import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the planning areas loader (plan step M5.2): conservation
// areas and Article 4 areas file as current entities only, the
// geometry-less rows are counted rather than silently dropped,
// the Article 4 publication gate is filed with the load, and the
// fixture (real rows captured 12 Nov 2026) reproduces the golden
// facts the prep and gap check established — above all that
// Newham's Article 4 answer state is "not published", never
// "none" (gap L1). The live proof runs in CI against a real
// PostGIS, and the loader's own golden checks run in both modes.

const loader = readFileSync(join(process.cwd(), "loaders/load-planning-areas.mjs"), "utf8");
const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/planning-areas");

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const push = () => {
    row.push(field);
    field = "";
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") push();
    else if (ch === "\n") {
      push();
      rows.push(row);
      row = [];
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    push();
    rows.push(row);
  }
  const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .slice(1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const ca = parseCsv(readFileSync(join(fixtureDir, "conservation-area.csv"), "utf8"));
const a4 = parseCsv(readFileSync(join(fixtureDir, "article-4-direction-area.csv"), "utf8"));
const dirs = parseCsv(readFileSync(join(fixtureDir, "article-4-direction.csv"), "utf8"));
const current = (rows: Record<string, string>[]) => rows.filter((r) => r["end-date"] === "");

describe("planning areas loader sources", () => {
  it("reads the three planning.data.gov.uk bulk files", () => {
    expect(loader).toContain("files.planning.data.gov.uk/dataset");
    expect(loader).toContain("conservation-area");
    expect(loader).toContain("article-4-direction-area");
    expect(loader).toContain("article-4-direction");
  });

  it("files shapes through PostGIS with the M5.2 provenance columns", () => {
    expect(loader).toContain("ST_Multi(ST_GeomFromText");
    expect(loader).toContain("source_reference");
    expect(loader).toContain("organisation");
    expect(loader).toContain("quality");
    expect(loader).toContain("permitted-development-rights");
  });

  it("excludes ended rows and counts geometry-less rows in the log line", () => {
    expect(loader).toContain('"end-date"');
    expect(loader).toContain("without geometry counted");
    expect(loader).toContain("ended excluded");
  });

  it("files the Article 4 gate and states the not-published rule", () => {
    expect(loader).toContain("article4_publishers");
    expect(loader).toContain("not published by the council to the national dataset");
  });

  it("the canary probes every planning dataset", () => {
    expect(canary).toContain("PLANNING_DATASETS");
    for (const dataset of [
      "conservation-area",
      "article-4-direction-area",
      "green-belt",
      "listed-building",
      "scheduled-monument",
    ]) {
      expect(canary).toContain(`"${dataset}"`);
    }
  });
});

describe("fixture golden facts", () => {
  it("the empty-result proof basis: per-layer current counts are positive and exact", () => {
    // Test-first item 1: a "none found" answer is only provable
    // against a layer that demonstrably loaded — the fixture's
    // own current-row counts are what the loader's filed counts
    // must equal in CI (filed = current with geometry).
    expect(current(ca)).toHaveLength(119);
    expect(current(a4)).toHaveLength(310);
    expect(current(dirs)).toHaveLength(147);
    expect(current(ca).filter((r) => r["geometry"] !== "")).toHaveLength(116);
    expect(current(a4).filter((r) => r["geometry"] !== "")).toHaveLength(309);
  });

  it("geometry-less current conservation areas are in the file to be counted (L3)", () => {
    expect(current(ca).filter((r) => r["geometry"] === "")).toHaveLength(3);
  });

  it("the golden conservation areas are present by reference", () => {
    const refs = new Set(ca.map((r) => r["reference"]));
    expect(refs.has("4452")).toBe(true); // Chelmer and Blackwater Navigation — Birkdale's nearest
    expect(refs.has("TH-28-NRC")).toBe(true); // Naval Row — Exeter's nearest
    expect(refs.has("000008/CONARA")).toBe(true); // Ewell Village — Epsom's nearest
  });

  it("the gate: Epsom and Tower Hamlets publish Article 4 areas; Newham and Braintree do not (L1)", () => {
    const publishers = new Set(current(a4).map((r) => r["organisation-entity"]));
    expect(publishers.has("129")).toBe(true); // Epsom and Ewell
    expect(publishers.has("350")).toBe(true); // Tower Hamlets
    expect(publishers.has("246")).toBe(false); // Newham — "not published", never "none"
    expect(publishers.has("56")).toBe(false); // Braintree — likewise
  });

  it("the Ewell Village Article 4 area carries its removed-rights codes as published", () => {
    const ewell = a4.find((r) => r["reference"] === "11/00002/ART4");
    expect(ewell?.["permitted-development-rights"]).toBe("1A;1C;1D;1F;2A;2B");
  });

  it("a known ended Article 4 area is in the file, ended, to be excluded (L4)", () => {
    const ended = a4.find((r) => r["reference"] === "A4D-2015-RETAIL-TO-RESIDENTIAL-A17");
    expect(ended?.["end-date"]).toBe("2021-07-31");
  });
});

describe("progress — BUG-265", () => {
  // This loader's long phases live in main(), so the wiring
  // is pinned here in source and driven end-to-end in
  // tests/load-progress-bug265-c.test.ts.
  it("creates one logger and wires it through the reads, the staging loop and the gate", () => {
    expect(loader).toContain('createProgressLogger({ name: "load-planning-areas" })');
    expect(loader).toContain('label: "stage layers"');
    expect(loader).toContain('label: "stage gate"');
    expect(loader).toContain('label: "process conservation-area"');
    expect(loader).toContain("progress.failed({");
    expect(loader).toContain("swap started — filing");
  });
});
