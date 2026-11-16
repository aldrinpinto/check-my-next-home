// Golden replay (plan step M6.19) — every golden home through
// every brain, through the REAL database sources, against the
// fixture corpus the CI database job files.
//
// Most brain tests run against fake sources; the scoped
// rehearsals that proved the brains against real filings lived
// in scratch folders and ran once. This suite is the committed
// form of those proofs: it runs in CI's database job (the step
// after the fixture filings, where DATABASE_URL points at the
// job's PostGIS), gated on GOLDEN_REPLAY=1 so the plain checks
// job — and a developer's `npm test` — skip it cleanly.
//
// What it asserts, in three strengths:
//  1. Corpus-independent locks — figures the fixture corpus
//     carries identically to the golden cuts (crime artefacts,
//     sold medians over the excerpt's complete postcode sets,
//     EPC artefacts and spreads, Census / IMD / benefits /
//     council-tax rows): asserted exactly, as in the matrix.
//  2. States — served / not-filed / not-covered / none-found
//     per home and brain, including the regional witnesses:
//     the thinner non-England reports, combination by
//     combination.
//  3. Fixture-basis spatial figures (nearby, constraints,
//     heritage, nature, flood edges): the fixture cuts are
//     excerpts, so these differ from the national-basis locks
//     in the matrix; each is locked here on the fixture basis
//     and cross-checked against the filed tables by SQL in the
//     M6.19 backend report.
//
// Setup filings (beforeAll) mirror what production filing
// would have done for the homes the CI steps do not reach:
// the golden homes' real ONSPD Aug 2026 directory rows
// (tests/fixtures/replay/directory-rows.json — the practice
// excerpt files only eight postcodes), the sold-prices loader
// run over an assembled fixture dir carrying the KT17 rows,
// the crime loader run over an assembled fixture dir whose
// points map reaches Epsom, Ewell Village and Hilgay (their
// monthly captures already sit in the police-uk fixture), the
// EPC loader for KT17 1FH and CM1 6ER, and the two zero-crimes
// witness artefacts filed in the loader's own write shape
// (its live captures from M6.9), plus its Cardiff live capture
// from M6.19 as the Welsh served-crime golden. Two completions
// keep the brains loop hermetic: the sold setup stamps every
// seeded England/Wales postcode the fixture file held no sales
// for (the standalone loader never writes the brain's load
// stamp — the brain's own on-demand load does, in production),
// and the crime source is created with its loader path pointed
// at the replay's fixture shim, so a first-check crime load
// runs the real loader over the assembled fixture dir and
// fails there — serving not-filed — for postcodes the fixture
// does not cover, instead of fetching live data. EH1 1AA, the matrix's
// Scotland witness, was terminated in ONSPD in December 1996
// and never enters the filed directory; the replay's Scottish
// witness is EH1 1AD, a live postcode in the same data zone
// (S01014710) the matrix's fake used.

import { execFile } from "node:child_process";
import { copyFile, cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAddressSource, resolveAddressInput, type AddressResolution } from "../lib/address";
import { buildAreaBundle, createAreaSource, type AreaBundle } from "../lib/area-bundle";
import { buildCrimeBundle, createCrimeSource, type CrimeBundle } from "../lib/crime";
import { buildFloodBundle, createFloodSource, type FloodBundle } from "../lib/flood";
import { buildNearbyBundle, createNearbySource, type NearbyBundle } from "../lib/nearby";
import { buildShortBundle, type ShortBundle } from "../lib/short-bundle";
import {
  buildSoldPricesBundle,
  createSoldPricesSource,
  type SoldPricesBundle,
} from "../lib/sold-prices";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const RUN = process.env.GOLDEN_REPLAY === "1" && Boolean(process.env.DATABASE_URL);
const NOW = new Date("2026-11-15T12:00:00.000Z");
const run = promisify(execFile);

type Brains = {
  resolution: AddressResolution;
  nearby: NearbyBundle;
  sold: SoldPricesBundle;
  crime: CrimeBundle;
  flood: FloodBundle;
  area: AreaBundle;
  short: ShortBundle;
};

const HOMES: Record<string, string> = {
  birkdale1: "19 Birkdale Rise, Hatfield Peverel CM3 2JT",
  birkdale2: "CM3 2JT",
  exeter1: "6 Exeter Road, London E16 1GN",
  exeter2: "E16 1GN",
  minerva1: "Flat 4, Minerva House, 12 Ceres Crescent, Epsom KT17 1FH",
  epsom2: "KT17 1FH",
  ewell2: "KT17 1DR",
  cityIsland2: "E14 0BZ",
  highLaver2: "CM5 0DR",
  kingston2: "KT1 1JS",
  oatlands2: "KT13 8NB",
  ashtead2: "KT21 1AG",
  oxford2: "OX1 1HD",
  cardiff2: "CF11 8AA",
  hilgay2: "CB6 1EH",
  beaulieu2: "CM1 6ER",
  headley2: "KT22 8QA",
  crawford2: "E16 1EG",
  edinburgh2: "EH1 1AD",
  belfast2: "BT1 1AA",
  midUlster2: "BT45 6EB",
  wasdale2: "CA20 1EX",
  llanwrtyd2: "LD5 4AD",
  wider3: "CM3",
};

describe.skipIf(!RUN)("golden replay — every golden home through every brain (M6.19)", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const brains = new Map<string, Brains>();

  beforeAll(async () => {
    const env = { ...process.env };
    const rows = JSON.parse(
      await readFile(join(REPO, "tests/fixtures/replay/directory-rows.json"), "utf8"),
    ) as {
      postcode: string;
      latitude: number;
      longitude: number;
      council: string;
      ward: string;
      region: string;
      lsoaCode: string | null;
      msoaCode: string | null;
    }[];
    const postcodes = rows.map((r) => r.postcode);

    // Directory seeds, stamped with the directory filing's own
    // source stamps as filed in this database.
    const stamp = await pool.query(
      "SELECT source_name, source_date FROM postcode_cache WHERE postcode = 'CM3 2JT'",
    );
    if (stamp.rowCount !== 1) throw new Error("the CI corpus is not filed (CM3 2JT missing)");
    const { source_name, source_date } = stamp.rows[0] as {
      source_name: string;
      source_date: string;
    };
    for (const r of rows) {
      await pool.query(
        `INSERT INTO postcode_cache (postcode, latitude, longitude, council, ward, region, lsoa_code, msoa_code, source_name, source_date, answers)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{}'::jsonb)
         ON CONFLICT (postcode) DO NOTHING`,
        [
          r.postcode,
          r.latitude,
          r.longitude,
          r.council,
          r.ward,
          r.region,
          r.lsoaCode,
          r.msoaCode,
          source_name,
          source_date,
        ],
      );
    }

    // Sold prices through the real loader: the pp-complete
    // fixture plus a monthly update concatenating the fixture's
    // own update rows with the KT17 rows — every replay postcode
    // gets its rows where the corpus has them and the loaded
    // stamp everywhere else, so no brain cold-loads live data.
    const soldDir = await mkdtemp(join(tmpdir(), "replay-sold-"));
    await copyFile(
      join(REPO, "tests/fixtures/land-registry/pp-complete.csv"),
      join(soldDir, "pp-complete.csv"),
    );
    const fixtureUpdate = await readFile(
      join(REPO, "tests/fixtures/land-registry/pp-monthly-update.csv"),
      "utf8",
    );
    const kt17Rows = await readFile(join(REPO, "tests/fixtures/address/kt17-1fh.csv"), "utf8");
    await writeFile(
      join(soldDir, "pp-monthly-update.csv"),
      fixtureUpdate.replace(/\n?$/, "\n") + kt17Rows.replace(/\n?$/, "\n"),
    );
    await run(
      "node",
      [join(REPO, "loaders/load-sold-prices.mjs"), "--file", soldDir, "--", ...postcodes],
      {
        env,
        maxBuffer: 64 * 1024 * 1024,
      },
    );

    // Crime through the real loader over the assembled fixture
    // dir (the committed points map plus Epsom, Ewell Village
    // and Hilgay, whose monthly captures the fixture carries).
    const crimeDir = await mkdtemp(join(tmpdir(), "replay-crime-"));
    await cp(join(REPO, "tests/fixtures/police-uk"), crimeDir, { recursive: true });
    const fixture = JSON.parse(await readFile(join(crimeDir, "fixture.json"), "utf8")) as {
      points: Record<string, { lat: number; lng: number; prefix: string }>;
      basisResidents: Record<string, number>;
    };
    fixture.points["KT17 1FH"] = { lat: 51.344571, lng: -0.247104, prefix: "epsom" };
    // Minerva's Basis B pin (M6.20, decision D39): the
    // committed fixture pins Birkdale's and Exeter's; the
    // assembled copy adds the third universal home's
    // measured 39,926.
    fixture.basisResidents["KT17 1FH"] = 39926;
    fixture.points["KT17 1DR"] = { lat: 51.350243, lng: -0.256581, prefix: "ewell" };
    fixture.points["CB6 1EH"] = { lat: 52.507481, lng: 0.33491, prefix: "hilgay" };
    await writeFile(join(crimeDir, "fixture.json"), JSON.stringify(fixture, null, 2));
    await run(
      "node",
      [
        join(REPO, "loaders/load-crime.mjs"),
        "--file",
        crimeDir,
        "--",
        "CM3 2JT",
        "E16 1GN",
        "KT17 1FH",
        "KT17 1DR",
        "CB6 1EH",
      ],
      { env, maxBuffer: 64 * 1024 * 1024 },
    );

    // The brains below are built through a crime source whose
    // loader path is the replay's fixture shim
    // (tests/fixtures/replay/crime-fixture-loader.mjs), which
    // runs the real loader against this assembled fixture dir.
    // A covered postcode with no filed artefact therefore
    // resolves its first-check load inside the fixture corpus
    // (no point in the fixture → the load fails → the brain
    // serves not-filed), never against live Police.uk data.
    process.env.REPLAY_CRIME_FIXTURE_DIR = crimeDir;

    // EPC through the real loader for the two postcodes the CI
    // steps do not file.
    await run(
      "node",
      [
        join(REPO, "loaders/load-epc.mjs"),
        "--file",
        join(REPO, "tests/fixtures/epc"),
        "--",
        "KT17 1FH",
        "CM1 6ER",
      ],
      { env, maxBuffer: 64 * 1024 * 1024 },
    );

    // Sold prices: the standalone loader files rows but never
    // writes the brain's load stamp — in production the stamp
    // is written by the brain's own on-demand load
    // (lib/sold-prices.ts), and it is what separates "loaded,
    // none recorded" from "never loaded". The loader run above
    // processed every seeded postcode against the fixture
    // file, so the setup completes that state, in the brain's
    // own stamp shape, for every seeded England/Wales postcode
    // the file held no sales for; without it the brain would
    // cold-load the live register mid-replay. Scotland and
    // Northern Ireland never reach the load (not-covered), so
    // they are not stamped.
    const editionRow = await pool.query(
      "SELECT source_date FROM price_paid WHERE postcode = 'CM3 2JT' LIMIT 1",
    );
    const rawEdition = (editionRow.rows[0] as { source_date: unknown } | undefined)?.source_date;
    const edition =
      rawEdition instanceof Date ? rawEdition.toISOString().slice(0, 10) : String(rawEdition);
    const loadStamp = JSON.stringify({ edition, loadedAt: NOW.toISOString() });
    for (const r of rows) {
      if (r.region === "S99999999" || r.region === "N99999999") continue;
      await pool.query(
        `UPDATE postcode_cache
            SET answers = jsonb_set(answers, '{soldPricesLoad}', $2::jsonb, true)
          WHERE postcode = $1
            AND NOT EXISTS (SELECT 1 FROM price_paid WHERE postcode = $1)
            AND NOT (answers ? 'soldPricesLoad')`,
        [r.postcode, loadStamp],
      );
    }

    // The zero-crimes witnesses and the Cardiff capture: the
    // loader's own live captures (M6.9 / M6.19), filed in its
    // write shape. Cardiff's is the Welsh served-crime golden:
    // 7,287 recorded crimes, window Oct 2025 – Sep 2026,
    // captured live through the real loader at M6.19.
    for (const [pc, file] of [
      ["CA20 1EX", "zero-witness-ca20-1ex.json"],
      ["LD5 4AD", "zero-witness-ld5-4ad.json"],
      ["CF11 8AA", "live-capture-cf11-8aa.json"],
    ] as const) {
      const artefact = JSON.parse(
        await readFile(join(REPO, "tests/fixtures/police-uk", file), "utf8"),
      );
      await pool.query(
        "UPDATE postcode_cache SET answers = answers || $1::jsonb WHERE postcode = $2",
        [JSON.stringify({ crime: artefact }), pc],
      );
    }

    // The England totals (M6.20, decision D39) through the
    // real national loader in fixture mode: it files the
    // fixture's synthetic 12 months and embeds the window
    // figure into every crime artefact above. The embedding's
    // denominator here is the replay corpus's excerpted
    // lsoa_bases (the three golden LSOAs, 5,899 residents) —
    // NOT England's 56,490,108 — so the replay asserts the
    // embedding's arithmetic identity on the excerpt, and
    // the real England figure stays the golden matrix's
    // M6.20 lock from the loader's live backfill.
    await run(
      "node",
      [
        join(REPO, "loaders/load-crime-national.mjs"),
        "--file",
        join(REPO, "tests/fixtures/police-uk-national"),
      ],
      { env, maxBuffer: 64 * 1024 * 1024 },
    );

    // Every home through every brain, once.
    const addressSource = createAddressSource(pool);
    const nearbySource = createNearbySource(pool);
    const soldSource = createSoldPricesSource(pool);
    const crimeSource = createCrimeSource(pool, {
      crimeLoaderPath: join(REPO, "tests/fixtures/replay/crime-fixture-loader.mjs"),
    });
    const floodSource = createFloodSource(pool);
    const areaSource = createAreaSource(pool);
    for (const [tag, input] of Object.entries(HOMES)) {
      const resolution = await resolveAddressInput(input, addressSource);
      const nearby = await buildNearbyBundle(resolution, nearbySource);
      const sold = await buildSoldPricesBundle(resolution, soldSource);
      const crime = await buildCrimeBundle(resolution, crimeSource, { now: NOW });
      const flood = await buildFloodBundle(resolution, floodSource);
      const area = await buildAreaBundle(resolution, areaSource);
      const short = buildShortBundle({ nearby, soldPrices: sold, crime, flood, area });
      brains.set(tag, { resolution, nearby, sold, crime, flood, area, short });
    }
  }, 900_000);

  afterAll(async () => {
    await pool.end();
  });

  const get = (tag: string): Brains => {
    const b = brains.get(tag);
    if (!b) throw new Error(`replay home missing: ${tag}`);
    return b;
  };

  it("resolves the golden homes at the expected rungs", () => {
    for (const tag of ["birkdale1", "exeter1", "minerva1"]) {
      expect(get(tag).resolution.rung, tag).toBe(1);
    }
    for (const tag of Object.keys(HOMES)) {
      if (tag.endsWith("2")) expect(get(tag).resolution.rung, tag).toBe(2);
    }
    expect(get("wider3").resolution.rung).toBe(3);
    // Minerva's Flat 4 resolves to Minerva House itself, not
    // to a sibling building's Flat 4 (the M6.1 trap). The
    // three-Flat-4s distinctness in full is pinned where it
    // was proven — M6.1's address tests over the fixture's
    // address parts: the replay corpus holds no Juno sale row
    // (the address fixture's Juno row carries blank sale
    // fields by provenance design, and the sold loader's
    // id-keyed merge cannot file two blank-id rows), so Juno
    // House is not a replay home.
    const minerva = get("minerva1").resolution;
    if (minerva.rung === 1) {
      // The served parts are the register's filed forms
      // (PAON "MINERVA HOUSE, 12", SAON "FLAT 4") — the PAON
      // naming Minerva House is the distinctness fact.
      expect(minerva.address.paon).toBe("MINERVA HOUSE, 12");
      expect(minerva.address.saon).toBe("FLAT 4");
    }
  });

  it("crime: the artefact locks reproduce through the real source", () => {
    const crime = (tag: string) => get(tag).crime;
    for (const tag of ["birkdale1", "birkdale2"]) {
      const c = crime(tag);
      if (c.kind !== "crime") throw new Error(`${tag}: expected a crime bundle`);
      expect(c.crime.state).toBe("served");
      if (c.crime.state === "served") {
        expect(c.crime.total).toBe(330);
        expect(c.crime.staleLine).toBeNull();
        expect(c.crime.categories.find((x) => x.slug === "violent-crime")?.count).toBe(133);
        expect(c.crime.categories.find((x) => x.slug === "anti-social-behaviour")?.count).toBe(65);
        expect(c.crime.months).toHaveLength(12);
        expect(c.crime.months[0]).toEqual({ month: "2025-10", count: 22 });
        expect(c.crime.months[11]).toEqual({ month: "2026-09", count: 12 });
      }
    }
    const exeter = crime("exeter1");
    if (exeter.kind !== "crime" || exeter.crime.state !== "served")
      throw new Error("exeter crime not served");
    expect(exeter.crime.total).toBe(10722);
    expect(exeter.crime.categories.find((x) => x.slug === "anti-social-behaviour")?.count).toBe(
      1852,
    );
    const minerva = crime("minerva1");
    if (minerva.kind !== "crime" || minerva.crime.state !== "served")
      throw new Error("minerva crime not served");
    expect(minerva.crime.total).toBe(1956);
    expect(minerva.crime.categories.find((x) => x.slug === "violent-crime")?.count).toBe(591);
    const ewell = crime("ewell2");
    if (ewell.kind !== "crime" || ewell.crime.state !== "served")
      throw new Error("ewell crime not served");
    expect(ewell.crime.total).toBe(2361);
    const hilgay = crime("hilgay2");
    if (hilgay.kind !== "crime" || hilgay.crime.state !== "served")
      throw new Error("hilgay crime not served");
    expect(hilgay.crime.total).toBe(7);
    // The Welsh served-crime golden (live capture, M6.19).
    const cardiff = crime("cardiff2");
    if (cardiff.kind !== "crime" || cardiff.crime.state !== "served")
      throw new Error("cardiff crime not served");
    expect(cardiff.crime.total).toBe(7287);
    expect(cardiff.crime.categories.find((x) => x.slug === "violent-crime")?.count).toBe(2499);
    expect(cardiff.crime.categories.find((x) => x.slug === "anti-social-behaviour")?.count).toBe(
      841,
    );
    expect(cardiff.crime.categories).toHaveLength(14);
  });

  it("crime: the zero witnesses serve genuine zeroes, as counts", () => {
    for (const tag of ["wasdale2", "llanwrtyd2"]) {
      const c = get(tag).crime;
      if (c.kind !== "crime" || c.crime.state !== "served")
        throw new Error(`${tag}: expected served zero`);
      expect(c.crime.total).toBe(0);
      expect(c.crime.totalLine).toContain("0 recorded crimes within 1 mile of this postcode");
      // The witnesses' committed artefacts predate M6.20 and
      // carry no filed basis — calibration is absent, never
      // estimated (the zero-with-basis behaviour is pinned
      // in tests/crime.test.ts on the measured populations).
      expect(c.crime.perHead).toBeNull();
      expect(c.crime.englandFigure).toBeNull();
    }
  });

  it("crime calibration (M6.20, D39): per-head goldens and the embedded England figure", () => {
    // The per-head goldens are the prep's measured figures,
    // served through the real loader's fixture pins.
    const perHead = (tag: string) => {
      const c = get(tag).crime;
      if (c.kind !== "crime" || c.crime.state !== "served")
        throw new Error(`${tag}: expected served crime`);
      return c.crime.perHead;
    };
    expect(perHead("birkdale1")).toEqual({
      residents: 6380,
      per1000: 51.7,
      line: "51.7 recorded crimes per 1,000 residents",
      basisLine: expect.stringContaining("6,380 residents for this circle"),
    });
    expect(perHead("exeter1")?.per1000).toBe(122.5);
    expect(perHead("minerva1")?.per1000).toBe(49.0);
    // The England embedding landed through the real national
    // loader: on this excerpted corpus the denominator is
    // the three golden LSOAs' 5,899 residents, so the served
    // England figure is the fixture total's arithmetic on
    // the excerpt — asserted as an identity, not a value.
    // (The real figure, on the full bases, is the golden
    // matrix's M6.20 lock from the live backfill.)
    const fixtureTotal = 5503997;
    const expectedEngland = Math.round(((fixtureTotal / 5899) * 1000 + Number.EPSILON) * 10) / 10;
    for (const tag of ["birkdale1", "exeter1", "minerva1"]) {
      const c = get(tag).crime;
      if (c.kind !== "crime" || c.crime.state !== "served")
        throw new Error(`${tag}: expected served crime`);
      expect(c.crime.englandFigure?.englandPer1000).toBe(expectedEngland);
      // On the excerpt the multiples round to 0.0 and are
      // withheld — the line carries the figures only.
      expect(c.crime.englandFigure?.multiple).toBeNull();
      expect(c.crime.englandFigure?.line).not.toContain("times");
    }
    // Cardiff's capture carries no basis: no calibration,
    // even with the embedding filed.
    const cardiff = get("cardiff2").crime;
    if (cardiff.kind !== "crime" || cardiff.crime.state !== "served")
      throw new Error("cardiff crime not served");
    expect(cardiff.crime.perHead).toBeNull();
    expect(cardiff.crime.englandFigure).toBeNull();
  });

  it("regional witnesses: Scotland — the not-covered combination", () => {
    const b = get("edinburgh2");
    expect(b.sold.kind).toBe("not-covered");
    expect(b.crime.kind).toBe("not-covered");
    expect(b.flood.kind).toBe("not-covered");
    if (b.area.kind !== "area-bundle") throw new Error("edinburgh: expected an area bundle");
    const s = b.area.sections;
    expect(s.census.state).toBe("not-covered");
    expect(s.councilTax.state).toBe("not-covered");
    expect(s.planningApplications.state).toBe("handed-off");
    expect(s.planningApplications.link).toBeNull();
    // The short bundle carries the same honesty at headline depth.
    expect(b.short.sections.crime.state).toBe("not-covered");
    expect(b.short.sections.soldPrices.state).toBe("not-covered");
    expect(b.short.sections.flood.state).toBe("not-covered");
  });

  it("regional witnesses: Northern Ireland — not-covered brains, the register hand-off", () => {
    const b = get("belfast2");
    expect(b.sold.kind).toBe("not-covered");
    expect(b.crime.kind).toBe("not-covered");
    expect(b.flood.kind).toBe("not-covered");
    if (b.area.kind !== "area-bundle") throw new Error("belfast: expected an area bundle");
    const s = b.area.sections;
    expect(s.census.state).toBe("not-covered");
    expect(s.councilTax.state).toBe("not-covered");
    expect(s.planningApplications.state).toBe("handed-off");
    expect(s.planningApplications.link?.url).toContain("planningregister.planningsystemni.gov.uk");
  });

  it("regional witnesses: Mid Ulster — the planning exception carries no link", () => {
    const b = get("midUlster2");
    expect(b.crime.kind).toBe("not-covered");
    expect(b.flood.kind).toBe("not-covered");
    if (b.area.kind !== "area-bundle") throw new Error("mid ulster: expected an area bundle");
    expect(b.area.sections.planningApplications.state).toBe("handed-off");
    expect(b.area.sections.planningApplications.link).toBeNull();
    expect(b.area.sections.planningApplications.line).toContain("Mid Ulster");
  });

  it("regional witnesses: Wales — flood not covered, planning handed off, council tax served", () => {
    const b = get("cardiff2");
    expect(b.flood.kind).toBe("not-covered");
    if (b.area.kind !== "area-bundle") throw new Error("cardiff: expected an area bundle");
    const s = b.area.sections;
    expect(s.planningApplications.state).toBe("handed-off");
    expect(s.planningApplications.link?.url).toContain("gov.uk/search-register-planning-decisions");
    expect(s.councilTax.state).toBe("served");
    if (s.councilTax.state === "served") {
      expect(s.councilTax.bandDAveragePence).toBe(201318);
      // Wales runs to Band I.
      expect(s.councilTax.bands.map((x) => x.band)).toContain("I");
    }
  });

  it("flood: the three layers serve their distinct fixture-basis facts, never merged", () => {
    const layers = (tag: string) => {
      const f = get(tag).flood;
      if (f.kind !== "flood" || f.flood.state !== "served")
        throw new Error(`${tag}: flood not served`);
      return new Map(f.flood.layers.map((l) => [l.layer, l]));
    };
    // Exeter: FZ3 covers (river and sea · modelled); RoFRS
    // filed Very low covers; surface water Low is a near miss.
    const exeter = layers("exeter1");
    expect(exeter.get("flood_zone")?.pointState).toBe("inside");
    expect(exeter.get("flood_zone")?.covering?.label).toBe("FZ3");
    expect(exeter.get("flood_zone")?.covering?.displayLabel).toBe("Flood Zone 3");
    expect(exeter.get("flood_zone")?.covering?.detail).toBe("river and sea · modelled");
    expect(exeter.get("rofrs")?.pointState).toBe("inside");
    expect(exeter.get("rofrs")?.covering?.label).toBe("Very low");
    expect(exeter.get("rofsw")?.pointState).toBe("below-lowest-band");
    const exeterSw = exeter.get("rofsw")?.proximity.find((p) => p.label === "Low");
    expect(exeterSw?.miles).toBeGreaterThan(0);
    expect(exeterSw?.miles).toBeLessThan(0.02);

    // Birkdale: three distinct absence states — Zone 1 by
    // absence, no RoFRS band published at the point, below the
    // surface-water Low threshold — each with its nearest edge.
    const birkdale = layers("birkdale1");
    expect(birkdale.get("flood_zone")?.pointState).toBe("zone-1");
    const birkdaleFz2 = birkdale.get("flood_zone")?.proximity.find((p) => p.label === "FZ2");
    expect(Math.abs((birkdaleFz2?.miles ?? 0) - 0.84)).toBeLessThanOrEqual(0.03);
    expect(birkdale.get("rofrs")?.pointState).toBe("no-band-published");
    expect(birkdale.get("rofsw")?.pointState).toBe("below-lowest-band");
    const birkdaleSw = birkdale.get("rofsw")?.proximity.find((p) => p.label === "Low");
    expect(Math.abs((birkdaleSw?.miles ?? 0) - 0.03)).toBeLessThanOrEqual(0.03);

    // Epsom: zones remainder with FZ2 at 0.40; surface-water
    // Low at the point itself.
    const epsom = layers("minerva1");
    expect(epsom.get("flood_zone")?.pointState).toBe("zone-1");
    const epsomFz2 = epsom.get("flood_zone")?.proximity.find((p) => p.label === "FZ2");
    expect(Math.abs((epsomFz2?.miles ?? 0) - 0.4)).toBeLessThanOrEqual(0.03);
    expect(epsom.get("rofsw")?.pointState).toBe("inside");
    expect(epsom.get("rofsw")?.covering?.label).toBe("Low");
  });

  it("sold prices: the universal locks reproduce on the fixture corpus", () => {
    const birkdale = get("birkdale1").sold;
    if (birkdale.kind !== "sold-prices" || birkdale.rung !== 1)
      throw new Error("birkdale sold not served");
    // The fixture corpus files 30 of the register's 31 recorded
    // sales: the monthly update's deletion row removes No 39's
    // category-B transfer, exactly as the loader's merge is
    // documented to apply it (the matrix's 31 is the complete
    // file's pre-merge count).
    expect(birkdale.recordedCount).toBe(30);
    expect(birkdale.ownHistory).toHaveLength(1);
    expect(birkdale.ownHistory[0]?.price).toBe(588995);
    expect(birkdale.ownHistory[0]?.date).toBe("2023-06-15");
    expect(birkdale.median.value).toBe(588995);
    expect(birkdale.median.counted).toBe(29);
    expect(birkdale.median.spanFrom).toBe("1996-12-20");
    expect(birkdale.median.spanTo).toBe("2026-07-20");

    const exeter = get("exeter1").sold;
    if (exeter.kind !== "sold-prices" || exeter.rung !== 1)
      throw new Error("exeter sold not served");
    expect(exeter.ownHistory[0]?.price).toBe(270000);
    expect(exeter.ownHistory[0]?.date).toBe("2014-01-17");
    expect(exeter.median.value).toBe(310000);
    expect(exeter.median.counted).toBe(9);

    // Minerva's own sale is a golden fact; the excerpt corpus
    // holds only the two golden KT17 rows, so the postcode
    // median stands in its too-few state here (the full-register
    // lock — £399,999 over 27 — is the matrix's, proven at M6.3
    // against the complete file).
    const minerva = get("minerva1").sold;
    if (minerva.kind !== "sold-prices" || minerva.rung !== 1)
      throw new Error("minerva sold not served");
    expect(minerva.ownHistory[0]?.price).toBe(420000);
    expect(minerva.ownHistory[0]?.date).toBe("2019-12-03");
    expect(minerva.recordedCount).toBe(2);
    expect(minerva.median.state).toBe("too-few");
  });

  it("sold prices: the loaded-none state serves for a proven-empty postcode", () => {
    const beaulieu = get("beaulieu2").sold;
    if (beaulieu.kind !== "sold-prices") throw new Error("beaulieu sold not served");
    expect(beaulieu.loadState).toBe("loaded-none");
    expect(beaulieu.recordedCount).toBe(0);
    expect(beaulieu.stateLine).toContain("No sale recorded for this postcode since 1995");
  });

  it("area locks: council tax, census and the EPC spread reproduce", () => {
    const area = (tag: string) => {
      const a = get(tag).area;
      if (a.kind !== "area-bundle") throw new Error(`${tag}: expected an area bundle`);
      return a.sections;
    };
    const birkdale = area("birkdale1");
    expect(birkdale.councilTax.state).toBe("served");
    if (birkdale.councilTax.state === "served") {
      expect(birkdale.councilTax.bandDAveragePence).toBe(228034);
      expect(birkdale.councilTax.monthlyLine).toContain("£190.03");
    }
    expect(birkdale.census.state).toBe("served");
    if (birkdale.census.state === "served") expect(birkdale.census.medianAge?.value).toBe(46.5);
    expect(birkdale.epc.state).toBe("served");
    if (birkdale.epc.state === "served") {
      expect(birkdale.epc.certificateCountAtPostcode).toBe(42);
      const predicted = birkdale.epc.spread?.rows.find((r) => r.kind === "predicted");
      const assessed = birkdale.epc.spread?.rows.find((r) => r.kind === "assessed");
      expect(predicted?.count).toBe(38);
      expect(assessed?.count).toBe(4);
    }

    const exeter = area("exeter1");
    if (exeter.councilTax.state === "served")
      expect(exeter.councilTax.bandDAveragePence).toBe(194423);
    if (exeter.census.state === "served") expect(exeter.census.medianAge?.value).toBe(33.4);
    if (exeter.epc.state === "served") expect(exeter.epc.certificateCountAtPostcode).toBe(12);

    const minerva = area("minerva1");
    if (minerva.councilTax.state === "served")
      expect(minerva.councilTax.bandDAveragePence).toBe(253084);
    if (minerva.census.state === "served") expect(minerva.census.medianAge?.value).toBe(44.5);
    if (minerva.epc.state === "served") {
      expect(minerva.epc.certificateCountAtPostcode).toBe(25);
      const predicted = minerva.epc.spread?.rows.find((r) => r.kind === "predicted");
      expect(predicted?.count).toBe(25);
    }

    const beaulieu = area("beaulieu2");
    if (beaulieu.epc.state === "served") {
      expect(beaulieu.epc.certificateCountAtPostcode).toBe(49);
      const predicted = beaulieu.epc.spread?.rows.find((r) => r.kind === "predicted");
      expect(predicted?.count).toBe(49);
    }
  });

  it("short bundle: the universal headlines carry the locked figures", () => {
    const birkdale = get("birkdale1").short;
    expect(Object.keys(birkdale.sections).sort()).toHaveLength(12);
    expect(birkdale.sections.crime.state).toBe("served");
    if (birkdale.sections.crime.state === "served") {
      expect(birkdale.sections.crime.total).toBe(330);
      expect(birkdale.sections.crime.asb?.count).toBe(65);
    }
    expect(birkdale.sections.councilTax.state).toBe("served");
    if (birkdale.sections.councilTax.state === "served") {
      expect(birkdale.sections.councilTax.line).toContain("£2,280.34");
      expect(birkdale.sections.councilTax.line).toContain("not this home's bill");
    }
    const exeter = get("exeter1").short;
    if (exeter.sections.crime.state === "served") expect(exeter.sections.crime.total).toBe(10722);
    const minerva = get("minerva1").short;
    if (minerva.sections.crime.state === "served") expect(minerva.sections.crime.total).toBe(1956);
  });
});
