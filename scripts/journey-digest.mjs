// The weekly journey digest (plan step M7.14) — the
// founder's reading end of the first-party counting.
//
// One generator, two triggers (the step's form): the
// weekly schedule (a cron at launch operations, M12) and
// this manual run at any time. It reads the journey
// events table (migration 0036), composes a designed,
// plain-English PDF — headline numbers first, grouped
// sections, aggregate step counts and ratios ONLY (no
// per-person funnel, no returning-visitor count; gap
// check item 6) — writes it to disk, and emails it to
// the project inbox via Resend, the loaders' alert path.
//
// Usage (docs/journey-digest-howto.md carries the
// founder's copy):
//   node scripts/journey-digest.mjs                  last 7 days, emailed
//   node scripts/journey-digest.mjs --days 30        last 30 days
//   node scripts/journey-digest.mjs --from 2026-12-01 --to 2026-12-31
//   node scripts/journey-digest.mjs --no-send        write the PDF only
//   node scripts/journey-digest.mjs --out path.pdf   choose the file
//
// Environment: DATABASE_URL and RESEND_API_KEY (read
// from the process, or from .env.local / .env beside the
// repo root when unset); ALERT_EMAIL_TO overrides the
// recipient (default the project inbox).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import pg from "pg";

import { createDigestPdf } from "./digest-pdf.mjs";

function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function dayLabel(date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function resolveWindow() {
  const fromArg = argValue("--from");
  const toArg = argValue("--to");
  if (fromArg || toArg) {
    if (!fromArg || !toArg) {
      throw new Error("--from and --to must be given together (YYYY-MM-DD).");
    }
    const from = new Date(`${fromArg}T00:00:00`);
    const to = new Date(`${toArg}T00:00:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      throw new Error("--from / --to are not a valid date range (YYYY-MM-DD).");
    }
    const end = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    return { from, to: end, label: `${dayLabel(from)} to ${dayLabel(to)}` };
  }
  const daysRaw = argValue("--days");
  const days = daysRaw === null ? 7 : Number.parseInt(daysRaw, 10);
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new Error("--days must be a whole number between 1 and 366.");
  }
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, label: `the last ${days} day${days === 1 ? "" : "s"}` };
}

function pct(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

async function main() {
  loadEnvLocal();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("journey-digest: DATABASE_URL is not set — see .env.local (Key K6).");
    process.exit(1);
  }
  const { from, to, label } = resolveWindow();
  const pool = new pg.Pool({ connectionString });
  try {
    const totals = new Map();
    const { rows: totalRows } = await pool.query(
      `SELECT event, count(*)::int AS n FROM journey_events
        WHERE occurred_at >= $1 AND occurred_at < $2 GROUP BY event`,
      [from, to],
    );
    for (const row of totalRows) totals.set(row.event, row.n);
    const count = (event) => totals.get(event) ?? 0;

    const { rows: entryRows } = await pool.query(
      `SELECT route_pattern, count(*)::int AS n FROM journey_events
        WHERE event = 'page_view' AND occurred_at >= $1 AND occurred_at < $2
        GROUP BY route_pattern ORDER BY n DESC, route_pattern ASC LIMIT 10`,
      [from, to],
    );
    const { rows: rungRows } = await pool.query(
      `SELECT rung, count(*)::int AS n FROM journey_events
        WHERE event = 'check_completed' AND occurred_at >= $1 AND occurred_at < $2
        GROUP BY rung ORDER BY rung ASC`,
      [from, to],
    );
    const { rows: nationRows } = await pool.query(
      `SELECT nation, count(*)::int AS n FROM journey_events
        WHERE event = 'check_completed' AND occurred_at >= $1 AND occurred_at < $2
        GROUP BY nation ORDER BY n DESC`,
      [from, to],
    );
    const { rows: errorRows } = await pool.query(
      `SELECT error_name, route_pattern, count(*)::int AS n,
              min(occurred_at) AS first_seen, max(occurred_at) AS last_seen
         FROM journey_events
        WHERE event = 'page_error' AND occurred_at >= $1 AND occurred_at < $2
        GROUP BY error_name, route_pattern ORDER BY n DESC LIMIT 10`,
      [from, to],
    );

    const visits = count("page_view");
    const landingVisits = entryRows.find((row) => row.route_pattern === "/")?.n ?? 0;
    const started = count("check_started");
    const completed = count("check_completed");
    const reportClicked = count("report_clicked");
    const checkoutStarted = count("checkout_started");
    const checkoutPaid = count("checkout_paid");
    const reportDelivered = count("report_delivered");
    // The payment funnel's top step (M9.6, Amendment B):
    // arrivals on the report door itself — page views of
    // the /report pattern, from the entry rows above.
    const doorViews = entryRows.find((row) => row.route_pattern === "/report")?.n ?? 0;
    const giftClaimed = count("gift_claimed");
    const giftRedeemed = count("gift_redeemed");
    const errorsTotal = count("page_error");

    // The funnel, in the step's order. Ratios are between
    // consecutive steps; the biggest drop-off is the
    // largest share lost between two steps that both saw
    // traffic. The payment leg stands in full (M9.6,
    // Amendment B): door view → started → paid →
    // delivered, so where buyers drop out of paying —
    // and whether paying becomes receiving — is as
    // visible as every other step.
    const funnel = [
      ["Arrived on the landing page", landingVisits],
      ["Started a check", started],
      ["Completed a check", completed],
      ["Clicked for the full report", reportClicked],
      ["Viewed the report door", doorViews],
      ["Started checkout", checkoutStarted],
      ["Paid", checkoutPaid],
      ["Report delivered", reportDelivered],
      ["A gift was claimed", giftClaimed],
    ];
    const funnelLines = [];
    let biggestDrop = null;
    funnel.forEach(([step, n], index) => {
      if (index === 0) {
        funnelLines.push(`- ${step}: ${n}`);
        return;
      }
      const prev = funnel[index - 1][1];
      const share = pct(n, prev);
      funnelLines.push(`- ${step}: ${n}${share === null ? "" : ` (${share}% of the step before)`}`);
      if (prev > 0) {
        const drop = 1 - n / prev;
        if (biggestDrop === null || drop > biggestDrop.drop) {
          biggestDrop = { drop, from: funnel[index - 1][0], to: step };
        }
      }
    });
    if (biggestDrop && biggestDrop.drop > 0) {
      funnelLines.push("");
      funnelLines.push(
        `The biggest drop-off is between "${biggestDrop.from}" and "${biggestDrop.to}", where ${Math.round(biggestDrop.drop * 1000) / 10}% of the step before is lost.`,
      );
    }

    const sections = [
      {
        heading: "Headline numbers",
        lines: [
          `In ${label}: ${visits} page visits, ${completed} checks completed, ${reportClicked} clicks for the full report, and ${giftClaimed} gifts claimed.`,
          errorsTotal === 0
            ? "No page errors were recorded."
            : `${errorsTotal} page error${errorsTotal === 1 ? "" : "s"} were recorded — the Errors section below has the detail.`,
        ],
      },
      {
        heading: "Where visitors arrived",
        lines:
          entryRows.length === 0
            ? ["No page visits were recorded in this period."]
            : entryRows.map((row) => `- ${row.route_pattern}: ${row.n}`),
      },
      {
        heading: "Checks",
        lines: [
          `${started} checks started and ${completed} completed${pct(completed, started) === null ? "" : ` — ${pct(completed, started)}% of starts reached their results`}.`,
          ...(rungRows.length === 0
            ? []
            : [
                "By rung: " + rungRows.map((row) => `rung ${row.rung} — ${row.n}`).join(", ") + ".",
              ]),
          ...(nationRows.length === 0
            ? []
            : [
                "By nation: " +
                  nationRows.map((row) => `${row.nation ?? "unknown"} — ${row.n}`).join(", ") +
                  ".",
              ]),
        ],
      },
      { heading: "The funnel", lines: funnelLines },
      {
        heading: "Shortlist and comparison",
        lines: [
          `${count("shortlist_add")} homes added to shortlists, ${count("shortlist_remove")} removed, and the comparison opened ${count("comparison_opened")} times. (Counts of the facts only — which homes is never recorded.)`,
        ],
      },
      {
        heading: "Gifts",
        lines: [`${giftClaimed} gifts claimed and ${giftRedeemed} redeemed in this period.`],
      },
      {
        heading: "Errors",
        lines:
          errorRows.length === 0
            ? ["No page errors were recorded in this period."]
            : errorRows.map(
                (row) =>
                  `- ${row.error_name ?? "(unnamed error)"} on ${row.route_pattern ?? "(no page)"}: ${row.n} time${row.n === 1 ? "" : "s"}, first seen ${new Date(row.first_seen).toLocaleString("en-GB")}, last seen ${new Date(row.last_seen).toLocaleString("en-GB")}.`,
              ),
      },
      {
        heading: "About this digest",
        lines: [
          "Counted first-party on our own stack: pinned journey moments only, no cookies, no fingerprinting, and no event ever carries an address, a full postcode or an email. Raw events are kept 13 months; these aggregates are the permanent record.",
          "Generated by scripts/journey-digest.mjs — run it by hand for any period (see docs/journey-digest-howto.md).",
        ],
      },
    ];

    const pdf = createDigestPdf({
      title: "Your Check My Next Home digest",
      subtitle: `The journeys for ${label} (${dayLabel(from)} – ${dayLabel(to)}).`,
      footer: "Check My Next Home — journey digest",
      sections,
    });

    const outArg = argValue("--out");
    const fileLabel = `${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}`;
    const outPath = outArg ?? join(process.cwd(), "digests", `digest-${fileLabel}.pdf`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, pdf);
    console.log(
      `journey-digest: ${label} — ${visits} visits, ${completed} checks completed, ${errorsTotal} errors. PDF written to ${outPath}`,
    );

    if (process.argv.includes("--no-send")) {
      console.log("journey-digest: --no-send given; the digest was not emailed.");
      return;
    }
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      console.error(
        "journey-digest: RESEND_API_KEY is not set — the PDF was written but not emailed.",
      );
      process.exit(1);
    }
    const recipient = process.env.ALERT_EMAIL_TO ?? "checkmynexthome@gmail.com";
    // EM-12 (founder ruling 23 Nov 2026): never Resend's
    // sandbox sender — the placed internal identity
    // (CONTACT_NOTIFICATION_FROM, loaded from .env.local
    // above) where placed, else the site's one fixed
    // proper sender, the delivery mailer's own default.
    // (Named senderFrom, not from: the digest window's
    // own `from` above is this function's date bound,
    // and a same-named const here would shadow it for
    // the whole block.)
    const senderFrom =
      process.env.CONTACT_NOTIFICATION_FROM ?? "Check My Next Home <reports@checkmynexthome.co.uk>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: senderFrom,
        to: [recipient],
        subject: `Your Check My Next Home digest — ${label}`,
        text: `Your journey digest for ${label} is attached as a PDF.\n\nHeadline: ${visits} page visits, ${completed} checks completed, ${reportClicked} report clicks, ${giftClaimed} gifts claimed, ${errorsTotal} page errors.\n`,
        attachments: [
          {
            filename: `check-my-next-home-digest-${fileLabel}.pdf`,
            content: pdf.toString("base64"),
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error(
        `journey-digest: Resend answered HTTP ${response.status} — the PDF was written but not emailed.`,
      );
      process.exit(1);
    }
    console.log(`journey-digest: emailed to ${recipient}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`journey-digest: failed — ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
