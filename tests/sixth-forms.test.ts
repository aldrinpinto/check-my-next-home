import { describe, expect, it } from "vitest";
import type { AddressResolution, DirectoryPostcode } from "../lib/address";
import {
  RADIUS_MILES,
  buildNearbyBundle,
  haversineMiles,
  type CategoryAnswer,
  type NearbyDataSource,
  type NearbyPoint,
} from "../lib/nearby";
import { BANNED_WORDING } from "./banned-wording";

// Guards the sixth-form serving (plan step M6.33, decisions
// D51 and D64): a twenty-second nearby category, "sixth
// forms and colleges", read from the same schools filing
// as the school lists, and the sixthForm marker on the
// secondary places — the register's flag as filed, never
// derived. The category's selection is mainstream only
// (D64): every "16 plus" phase row plus the flagged rows
// of every other phase except Secondary, minus
// special-sector types, independent types, British
// schools overseas and Welsh establishments. The within
// list never repeats a school the secondary list serves;
// the beyond name may draw on flagged secondaries (ruling
// 4) but must sit strictly beyond the radius. The
// fixture-corpus outcomes are pinned in tests/nearby.test
// .ts; the cache behaviour in tests/bundle-cache.test.ts.

const HAS = "Has a sixth form";
const DOES_NOT = "Does not have a sixth form";
const NOT_APPLICABLE = "Not applicable";

// One filed schools row, as the loader files it (the
// brain's read columns): the fake below applies the
// brain's own selections, written out — the
// nearby.test.ts mirror pattern.
type Row = {
  name: string;
  phase: string | null;
  type: string | null;
  flag: string | null;
  selective?: boolean;
  latitude: number;
  longitude: number;
};

const HOME_LAT = 51.5;
const HOME_LNG = 0.02;
// Due-north placement: the served miles are computed from
// the same haversine the brain serves, so the offsets
// only need to be near their nominal distances.
const north = (miles: number) => HOME_LAT + miles / 69.0;
const row = (partial: Partial<Row> & { name: string; miles: number }): Row => ({
  phase: null,
  type: null,
  flag: null,
  latitude: north(partial.miles),
  longitude: HOME_LNG,
  ...partial,
});
const milesOf = (r: Row) =>
  Math.round(haversineMiles(HOME_LAT, HOME_LNG, r.latitude, r.longitude) * 1000) / 1000;

// The brain's marker CASE, written out (D64 ruling 7).
const markerOf = (flag: string | null): boolean | null =>
  flag === HAS ? true : flag === DOES_NOT ? false : null;

const excludedType = (type: string | null): boolean =>
  /special/i.test(type ?? "") ||
  /independent/i.test(type ?? "") ||
  type === "British schools overseas" ||
  type === "Welsh establishment";
const withinSel = (r: Row): boolean =>
  (r.phase === "16 plus" || (r.flag === HAS && r.phase !== "Secondary")) && !excludedType(r.type);
const beyondSel = (r: Row): boolean =>
  (r.phase === "16 plus" || r.flag === HAS) && !excludedType(r.type);

class FakeSource implements NearbyDataSource {
  rows: Row[] = [];
  sixthFormsFiled: number | null = null;
  async pointsWithin(
    category: string,
    latitude: number,
    longitude: number,
    radiusMiles: number,
  ): Promise<NearbyPoint[]> {
    const near = (r: Row) =>
      haversineMiles(latitude, longitude, r.latitude, r.longitude) <= radiusMiles;
    if (category === "schools-secondary")
      return this.rows
        .filter((r) => r.phase === "Secondary" && near(r))
        .map((r) => ({
          name: r.name,
          latitude: r.latitude,
          longitude: r.longitude,
          selective: r.selective ?? false,
          sixthForm: markerOf(r.flag),
        }));
    if (category === "schools-primary")
      return this.rows
        .filter((r) => r.phase === "Primary" && near(r))
        .map((r) => ({ name: r.name, latitude: r.latitude, longitude: r.longitude }));
    if (category === "sixth-forms")
      return this.rows
        .filter((r) => withinSel(r) && near(r))
        .map((r) => ({
          name: r.name,
          latitude: r.latitude,
          longitude: r.longitude,
          detail: r.type,
        }));
    return [];
  }
  async nearestPoint(
    category: string,
    latitude: number,
    longitude: number,
  ): Promise<NearbyPoint | null> {
    // The sixth-forms beyond read mirrors the real source:
    // the wider pool, strictly beyond the radius.
    const pool =
      category === "sixth-forms"
        ? this.rows.filter(beyondSel)
        : category === "schools-secondary"
          ? this.rows.filter((r) => r.phase === "Secondary")
          : [];
    let best: Row | null = null;
    let bestMiles = Infinity;
    for (const r of pool) {
      const d = haversineMiles(latitude, longitude, r.latitude, r.longitude);
      if (category === "sixth-forms" && d <= 5) continue; // BUG-110: beyond the 5-mile list radius
      if (d < bestMiles) {
        bestMiles = d;
        best = r;
      }
    }
    if (!best) return null;
    return {
      name: best.name,
      latitude: best.latitude,
      longitude: best.longitude,
      detail: category === "sixth-forms" ? best.type : null,
    };
  }
  async filedCount(category: string): Promise<number> {
    if (category === "sixth-forms")
      return this.sixthFormsFiled ?? this.rows.filter(withinSel).length;
    return 1000;
  }
  async industrialSiteFacts() {
    return { filedCount: 0, dataYear: null, sourceName: null, sourceDate: null, sites: [] };
  }
  async destinationsRelease() {
    return { filedCount: 0, ks4: null, ks5: null };
  }
}

function directory(partial: Partial<DirectoryPostcode> & { postcode: string }): DirectoryPostcode {
  return {
    latitude: HOME_LAT,
    longitude: HOME_LNG,
    council: null,
    ward: null,
    region: null,
    lsoaCode: "E01000001",
    msoaCode: "E02000001",
    ...partial,
  };
}

function home(): AddressResolution {
  return {
    rung: 1,
    kind: "home",
    directory: directory({ postcode: "ZZ1 1ZZ" }),
    address: {
      postcode: "ZZ1 1ZZ",
      paon: "1",
      saon: null,
      street: "SOME STREET",
      town: null,
      label: "1 Some Street",
    } as never,
  };
}

async function categoryOf(source: FakeSource, key: string): Promise<CategoryAnswer> {
  const bundle = await buildNearbyBundle(home(), source);
  if (bundle.kind !== "distances") throw new Error("expected distances");
  const found = bundle.categories.find((c) => c.category === key);
  if (!found) throw new Error(`category ${key} missing`);
  return found;
}

// The main scenario: every D64 clause exercised by a row
// inside the radius, plus the beyond pool beyond it.
const PHASE_COLLEGE = row({
  name: "Phase College",
  miles: 0.5,
  phase: "16 plus",
  type: "Further education",
  flag: NOT_APPLICABLE,
});
const FLAGGED_ALL_THROUGH = row({
  name: "Flagged All Through",
  miles: 0.8,
  phase: "All-through",
  type: "Academy converter",
  flag: HAS,
});
const SIXTEEN_NINETEEN = row({
  name: "Sixteen Nineteen Academy",
  miles: 1.1,
  phase: "16 plus",
  type: "Academy 16-19 converter",
  flag: HAS,
});
const FLAGGED_SECONDARY = row({
  name: "Flagged Secondary",
  miles: 0.3,
  phase: "Secondary",
  type: "Academy converter",
  flag: HAS,
});
const PLAIN_SECONDARY = row({
  name: "Plain Secondary",
  miles: 0.6,
  phase: "Secondary",
  type: "Community school",
  flag: DOES_NOT,
});
const SILENT_SECONDARY = row({
  name: "Silent Secondary",
  miles: 0.9,
  phase: "Secondary",
  type: "Community school",
  flag: NOT_APPLICABLE,
});
const EXCLUDED_ROWS: Row[] = [
  row({
    name: "Special College",
    miles: 0.4,
    phase: "16 plus",
    type: "Community special school",
    flag: NOT_APPLICABLE,
  }),
  row({
    name: "Special Flagged School",
    miles: 0.45,
    phase: "Not applicable",
    type: "Academy special converter",
    flag: HAS,
  }),
  row({
    name: "Special Post Sixteen",
    miles: 0.55,
    phase: "Not applicable",
    type: "Special post 16 institution",
    flag: NOT_APPLICABLE,
  }),
  row({
    name: "Sixth Form Centre",
    miles: 0.65,
    phase: "Not applicable",
    type: "Sixth form centres",
    flag: NOT_APPLICABLE,
  }),
  row({
    name: "Flagged Independent",
    miles: 0.7,
    phase: "Not applicable",
    type: "Other independent school",
    flag: HAS,
  }),
  row({
    name: "Independent College",
    miles: 0.75,
    phase: "16 plus",
    type: "Other independent school",
    flag: HAS,
  }),
  row({
    name: "Welsh Flagged",
    miles: 0.85,
    phase: "Not applicable",
    type: "Welsh establishment",
    flag: HAS,
  }),
  row({
    name: "Overseas Flagged",
    miles: 0.95,
    phase: "Not applicable",
    type: "British schools overseas",
    flag: HAS,
  }),
];
// BUG-110: the list radius is five miles now, so the
// "distant" rows stand beyond five to keep exercising
// the beyond pool.
const DISTANT_FLAGGED_SECONDARY = row({
  name: "Distant Flagged Secondary",
  miles: 6.2,
  phase: "Secondary",
  type: "Academy converter",
  flag: HAS,
});
const DISTANT_COLLEGE = row({
  name: "Distant College",
  miles: 7.4,
  phase: "16 plus",
  type: "Further education",
  flag: NOT_APPLICABLE,
});

function mainSource(): FakeSource {
  const source = new FakeSource();
  source.rows = [
    PHASE_COLLEGE,
    FLAGGED_ALL_THROUGH,
    SIXTEEN_NINETEEN,
    FLAGGED_SECONDARY,
    PLAIN_SECONDARY,
    SILENT_SECONDARY,
    ...EXCLUDED_ROWS,
    DISTANT_FLAGGED_SECONDARY,
    DISTANT_COLLEGE,
  ];
  return source;
}

describe("sixth forms — the category selection (M6.33, D51/D64)", () => {
  it("serves the phase-clause and flag-clause rows in distance order, type as filed, and nothing else", async () => {
    const cat = await categoryOf(mainSource(), "sixth-forms");
    expect(cat.label).toBe("sixth forms and colleges");
    expect(cat.state).toBe("within");
    expect(cat.countWithin).toBe(3);
    expect(cat.places).toEqual([
      {
        name: "Phase College",
        miles: milesOf(PHASE_COLLEGE),
        detail: "Further education",
        latitude: PHASE_COLLEGE.latitude,
        longitude: PHASE_COLLEGE.longitude,
      },
      {
        name: "Flagged All Through",
        miles: milesOf(FLAGGED_ALL_THROUGH),
        detail: "Academy converter",
        latitude: FLAGGED_ALL_THROUGH.latitude,
        longitude: FLAGGED_ALL_THROUGH.longitude,
      },
      {
        name: "Sixteen Nineteen Academy",
        miles: milesOf(SIXTEEN_NINETEEN),
        detail: "Academy 16-19 converter",
        latitude: SIXTEEN_NINETEEN.latitude,
        longitude: SIXTEEN_NINETEEN.longitude,
      },
    ]);
    // Name, type as filed, distance — no Ofsted element,
    // no marker, no rating (D64 ruling 5). The two extra
    // keys are the filed coordinates every named place in
    // the nearby answer carries since the M8.1 re-pin
    // (the Section 5 map's geometry) — not content.
    for (const place of cat.places)
      expect(Object.keys(place).sort()).toEqual([
        "detail",
        "latitude",
        "longitude",
        "miles",
        "name",
      ]);
  });

  it("excludes every D64-out row, however near: special-sector types, 'Special post 16 institution', 'Sixth form centres', independent types, Welsh establishments, British schools overseas", async () => {
    const cat = await categoryOf(mainSource(), "sixth-forms");
    const names = cat.places.map((p) => p.name);
    for (const excluded of EXCLUDED_ROWS) expect(names).not.toContain(excluded.name);
    expect(cat.countWithin).toBe(3);
  });

  it("never repeats a school the secondary list serves: the flagged secondary inside the radius is not in the category", async () => {
    const source = mainSource();
    const cat = await categoryOf(source, "sixth-forms");
    const secondary = await categoryOf(source, "schools-secondary");
    expect(secondary.places.map((p) => p.name)).toContain("Flagged Secondary");
    expect(cat.places.map((p) => p.name)).not.toContain("Flagged Secondary");
    const servedNames = [...cat.places, ...secondary.places].map((p) => p.name);
    expect(new Set(servedNames).size).toBe(servedNames.length);
  });
});

describe("sixth forms — the marker on secondary places (M6.33, D64 ruling 7)", () => {
  it("serves the flag as filed: true on 'Has', false on 'Does not have', null on 'Not applicable'", async () => {
    const secondary = await categoryOf(mainSource(), "schools-secondary");
    expect(secondary.places.map((p) => [p.name, p.sixthForm])).toEqual([
      ["Flagged Secondary", true],
      ["Plain Secondary", false],
      ["Silent Secondary", null],
    ]);
    for (const place of secondary.places) expect(place).toHaveProperty("sixthForm");
  });

  it("serves null where the register files no flag value at all", async () => {
    const source = new FakeSource();
    source.rows = [
      row({
        name: "Blank Flag Secondary",
        miles: 0.5,
        phase: "Secondary",
        type: "Community school",
        flag: null,
      }),
    ];
    const secondary = await categoryOf(source, "schools-secondary");
    expect(secondary.places).toHaveLength(1);
    expect(secondary.places[0].sixthForm).toBeNull();
  });

  it("puts the marker on no other category's places", async () => {
    const source = mainSource();
    source.rows.push(
      row({
        name: "Village Primary",
        miles: 0.2,
        phase: "Primary",
        type: "Community school",
        flag: HAS,
      }),
    );
    const bundle = await buildNearbyBundle(home(), source);
    if (bundle.kind !== "distances") throw new Error("expected distances");
    for (const cat of bundle.categories) {
      if (cat.category === "schools-secondary") continue;
      for (const place of cat.places) expect(place).not.toHaveProperty("sixthForm");
    }
  });
});

describe("sixth forms — the beyond name (M6.33, D64 ruling 4)", () => {
  it("names the nearest flagged secondary beyond the radius when the within selection is empty there", async () => {
    const source = new FakeSource();
    source.rows = [DISTANT_FLAGGED_SECONDARY, DISTANT_COLLEGE];
    const cat = await categoryOf(source, "sixth-forms");
    expect(cat.state).toBe("none-within");
    expect(cat.places).toEqual([]);
    expect(cat.beyondNearest).toEqual({
      name: "Distant Flagged Secondary",
      miles: milesOf(DISTANT_FLAGGED_SECONDARY),
      latitude: DISTANT_FLAGGED_SECONDARY.latitude,
      longitude: DISTANT_FLAGGED_SECONDARY.longitude,
    });
    expect(cat.line).toBe(
      `none within 5 miles — nearest is Distant Flagged Secondary, ${milesOf(DISTANT_FLAGGED_SECONDARY)} miles away (straight-line distance from the postcode point)`,
    );
  });

  it("never names a flagged secondary INSIDE the radius as the beyond name — the line would contradict itself", async () => {
    const source = new FakeSource();
    // The only sixth-form evidence within the radius is a
    // flagged secondary (which the category deliberately
    // does not repeat); the nearest nameable evidence
    // beyond it is the distant flagged secondary.
    source.rows = [FLAGGED_SECONDARY, DISTANT_FLAGGED_SECONDARY, DISTANT_COLLEGE];
    const cat = await categoryOf(source, "sixth-forms");
    expect(cat.state).toBe("none-within");
    expect(cat.countWithin).toBe(0);
    expect(cat.beyondNearest).toEqual({
      name: "Distant Flagged Secondary",
      miles: milesOf(DISTANT_FLAGGED_SECONDARY),
      latitude: DISTANT_FLAGGED_SECONDARY.latitude,
      longitude: DISTANT_FLAGGED_SECONDARY.longitude,
    });
  });

  it("names a within-selection row beyond the radius when no flagged secondary is nearer", async () => {
    const source = new FakeSource();
    source.rows = [DISTANT_COLLEGE];
    const cat = await categoryOf(source, "sixth-forms");
    expect(cat.state).toBe("none-within");
    expect(cat.beyondNearest).toEqual({
      name: "Distant College",
      miles: milesOf(DISTANT_COLLEGE),
      latitude: DISTANT_COLLEGE.latitude,
      longitude: DISTANT_COLLEGE.longitude,
    });
  });

  it("serves the ground empty line when the only filed evidence is unnamed — never silence, never an invented name", async () => {
    const source = new FakeSource();
    source.rows = [
      row({
        name: "",
        miles: 0.5,
        phase: "16 plus",
        type: "Further education",
        flag: NOT_APPLICABLE,
      }),
    ];
    const cat = await categoryOf(source, "sixth-forms");
    expect(cat.state).toBe("none-within");
    expect(cat.countWithin).toBe(1);
    expect(cat.places).toEqual([]);
    expect(cat.beyondNearest).toBeNull();
    expect(cat.line).toBe("no sixth forms and colleges within 5 miles of the postcode point");
  });
});

describe("sixth forms — the not-filed state (M6.33, D30)", () => {
  it("an empty selection filing serves not-filed, never an absence", async () => {
    const source = new FakeSource();
    source.rows = [];
    source.sixthFormsFiled = 0;
    const cat = await categoryOf(source, "sixth-forms");
    expect(cat.state).toBe("not-filed");
    expect(cat.places).toEqual([]);
    expect(cat.beyondNearest).toBeNull();
    expect(cat.line).toBe(
      "the sixth forms and colleges data is not filed yet, so no sixth forms and colleges answer can be given yet",
    );
  });
});

describe("sixth forms — the bundle's words (M6.33)", () => {
  it("no served string in the bundle carries banned wording", async () => {
    const bundle = await buildNearbyBundle(home(), mainSource());
    const strings: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
    };
    walk(bundle);
    expect(strings.length).toBeGreaterThan(20);
    // Filed names are data, not the step's words: strip
    // them before the scan (the M6.31 pattern).
    const filedNames = mainSource().rows.map((r) => r.name);
    for (const text of strings) {
      let stripped = text;
      for (const name of filedNames) stripped = stripped.split(name).join("");
      for (const term of BANNED_WORDING)
        expect(stripped.toLowerCase(), `${term} in "${text}"`).not.toContain(term);
    }
  });
});
