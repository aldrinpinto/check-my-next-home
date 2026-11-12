// Loader runner (plan step M4.8). One entry point that runs the
// contract canary probes and the due dataset loads, records the
// whole run in the loader_runs tables, sends ONE email per run
// (an alert on failure, a short OK heartbeat on success — so a
// missing email is itself visible), and exits non-zero on any
// failure, including the email failing.
//
//   npm run load:all                        live run (due datasets)
//   npm run load:all -- --canary-only       probes only
//   npm run load:all -- --file tests/fixtures --kind practice-break --env ci
//
// Design rules (M4.8 gap check, 12 Nov 2026):
//   - Canary first; a failed probe alerts but never blocks a
//     load — the loaders' own validation is the filing authority.
//   - Continue on failure: one broken source never blocks the
//     rest of the month. The one exception: with no postcode
//     directory at all, downstream loads are skipped, because
//     they have nothing to join onto.
//   - The runner is the only writer of the run record; if the
//     database is down it falls back to a JSON-lines file and
//     still sends the email from memory — alerting never depends
//     on the log being writable.
//   - "Within an hour" means what it can honestly mean: the
//     email is sent as the runner's last act, within an hour of
//     the run that detected the failure finishing.

import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { runCanaryProbes } from "./canary.mjs";

const GOLDEN_POSTCODES = ["CM3 2JT", "E16 1GN", "KT17 1FH"];
const ALERT_TO = process.env.ALERT_EMAIL_TO ?? "checkmynexthome@gmail.com";
const DAY = 86400000;

// --- pure core (unit-tested) --------------------------------------

export function dueDecision(lastSuccessIso, thresholdDays, now = new Date()) {
  if (!lastSuccessIso) return { due: true, reason: "never loaded successfully" };
  const age = (now.getTime() - new Date(lastSuccessIso).getTime()) / DAY;
  return age >= thresholdDays
    ? { due: true, reason: `last success ${Math.floor(age)} days ago` }
    : { due: false, reason: `not due — last success ${Math.floor(age)} days ago` };
}

export function summariseRun(kind, items) {
  const failed = items.filter((i) => i.status === "failed");
  const counted = items.filter((i) => i.status !== "warning");
  const status = failed.length > 0 ? "failed" : "succeeded";
  const label = kind === "canary" ? "Canary" : "Loader run";
  const subject =
    status === "failed"
      ? `[Check My Next Home] ${label} FAILED — ${failed.map((i) => i.item).join(", ")} (${failed.length} of ${counted.length})`
      : `[Check My Next Home] ${label === "Canary" ? "Canary" : "Loaders"} OK`;
  const lines = items.map((i) => {
    if (i.status === "succeeded") return `OK      ${i.item} — ${i.logLine ?? ""}`;
    if (i.status === "skipped") return `SKIPPED ${i.item} — ${i.logLine ?? ""}`;
    if (i.status === "warning") return `WARNING ${i.item} — ${i.logLine ?? ""}`;
    return `FAILED  ${i.item} — ${(i.errorMessage ?? "unknown error").split("\n")[0]}`;
  });
  if (status === "failed") {
    lines.push("", "Each failed loader filed nothing; the previous data is still serving.");
  }
  return { status, subject, lines };
}

export function decideExitCode({ items, alertStatus, noEmail }) {
  if (items.some((i) => i.status === "failed")) return 1;
  if (!noEmail && alertStatus !== "sent") return 1;
  return 0;
}

// --- the email a person reads --------------------------------------
//
// The run record keeps the loaders' verbatim log lines; the email
// does not lead with them. It opens with what happened and what
// (if anything) the operator needs to do, in plain words, then
// lists each collector as one human sentence, and only then the
// technical detail. The gap check's test for this email: one
// person, no dashboard habit, thirty seconds — what broke, what
// is still serving, what do I have to do?

export const FRIENDLY_NAMES = {
  "load-postcodes": "Postcode directory",
  "load-sold-prices": "Sold prices",
  "load-crime": "Crime",
  "load-epc": "Energy certificates (EPC)",
  "load-schools": "Schools",
  "load-health": "Health — GPs, pharmacies, dentists, hospitals",
  "load-planning-areas": "Planning areas — conservation areas and Article 4",
  "load-green-belt": "Green belt",
  "load-heritage": "Heritage — listed buildings and monuments",
  "load-nature-designations": "Nature designations — SSSI, SAC, SPA, Ramsar, ancient woodland",
  "load-priority-habitats": "Priority habitats",
  onspd: "Postcode directory source (canary)",
  ppd: "Sold prices source (canary)",
  police: "Crime source (canary)",
  epc: "EPC source (canary)",
  "epc-deltas": "EPC changes feed (canary)",
  gias: "Schools register (canary)",
  ofsted: "Ofsted source (canary)",
  ods: "NHS lists source (canary)",
  "cqc-directory": "CQC directory (canary)",
  "cqc-ratings": "CQC ratings (canary)",
  "conservation-area": "Conservation areas source (canary)",
  "article-4-direction-area": "Article 4 areas source (canary)",
  "green-belt": "Green belt source (canary)",
  "listed-building": "Listed buildings source (canary)",
  "scheduled-monument": "Scheduled monuments source (canary)",
  sssi: "SSSI source (canary)",
  sac: "SAC source (canary)",
  spa: "SPA source (canary)",
  ramsar: "Ramsar source (canary)",
  "ancient-woodland": "Ancient woodland source (canary)",
  "ancient-woodland-revised": "Ancient woodland, revised (canary)",
  "priority-habitats": "Priority habitats source (canary)",
};

function shortDetail(item) {
  const line = item.logLine ?? "";
  const pick = (re) => line.match(re)?.[1]?.trim();
  switch (item.item) {
    case "load-postcodes": {
      const edition = pick(/edition ([^·(]+)/);
      return edition ? `edition ${edition}` : "updated";
    }
    case "load-crime": {
      const window = pick(/window ([^·]+)/);
      return window ? `data window ${window.replace("..", " to ")}` : "updated";
    }
    case "load-schools": {
      const gias = pick(/GIAS (\d{4}-\d{2}-\d{2})/);
      return gias ? `register dated ${gias}` : "updated";
    }
    case "load-sold-prices": {
      const edition = pick(/edition (\d{4})-(\d{2})-(\d{2})/);
      if (!edition) return "updated";
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const parts = line.match(/edition (\d{4})-(\d{2})-(\d{2})/);
      return `sales file dated ${Number(parts[3])} ${months[Number(parts[2]) - 1]} ${parts[1]}`;
    }
    case "load-epc": {
      const counts = [...line.matchAll(/(\d+) certificates/g)].map((m) => Number(m[1]));
      return counts.length
        ? `${counts.reduce((a, b) => a + b, 0)} certificates checked`
        : "updated";
    }
    case "load-health": {
      const ods = pick(/ODS (\d{4}-\d{2}-\d{2})/);
      return ods ? `lists dated ${ods}` : "updated";
    }
    case "load-planning-areas": {
      const areas = pick(/conservation areas: (\d+) filed/);
      return areas ? `${areas} conservation areas filed` : "updated";
    }
    case "load-green-belt": {
      const pieces = pick(/(\d+) pieces filed/);
      return pieces ? `${pieces} green belt pieces` : "updated";
    }
    case "load-heritage": {
      const buildings = pick(/listed buildings: (\d+) filed/);
      return buildings ? `${buildings} listed buildings` : "updated";
    }
    case "load-nature-designations": {
      const sssi = pick(/SSSI: (\d+) features filed/);
      return sssi ? `${sssi} SSSIs filed` : "updated";
    }
    case "load-priority-habitats": {
      const patches = pick(/(\d+) patches filed/);
      return patches ? `${patches} habitat patches` : "updated";
    }
    default:
      return "updated";
  }
}

export function humanLine(item) {
  const name = FRIENDLY_NAMES[item.item] ?? item.item;
  if (item.status === "succeeded")
    return { icon: "OK", text: `${name} — updated fine (${shortDetail(item)}).` };
  if (item.status === "skipped")
    return {
      icon: "SKIP",
      text: `${name} — skipped: ${(item.logLine ?? "").replace(/^skipped — /, "")}`,
    };
  if (item.status === "warning")
    return { icon: "WARN", text: `${name} — noted, not alerting: ${item.logLine ?? ""}` };
  const reason = (item.errorMessage ?? "unknown error").split("\n")[0].slice(0, 160);
  if (item.mode === "probe") {
    return {
      icon: "FAIL",
      text: `${name} — early warning: this source changed shape or went stale, so the next real load may fail. Reason: ${reason}`,
    };
  }
  return {
    icon: "FAIL",
    text: `${name} — FAILED. Nothing was filed, so the site keeps showing the previous figures. Reason: ${reason}`,
  };
}

export function buildEmailBodies(run, items, recordNote) {
  const loads = items.filter((i) => i.mode !== "probe");
  const failed = items.filter((i) => i.status === "failed");
  const failedLoads = failed.filter((i) => i.mode !== "probe");
  const skipped = items.filter((i) => i.status === "skipped");
  const human = items.map(humanLine);

  let happened;
  if (failedLoads.length > 0) {
    happened = `${failedLoads.length} of ${loads.length} fact collectors failed (${failedLoads.map((i) => FRIENDLY_NAMES[i.item] ?? i.item).join(", ")}). The rest updated normally.`;
  } else if (failed.length > 0) {
    happened = `All ${loads.length} fact collectors updated normally, but ${failed.length} early-warning check(s) failed.`;
  } else {
    happened = `All ${loads.length} fact collectors updated normally${skipped.length > 0 ? ` (${skipped.length} not due and skipped)` : ""}.`;
  }

  let needsYou;
  if (failedLoads.length > 0) {
    needsYou =
      "Nothing urgent — the site is serving the last good figures for anything that failed. When convenient, raise it in the Property Checker implementation chat; the full failure record is in the loader_runs tables (reference below).";
  } else if (failed.length > 0) {
    needsYou =
      "Nothing is broken yet. A source has changed shape or gone stale, which may break the next monthly load — worth raising in the Property Checker implementation chat.";
  } else {
    needsYou = "Nothing. This is the regular confirmation that the facts refreshed.";
  }

  const reference = `Reference: run ${run.id} · ${run.kind} · ${run.environment} · started ${run.startedAt.toISOString()} · ${recordNote ?? "full record in the loader_runs tables."}`;
  const detailLines = items.map(
    (i) =>
      `${i.status.toUpperCase().padEnd(9)} ${i.item} — ${i.logLine ?? i.errorMessage?.split("\n")[0] ?? ""}`,
  );

  const text = [
    "WHAT HAPPENED",
    happened,
    "",
    "WHAT YOU NEED TO DO",
    needsYou,
    "",
    "COLLECTOR BY COLLECTOR",
    ...human.map((h) => `${h.icon.padEnd(4)} ${h.text}`),
    "",
    "TECHNICAL DETAIL (the collectors' own log lines)",
    ...detailLines,
    "",
    reference,
  ].join("\n");

  const esc = (t) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const colour = { OK: "#1a7f37", SKIP: "#6e7781", WARN: "#bf8700", FAIL: "#cf222e" };
  const rows = human
    .map(
      (h) =>
        `<tr><td style="padding:6px 10px 6px 0;font-weight:bold;color:${colour[h.icon]}">${h.icon}</td><td style="padding:6px 0">${esc(h.text)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2328;line-height:1.5">
<h2 style="font-size:18px;margin:0 0 4px">What happened</h2>
<p style="margin:0 0 16px">${esc(happened)}</p>
<h2 style="font-size:18px;margin:0 0 4px">What you need to do</h2>
<p style="margin:0 0 16px">${esc(needsYou)}</p>
<h2 style="font-size:18px;margin:0 0 4px">Collector by collector</h2>
<table style="border-collapse:collapse;margin:0 0 16px">${rows}</table>
<h2 style="font-size:15px;margin:0 0 4px;color:#57606a">Technical detail</h2>
<pre style="white-space:pre-wrap;font-size:12px;color:#57606a;background:#f6f8fa;padding:12px;border-radius:6px">${esc(detailLines.join("\n"))}</pre>
<p style="font-size:12px;color:#6e7781">${esc(reference)}</p>
</div>`;
  return { text, html };
}

// --- email ----------------------------------------------------------

async function sendRunEmail(subject, text, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "failed", error: "RESEND_API_KEY is not set" };
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Check My Next Home <onboarding@resend.dev>",
          to: [ALERT_TO],
          subject,
          text,
          html,
        }),
      });
      if (!response.ok)
        throw new Error(`Resend HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      return { status: "sent", error: null };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  return { status: "failed", error: lastError?.message ?? "unknown send error" };
}

// --- loader execution -------------------------------------------------

function runLoader(name, args) {
  return new Promise((resolve) => {
    const startedAt = new Date();
    execFile(
      process.execPath,
      [join(process.cwd(), "loaders", `${name}.mjs`), ...args],
      { maxBuffer: 16 * 1024 * 1024, timeout: 30 * 60 * 1000 },
      (error, stdout, stderr) => {
        const finishedAt = new Date();
        const outLines = (stdout ?? "").split("\n").filter((l) => l.trim() !== "");
        const logLine =
          [...outLines].reverse().find((l) => l.startsWith("load-")) ?? outLines.at(-1) ?? null;
        resolve({
          item: name,
          mode: args.includes("--file") ? "fixture" : "live",
          status: error ? "failed" : "succeeded",
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          logLine: error ? null : logLine,
          errorMessage: error ? (stderr || error.message).slice(-4000) : null,
          exitCode: error ? (typeof error.code === "number" ? error.code : 1) : 0,
        });
      },
    );
  });
}

// --- run record -------------------------------------------------------

async function openRecord(run) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    `INSERT INTO loader_runs (id, kind, environment, trigger_source, status, started_at)
     VALUES ($1,$2,$3,$4,'running',$5)`,
    [run.id, run.kind, run.environment, run.trigger, run.startedAt],
  );
  return client;
}

async function recordItems(client, runId, items) {
  for (const i of items) {
    await client.query(
      `INSERT INTO loader_run_items (run_id, item, mode, status, started_at, finished_at, duration_ms, source_name, source_date, log_line, error_message, exit_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        runId,
        i.item,
        i.mode,
        i.status,
        i.startedAt ?? null,
        i.finishedAt ?? null,
        i.durationMs ?? null,
        i.sourceName ?? null,
        i.sourceDate ?? null,
        i.logLine ?? null,
        i.errorMessage ?? null,
        i.exitCode ?? null,
      ],
    );
  }
}

async function closeRecord(client, run, items, alert) {
  const { status, subject } = summariseRun(run.kind, items);
  await client.query(
    `UPDATE loader_runs SET status = $2, finished_at = $3, alert_status = $4, alert_sent_at = $5, alert_error = $6, summary = $7 WHERE id = $1`,
    [
      run.id,
      status,
      new Date(),
      alert.status,
      alert.status === "sent" ? new Date() : null,
      alert.error ?? null,
      subject,
    ],
  );
}

// --- main ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const canaryOnly = args.includes("--canary-only");
  const noEmail = args.includes("--no-email");
  const noCanary = args.includes("--no-canary");
  const fileAt = args.indexOf("--file");
  const fixtureRoot = fileAt !== -1 ? args[fileAt + 1] : null;
  const kindAt = args.indexOf("--kind");
  const run = {
    id: randomUUID(),
    kind: canaryOnly ? "canary" : kindAt !== -1 ? args[kindAt + 1] : "load",
    environment: process.env.RUNNER_ENV ?? (fixtureRoot ? "local" : "local"),
    trigger: process.env.RUNNER_TRIGGER ?? "manual",
    startedAt: new Date(),
  };
  const items = [];

  if (!noCanary || canaryOnly) {
    const probes = await runCanaryProbes();
    items.push(...probes);
    for (const p of probes) console.log(p.logLine ?? `canary ${p.item} FAILED — ${p.errorMessage}`);
  }

  let client = null;
  let recordNote = null;
  try {
    client = await openRecord(run);
  } catch (error) {
    recordNote = `run record fell back to file (${error.message})`;
  }

  if (!canaryOnly) {
    if (fixtureRoot) {
      const fx = (name) => join(fixtureRoot, name);
      const runAndLog = async (name, loaderArgs) => {
        const outcome = await runLoader(name, loaderArgs);
        console.log(
          outcome.logLine ??
            `${outcome.item} FAILED — ${(outcome.errorMessage ?? "").split("\n")[0]}`,
        );
        items.push(outcome);
      };
      await runAndLog("load-postcodes", ["--file", fx("onspd")]);
      await runAndLog("load-sold-prices", ["--file", fx("land-registry"), ...GOLDEN_POSTCODES]);
      // The crime and EPC fixtures were captured for the two
      // original golden postcodes (KT17's facts were locked from
      // live sources, not fixtures), so their fixture runs take
      // those two; sold prices tolerates all three.
      await runAndLog("load-crime", ["--file", fx("police-uk"), "CM3 2JT", "E16 1GN"]);
      await runAndLog("load-epc", ["--file", fx("epc"), "CM3 2JT", "E16 1GN"]);
      await runAndLog("load-schools", ["--file", fx("schools")]);
      await runAndLog("load-health", ["--file", fx("health")]);
      await runAndLog("load-planning-areas", ["--file", fx("planning-areas")]);
      await runAndLog("load-green-belt", ["--file", fx("green-belt")]);
      await runAndLog("load-heritage", ["--file", fx("heritage")]);
      await runAndLog("load-nature-designations", ["--file", fx("nature-designations")]);
      await runAndLog("load-priority-habitats", ["--file", fx("priority-habitats")]);
    } else {
      if (!client) throw new Error("a live run needs the run-record database (DATABASE_URL)");
      const lastSuccess = async (item) => {
        const res = await client.query(
          `SELECT max(finished_at) AS last FROM loader_run_items WHERE item = $1 AND status = 'succeeded'`,
          [item],
        );
        return res.rows[0].last;
      };
      const directoryCount = await client.query("SELECT count(*)::int AS n FROM postcode_cache");
      const hasDirectory = directoryCount.rows[0].n > 0;

      const plan = [];
      const postcodesDue = dueDecision(await lastSuccess("load-postcodes"), 70);
      plan.push({ item: "load-postcodes", due: postcodesDue, args: [] });

      const targets = { sold: new Set(), crime: new Set(), epc: new Set() };
      const soldRows = await client.query("SELECT DISTINCT postcode FROM price_paid");
      soldRows.rows.forEach((r) => targets.sold.add(r.postcode));
      const answerRows = await client.query(
        "SELECT postcode, answers FROM postcode_cache WHERE answers IS NOT NULL",
      );
      for (const row of answerRows.rows) {
        if (row.answers && "crime" in row.answers) targets.crime.add(row.postcode);
        if (row.answers && "epc" in row.answers) targets.epc.add(row.postcode);
      }
      if (targets.sold.size === 0 && targets.crime.size === 0 && targets.epc.size === 0) {
        GOLDEN_POSTCODES.forEach((pc) => {
          targets.sold.add(pc);
          targets.crime.add(pc);
          targets.epc.add(pc);
        });
      }
      for (const [item, set, loaderArgs] of [
        ["load-sold-prices", targets.sold, [...targets.sold]],
        ["load-crime", targets.crime, [...targets.crime]],
        ["load-epc", targets.epc, [...targets.epc]],
      ]) {
        void set;
        plan.push({ item, due: dueDecision(await lastSuccess(item), 25), args: loaderArgs });
      }
      plan.push({
        item: "load-schools",
        due: dueDecision(await lastSuccess("load-schools"), 25),
        args: [],
      });
      plan.push({
        item: "load-health",
        due: dueDecision(await lastSuccess("load-health"), 25),
        args: [],
      });
      // The M5.2 planning and heritage datasets and the M5.3
      // nature datasets are quarterly, on the postcode
      // directory's 70-day rhythm — they file shapes and points
      // from their own files and never join onto the directory,
      // so the empty-directory skip below does not apply to them.
      for (const item of [
        "load-planning-areas",
        "load-green-belt",
        "load-heritage",
        "load-nature-designations",
        "load-priority-habitats",
      ]) {
        plan.push({ item, due: dueDecision(await lastSuccess(item), 70), args: [] });
      }
      const DIRECTORY_FREE = new Set([
        "load-planning-areas",
        "load-green-belt",
        "load-heritage",
        "load-nature-designations",
        "load-priority-habitats",
      ]);

      for (const step of plan) {
        if (!step.due.due) {
          items.push({
            item: step.item,
            mode: "live",
            status: "skipped",
            logLine: `skipped — ${step.due.reason}`,
            durationMs: 0,
          });
          continue;
        }
        if (step.item !== "load-postcodes" && !DIRECTORY_FREE.has(step.item) && !hasDirectory) {
          items.push({
            item: step.item,
            mode: "live",
            status: "skipped",
            logLine: "skipped — no postcode directory to join onto",
            durationMs: 0,
          });
          continue;
        }
        const outcome = await runLoader(step.item, step.args);
        console.log(
          outcome.logLine ??
            `${outcome.item} FAILED — ${(outcome.errorMessage ?? "").split("\n")[0]}`,
        );
        items.push(outcome);
      }
    }
  }

  const { subject } = summariseRun(run.kind, items);
  const bodies = buildEmailBodies(run, items, recordNote);
  const alert = noEmail
    ? { status: "not_required", error: null }
    : await sendRunEmail(subject, bodies.text, bodies.html);
  if (!noEmail && alert.status !== "sent") console.error(`ALERT FAILED: ${alert.error}`);

  if (client) {
    try {
      await recordItems(client, run.id, items);
      await closeRecord(client, run, items, alert);
    } catch (error) {
      recordNote = `run record fell back to file (${error.message})`;
      client = null;
    }
  }
  if (!client) {
    await appendFile(
      join(process.cwd(), "loader-runs-fallback.jsonl"),
      `${JSON.stringify({ run, items, alert, status, subject })}\n`,
    ).catch(() => {});
    if (recordNote) console.error(recordNote);
  }
  if (client) await client.end();

  console.log(subject.replace(/^\[Check My Next Home\] /, ""));
  process.exitCode = decideExitCode({ items, alertStatus: alert.status, noEmail });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`run-loaders FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
