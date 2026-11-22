// The journey events recorder (plan step M7.14) — the
// server half of lib/journey-events.ts's pinned catalogue.
//
// Two rules govern everything here:
//
//   FIRE-AND-FORGET. Counting never slows or breaks the
//   journeys it measures: recordJourneyEvent never throws,
//   and a failed write changes nothing the visitor sees —
//   the outcome is a value ('recorded' | 'duplicate' |
//   'dropped') the caller may log and always ignores.
//
//   THE SCAN RUNS HERE TOO. Every payload — a client's
//   post or server code's own record — passes
//   assertJourneyEventSafe before it is stored. The
//   no-address rule has no side door.
//
// The page-error class (D45) adds alerting on top of the
// record: the first sighting of an error fingerprint, or
// a spike past the pinned threshold inside a rolling
// hour, sends ONE alert email through the same Resend
// path the data loaders use (loaders/run-loaders.mjs's
// pattern: RESEND_API_KEY, ALERT_EMAIL_TO, one project
// inbox). The alert send never holds a request: it runs
// on a detached chain, and the fingerprint is marked
// alerted only when the send succeeds, so a failed send
// is retried by a later occurrence — never one email per
// error, and never silence because Resend blinked.

import type { AddressQueryable } from "../address";
import { envValue } from "./env";
import {
  assertJourneyEventSafe,
  browserClassOf,
  ERROR_SPIKE_THRESHOLD,
  ERROR_SPIKE_WINDOW_MS,
  errorFingerprint,
  journeyEventSpec,
  sanitiseErrorMessage,
  sanitiseErrorName,
  stepOfRoutePattern,
  type JourneyEventInput,
} from "../journey-events";

export type RecordOutcome = "recorded" | "duplicate" | "dropped";

const INSERT_SQL = `
  INSERT INTO journey_events
    (event, surface, route_pattern, rung, nation, sections, states,
     error_name, error_message, browser_class, dedupe_key, details)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id`;

function insertParams(input: JourneyEventInput): unknown[] {
  return [
    input.event,
    input.surface ?? "website",
    input.routePattern ?? null,
    input.rung ?? null,
    input.nation ?? null,
    input.sections ?? null,
    input.states ? JSON.stringify(input.states) : null,
    input.errorName ?? null,
    input.errorMessage ?? null,
    input.browserClass ?? null,
    input.dedupeKey ?? null,
    JSON.stringify(input.details ?? {}),
  ];
}

export async function recordJourneyEvent(
  db: AddressQueryable,
  input: JourneyEventInput,
): Promise<RecordOutcome> {
  try {
    if (!journeyEventSpec(input.event)) return "dropped";
    assertJourneyEventSafe(input);
    const { rows } = await db.query(INSERT_SQL, insertParams(input));
    return (rows as unknown[]).length > 0 ? "recorded" : "duplicate";
  } catch (error) {
    // A dropped count is a gap in a chart; a thrown error
    // here would be a broken journey. The drop is logged
    // in the entry-log style so it is greppable beside the
    // serve layer's own lines.
    console.warn(
      `journey event=${input.event} outcome=dropped reason=${
        error instanceof Error ? error.message.slice(0, 120) : "unknown"
      }`,
    );
    return "dropped";
  }
}

// ------------------------------------------------------------------
// The error class: record + alert evaluation (D45)
// ------------------------------------------------------------------

export interface PageErrorInput {
  errorName?: string | null;
  errorMessage?: string | null;
  routePattern?: string | null;
  userAgent?: string | null;
  browserClass?: string | null;
  dedupeKey?: string | null;
}

interface AlertEmail {
  subject: string;
  text: string;
}

// The Resend send, in run-loaders.mjs's shape — a value,
// never a throw. One attempt only: this path is detached
// from the request, and a failed send is retried by the
// next occurrence of the error, not by a loop here.
async function sendAlertEmail(email: AlertEmail): Promise<boolean> {
  // Both names read through envValue (BUG-148): a
  // name the compose file passes empty counts as
  // unset, so the alert's recipient falls back to the
  // project inbox instead of an empty address.
  const key = envValue("RESEND_API_KEY");
  if (!key) return false;
  const to = envValue("ALERT_EMAIL_TO") ?? "checkmynexthome@gmail.com";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Check My Next Home <onboarding@resend.dev>",
        to: [to],
        subject: email.subject,
        text: email.text,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// The detached alert chain: sends (and their alerted
// markings) run here, off the request path. Tests await
// whenJourneyAlertsSettled() to observe the outcome.
let alertChain: Promise<void> = Promise.resolve();

export function whenJourneyAlertsSettled(): Promise<void> {
  return alertChain;
}

function queueAlert(task: () => Promise<void>): void {
  alertChain = alertChain.then(task).catch(() => {
    // The chain survives any single alert's failure; the
    // fingerprint simply stays unmarked and a later
    // occurrence retries.
  });
}

export async function recordPageError(
  db: AddressQueryable,
  input: PageErrorInput,
): Promise<RecordOutcome> {
  const errorName = sanitiseErrorName(input.errorName);
  const errorMessage = sanitiseErrorMessage(input.errorMessage);
  const routePattern = input.routePattern ?? null;
  const eventInput: JourneyEventInput = {
    event: "page_error",
    routePattern,
    errorName,
    errorMessage,
    browserClass: input.browserClass ?? browserClassOf(input.userAgent),
    dedupeKey: input.dedupeKey ?? null,
    details: { step: stepOfRoutePattern(routePattern) },
  };
  const outcome = await recordJourneyEvent(db, eventInput);
  if (outcome !== "recorded") return outcome;

  // Alert evaluation — reads and the alert-memory upsert
  // are awaited (they are the record); only the email
  // send itself is detached.
  try {
    const fingerprint = errorFingerprint({ event: "page_error", errorName, routePattern });
    const { rows: existingRows } = await db.query(
      `SELECT total_count, last_alert_at FROM journey_event_alerts WHERE fingerprint = $1`,
      [fingerprint],
    );
    const existing = (
      existingRows as unknown as { total_count: string; last_alert_at: Date | null }[]
    )[0];
    const { rows: hourRows } = await db.query(
      `SELECT count(*)::int AS n FROM journey_events
        WHERE event = 'page_error'
          AND error_name IS NOT DISTINCT FROM $1
          AND route_pattern IS NOT DISTINCT FROM $2
          AND occurred_at > now() - ($3 * interval '1 millisecond')`,
      [errorName, routePattern, ERROR_SPIKE_WINDOW_MS],
    );
    const hourCount = (hourRows as unknown as { n: number }[])[0]?.n ?? 0;

    let reason: "first-seen" | "spike" | null = null;
    if (!existing) {
      reason = "first-seen";
    } else if (
      hourCount >= ERROR_SPIKE_THRESHOLD &&
      (existing.last_alert_at === null ||
        Date.now() - new Date(existing.last_alert_at).getTime() >= ERROR_SPIKE_WINDOW_MS)
    ) {
      reason = "spike";
    }

    await db.query(
      `INSERT INTO journey_event_alerts
         (fingerprint, event, error_name, route_pattern, total_count, last_seen_at)
       VALUES ($1, 'page_error', $2, $3, 1, now())
       ON CONFLICT (fingerprint) DO UPDATE
         SET total_count = journey_event_alerts.total_count + 1,
             last_seen_at = now()`,
      [fingerprint, errorName, routePattern],
    );

    if (reason) {
      const name = errorName ?? "(unnamed error)";
      const where = routePattern ?? "(no route)";
      const email: AlertEmail =
        reason === "first-seen"
          ? {
              subject: `New page error on Check My Next Home — ${name} on ${where}`,
              text: [
                `A page error type has been seen for the first time.`,
                ``,
                `Error: ${name}`,
                `Page: ${where}`,
                errorMessage ? `Message: ${errorMessage}` : `Message: (none recorded)`,
                ``,
                `The full record is in the journey_events table (D45); Sentry carries the stack traces.`,
              ].join("\n"),
            }
          : {
              subject: `Page error spike on Check My Next Home — ${name} on ${where}`,
              text: [
                `A page error has spiked: ${hourCount} in the last hour (the alert threshold is ${ERROR_SPIKE_THRESHOLD}).`,
                ``,
                `Error: ${name}`,
                `Page: ${where}`,
                errorMessage ? `Latest message: ${errorMessage}` : `Message: (none recorded)`,
                ``,
                `The full record is in the journey_events table (D45); Sentry carries the stack traces.`,
              ].join("\n"),
            };
      queueAlert(async () => {
        const sent = await sendAlertEmail(email);
        if (sent) {
          await db.query(
            `UPDATE journey_event_alerts SET last_alert_at = now(), last_alert_reason = $2
              WHERE fingerprint = $1`,
            [fingerprint, reason],
          );
        }
      });
    }
  } catch {
    // Alerting is a side record of the error, never a
    // second failure on top of it.
  }
  return outcome;
}
