import { describe, expect, it } from "vitest";

import type { AddressQueryable } from "../lib/address";
import { createDistrictSource, DEFENCE_WATERCOURSES_SQL } from "../lib/district";

// The district source's SQL forms (founder fix batch,
// 19 Nov 2026 — audit Part 3, the district latency item).
//
// The defences corridor query used to run a geography
// ST_DWithin inside an EXISTS over every district
// postcode for each of the 834 filed defences — measured
// at 8–10s of the district page's 12–14s. The rewritten
// form restricts the candidate defences first, by the
// district's expanded bounding box through the GiST
// index (migration 0024's flood_defences_geom_idx), and
// runs the exact geography test only for those
// candidates. Same results by construction — the box is
// a strict superset of the 2-mile corridor at every UK
// latitude — and proven so against real PostGIS by
// db/prove.mjs, which runs the pre-fix form and this form
// over the same filed fixtures and asserts the same
// watercourse set. This file pins the form the source
// actually emits, so the proof and the product cannot
// drift apart silently.

class CapturingDb implements AddressQueryable {
  queries: { text: string; params: readonly unknown[] }[] = [];
  floodCovered = true;

  async query(text: string, params: readonly unknown[] = []) {
    this.queries.push({ text, params });
    if (text.includes("FROM flood_defences")) {
      // In the query's own ORDER BY order, as the real
      // read returns them.
      return { rows: [{ name: "River Brain" }, { name: "River Chelmer" }] };
    }
    if (text.includes("count(*)::int AS n FROM flood_layers")) {
      return { rows: [{ n: 500 }] };
    }
    if (text.includes("FROM flood_layers WHERE layer_type = $1 LIMIT 1")) {
      return { rows: [{ source_name: "Environment Agency", source_date: "2025-06-01" }] };
    }
    if (text.includes("ST_ConvexHull")) {
      return { rows: [{ covered: this.floodCovered }] };
    }
    if (text.includes("ST_Covers")) {
      return {
        rows: [
          { postcode: "ZZ9 1AA", label: "High" },
          { postcode: "ZZ9 1AB", label: null },
        ],
      };
    }
    throw new Error(`CapturingDb: unhandled SQL: ${text}`);
  }
}

describe("district source — the defences corridor query (audit Part 3)", () => {
  it("emits the index-assisted prefilter form, never the bare per-defence EXISTS scan", async () => {
    const db = new CapturingDb();
    const source = createDistrictSource(db);
    const names = await source.defenceWatercourses(["ZZ9 1AA", "ZZ9 1AB"]);
    expect(names).toEqual(["River Brain", "River Chelmer"]);
    const emitted = db.queries.find((query) => query.text.includes("FROM flood_defences"));
    expect(emitted?.text).toBe(DEFENCE_WATERCOURSES_SQL);
    // The prefilter: candidates restricted by the
    // district's extent, expanded, through the && box
    // operator the GiST index serves — before any
    // geography distance work.
    expect(emitted?.text).toContain("ST_Expand(ST_Extent(geom), 0.06)");
    expect(emitted?.text).toContain("fd.geom && district.box");
    // The exact test survives untouched for the
    // candidates: the same geography ST_DWithin at the
    // same 2-mile radius.
    expect(emitted?.text).toContain("ST_DWithin(fd.geom::geography, pc.geom::geography, 3218.688)");
    expect(emitted?.params).toEqual([["ZZ9 1AA", "ZZ9 1AB"]]);
  });

  it("answers no postcodes with no query at all", async () => {
    const db = new CapturingDb();
    const source = createDistrictSource(db);
    expect(await source.defenceWatercourses([])).toEqual([]);
    expect(db.queries).toHaveLength(0);
  });
});

describe("district source — flood layer coverage (audit item 14)", () => {
  it("reads the layer's coverage of this district from the filed shapes and passes it through", async () => {
    const db = new CapturingDb();
    const source = createDistrictSource(db);
    const facts = await source.floodFacts("rofrs", ["ZZ9 1AA", "ZZ9 1AB"]);
    expect(facts.filedCount).toBe(500);
    expect(facts.covered).toBe(true);
    expect(facts.assignments).toEqual([
      { postcode: "ZZ9 1AA", label: "High" },
      { postcode: "ZZ9 1AB", label: null },
    ]);
    const coverage = db.queries.find((query) => query.text.includes("ST_ConvexHull"));
    expect(coverage?.text).toContain("ST_Intersects(fl.geom, hull.g)");
  });

  it("reports an uncovered district as uncovered even where shapes are filed", async () => {
    const db = new CapturingDb();
    db.floodCovered = false;
    const source = createDistrictSource(db);
    const facts = await source.floodFacts("rofsw", ["ZZ9 1AA"]);
    expect(facts.filedCount).toBe(500);
    expect(facts.covered).toBe(false);
  });
});
