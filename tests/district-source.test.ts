import { describe, expect, it } from "vitest";

import type { AddressQueryable } from "../lib/address";
import { cleanSettlements, createDistrictSource, DEFENCE_WATERCOURSES_SQL } from "../lib/district";

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

// The places() composition and the settlement filter's
// county set (BUG-034 residual, 20 Nov 2026). The first
// BUG-034 build handed the filter only the district's
// own filed counties; where a district's sales rows
// file no county the set was empty, and the county the
// picking index files as a town stood as a settlement
// on the live place page (CM11, CM2). These pins run
// the REAL source against a fake register in exactly
// that shape — the fake the first build's tests used
// agreed with the code, so this one is built from the
// live failure's rows instead.
class PlacesDb implements AddressQueryable {
  queries: { text: string; params: readonly unknown[] }[] = [];
  localityRows: { locality: string; filings: number }[] = [];
  townRows: { town: string; filings: number }[] = [];
  indexTownRows: { town: string; filings: number }[] = [];
  districtCountyRows: { county: string }[] = [];
  nationalCountyRows: { county: string }[] = [];
  settlementRows: { locality: string; postcode: string }[] = [];

  async query(text: string, params: readonly unknown[] = []) {
    this.queries.push({ text, params });
    if (text.includes("min(postcode)")) return { rows: this.settlementRows };
    if (text.includes("GROUP BY county")) {
      // BUG-307: the district's own counties are read
      // counted and ranked, most-filed first.
      return { rows: this.districtCountyRows };
    }
    if (text.includes("SELECT DISTINCT county")) {
      // The district's own counties are read through
      // its outward prefix; the register-wide set is
      // the one read with no prefix in it.
      return {
        rows: text.includes("starts_with") ? this.districtCountyRows : this.nationalCountyRows,
      };
    }
    if (text.includes("FROM picking_index")) return { rows: this.indexTownRows };
    if (text.includes("locality")) return { rows: this.localityRows };
    if (text.includes("FROM price_paid")) return { rows: this.townRows };
    throw new Error(`PlacesDb: unhandled SQL: ${text}`);
  }
}

describe("district source — places() and the register-wide county set (BUG-034 residual)", () => {
  function cm11Db(): PlacesDb {
    const db = new PlacesDb();
    // The district's sales rows file localities but no
    // county at all; the picking index files ESSEX as a
    // town, upper case; the register at large files the
    // county in title case.
    db.localityRows = [
      { locality: "BILLERICAY", filings: 700 },
      { locality: "ESSEX", filings: 7 },
      { locality: "DOWNHAM", filings: 40 },
    ];
    db.indexTownRows = [{ town: "ESSEX", filings: 24 }];
    db.districtCountyRows = [];
    db.nationalCountyRows = [{ county: "Essex" }];
    return db;
  }

  it("keeps counties the district's own (empty) and hands the filter the union set", async () => {
    const db = cm11Db();
    const source = createDistrictSource(db);
    const places = await source.places("CM11");
    expect(places.counties).toEqual([]);
    expect(places.settlementCounties).toEqual(["Essex"]);
    // The served outcome, composed exactly as the
    // bundle builder composes it: no Essex, in any
    // case, among the settlements.
    expect(cleanSettlements(places.localities, places.settlementCounties)).toEqual([
      "Billericay",
      "Downham",
    ]);
  });

  it("reads the register-wide set once per pool, however many districts are composed", async () => {
    const db = cm11Db();
    const source = createDistrictSource(db);
    await source.places("CM11");
    await source.places("CM2");
    const nationalReads = db.queries.filter(
      (query) =>
        query.text.includes("SELECT DISTINCT county") && !query.text.includes("starts_with"),
    );
    expect(nationalReads).toHaveLength(1);
    // The district's own counties are still read per
    // district — only the register-wide set is cached.
    const districtReads = db.queries.filter((query) => query.text.includes("GROUP BY county"));
    expect(districtReads).toHaveLength(2);
  });

  it("BUG-307: ranks the district's filed counties most-filed first, and hands the filter the union set", async () => {
    const db = cm11Db();
    // The SQL ranks by filings, so the fake returns the
    // rows in the ranked order the SQL would serve:
    // Essex the district's county by a wide margin, Luton
    // a stray filing alongside it.
    db.districtCountyRows = [{ county: "Essex" }, { county: "Luton" }];
    const source = createDistrictSource(db);
    const places = await source.places("CM11");
    expect(places.counties).toEqual(["Essex", "Luton"]);
    expect(places.settlementCounties).toEqual(["Essex", "Luton"]);
  });
});
