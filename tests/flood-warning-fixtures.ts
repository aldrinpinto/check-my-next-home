import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFloodWarningItems,
  type FloodWarningItem,
  type FloodWarningSource,
} from "../lib/flood";

// The M6.22 live-warning fixtures: the two Environment
// Agency items captured live from the flood-monitoring API
// during the M6.22 prep (15 Nov 2026) and re-verified live
// at the M6.22 build's first contact (16 Nov 2026) — a
// River Leadon flood alert (raised 2026-11-15T16:35:59) and
// a tidal Rivers Bure, Ant and Thurne flood alert (raised
// 2026-11-15T09:00:34), each the verbatim item of the
// geo-filtered /id/floods response the live source consumes
// (tests/fixtures/flood-warnings/*.json). They are replayed
// through the real parser, so the fake source below serves
// exactly what the live source would return for them.

const __dirname = dirname(fileURLToPath(import.meta.url));

function fixtureItem(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, "fixtures", "flood-warnings", name), "utf8"));
}

export const LEADON_RAW = fixtureItem("leadon-alert.json");
export const BURE_RAW = fixtureItem("bure-ant-thurne-alert.json");

export const LEADON_ITEM: FloodWarningItem = parseFloodWarningItems({ items: [LEADON_RAW] })[0];
export const BURE_ITEM: FloodWarningItem = parseFloodWarningItems({ items: [BURE_RAW] })[0];

// A level-4 form of the Leadon item ("Warning no longer in
// force" — the EA's documented level-4 label): no level-4
// item was live at capture, so this one is derived from the
// real item's shape with the documented label, to prove the
// filter. It is never served.
export const LAPSED_ITEM: FloodWarningItem = {
  ...LEADON_ITEM,
  severity: "Warning no longer in force",
  severityLevel: 4,
};

// A programmable fake warning source: serves `items`, or
// throws `error`, and records every call — the cache proofs
// count calls to prove composition happens per serve and is
// never memoised.
export class FakeFloodWarningSource implements FloodWarningSource {
  items: FloodWarningItem[] = [];
  error: Error | null = null;
  calls: { latitude: number; longitude: number }[] = [];

  async warningsNear(latitude: number, longitude: number): Promise<FloodWarningItem[]> {
    this.calls.push({ latitude, longitude });
    if (this.error) throw this.error;
    return this.items;
  }
}

// A fixed serve instant inside the fixtures' own weekend:
// 2026-11-16T06:54:00Z is 06:54 in London (GMT in November).
export const WARNING_NOW = new Date("2026-11-16T06:54:00.000Z");
