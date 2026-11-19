import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveAddressInput,
  type AddressDataSource,
  type AddressResolution,
  type DirectoryPostcode,
  type LoadedAddressParts,
} from "../lib/address";
import {
  CRIME_CALIBRATION_EXPLAINER,
  CRIME_EXPLAINER,
  CRIME_STALE_AFTER_MONTHS,
  CRIME_STILL_GATHERING_REASON,
  CrimeLoadPendingError,
  buildCrimeBundle,
  createCrimeSource,
  crimeLoadWaitMsFromEnv,
  type CrimeBundle,
  type CrimeDataSource,
  type FiledCrimeAnswer,
} from "../lib/crime";

// Crime in the brain (plan step M6.4, decision D24).
//
// The answer is served over the artefact the M4.3 loader files
// into postcode_cache.answers -> "crime": the Police.uk API's own
// counts within 1 mile of the postcode point for a 12-month
// window — the total, the full published category breakdown and
// the monthly counts as dated facts. Never a score, a rate, a
// ranking or a trend; never "safe" or "unsafe". Rung 1 and rung 2
// serve the identical answer, worded "recorded within 1 mile of
// this postcode"; rung 3 serves the named state only; Scotland
// and Northern Ireland get the named not-covered state; a window
// more than 3 months old (the loader guard's own threshold)
// serves with the named stale line, its counts unchanged.
//
// The filed artefacts below are re-derived from the raw Police.uk
// captures in tests/fixtures/police-uk with the loader's counting
// rules written out again — the transport/schools pattern — so
// the brain is tested against filed truth, not against the
// loader itself. Birkdale and Exeter are the M4.3 captures
// (12 Nov 2026); Minerva, Ewell Village and Hilgay were captured
// at M6.4's first load (14 Nov 2026), when the real loader filed
// the same three postcodes live and the two tallies were checked
// against each other exactly (see tests/golden-matrix.md).

// --- the filed artefacts, re-derived from the captures --------

const LOADER_BASIS =
  "Street-level crimes recorded within 1 mile of the postcode point (Police.uk API)";
const LOADER_SOURCE_NAME = "Police.uk street-level crime";

function monthIndex(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return y * 12 + (m - 1);
}
function monthName(index: number): string {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function filedArtefact(prefix: string, loadedAt: string): FiledCrimeAnswer {
  const dir = join(process.cwd(), "tests/fixtures/police-uk");
  const dates = JSON.parse(readFileSync(join(dir, "crimes-street-dates.json"), "utf8")) as {
    date: string;
  }[];
  const latest = dates
    .map((d) => d.date)
    .sort()
    .at(-1) as string;
  const months: { month: string; count: number }[] = [];
  const categories: Record<string, number> = {};
  for (let back = 11; back >= 0; back -= 1) {
    const month = monthName(monthIndex(latest) - back);
    const records = JSON.parse(readFileSync(join(dir, `${prefix}-${month}.json`), "utf8")) as {
      category?: string;
    }[];
    months.push({ month, count: records.length });
    for (const record of records) {
      const category = record.category ?? "unknown";
      categories[category] = (categories[category] ?? 0) + 1;
    }
  }
  return {
    total: months.reduce((sum, m) => sum + m.count, 0),
    windowFrom: months[0].month,
    windowTo: latest,
    months,
    categories,
    basis: LOADER_BASIS,
    sourceName: LOADER_SOURCE_NAME,
    sourceDate: latest,
    loadedAt,
  };
}

const ARTEFACTS = new Map<string, FiledCrimeAnswer>([
  ["CM3 2JT", filedArtefact("birkdale", "2026-11-12T00:00:00.000Z")],
  ["E16 1GN", filedArtefact("exeter", "2026-11-12T00:00:00.000Z")],
  ["KT17 1FH", filedArtefact("epsom", "2026-11-14T00:00:00.000Z")],
  ["KT17 1DR", filedArtefact("ewell", "2026-11-14T00:00:00.000Z")],
  ["CB6 1EH", filedArtefact("hilgay", "2026-11-14T00:00:00.000Z")],
]);

// The Basis B populations (M6.20, decision D39), measured at
// the step's prep on the full filed directory + the full
// TS021 file: the Census 2021 residents of the LSOAs
// containing the postcodes within the same 1 mile, counted
// whole. The loader files this figure inside the artefact;
// the captures above predate it, so the three universal
// homes' artefacts are completed with the measured values.
const BASIS_RESIDENTS: Record<string, number> = {
  "CM3 2JT": 6380,
  "E16 1GN": 87519,
  "KT17 1FH": 39926,
};
for (const [pc, residents] of Object.entries(BASIS_RESIDENTS)) {
  const artefact = ARTEFACTS.get(pc);
  if (artefact) artefact.basisResidents = residents;
}

class FakeCrimeSource implements CrimeDataSource {
  constructor(private artefacts: Map<string, FiledCrimeAnswer>) {}
  async crimeAnswer(postcode: string) {
    return this.artefacts.get(postcode) ?? null;
  }
  // The cold load (M6.9/D30): this fake's loads fail unless
  // a test installs its own source — so an unfiled postcode
  // serves not-filed, the load-attempted-and-failed state.
  async loadPostcode(): Promise<void> {
    throw new Error("the Police.uk load failed");
  }
}

const source = new FakeCrimeSource(ARTEFACTS);

// "Today" inside the loader guard's tolerance of the filed
// window (windowTo 2026-09, lag 2 — the fixture's own date).
const NOW = new Date("2026-11-14T00:00:00.000Z");

// --- the address resolutions the bundles hang off -------------
// The M6.1 fake, mirrored from the sibling brain suites.

function parsePpdLine(line: string): string[] | null {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] !== '"') return null;
    let value = "";
    i += 1;
    while (i < line.length) {
      if (line[i] === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i += 2;
        } else {
          i += 1;
          break;
        }
      } else {
        value += line[i];
        i += 1;
      }
    }
    fields.push(value);
    if (line[i] === ",") i += 1;
  }
  return fields;
}

function ppdAddresses(csv: string): LoadedAddressParts[] {
  const rows: LoadedAddressParts[] = [];
  for (const line of csv.split("\n")) {
    if (!line.trim()) continue;
    const f = parsePpdLine(line.replace(/\r$/, ""));
    if (!f || f.length !== 16) continue;
    rows.push({
      postcode: f[3],
      paon: f[7] || null,
      saon: f[8] || null,
      street: f[9] || null,
      locality: f[10] || null,
      town: f[11] || null,
    });
  }
  return rows;
}

const ADDRESSES: LoadedAddressParts[] = [
  ...ppdAddresses(
    readFileSync(join(process.cwd(), "tests/fixtures/land-registry/pp-complete.csv"), "utf8"),
  ),
  ...ppdAddresses(readFileSync(join(process.cwd(), "tests/fixtures/address/kt17-1fh.csv"), "utf8")),
];

const DIRECTORY = new Map<string, DirectoryPostcode>([
  [
    "CM3 2JT",
    {
      postcode: "CM3 2JT",
      latitude: 51.776176,
      longitude: 0.60387,
      council: "Braintree",
      ward: null,
      region: null,
      lsoaCode: "E01021395",
      msoaCode: "E02004463",
    },
  ],
  [
    "E16 1GN",
    {
      postcode: "E16 1GN",
      latitude: 51.515224,
      longitude: 0.021177,
      council: "Newham",
      ward: null,
      region: null,
      lsoaCode: "E01003511",
      msoaCode: "E02000749",
    },
  ],
  [
    "KT17 1FH",
    {
      postcode: "KT17 1FH",
      latitude: 51.344571,
      longitude: -0.247104,
      council: "Epsom and Ewell",
      ward: "Nonsuch",
      region: null,
      lsoaCode: "E01030396",
      msoaCode: "E02006837",
    },
  ],
  [
    "KT17 1DR",
    {
      postcode: "KT17 1DR",
      latitude: 51.350243,
      longitude: -0.256581,
      council: "Epsom and Ewell",
      ward: null,
      region: null,
      lsoaCode: null,
      msoaCode: null,
    },
  ],
  [
    "CB6 1EH",
    {
      postcode: "CB6 1EH",
      latitude: 52.507481,
      longitude: 0.33491,
      council: null,
      ward: null,
      region: null,
      lsoaCode: null,
      msoaCode: null,
    },
  ],
]);

const addressSource: AddressDataSource = {
  async directoryPostcode(postcode) {
    return DIRECTORY.get(postcode) ?? null;
  },
  async addressesInPostcode(postcode) {
    return ADDRESSES.filter((a) => a.postcode === postcode);
  },
  async districtSummary(outward) {
    const keys = [...DIRECTORY.keys()].filter((pc) => pc.startsWith(`${outward} `));
    return keys.length > 0 ? { postcodeCount: keys.length } : null;
  },
};

async function bundleFor(input: string, src: CrimeDataSource = source, now: Date = NOW) {
  const resolution = await resolveAddressInput(input, addressSource);
  return buildCrimeBundle(resolution, src, { now });
}

function rung2Resolution(postcode: string): AddressResolution {
  return {
    rung: 2,
    kind: "address-list",
    directory: {
      postcode,
      latitude: 0,
      longitude: 0,
      council: null,
      ward: null,
      region: null,
      lsoaCode: null,
      msoaCode: null,
    },
    street: null,
    building: null,
    addresses: [],
  };
}

// The served category order: count descending, slug ascending —
// the order the locked splits below are written in.
function servedSplit(postcode: string): { slug: string; count: number }[] {
  const artefact = ARTEFACTS.get(postcode) as FiledCrimeAnswer;
  return Object.entries(artefact.categories)
    .filter(([, count]) => count > 0)
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));
}

describe("crime — 19 Birkdale Rise, CM3 2JT (locked total 330)", () => {
  it("serves the locked total, window, full split and monthly facts", async () => {
    const bundle = await bundleFor("19 Birkdale Rise, CM3 2JT");
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error(`expected a served crime bundle, got ${bundle.kind}`);
    expect(bundle.rung).toBe(1);
    expect(bundle.postcode).toBe("CM3 2JT");
    const crime = bundle.crime;
    expect(crime.total).toBe(330);
    expect(crime.windowFrom).toBe("2025-10");
    expect(crime.windowTo).toBe("2026-09");
    expect(crime.windowLine).toBe("October 2025 to September 2026");
    expect(crime.totalLine).toBe(
      "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
    );
    // The full published split, as filed — all 14 categories
    // have a count at Birkdale, so all 14 lines are served.
    expect(crime.categories).toEqual([
      { slug: "violent-crime", count: 133 },
      { slug: "anti-social-behaviour", count: 65 },
      { slug: "robbery", count: 29 },
      { slug: "criminal-damage-arson", count: 20 },
      { slug: "other-theft", count: 19 },
      { slug: "vehicle-crime", count: 16 },
      { slug: "public-order", count: 14 },
      { slug: "drugs", count: 9 },
      { slug: "burglary", count: 7 },
      { slug: "other-crime", count: 6 },
      { slug: "shoplifting", count: 6 },
      { slug: "possession-of-weapons", count: 4 },
      { slug: "bicycle-theft", count: 1 },
      { slug: "theft-from-the-person", count: 1 },
    ]);
    // The split sums to the headline total — anti-social
    // behaviour is inside both, never carved out.
    expect(crime.categories.reduce((sum, c) => sum + c.count, 0)).toBe(crime.total);
    // The monthly counts travel as dated facts, exactly as filed.
    expect(crime.months).toEqual(ARTEFACTS.get("CM3 2JT")?.months);
    expect(crime.months).toHaveLength(12);
    // Basis, source and explainer ride with the figure (D9/D13).
    expect(crime.basis).toBe(LOADER_BASIS);
    expect(crime.sourceName).toBe(LOADER_SOURCE_NAME);
    expect(crime.sourceLine).toBe("Police.uk street-level crime — data to September 2026");
    expect(crime.explainer).toBe(CRIME_EXPLAINER);
    expect(crime.staleLine).toBeNull();
  });
});

describe("crime — 6 Exeter Road, E16 1GN (locked total 10,722)", () => {
  it("serves the locked total and the full 14-category split", async () => {
    const bundle = await bundleFor("6 Exeter Road, E16 1GN");
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    const crime = bundle.crime;
    expect(crime.total).toBe(10722);
    expect(crime.totalLine).toBe(
      "10,722 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
    );
    expect(crime.categories).toEqual([
      { slug: "violent-crime", count: 2893 },
      { slug: "anti-social-behaviour", count: 1852 },
      { slug: "vehicle-crime", count: 1266 },
      { slug: "other-theft", count: 1042 },
      { slug: "shoplifting", count: 706 },
      { slug: "theft-from-the-person", count: 654 },
      { slug: "drugs", count: 487 },
      { slug: "public-order", count: 477 },
      { slug: "burglary", count: 432 },
      { slug: "robbery", count: 351 },
      { slug: "criminal-damage-arson", count: 283 },
      { slug: "bicycle-theft", count: 105 },
      { slug: "other-crime", count: 98 },
      { slug: "possession-of-weapons", count: 76 },
    ]);
    expect(crime.categories.reduce((sum, c) => sum + c.count, 0)).toBe(10722);
    expect(crime.months.map((m) => m.count)).toEqual([
      970, 891, 828, 810, 714, 901, 946, 1024, 943, 940, 902, 853,
    ]);
    expect(crime.staleLine).toBeNull();
  });
});

describe("crime — Flat 4, Minerva House, KT17 1FH (locked total 1,956)", () => {
  it("serves the locked total as a served answer for the first time, with its split", async () => {
    const bundle = await bundleFor("Flat 4, Minerva House, KT17 1FH");
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(bundle.rung).toBe(1);
    const crime = bundle.crime;
    expect(crime.total).toBe(1956);
    expect(crime.categories).toEqual([
      { slug: "violent-crime", count: 591 },
      { slug: "anti-social-behaviour", count: 332 },
      { slug: "public-order", count: 175 },
      { slug: "criminal-damage-arson", count: 169 },
      { slug: "shoplifting", count: 162 },
      { slug: "other-theft", count: 132 },
      { slug: "vehicle-crime", count: 122 },
      { slug: "burglary", count: 88 },
      { slug: "drugs", count: 73 },
      { slug: "other-crime", count: 44 },
      { slug: "bicycle-theft", count: 23 },
      { slug: "robbery", count: 20 },
      { slug: "possession-of-weapons", count: 14 },
      { slug: "theft-from-the-person", count: 11 },
    ]);
    expect(crime.months.map((m) => m.count)).toEqual([
      180, 169, 155, 132, 123, 176, 165, 160, 179, 162, 168, 187,
    ]);
  });
});

describe("crime — Ewell Village, KT17 1DR (fixed at first load: 2,361)", () => {
  it("serves the first-load total and split", async () => {
    const bundle = await bundleFor("KT17 1DR");
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(bundle.rung).toBe(2);
    const crime = bundle.crime;
    expect(crime.total).toBe(2361);
    expect(crime.categories).toEqual(servedSplit("KT17 1DR"));
    expect(crime.categories[0]).toEqual({ slug: "violent-crime", count: 769 });
    expect(crime.categories).toHaveLength(14);
    expect(crime.categories.reduce((sum, c) => sum + c.count, 0)).toBe(2361);
  });
});

describe("crime — Hilgay, CB6 1EH (fixed at first load: 7)", () => {
  it("serves the genuinely tiny rural count, exactly as filed", async () => {
    const bundle = await bundleFor("CB6 1EH");
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    const crime = bundle.crime;
    expect(crime.total).toBe(7);
    expect(crime.totalLine).toBe(
      "7 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
    );
    // Only the five categories with a count are listed — the
    // other nine published slugs are absent from the filed map
    // and are not printed as measured zeros.
    expect(crime.categories).toEqual([
      { slug: "violent-crime", count: 3 },
      { slug: "criminal-damage-arson", count: 1 },
      { slug: "other-theft", count: 1 },
      { slug: "public-order", count: 1 },
      { slug: "vehicle-crime", count: 1 },
    ]);
    expect(crime.months.map((m) => m.count)).toEqual([0, 0, 0, 2, 1, 0, 0, 1, 2, 1, 0, 0]);
  });
});

describe("crime — ladder rungs (M6.4)", () => {
  it("serves the IDENTICAL answer at rung 1 and rung 2", async () => {
    const rung1 = await bundleFor("19 Birkdale Rise, CM3 2JT");
    const rung2 = await bundleFor("Birkdale Rise, CM3 2JT");
    if (rung1.kind !== "crime" || rung2.kind !== "crime")
      throw new Error("expected crime bundles at both rungs");
    expect(rung1.rung).toBe(1);
    expect(rung2.rung).toBe(2);
    expect(rung2.crime).toEqual(rung1.crime);
    // The wording never attaches the count to the home itself.
    const serialised = JSON.stringify(rung1);
    expect(serialised).not.toContain("near this home");
    expect(serialised).not.toContain("at this address");
  });

  it("returns NO crime figures at rung 3 — the named state only", async () => {
    const resolution = await resolveAddressInput("CM3", addressSource);
    expect(resolution.rung).toBe(3);
    const bundle = await buildCrimeBundle(resolution, source, { now: NOW });
    expect(bundle).toEqual({
      rung: 3,
      kind: "wider-area",
      crime: { state: "unavailable", reason: "crime counts need an exact postcode" },
    });
    const serialised = JSON.stringify(bundle);
    expect(serialised).not.toContain("330");
    expect(serialised).not.toContain("total");
    expect(serialised).not.toContain("violent-crime");
  });

  it("returns the no-location state at rung 4", async () => {
    const resolution = await resolveAddressInput("Birkdale Rise, Hatfield Peverel", addressSource);
    expect(resolution.rung).toBe(4);
    const bundle = await buildCrimeBundle(resolution, source, { now: NOW });
    expect(bundle).toEqual({
      rung: 4,
      kind: "no-location",
      crime: { state: "unavailable", reason: "crime counts need an exact postcode" },
    });
  });
});

describe("crime — coverage", () => {
  it("gives a Scottish postcode the named not-covered state", async () => {
    const resolution: AddressResolution = {
      rung: 1,
      kind: "home",
      directory: {
        postcode: "EH1 1YZ",
        latitude: 0,
        longitude: 0,
        council: null,
        ward: null,
        region: "Scotland",
        lsoaCode: null,
        msoaCode: null,
      },
      address: {
        postcode: "EH1 1YZ",
        paon: "1",
        saon: null,
        street: "PRINCES STREET",
        locality: null,
        town: "EDINBURGH",
        label: "1 Princes Street",
      },
    };
    const bundle = await buildCrimeBundle(resolution, source, { now: NOW });
    expect(bundle.kind).toBe("not-covered");
    if (bundle.kind !== "not-covered") throw new Error("expected not-covered");
    expect(bundle.crime.state).toBe("not-covered");
    expect(bundle.crime.reason).toContain("Scotland");
    expect(bundle.crime.reason).toContain("England and Wales");
  });

  it("gives a Northern Ireland postcode the named not-covered state", async () => {
    const bundle = await buildCrimeBundle(rung2Resolution("BT1 1AA"), source, { now: NOW });
    expect(bundle.kind).toBe("not-covered");
    if (bundle.kind !== "not-covered") throw new Error("expected not-covered");
    expect(bundle.crime.reason).toContain("Northern Ireland");
  });

  it("serves a Welsh postcode — Police.uk covers Wales", async () => {
    const welsh = new FakeCrimeSource(
      new Map([["CF11 8AA", ARTEFACTS.get("CB6 1EH") as FiledCrimeAnswer]]),
    );
    const bundle = await buildCrimeBundle(rung2Resolution("CF11 8AA"), welsh, { now: NOW });
    expect(bundle.kind).toBe("crime");
  });
});

describe("crime — the stale window (the loader guard's 3-month threshold)", () => {
  it("pins the brain's threshold to the loader's MAX_LAG_MONTHS — one line, shared", () => {
    const loader = readFileSync(join(process.cwd(), "loaders", "load-crime.mjs"), "utf8");
    const match = /MAX_LAG_MONTHS = (\d+)/.exec(loader);
    if (!match) throw new Error("the loader's MAX_LAG_MONTHS was not found");
    expect(CRIME_STALE_AFTER_MONTHS).toBe(Number.parseInt(match[1], 10));
    expect(CRIME_STALE_AFTER_MONTHS).toBe(3);
  });

  it("serves without a stale line at exactly 3 months behind", async () => {
    const bundle = await bundleFor(
      "19 Birkdale Rise, CM3 2JT",
      source,
      new Date("2026-12-31T00:00:00.000Z"),
    );
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(bundle.crime.staleLine).toBeNull();
    expect(bundle.crime.total).toBe(330);
  });

  it("serves the last-good window WITH the named stale line beyond 3 months — counts unchanged, nothing suppressed", async () => {
    const fresh = await bundleFor("19 Birkdale Rise, CM3 2JT");
    const stale = await bundleFor(
      "19 Birkdale Rise, CM3 2JT",
      source,
      new Date("2027-01-15T00:00:00.000Z"),
    );
    if (stale.kind !== "crime" || stale.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(stale.crime.staleLine).toBe(
      "the latest month we hold is September 2026 — Police.uk has not published newer data we can file",
    );
    if (fresh.kind !== "crime" || fresh.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    // Only the stale line differs: totals, split and months are
    // the last-good window, served in full.
    expect({ ...stale.crime, staleLine: null }).toEqual(fresh.crime);
  });

  it("still serves, with the stale line, when the window is far past the threshold", async () => {
    const bundle = await bundleFor(
      "6 Exeter Road, E16 1GN",
      source,
      new Date("2027-06-01T00:00:00.000Z"),
    );
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(bundle.crime.total).toBe(10722);
    expect(bundle.crime.staleLine).toContain("September 2026");
  });
});

describe("crime — zero counts and the not-filed state", () => {
  const ZERO: FiledCrimeAnswer = {
    total: 0,
    windowFrom: "2025-10",
    windowTo: "2026-09",
    months: [
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ].map((month) => ({ month, count: 0 })),
    categories: {},
    basis: LOADER_BASIS,
    sourceName: LOADER_SOURCE_NAME,
    sourceDate: "2026-09",
    loadedAt: "2026-11-14T00:00:00.000Z",
  };

  it("serves a true zero as a count with window and basis named — never as 'no crime'", async () => {
    const zeroSource = new FakeCrimeSource(new Map([["XX1 1XX", ZERO]]));
    const bundle = await buildCrimeBundle(rung2Resolution("XX1 1XX"), zeroSource, { now: NOW });
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(bundle.crime.total).toBe(0);
    expect(bundle.crime.totalLine).toBe(
      "0 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
    );
    expect(bundle.crime.categories).toEqual([]);
    expect(JSON.stringify(bundle).toLowerCase()).not.toContain("no crime");
  });

  it("serves the singular form for a single recorded crime", async () => {
    const one: FiledCrimeAnswer = {
      ...ZERO,
      total: 1,
      months: ZERO.months.map((m, i) => ({ ...m, count: i === 0 ? 1 : 0 })),
      categories: { burglary: 1 },
    };
    const oneSource = new FakeCrimeSource(new Map([["XX1 1XX", one]]));
    const bundle = await buildCrimeBundle(rung2Resolution("XX1 1XX"), oneSource, { now: NOW });
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(bundle.crime.totalLine).toBe(
      "1 recorded crime within 1 mile of this postcode, October 2025 to September 2026",
    );
  });

  it("gives a covered postcode with no filed artefact the named not-filed state — no figures", async () => {
    const empty = new FakeCrimeSource(new Map());
    const bundle = await buildCrimeBundle(rung2Resolution("KT17 1DR"), empty, { now: NOW });
    expect(bundle.kind).toBe("crime");
    if (bundle.kind !== "crime") throw new Error("expected a crime bundle");
    expect(bundle.crime.state).toBe("not-filed");
    expect(JSON.stringify(bundle)).not.toContain("total");
  });
});

describe("crime — calibration (M6.20, decision D39)", () => {
  // A synthetic England figure for the arithmetic proofs:
  // 5,649,011 over the real denominator 56,490,108 is
  // 100.0 per 1,000. The REAL England figure is pinned by
  // the national loader's backfill and recorded in the
  // golden matrix — no comparison golden is asserted here.
  const NATIONAL = { total: 5649011, residents: 56490108 };

  function withNational(postcode: string): FakeCrimeSource {
    const artefact = ARTEFACTS.get(postcode) as FiledCrimeAnswer;
    return new FakeCrimeSource(new Map([[postcode, { ...artefact, national: NATIONAL }]]));
  }

  it("serves the per-head figure on the filed Basis B population — the prep's measured goldens", async () => {
    const birkdale = await bundleFor("19 Birkdale Rise, CM3 2JT");
    if (birkdale.kind !== "crime" || birkdale.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(birkdale.crime.perHead).toEqual({
      residents: 6380,
      per1000: 51.7,
      line: "51.7 recorded crimes per 1,000 residents",
      basisLine:
        "worked out from the Census 2021 residents of the small areas that contain the postcodes within the same mile, counted whole — 6,380 residents for this circle",
    });
    // No England embedding on the artefact: the comparison
    // is absent, the per-head figure unaffected.
    expect(birkdale.crime.englandFigure).toBeNull();
    expect(birkdale.crime.calibrationExplainer).toBe(CRIME_CALIBRATION_EXPLAINER);

    const exeter = await bundleFor("6 Exeter Road, E16 1GN");
    if (exeter.kind !== "crime" || exeter.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(exeter.crime.perHead?.per1000).toBe(122.5);
    expect(exeter.crime.perHead?.line).toBe("122.5 recorded crimes per 1,000 residents");
    expect(exeter.crime.perHead?.basisLine).toContain("87,519 residents for this circle");

    const minerva = await bundleFor("Flat 4, Minerva House, KT17 1FH");
    if (minerva.kind !== "crime" || minerva.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(minerva.crime.perHead?.per1000).toBe(49.0);
    expect(minerva.crime.perHead?.line).toBe("49.0 recorded crimes per 1,000 residents");
    expect(minerva.crime.perHead?.basisLine).toContain("39,926 residents for this circle");
  });

  it("sets the circle's figure against England's — both figures together, as a multiple", async () => {
    const birkdale = await buildCrimeBundle(
      await resolveAddressInput("19 Birkdale Rise, CM3 2JT", addressSource),
      withNational("CM3 2JT"),
      { now: NOW },
    );
    if (birkdale.kind !== "crime" || birkdale.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(birkdale.crime.englandFigure).toEqual({
      englandPer1000: 100.0,
      multiple: 0.5,
      line: "the England figure for the same 12 months is 100.0 recorded crimes per 1,000 residents — this circle's figure is about 0.5 times the England figure",
    });

    const exeter = await buildCrimeBundle(
      await resolveAddressInput("6 Exeter Road, E16 1GN", addressSource),
      withNational("E16 1GN"),
      { now: NOW },
    );
    if (exeter.kind !== "crime" || exeter.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(exeter.crime.englandFigure?.multiple).toBe(1.2);
    expect(exeter.crime.englandFigure?.line).toContain("about 1.2 times the England figure");
  });

  it("serves a Welsh home's own per-head figure against the England figure D39 names", async () => {
    // The Welsh copy carries a basis by hand (Hilgay's
    // artefact has none in this suite): the point is the
    // nation's treatment, not the arithmetic (proven above).
    const welshArtefact: FiledCrimeAnswer = {
      ...(ARTEFACTS.get("CB6 1EH") as FiledCrimeAnswer),
      basisResidents: 39926,
      national: NATIONAL,
    };
    const welsh = new FakeCrimeSource(new Map([["CF11 8AA", welshArtefact]]));
    const bundle = await buildCrimeBundle(rung2Resolution("CF11 8AA"), welsh, { now: NOW });
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(bundle.crime.perHead).not.toBeNull();
    expect(bundle.crime.englandFigure?.line).toContain("the England figure for the same 12 months");
  });

  it("at a zero count the per-head figure serves as 0.0 and the comparison carries no multiple", async () => {
    // The two M6.9 zero witnesses and their measured Basis
    // B populations (prep: Wasdale Head's circle is its own
    // LSOA, 1,328 residents; Llanwrtyd Wells', 1,767).
    for (const [postcode, residents] of [
      ["CA20 1EX", 1328],
      ["LD5 4AD", 1767],
    ] as const) {
      const zero: FiledCrimeAnswer = {
        total: 0,
        windowFrom: "2025-10",
        windowTo: "2026-09",
        months: [
          "2025-10",
          "2025-11",
          "2025-12",
          "2026-01",
          "2026-02",
          "2026-03",
          "2026-04",
          "2026-05",
          "2026-06",
          "2026-07",
          "2026-08",
          "2026-09",
        ].map((month) => ({ month, count: 0 })),
        categories: {},
        basis: LOADER_BASIS,
        sourceName: LOADER_SOURCE_NAME,
        sourceDate: "2026-09",
        loadedAt: "2026-11-14T00:00:00.000Z",
        basisResidents: residents,
        national: NATIONAL,
      };
      const bundle = await buildCrimeBundle(
        rung2Resolution(postcode),
        new FakeCrimeSource(new Map([[postcode, zero]])),
        { now: NOW },
      );
      if (bundle.kind !== "crime" || bundle.crime.state !== "served")
        throw new Error("expected a served crime bundle");
      expect(bundle.crime.perHead).toEqual({
        residents,
        per1000: 0,
        line: "0 recorded crimes per 1,000 residents",
        basisLine: expect.stringContaining(
          `${residents.toLocaleString("en-GB")} residents for this circle`,
        ),
      });
      expect(bundle.crime.englandFigure?.multiple).toBeNull();
      expect(bundle.crime.englandFigure?.line).toBe(
        "the England figure for the same 12 months is 100.0 recorded crimes per 1,000 residents",
      );
      expect(bundle.crime.englandFigure?.line).not.toContain("times");
    }
  });

  it("withholds a multiple that rounds to 0.0 for a nonzero count — the figures only", async () => {
    // The honest extension of the zero rule: 7 crimes over
    // an illustrative 2,000 residents is 3.5 per 1,000,
    // whose multiple against 100.0 is 0.035 — "about 0.0
    // times" would be a falsehood in the settled form.
    const tiny: FiledCrimeAnswer = {
      ...(ARTEFACTS.get("CB6 1EH") as FiledCrimeAnswer),
      basisResidents: 2000,
      national: NATIONAL,
    };
    const bundle = await buildCrimeBundle(
      rung2Resolution("CB6 1EH"),
      new FakeCrimeSource(new Map([["CB6 1EH", tiny]])),
      { now: NOW },
    );
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(bundle.crime.perHead?.per1000).toBe(3.5);
    expect(bundle.crime.englandFigure?.multiple).toBeNull();
    expect(bundle.crime.englandFigure?.line).not.toContain("times");
  });

  it("a pre-M6.20 artefact serves its counts with calibration absent — never estimated", async () => {
    const bundle = await bundleFor("KT17 1DR");
    if (bundle.kind !== "crime" || bundle.crime.state !== "served")
      throw new Error("expected a served crime bundle");
    expect(bundle.crime.total).toBe(2361);
    expect(bundle.crime.perHead).toBeNull();
    expect(bundle.crime.englandFigure).toBeNull();
    expect(bundle.crime.calibrationExplainer).toBe(CRIME_CALIBRATION_EXPLAINER);
  });

  it("calibration follows the counts into a stale window, unchanged", async () => {
    const fresh = await buildCrimeBundle(
      await resolveAddressInput("19 Birkdale Rise, CM3 2JT", addressSource),
      withNational("CM3 2JT"),
      { now: NOW },
    );
    const stale = await buildCrimeBundle(
      await resolveAddressInput("19 Birkdale Rise, CM3 2JT", addressSource),
      withNational("CM3 2JT"),
      { now: new Date("2027-01-15T00:00:00.000Z") },
    );
    if (
      fresh.kind !== "crime" ||
      fresh.crime.state !== "served" ||
      stale.kind !== "crime" ||
      stale.crime.state !== "served"
    )
      throw new Error("expected served crime bundles");
    expect(stale.crime.staleLine).not.toBeNull();
    expect(stale.crime.perHead).toEqual(fresh.crime.perHead);
    expect(stale.crime.englandFigure).toEqual(fresh.crime.englandFigure);
  });
});

describe("crime — the database source", () => {
  it("reads the artefact from the postcode's cached answers, and nothing else", async () => {
    const artefact = ARTEFACTS.get("CM3 2JT") as FiledCrimeAnswer;
    const seen: { text: string; params?: readonly unknown[] }[] = [];
    const db = {
      async query(text: string, params?: readonly unknown[]) {
        seen.push({ text, params });
        if (text.includes("postcode_cache"))
          return { rows: [{ crime: params?.[0] === "CM3 2JT" ? artefact : null }] };
        throw new Error(`unexpected query: ${text}`);
      },
    };
    const dbSource = createCrimeSource(db);
    expect(await dbSource.crimeAnswer("CM3 2JT")).toEqual(artefact);
    expect(await dbSource.crimeAnswer("E16 1GN")).toBeNull();
    expect(seen).toHaveLength(2);
    expect(seen[0].text).toContain("answers -> 'crime'");
  });
});

describe("crime — wording (D24's banned-wording scan)", () => {
  const BANNED = [
    "score",
    "rating",
    "rated",
    "safe",
    "unsafe",
    "dangerous",
    "high-crime",
    "low-crime",
    "crime rate",
    "rising",
    "falling",
    "trend",
  ];

  function allStrings(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
    else if (value && typeof value === "object")
      for (const v of Object.values(value)) allStrings(v, out);
    return out;
  }

  function allKeys(value: unknown, out: string[] = []): string[] {
    if (Array.isArray(value)) for (const v of value) allKeys(v, out);
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) {
        out.push(k);
        allKeys(v, out);
      }
    return out;
  }

  it("no served string carries a banned term, and no key computes a comparison", async () => {
    const bundles: CrimeBundle[] = [];
    bundles.push(await bundleFor("19 Birkdale Rise, CM3 2JT"));
    bundles.push(await bundleFor("6 Exeter Road, E16 1GN"));
    bundles.push(await bundleFor("Flat 4, Minerva House, KT17 1FH"));
    bundles.push(await bundleFor("KT17 1DR"));
    bundles.push(await bundleFor("CB6 1EH"));
    bundles.push(
      await bundleFor("19 Birkdale Rise, CM3 2JT", source, new Date("2027-01-15T00:00:00.000Z")),
    );
    bundles.push(await buildCrimeBundle(rung2Resolution("BT1 1AA"), source, { now: NOW }));
    bundles.push(
      await buildCrimeBundle(rung2Resolution("KT17 1DR"), new FakeCrimeSource(new Map()), {
        now: NOW,
      }),
    );
    for (const bundle of bundles) {
      for (const text of allStrings(bundle)) {
        for (const term of BANNED) expect(text.toLowerCase()).not.toContain(term);
        expect(text).not.toContain("%");
      }
      for (const key of allKeys(bundle)) {
        expect(key).not.toMatch(/score|rate|rank|percent|trend|compar|verdict/i);
      }
    }
  });
});

describe("crime — the bounded cold load (fix batch, BUG-003)", () => {
  // The founder's ruling of 19 Nov 2026 (21:50): every
  // checking part is bounded the way sold prices is
  // bounded (10s). The crime cold load was the proven
  // unbounded case (~95s on the play server). These
  // tests pin the bound at the source (a caller's wait
  // expires with CrimeLoadPendingError while the run
  // itself carries on) and at the brain (the pending
  // error serves the still-gathering named state, so
  // the check completes instead of sticking).

  function stubLoader(script: string): string {
    const dir = mkdtempSync(join(tmpdir(), "cmnh-crime-stub-"));
    const stub = join(dir, "load-crime.mjs");
    writeFileSync(stub, script);
    return stub;
  }

  const noRowsDb = {
    async query() {
      return { rows: [] };
    },
  };

  it("a caller whose wait expires is told the load is still running — promptly", async () => {
    const stub = stubLoader("await new Promise((r) => setTimeout(r, 30_000));\n");
    const dbSource = createCrimeSource(noRowsDb, {
      crimeLoaderPath: stub,
      databaseUrl: "postgresql://stub.invalid/db",
      loadWaitMs: 50,
    });
    const started = Date.now();
    await expect(dbSource.loadPostcode("ZZ9 9ZZ")).rejects.toBeInstanceOf(CrimeLoadPendingError);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("a load that lands inside the wait resolves as it always did", async () => {
    const stub = stubLoader('console.log("load-crime · done");\n');
    const dbSource = createCrimeSource(noRowsDb, {
      crimeLoaderPath: stub,
      databaseUrl: "postgresql://stub.invalid/db",
      loadWaitMs: 5_000,
    });
    await expect(dbSource.loadPostcode("ZZ9 9ZY")).resolves.toBeUndefined();
  });

  it("the brain serves the still-gathering named state for a pending load", async () => {
    const pendingSource: CrimeDataSource = {
      async crimeAnswer() {
        return null;
      },
      async loadPostcode() {
        throw new CrimeLoadPendingError("ZZ9 9ZZ", 10_000);
      },
    };
    const bundle = await buildCrimeBundle(rung2Resolution("ZZ9 9ZZ"), pendingSource, { now: NOW });
    expect(bundle.kind).toBe("crime");
    if (bundle.kind !== "crime") throw new Error("expected a crime bundle");
    expect(bundle.crime).toEqual({ state: "not-filed", reason: CRIME_STILL_GATHERING_REASON });
    expect(CRIME_STILL_GATHERING_REASON).toBe(
      "crime counts are still being gathered for this postcode — check again shortly",
    );
  });

  it("the wait override reads only a non-negative number from the env", () => {
    expect(crimeLoadWaitMsFromEnv({})).toBe(10_000);
    expect(crimeLoadWaitMsFromEnv({ CRIME_LOAD_WAIT_MS: "250" })).toBe(250);
    expect(crimeLoadWaitMsFromEnv({ CRIME_LOAD_WAIT_MS: "-5" })).toBe(10_000);
    expect(crimeLoadWaitMsFromEnv({ CRIME_LOAD_WAIT_MS: "soon" })).toBe(10_000);
  });
});
