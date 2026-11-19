// The site-down heartbeat (plan step M7.14; D45's
// site-down half).
//
// A site that is down entirely cannot report through a
// browser, so this check runs OUTSIDE the app: it
// requests the homepage and one check route over the
// public origin every few minutes (a cron wherever it
// is scheduled — see docs/journey-digest-howto.md).
// Two consecutive failures send ONE alert email through
// the Resend path; a success after an alerted outage
// sends one recovery email. Nothing else emails — a
// single blip is a state change, not an alarm.
//
// The state between runs is one small JSON file:
//   { consecutiveFailures, downAlertedAt }
// Override its home with HEARTBEAT_STATE. The origin is
// APP_ORIGIN (default the production origin; the play
// server's origin on the play deployment).
//
// Placement, named at build: the realistic failures this
// catches are the app, the tunnel and the public path.
// It should be scheduled on a host OTHER than the server
// it watches wherever one exists — on the server itself
// it still covers app/tunnel/path failure, and total
// box death is the one failure it cannot see from there.
// The how-to carries the cron lines for both placements.
//
// Usage: node scripts/heartbeat.mjs
// Environment: RESEND_API_KEY and ALERT_EMAIL_TO as the
// loaders use them (process, or .env.local / .env).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ORIGIN = (process.env.APP_ORIGIN ?? "https://checkmynexthome.co.uk").replace(/\/$/, "");
const STATE_PATH =
  process.env.HEARTBEAT_STATE ??
  join(dirname(fileURLToPath(import.meta.url)), "heartbeat-state.json");
const CHECK_PATHS = ["/", "/check/schools"];
const FAILURE_THRESHOLD = 2;
const REQUEST_TIMEOUT_MS = 15_000;

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

function readState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    return {
      consecutiveFailures: Number(parsed.consecutiveFailures) || 0,
      downAlertedAt: typeof parsed.downAlertedAt === "string" ? parsed.downAlertedAt : null,
    };
  } catch {
    return { consecutiveFailures: 0, downAlertedAt: null };
  }
}

function writeState(state) {
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

async function sendEmail(subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const to = process.env.ALERT_EMAIL_TO ?? "checkmynexthome@gmail.com";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Check My Next Home <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function checkOne(path) {
  try {
    const response = await fetch(`${ORIGIN}${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { "User-Agent": "cmnh-heartbeat" },
    });
    return { path, ok: response.status === 200, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { path, ok: false, detail: error instanceof Error ? error.name : "fetch failed" };
  }
}

async function main() {
  loadEnvLocal();
  const state = readState();
  const results = await Promise.all(CHECK_PATHS.map(checkOne));
  const failures = results.filter((result) => !result.ok);
  const stamp = new Date().toISOString();

  if (failures.length === 0) {
    if (state.downAlertedAt) {
      const sent = await sendEmail(
        "Check My Next Home is back up",
        `The heartbeat can reach the site again (${ORIGIN}).\n\nThe outage was first alerted at ${state.downAlertedAt}; recovery was seen at ${stamp}.\n`,
      );
      console.log(
        `heartbeat ${stamp}: recovered — all checks pass; recovery email ${sent ? "sent" : "FAILED to send"}.`,
      );
    } else {
      console.log(`heartbeat ${stamp}: ok — ${CHECK_PATHS.join(" and ")} both answer 200.`);
    }
    writeState({ consecutiveFailures: 0, downAlertedAt: null });
    return;
  }

  const next = {
    consecutiveFailures: state.consecutiveFailures + 1,
    downAlertedAt: state.downAlertedAt,
  };
  const detail = failures.map((f) => `${f.path} — ${f.detail}`).join("; ");
  if (next.consecutiveFailures >= FAILURE_THRESHOLD && !next.downAlertedAt) {
    const sent = await sendEmail(
      "Check My Next Home looks down",
      `The heartbeat has failed ${next.consecutiveFailures} times in a row against ${ORIGIN}.\n\nFailing now: ${detail}.\nFirst failure of this run was recorded before ${stamp}.\n`,
    );
    if (sent) next.downAlertedAt = stamp;
    console.log(
      `heartbeat ${stamp}: DOWN — ${detail}; alert email ${sent ? "sent" : "FAILED to send (will retry next run)"}.`,
    );
  } else {
    console.log(
      `heartbeat ${stamp}: failure ${next.consecutiveFailures} — ${detail}${next.downAlertedAt ? " (already alerted)" : ""}.`,
    );
  }
  writeState(next);
}

main().catch((error) => {
  console.error(`heartbeat: failed — ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
