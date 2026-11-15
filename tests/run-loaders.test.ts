import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildEmailBodies,
  decideExitCode,
  dueDecision,
  errorHeadline,
  formatTimeout,
  formatTimers,
  humanLine,
  isOperatorJob,
  LOADER_SCHEDULE,
  operatorSkipLine,
  runLoader,
  scheduleFor,
  STATIC_THRESHOLD_DAYS,
  summariseRun,
  thresholdDaysFor,
  timeoutMinutesFor,
  DEFAULT_TIMEOUT_MINUTES,
} from "../loaders/run-loaders.mjs";

// The runner's pure core (plan step M4.8): due-ness, the one-email
// summary, and the exit-code rule — any failure anywhere,
// including the email itself failing, means a non-zero exit.

describe("due-ness", () => {
  const now = new Date("2026-11-12T00:00:00Z");
  it("never loaded means due", () => {
    expect(dueDecision(null, 25, now).due).toBe(true);
  });
  it("a recent success is not due, an old one is", () => {
    expect(dueDecision("2026-11-01T00:00:00Z", 25, now).due).toBe(false);
    expect(dueDecision("2026-09-01T00:00:00Z", 25, now).due).toBe(true);
    expect(dueDecision("2026-09-01T00:00:00Z", 70, now).due).toBe(true);
  });
});

describe("run summary", () => {
  it("names the failed items in the subject and keeps the reassurance in the body", () => {
    const { status, subject, lines } = summariseRun("load", [
      { item: "load-crime", status: "failed", errorMessage: "boom\nstack" },
      { item: "load-epc", status: "succeeded", logLine: "load-epc · OK" },
      { item: "epc-deltas", status: "warning", logLine: "canary epc-deltas · HTTP 500" },
    ]);
    expect(status).toBe("failed");
    expect(subject).toContain("FAILED");
    expect(subject).toContain("load-crime");
    expect(subject).not.toContain("epc-deltas");
    expect(lines.join("\n")).toContain("the previous data is still serving");
  });

  it("a failed loader's summary shows its own error, not Node's opening warning", () => {
    // CI runs 98 and 99: a loader that imports node:sqlite has
    // Node 22's ExperimentalWarning as the FIRST line of its
    // stderr, and the summaries used to print that first line —
    // so the greenspace loader's real error never reached the
    // log or the alert email, two runs running.
    const stderr = [
      "(node:3236) ExperimentalWarning: SQLite is an experimental feature and might change at any time",
      "(Use `node --trace-warnings ...` to show where the warning was created)",
      'load-os-greenspace FAILED: column "lat" of relation "greenspace_points" does not exist',
    ].join("\n");
    expect(errorHeadline(stderr)).toContain('column "lat"');
    expect(errorHeadline(stderr)).not.toContain("ExperimentalWarning");
    const { lines } = summariseRun("load", [
      { item: "load-os-greenspace", status: "failed", errorMessage: stderr },
    ]);
    expect(lines.join("\n")).toContain('column "lat" of relation "greenspace_points"');
    // Plain single-line errors are untouched by the picking.
    expect(errorHeadline("boom")).toBe("boom");
    expect(errorHeadline(null)).toBe("unknown error");
  });

  it("warnings alone never fail a run", () => {
    const { status } = summariseRun("canary", [
      { item: "epc-deltas", status: "warning", logLine: "w" },
      { item: "onspd", status: "succeeded", logLine: "ok" },
    ]);
    expect(status).toBe("succeeded");
  });
});

describe("exit code", () => {
  const ok = [{ item: "a", status: "succeeded" }];
  it("is zero only when everything succeeded and the email sent", () => {
    expect(decideExitCode({ items: ok, alertStatus: "sent", noEmail: false })).toBe(0);
    expect(decideExitCode({ items: ok, alertStatus: "failed", noEmail: false })).toBe(1);
    expect(
      decideExitCode({
        items: [{ item: "a", status: "failed" }],
        alertStatus: "sent",
        noEmail: false,
      }),
    ).toBe(1);
    expect(decideExitCode({ items: ok, alertStatus: "not_required", noEmail: true })).toBe(0);
  });
});

describe("sources", () => {
  const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
  const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
  const migration = readFileSync(join(process.cwd(), "db/migrations/0006_loader_runs.sql"), "utf8");

  it("the migration records runs, items and the alert's own fate", () => {
    expect(migration).toContain("loader_runs");
    expect(migration).toContain("loader_run_items");
    expect(migration).toContain("alert_status");
    expect(migration).toContain("alert_error");
  });

  it("main() actually sends the human-readable bodies, not the raw lines", () => {
    // Regression guard: the readable-email builder once existed
    // and was unit-tested while main() still sent the old body.
    expect(runner).toContain("buildEmailBodies(run, items, recordNote)");
    expect(runner).toContain("sendRunEmail(subject, bodies.text, bodies.html)");
    expect(runner).not.toContain("emailBody");
  });

  it("the email gives sold prices and EPC a real detail, not a bare (updated)", () => {
    const items = [
      {
        item: "load-sold-prices",
        mode: "fixture",
        status: "succeeded",
        logLine: "load-sold-prices · edition 2026-07-20 · CM3 2JT 30 sales · golden homes OK · 0s",
      },
      {
        item: "load-epc",
        mode: "fixture",
        status: "succeeded",
        logLine:
          "load-epc · CM3 2JT 42 certificates · E16 1GN 12 certificates · golden homes OK · 0s",
      },
    ] as never;
    const mailRun = {
      id: "00000000-0000-4000-8000-000000000000",
      kind: "load",
      environment: "local",
      startedAt: new Date("2026-11-12T00:00:00Z"),
    } as never;
    const { text } = buildEmailBodies(mailRun, items, null);
    expect(text).toContain("Sold prices — updated fine (sales file dated 20 July 2026).");
    expect(text).toContain("Energy certificates (EPC) — updated fine (54 certificates checked).");
  });

  it("the runner sends one email via Resend and prints ALERT FAILED when it cannot", () => {
    expect(runner).toContain("api.resend.com/emails");
    expect(runner).toContain("onboarding@resend.dev");
    expect(runner).toContain("ALERT FAILED");
    expect(runner).toContain("loader-runs-fallback.jsonl");
  });

  it("main() destructures the status its DB-fallback record serialises", () => {
    // Regression guard (latent defect found at the M6.19 gate,
    // present since before M6.19): main() built the
    // loader-runs-fallback.jsonl record as
    // JSON.stringify({ run, items, alert, status, subject })
    // but destructured only `subject` from summariseRun — so if
    // the run-record DB write ever failed at close-out, building
    // the fallback record threw a ReferenceError and the record
    // was lost. main() is not exported, so — the buildEmailBodies
    // guard above is the precedent — the wiring is pinned here
    // against main()'s own body, and the record shape it must
    // produce is pinned functionally in the describe below.
    const mainBody = runner.slice(runner.indexOf("async function main()"));
    expect(mainBody).toContain("const { status, subject } = summariseRun(run.kind, items);");
    expect(mainBody).toContain("JSON.stringify({ run, items, alert, status, subject })");
  });

  it("the canary covers every source and keeps deltas warning-grade", () => {
    for (const probe of [
      "onspd",
      "ppd",
      "police",
      "epc",
      "gias",
      "ofsted",
      "ods",
      "cqc-directory",
      "cqc-ratings",
    ]) {
      expect(canary).toContain(probe);
    }
    expect(canary).toContain("warning-grade");
  });
});

describe("the DB-fallback record", () => {
  // When the run-record DB write fails at close-out, main()
  // falls back to one JSONL line:
  // JSON.stringify({ run, items, alert, status, subject }),
  // with status and subject taken from summariseRun. These
  // tests pin that both fields summariseRun supplies are the
  // ones the record needs, for both run outcomes, and that the
  // serialised line round-trips whole.
  const run = {
    id: "run-fallback",
    kind: "load",
    environment: "local",
    trigger: "manual",
    startedAt: new Date("2026-11-15T00:00:00Z"),
  };
  const alert = { status: "sent", error: null };

  it("a failed run's fallback line carries status failed and the FAILED subject", () => {
    const items = [
      { item: "load-crime", status: "failed", errorMessage: "boom" },
      { item: "load-epc", status: "succeeded", logLine: "load-epc · OK" },
    ];
    const { status, subject } = summariseRun(run.kind, items as never);
    const parsed = JSON.parse(`${JSON.stringify({ run, items, alert, status, subject })}\n`);
    expect(parsed.status).toBe("failed");
    expect(parsed.subject).toContain("FAILED");
    expect(parsed.subject).toContain("load-crime");
    expect(parsed.run.id).toBe("run-fallback");
    expect(parsed.items).toHaveLength(2);
    expect(parsed.alert.status).toBe("sent");
  });

  it("a clean run's fallback line carries status succeeded", () => {
    const items = [{ item: "load-epc", status: "succeeded", logLine: "load-epc · OK" }];
    const { status, subject } = summariseRun(run.kind, items as never);
    const parsed = JSON.parse(`${JSON.stringify({ run, items, alert, status, subject })}\n`);
    expect(parsed.status).toBe("succeeded");
    expect(parsed.subject).toContain("OK");
    expect(parsed.items).toHaveLength(1);
  });
});

describe("the email a person reads", () => {
  const run = {
    id: "run-1",
    kind: "practice-break",
    environment: "ci",
    startedAt: new Date("2026-11-12T18:29:34Z"),
  };
  const bodies = buildEmailBodies(
    run,
    [
      {
        item: "load-postcodes",
        mode: "live",
        status: "succeeded",
        logLine: "load-postcodes · edition August 2026 (2026-08-01) · 6 live postcodes filed",
      },
      {
        item: "load-crime",
        mode: "live",
        status: "failed",
        errorMessage: "load-crime FAILED: CM3 2JT 2026-05: Police.uk response is not a list",
      },
    ],
    null,
  );

  it("leads with what happened and what to do, in plain words", () => {
    expect(bodies.text.indexOf("WHAT HAPPENED")).toBeLessThan(
      bodies.text.indexOf("load-postcodes · edition"),
    );
    expect(bodies.text).toContain("Nothing urgent");
    expect(bodies.text).toContain("Crime — FAILED. Nothing was filed");
    expect(bodies.text).toContain("Postcode directory — updated fine (edition August 2026)");
  });

  it("carries the same structure as HTML for mail clients", () => {
    expect(bodies.html).toContain("What happened");
    expect(bodies.html).toContain("What you need to do");
    expect(bodies.html).toContain("Collector by collector");
  });
});

// --- M5.15 / D19: the schedule registry, the operator-job class,
// the timeout map and its labelling, and the --timers print. ---

describe("the schedule registry (M5.15 / D19)", () => {
  const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
  const span = runner.slice(runner.indexOf("FRIENDLY_NAMES"));
  const friendlyLoaders = [...span.slice(0, span.indexOf("};")).matchAll(/"([\w-]+)"\s*:/g)]
    .map((m) => m[1])
    .filter((k) => k.startsWith("load-"))
    .sort();

  it("covers exactly the loaders the runner knows, no more, no fewer", () => {
    expect(LOADER_SCHEDULE.map((e) => e.item).sort()).toEqual(friendlyLoaders);
  });

  it("noise and priority habitats are operator jobs — the timer never runs them", () => {
    expect(isOperatorJob("load-noise")).toBe(true);
    expect(isOperatorJob("load-priority-habitats")).toBe(true);
    expect(isOperatorJob("load-crime")).toBe(false);
    // No due-ness threshold and no timeout: they are not the
    // timer's business at all.
    expect(thresholdDaysFor("load-noise")).toBeNull();
    expect(thresholdDaysFor("load-priority-habitats")).toBeNull();
    expect(timeoutMinutesFor("load-noise")).toBeNull();
    expect(timeoutMinutesFor("load-priority-habitats")).toBeNull();
    expect(scheduleFor("load-noise").timeoutMinutes).toBeUndefined();
  });

  it("EV chargers moved from quarterly to monthly (D19)", () => {
    expect(scheduleFor("load-ev-chargers").cadence).toBe("monthly");
    expect(thresholdDaysFor("load-ev-chargers")).toBe(25);
  });

  it("every timed loader carries the 30-minute default, and the classes keep their thresholds", () => {
    expect(DEFAULT_TIMEOUT_MINUTES).toBe(30);
    for (const entry of LOADER_SCHEDULE) {
      if (entry.cadence === "operator") continue;
      expect(entry.timeoutMinutes, entry.item).toBe(DEFAULT_TIMEOUT_MINUTES);
      expect(timeoutMinutesFor(entry.item)).toBe(30);
    }
    expect(thresholdDaysFor("load-crime")).toBe(25);
    expect(thresholdDaysFor("load-company-ownership")).toBe(25);
    expect(thresholdDaysFor("load-postcodes")).toBe(70);
    expect(thresholdDaysFor("load-tribunal-building-safety")).toBe(70);
    expect(thresholdDaysFor("load-census")).toBe(STATIC_THRESHOLD_DAYS);
    expect(thresholdDaysFor("load-council-tax")).toBe(STATIC_THRESHOLD_DAYS);
  });
});

describe("operator-job skip lines", () => {
  it("name the job and the date it last filed, or that it never has", () => {
    expect(operatorSkipLine("load-noise", "2026-10-03T12:00:00.000Z")).toBe(
      "skipped — operator job, run by hand; last filed 3 October 2026",
    );
    expect(operatorSkipLine("load-priority-habitats", null)).toBe(
      "skipped — operator job, run by hand; never filed yet",
    );
    // A pg Date object formats the same way.
    expect(operatorSkipLine("load-noise", new Date("2026-01-31T23:59:00.000Z"))).toContain(
      "last filed 31 January 2026",
    );
  });

  it("reach the run email as a SKIPPED line carrying that wording", () => {
    const run = {
      id: "run-op",
      kind: "load",
      environment: "local",
      startedAt: new Date("2026-11-14T00:00:00Z"),
    };
    const item = {
      item: "load-noise",
      mode: "live",
      status: "skipped",
      logLine: operatorSkipLine("load-noise", "2026-10-03T12:00:00.000Z"),
    };
    expect(humanLine(item as never).text).toContain(
      "skipped: operator job, run by hand; last filed 3 October 2026",
    );
    const { text } = buildEmailBodies(run as never, [item] as never, null);
    expect(text).toContain("operator job, run by hand; last filed 3 October 2026");
  });
});

describe("timeout labelling (M5.15 / D19)", () => {
  it("says TIMED OUT after N minutes, in those words", () => {
    expect(formatTimeout(30 * 60 * 1000)).toBe("TIMED OUT after 30 minutes");
    expect(formatTimeout(60 * 1000)).toBe("TIMED OUT after 1 minute");
    expect(formatTimeout(45 * 60 * 1000)).toBe("TIMED OUT after 45 minutes");
  });

  it("the label wins the headline over any partial stderr", () => {
    expect(errorHeadline("TIMED OUT after 30 minutes\nsome partial output")).toBe(
      "TIMED OUT after 30 minutes",
    );
  });

  it("reaches the run record summary and the email as the reason", () => {
    const item = {
      item: "load-crime",
      mode: "live",
      status: "failed",
      errorMessage: "TIMED OUT after 30 minutes\n",
    };
    const { lines } = summariseRun("load", [item as never]);
    expect(lines.join("\n")).toContain("TIMED OUT after 30 minutes");
    const run = {
      id: "run-to",
      kind: "load",
      environment: "local",
      startedAt: new Date("2026-11-14T00:00:00Z"),
    };
    const { text } = buildEmailBodies(run as never, [item] as never, null);
    expect(text).toContain("TIMED OUT after 30 minutes");
    expect(decideExitCode({ items: [item] as never, alertStatus: "sent", noEmail: false })).toBe(1);
  });
});

describe("the --timers print (M5.15 / D19)", () => {
  const print = formatTimers();

  it("groups every registered loader by class, matching the plan's Data Loaders table", () => {
    for (const entry of LOADER_SCHEDULE) expect(print).toContain(entry.item);
    const monthlyAt = print.indexOf("MONTHLY");
    const quarterlyAt = print.indexOf("QUARTERLY");
    const operatorAt = print.indexOf("OPERATOR JOBS");
    expect(monthlyAt).toBeGreaterThan(-1);
    expect(quarterlyAt).toBeGreaterThan(monthlyAt);
    expect(operatorAt).toBeGreaterThan(quarterlyAt);
    // EV chargers print in the monthly group (D19), not quarterly.
    expect(print.indexOf("load-ev-chargers")).toBeGreaterThan(monthlyAt);
    expect(print.indexOf("load-ev-chargers")).toBeLessThan(quarterlyAt);
    // The quarterly rhythm is stated in the plan's own terms.
    expect(print).toContain("Jan/Apr/Jul/Oct");
    // Operator jobs print as operator jobs, after every timed group.
    expect(print.indexOf("load-noise")).toBeGreaterThan(operatorAt);
    expect(print.indexOf("load-priority-habitats")).toBeGreaterThan(operatorAt);
    // Timed loaders print their timeout; the monthly group runs on the 5th.
    expect(print).toContain("timeout 30 minutes");
    expect(print).toContain("on the 5th");
  });
});

describe("timeout drill — a fixture loader past a tiny timeout", () => {
  // The practice workflow cannot grow a break-timeout scenario
  // (workflow files are not editable by push), so the drill the
  // M5.15 check calls for lives here: two throwaway loaders in
  // loaders/, one that hangs and one that finishes, run through
  // the runner's own runLoader one after the other.
  const hangName = "load-zz-drill-hang";
  const okName = "load-zz-drill-ok";
  const hangPath = join(process.cwd(), "loaders", `${hangName}.mjs`);
  const okPath = join(process.cwd(), "loaders", `${okName}.mjs`);

  beforeAll(() => {
    writeFileSync(hangPath, "setInterval(() => {}, 1000);\n");
    writeFileSync(okPath, `console.log("${okName} · done");\n`);
  });
  afterAll(() => {
    rmSync(hangPath, { force: true });
    rmSync(okPath, { force: true });
  });

  it("is FAILED, labelled TIMED OUT in record and email, exits 1 — and the next loader still runs", async () => {
    const hung = await runLoader(hangName, [], 300);
    expect(hung.status).toBe("failed");
    expect(hung.errorMessage).toContain("TIMED OUT after");

    const run = {
      id: "run-drill",
      kind: "load",
      environment: "local",
      startedAt: new Date("2026-11-14T00:00:00Z"),
    };
    const { text } = buildEmailBodies(run as never, [hung] as never, null);
    expect(text).toContain("TIMED OUT after");
    expect(decideExitCode({ items: [hung] as never, alertStatus: "sent", noEmail: false })).toBe(1);

    const next = await runLoader(okName, [], 10_000);
    expect(next.status).toBe("succeeded");
    expect(next.logLine).toContain("done");
  });
});
