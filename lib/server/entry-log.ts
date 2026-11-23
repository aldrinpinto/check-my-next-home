// The entry point's decision log (entry-point build, 18 Nov
// 2026; founder requirement: "loggers at every place so I can
// check for a particular request whether it was filled by
// local first, or Postio, or the fallback").
//
// Every decision the hybrid makes — which layer answered,
// why, and how long it took — is written as ONE structured
// line on stdout, prefixed `entry`, carrying a request id.
// One request's whole path is one grep:
//
//   grep "entry req=<request-id>" <logfile>
//
// The events (see docs/entry-point.md for the full guide):
//   suggestions.served    the local suggestions behind one
//                         keystroke pause (layer=local —
//                         a keystroke never reaches Postio);
//   suggestions.limited   a suggestions call refused by the
//                         rate limit;
//   suggestions.ceiling   a full postcode's home list ran
//                         past the defensive ceiling and was
//                         truncated at it (D71 amendment —
//                         the truncation is logged, never
//                         silent);
//   picker.list           the picker list's composition —
//                         the local rows as filed (BUG-185:
//                         a list build is local-only, always);
//   picker.supplement     the on-demand supplement's
//                         composition — the visitor's one
//                         click: how many rows Postio
//                         supplied and how many duplicates
//                         were merged (or why none were);
//   supplement.limited    a supplement call refused by
//                         the rate limit;
//   postio.call           one Postio call's outcome (ok /
//                         timeout / error / zero-balance /
//                         no-key / refused);
//   pick.resolved         a pick's resolution — which layer
//                         carried it and why;
//   transient.created     a transient resolve record was
//                         written for a Postio pick;
//   transient.served      a route re-derived a home from a
//                         transient record;
//   transient.promoted    the picked home is now filed
//                         locally; its canonical home key
//                         takes over and the record lapses;
//   transient.expired     a record outlived its 24 hours
//                         and was deleted on sight;
//   fallback.notice       the mid-pick fallback notice was
//                         served (a pick degraded to the
//                         whole-postcode check).
//
// Fields are plain key=value pairs, values without spaces,
// so the lines stay greppable and diff-able. The typed query
// itself is never logged — only its classified shape and
// length (an address fragment is a visitor's data; the log
// needs the decision, not the words).

import { randomUUID } from "node:crypto";

export type EntryEvent =
  | "suggestions.served"
  | "suggestions.limited"
  | "suggestions.ceiling"
  | "picker.list"
  | "picker.supplement"
  | "supplement.limited"
  | "postio.call"
  | "pick.resolved"
  | "transient.created"
  | "transient.served"
  | "transient.promoted"
  | "transient.expired"
  | "fallback.notice";

export type EntryLayer = "local" | "postio" | "hybrid" | "transient" | "fallback";

export interface EntryFields {
  layer: EntryLayer;
  reason?: string;
  ms?: number;
  [key: string]: string | number | boolean | undefined;
}

// A fresh request id: short enough to grep, unique enough
// to follow one visitor action through the layers.
export function newRequestId(): string {
  return randomUUID().slice(0, 8);
}

function formatValue(value: string | number | boolean): string {
  const text = String(value);
  return /[\s=]/.test(text) ? JSON.stringify(text) : text;
}

// The one writer. Tests replace the sink to capture lines;
// production writes to stdout, where the server's log
// collector picks it up beside the loaders' own lines.
let sink: (line: string) => void = (line) => console.log(line);

export function setEntryLogSink(next: ((line: string) => void) | null): void {
  sink = next ?? ((line) => console.log(line));
}

export function logEntry(req: string, event: EntryEvent, fields: EntryFields): void {
  const parts = [`entry`, `req=${req}`, `event=${event}`, `layer=${fields.layer}`];
  if (fields.reason !== undefined) parts.push(`reason=${formatValue(fields.reason)}`);
  if (fields.ms !== undefined) parts.push(`ms=${Math.round(fields.ms)}`);
  for (const [key, value] of Object.entries(fields)) {
    if (key === "layer" || key === "reason" || key === "ms" || value === undefined) continue;
    parts.push(`${key}=${formatValue(value)}`);
  }
  sink(parts.join(" "));
}

// Millisecond clock for the ms= field — performance.now()
// where available, Date.now() otherwise.
export function entryNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
