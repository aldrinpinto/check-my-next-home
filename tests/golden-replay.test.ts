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
import {
  SCHOOL_DEADLINES_ENGLAND_LINE,
  SCHOOL_DEADLINES_WALES_LINE,
  buildNearbyBundle,
  createNearbySource,
  type NearbyBundle,
} from "../lib/nearby";
import { buildReportView } from "../lib/report";
import {
  BURE_ITEM,
  LEADON_ITEM,
  WARNING_NOW,
  FakeFloodWarningSource,
} from "./flood-warning-fixtures";
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
    // loader, but on this excerpted corpus the embedded base
    // is the three golden LSOAs' 5,899 residents — far below
    // the credibility floor (ENGLAND_BASE_MIN_RESIDENTS, the
    // parity fix batch's item 9 guard, 18 Nov 2026). The
    // pre-guard pin asserted the arithmetic on that thin base
    // (5,503,997 / 5,899 → 933,039 per 1,000): it had captured
    // the thin-base bug's own output, and the guard supersedes
    // it — on the excerpt the England figure is withheld and
    // the local rate serves alone. (The real figure, on the
    // full bases, is the golden matrix's M6.20 lock from the
    // live backfill.)
    for (const tag of ["birkdale1", "exeter1", "minerva1"]) {
      const c = get(tag).crime;
      if (c.kind !== "crime" || c.crime.state !== "served")
        throw new Error(`${tag}: expected served crime`);
      expect(c.crime.englandFigure).toBeNull();
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
    if (birkdale.kind !== "sold-prices" || birkdale.rung !== 1 || "soldPrices" in birkdale)
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
    // The counted set (M8.2's widening): the whole set the
    // median is drawn from — its middle, sorted, is the
    // median itself.
    expect(birkdale.countedSales).toHaveLength(29);
    expect([...birkdale.countedSales.map((s) => s.price)].sort((a, b) => a - b)[14]).toBe(588995);

    const exeter = get("exeter1").sold;
    if (exeter.kind !== "sold-prices" || exeter.rung !== 1 || "soldPrices" in exeter)
      throw new Error("exeter sold not served");
    expect(exeter.ownHistory[0]?.price).toBe(270000);
    expect(exeter.ownHistory[0]?.date).toBe("2014-01-17");
    expect(exeter.median.value).toBe(310000);
    expect(exeter.median.counted).toBe(9);
    expect(exeter.countedSales).toHaveLength(9);
    expect([...exeter.countedSales.map((s) => s.price)].sort((a, b) => a - b)[4]).toBe(310000);

    // Minerva's own sale is a golden fact; the excerpt corpus
    // holds only the two golden KT17 rows, so the postcode
    // median stands in its too-few state here (the full-register
    // lock — £399,999 over 27 — is the matrix's, proven at M6.3
    // against the complete file).
    const minerva = get("minerva1").sold;
    if (minerva.kind !== "sold-prices" || minerva.rung !== 1 || "soldPrices" in minerva)
      throw new Error("minerva sold not served");
    expect(minerva.ownHistory[0]?.price).toBe(420000);
    expect(minerva.ownHistory[0]?.date).toBe("2019-12-03");
    expect(minerva.recordedCount).toBe(2);
    expect(minerva.median.state).toBe("too-few");
  });

  it("sold prices: the loaded-none state serves for a proven-empty postcode", () => {
    const beaulieu = get("beaulieu2").sold;
    if (beaulieu.kind !== "sold-prices" || "soldPrices" in beaulieu)
      throw new Error("beaulieu sold not served");
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

  it("missing layers (M6.21, D41): the filed layers serve through the real source", () => {
    const area = (tag: string) => {
      const a = get(tag).area;
      if (a.kind !== "area-bundle") throw new Error(`${tag}: expected an area bundle`);
      return a.sections;
    };

    // Brownfield: the fixture cut's deduped sites, counted
    // and distanced by PostGIS from the filed points. The
    // counts are the five-mile counts (BUG-126 widened the
    // search from two miles); on the fixture filing they
    // equal the cut's three-mile counts, the cut holding
    // no rows beyond three miles of a golden home.
    const birkdale = area("birkdale1");
    expect(birkdale.constraints.brownfield.state).toBe("served");
    expect(birkdale.constraints.brownfield.countWithin).toBe(10);
    expect(birkdale.constraints.brownfield.within[0]?.label).toBe(
      "Universal Garage, The Street, Hatfield Peverel",
    );
    expect(birkdale.constraints.brownfield.within[0]?.miles).toBeCloseTo(0.252, 2);
    expect(birkdale.constraints.brownfield.within[0]?.dwellingsLine).toBe(
      "the register publishes 9 net dwellings for the site",
    );

    const exeter = area("exeter1");
    expect(exeter.constraints.brownfield.state).toBe("served");
    expect(exeter.constraints.brownfield.countWithin).toBe(226);
    expect(exeter.constraints.brownfield.within[0]?.label).toBe(
      "45 Beckton Road, Canning Town, London, E16 4EA",
    );
    expect(exeter.constraints.brownfield.within[0]?.miles).toBeCloseTo(0.163, 2);

    const minerva = area("minerva1");
    expect(minerva.constraints.brownfield.state).toBe("served");
    expect(minerva.constraints.brownfield.countWithin).toBe(98);
    expect(minerva.constraints.brownfield.within[0]?.label).toBe(
      "Etwell House and former coach, Station Approach",
    );
    expect(minerva.constraints.brownfield.within[0]?.miles).toBeCloseTo(0.227, 2);

    // Built-up areas: all three homes inside their pinned
    // areas, named from the filed polygons.
    expect(birkdale.constraints.builtUpArea.state).toBe("inside");
    expect(birkdale.constraints.builtUpArea.insideName).toBe("Hatfield Peverel");
    expect(exeter.constraints.builtUpArea.state).toBe("inside");
    expect(exeter.constraints.builtUpArea.insideName).toBe("Newham");
    expect(minerva.constraints.builtUpArea.state).toBe("inside");
    expect(minerva.constraints.builtUpArea.insideName).toBe("Ewell");

    // Heritage: the four new layers serve their absence
    // lines at all three homes on the fixture basis.
    for (const sections of [birkdale, exeter, minerva]) {
      expect(sections.heritage.worldHeritageSites.state).toBe("none-found");
      expect(sections.heritage.battlefields.state).toBe("none-found");
      expect(sections.heritage.protectedWrecks.state).toBe("none-found");
      expect(sections.heritage.worldHeritageBufferZones.state).toBe("none-found");
    }

    // EPC improvements: Birkdale's certificate serves its
    // two modelled steps through the widened filing;
    // Exeter's and Minerva Flat 4's serve the named
    // no-measures state.
    if (birkdale.epc.state === "served") {
      const cert = birkdale.epc.certificates.find(
        (c) => c.certificateNumber === "2490-1633-0432-1002-3023",
      );
      expect(cert?.improvements?.state).toBe("served");
      expect(cert?.improvements?.steps.map((s) => s.name)).toEqual([
        "Solar water heating",
        "Solar photovoltaic panels, 2.5 kWp",
      ]);
      expect(cert?.improvements?.steps.map((s) => s.typicalSavingLabel)).toEqual([
        "£34.00",
        "£383.00",
      ]);
      expect(cert?.improvements?.closingLine).toBe(
        "after all 2 steps, the register's model gives an energy rating of 93 and an environmental rating of 94",
      );
    }
    if (exeter.epc.state === "served") {
      for (const cert of exeter.epc.certificates)
        expect(cert.improvements?.state).toBe("none-published");
    }
    if (minerva.epc.state === "served") {
      const flat4 = minerva.epc.certificates.find(
        (c) => c.certificateNumber === "8401-7039-6529-6723-9906",
      );
      expect(flat4?.improvements?.state).toBe("none-published");
    }
  });

  it("air yardsticks (M6.29, D50/D57): the report-depth positions serve through the real source on the locked PCM triples", () => {
    const area = (tag: string) => {
      const a = get(tag).area;
      if (a.kind !== "area-bundle") throw new Error(`${tag}: expected an area bundle`);
      return a.sections;
    };
    // Added at the D53 closure pass: until here the
    // replay carried no air-specific assertion (recorded
    // at M6.29), so the yardstick block — M6.29's whole
    // serving addition — had no real-source proof. The
    // values are the locked PCM 2024 triples (the
    // matrix's M6.6 lock), read through the real source
    // from the filed fixture squares; the positions are
    // D57's boundary semantics applied to those figures,
    // premise-checked field by field against the filing
    // at the closure pass.
    const cases: {
      tag: string;
      values: [number, number, number];
      positions: [string, string, string];
    }[] = [
      {
        tag: "birkdale1",
        values: [8.150298, 7.124671, 12.54823],
        positions: ["below-both", "between", "below-both"],
      },
      {
        tag: "exeter1",
        values: [21.71409, 9.939679, 16.97423],
        positions: ["between", "between", "between"],
      },
      {
        tag: "minerva1",
        values: [12.49256, 7.868347, 12.10357],
        positions: ["between", "between", "below-both"],
      },
    ];
    const summaryFor = (position: string) =>
      position === "between"
        ? "within the UK legal limit, but above the stricter WHO guideline"
        : "within the UK legal limit, and below the stricter WHO guideline";
    for (const { tag, values, positions } of cases) {
      const air = area(tag).air;
      expect(air.state).toBe("served");
      expect(air.year).toBe(2024);
      expect([air.no2, air.pm25, air.pm10]).toEqual(values);
      const yardsticks = air.yardsticks;
      if (!yardsticks) throw new Error(`${tag}: yardsticks missing on a served section`);
      expect(yardsticks.basisLine).toBe(
        "A figure's position against these yardsticks is a scale for reading the figure. Whether a legal limit is met is decided for whole zones from monitoring and modelling together — not from one square's modelled background figure, and never for an individual home.",
      );
      expect(yardsticks.pollutants.map((p) => p.pollutant)).toEqual(["NO2", "PM2.5", "PM10"]);
      expect(yardsticks.pollutants.map((p) => p.value)).toEqual(values);
      expect(yardsticks.pollutants.map((p) => p.position)).toEqual(positions);
      expect(yardsticks.pollutants.map((p) => p.summaryLine)).toEqual(positions.map(summaryFor));
      // The figure is never embedded in the yardstick
      // prose (the M6.29 invariant, through the real
      // source).
      for (const p of yardsticks.pollutants) expect(p.yardstickLine).not.toContain(String(p.value));
    }
    // One yardstick line verbatim, and the above-limit
    // arm: no golden home's figure exceeds a UK limit
    // (above ×0 on the real triples — the arm itself is
    // fixtured synthetically in the serving suite).
    const birkdale = area("birkdale1").air;
    expect(birkdale.yardsticks?.pollutants[0]?.yardstickLine).toBe(
      "NO2 yardsticks: the UK legal limit is 40 µg/m³ as an annual mean (the Air Quality Standards Regulations 2010), and the World Health Organization's 2021 guideline is 10 µg/m³ as an annual mean.",
    );
    for (const { tag } of cases)
      for (const p of area(tag).air.yardsticks?.pollutants ?? [])
        expect(p.position).not.toBe("above-uk-limit");
  });

  it("AQMA (M6.30, D59): the three states serve through the real source on the fixture filing", () => {
    const area = (tag: string) => {
      const a = get(tag).area;
      if (a.kind !== "area-bundle") throw new Error(`${tag}: expected an area bundle`);
      return a.sections;
    };
    // The replay world files the fixture cut: 72 areas,
    // edition 2026-10-20. The states are the prep's
    // goldens; Minerva's distance is the PostGIS geography
    // figure, locked here on first CI proof (the
    // golden-check basis measured 0.929).
    const birkdale = area("birkdale1");
    expect(birkdale.air.aqma.state).toBe("none");
    expect(birkdale.air.aqma.filedCount).toBe(72);
    expect(birkdale.air.aqma.line).toContain(
      "complete filed set of 72 declared areas (Defra UK-AIR, edition 20 October 2026)",
    );

    const exeter = area("exeter1");
    expect(exeter.air.aqma.state).toBe("inside");
    expect(exeter.air.aqma.name).toBe("Newham AQMA (No. 2)");
    expect(exeter.air.aqma.authority).toBe("London Borough of Newham");
    expect(exeter.air.aqma.pollutants).toEqual([
      "nitrogen dioxide (NO2)",
      "particulate matter (PM10)",
    ]);
    expect(exeter.air.aqma.sourceDate).toBe("2026-10-20");

    const minerva = area("minerva1");
    expect(minerva.air.aqma.state).toBe("nearest");
    expect(minerva.air.aqma.name).toBe("Sutton AQMA");
    expect(minerva.air.aqma.authority).toBe("London Borough of Sutton");
    expect(minerva.air.aqma.miles).not.toBeNull();
    expect(minerva.air.aqma.miles ?? 0).toBeGreaterThan(0.9);
    expect(minerva.air.aqma.miles ?? 0).toBeLessThan(0.96);
  });

  it("charging zones (M6.31, D61/D63): the states serve through the real source on the fixture filing", () => {
    const area = (tag: string) => {
      const a = get(tag).area;
      if (a.kind !== "area-bundle") throw new Error(`${tag}: expected an area bundle`);
      return a.sections;
    };
    // The replay world files the fixture cut: the eleven
    // sourced schemes; Portsmouth files no row (decision
    // D63). Second pass (BUG-085): the uncheckable zone
    // is named only for homes within its broad reach —
    // every golden home stands far from Portsmouth, so
    // every outside answer here is the plain form.
    const exeter = area("exeter1");
    expect(exeter.chargingZones.state).toBe("inside");
    expect(exeter.chargingZones.scheme?.name).toBe("London Ultra Low Emission Zone (ULEZ)");
    expect(exeter.chargingZones.scheme?.family).toBe("ulez");
    expect(exeter.chargingZones.scheme?.dateLine).toBe(
      "Charges in this zone, at this boundary, began on 29 August 2023.",
    );
    expect(exeter.chargingZones.filedCount).toBe(11);

    const edinburgh = area("edinburgh2");
    expect(edinburgh.chargingZones.state).toBe("inside");
    expect(edinburgh.chargingZones.scheme?.name).toBe("Edinburgh Low Emission Zone");
    expect(edinburgh.chargingZones.scheme?.family).toBe("lez");
    expect(edinburgh.chargingZones.scheme?.dateLine).toBe(
      "Penalties in this zone began on 1 June 2024.",
    );

    for (const tag of ["birkdale1", "minerva1", "cardiff2"]) {
      const s = area(tag).chargingZones;
      expect(s.state).toBe("outside");
      expect(s.line).toBe(
        "This postcode point is not inside any charging zone whose boundary is published.",
      );
      expect(s.setDate).toBeNull();
      expect(s.filedCount).toBe(11);
    }
  });

  it("industrial sites (M6.32, D60/D62): the block serves through the real source on the fixture filing", async () => {
    const nearby = (tag: string) => {
      const n = get(tag).nearby;
      if (n.kind !== "distances") throw new Error(`${tag}: expected distances`);
      return n;
    };
    // The replay world files the fixture cut: nine
    // permits of the real 2024 register (seven goldens,
    // one with no air rows, one with no published point —
    // both far from every golden home).
    const birkdale = nearby("birkdale1").industrialSites;
    expect(birkdale?.state).toBe("served");
    expect(birkdale?.dataYear).toBe(2024);
    expect(birkdale?.sourceName).toBe("Environment Agency Pollution Inventory");
    expect(birkdale?.sourceDate).toBe("2025-11-20");
    expect(birkdale?.sites).toHaveLength(1);
    const fairwinds = birkdale!.sites[0]!;
    expect(fairwinds.permitId).toBe("YP3432XR");
    expect(fairwinds.operator).toBe("Stuart Davis Limited");
    expect(Math.abs(fairwinds.miles - 1.328)).toBeLessThan(0.005);
    expect(fairwinds.releases).toEqual([
      { substance: "Ammonia", quantityKg: 3128, thresholdKg: 1000 },
      { substance: "Particulate matter - PM10", quantityKg: 3066, thresholdKg: 1000 },
    ]);
    expect(fairwinds.belowThreshold).toEqual(["Nitrogen oxides (NO and NO2) as NO2"]);

    const exeter = nearby("exeter1").industrialSites;
    expect(exeter?.state).toBe("served");
    expect(exeter?.sites.map((s) => s.permitId)).toEqual([
      "SP3237JU",
      "BP3530YR",
      "FP3839YQ",
      "EP3507SL",
      "MP3530HZ",
      "DP3906BE",
    ]);
    expect(Math.abs(exeter!.sites[0]!.miles - 0.998)).toBeLessThan(0.005);
    const thames = exeter!.sites.find((s) => s.permitId === "MP3530HZ");
    expect(thames?.operator).toBe("T & L Sugars Limited");
    expect(thames?.releases[0]).toEqual({
      substance: "Carbon dioxide",
      quantityKg: 88988870,
      thresholdKg: 10000000,
    });
    // The threshold-0 case serves through the real source.
    const tva = exeter!.sites.find((s) => s.permitId === "EP3507SL");
    expect(tva?.releases).toEqual([
      {
        substance: "Carbon Dioxide From Qualifying Renewable Fuel Sources",
        quantityKg: 670,
        thresholdKg: 0,
      },
    ]);
    // A BRT-only site: no quantified releases, its names
    // on the below-threshold line.
    const dataCentre = exeter!.sites.find((s) => s.permitId === "DP3906BE");
    expect(dataCentre?.releases).toEqual([]);
    expect(dataCentre?.belowThreshold).toHaveLength(10);

    const minerva = nearby("minerva1").industrialSites;
    expect(minerva?.state).toBe("none-within-5-miles");
    // Re-pinned (BUG-113): the search radius is ten
    // miles — the absence line names ten (the state
    // string keeps its original name).
    expect(minerva?.line).toBe(
      "No regulated industrial site in the Environment Agency's Pollution Inventory for 2024 is recorded within ten miles of this postcode point.",
    );

    // The devolved witnesses: not covered, each naming
    // its own inventory — never a false none.
    expect(nearby("cardiff2").industrialSites?.state).toBe("not-covered");
    expect(nearby("cardiff2").industrialSites?.line).toContain("Welsh Emissions Inventory");
    expect(nearby("edinburgh2").industrialSites?.state).toBe("not-covered");
    expect(nearby("edinburgh2").industrialSites?.line).toContain(
      "Scottish Pollutant Release Inventory",
    );
    expect(nearby("belfast2").industrialSites?.state).toBe("not-covered");
    expect(nearby("belfast2").industrialSites?.line).toContain(
      "Northern Ireland Pollution Inventory",
    );

    // Depth (prep check 12): the short bundle is
    // byte-identical with the flag on or off — the
    // derivation never reads the block.
    const stored = get("birkdale1");
    const nearbyOff = await buildNearbyBundle(stored.resolution, createNearbySource(pool), {
      industrialSitesEnabled: false,
    });
    expect("industrialSites" in nearbyOff).toBe(false);
    const shortOff = buildShortBundle({
      nearby: nearbyOff,
      soldPrices: stored.sold,
      crime: stored.crime,
      flood: stored.flood,
      area: stored.area,
    });
    expect(shortOff).toEqual(stored.short);
    expect(JSON.stringify(stored.short)).not.toContain("Pollution Inventory");
  });

  it("sixth forms (M6.33, D51/D64): the category and the marker serve through the real source on the fixture filing", () => {
    const nearby = (tag: string) => {
      const n = get(tag).nearby;
      if (n.kind !== "distances") throw new Error(`${tag}: expected distances`);
      return n;
    };
    const category = (tag: string, key: string) => {
      const found = nearby(tag).categories.find((c) => c.category === key);
      if (!found) throw new Error(`${tag}: no ${key} answer`);
      return found;
    };
    // The replay world files the fixture cut of the
    // register (70 rows around the golden homes): the
    // only within-selection row it holds is NESCOT, so
    // most homes take the beyond path — the national
    // outcomes (Exeter's three within; 410 rows selected)
    // are the prep's live-extract goldens, recorded in
    // docs/backend-m6.33.md.
    expect(nearby("birkdale1").categories).toHaveLength(22);
    expect(
      nearby("birkdale1")
        .categories.map((c) => c.category)
        .slice(0, 3),
    ).toEqual(["schools-primary", "schools-secondary", "sixth-forms"]);

    // Minerva: NESCOT alone within the radius, on the
    // phase clause (its filed flag is "Not applicable"),
    // serving name, type as filed, distance.
    const minervaCat = category("minerva1", "sixth-forms");
    expect(minervaCat.state).toBe("within");
    expect(minervaCat.countWithin).toBe(1);
    expect(minervaCat.places).toHaveLength(1);
    expect(minervaCat.places[0]?.name).toBe("North East Surrey College of Technology");
    expect(minervaCat.places[0]?.detail).toBe("Further education");
    expect(Math.abs((minervaCat.places[0]?.miles ?? 0) - 0.174)).toBeLessThan(0.005);
    expect(minervaCat.places[0]).not.toHaveProperty("sixthForm");

    // The marker on the served secondaries, as filed:
    // Minerva's three all file "Has a sixth form".
    expect(
      category("minerva1", "schools-secondary").places.map((p) => [p.name, p.sixthForm]),
    ).toEqual([
      ["Glyn School", true],
      ["Blenheim High School", true],
      ["Nonsuch High School for Girls", true],
    ]);
    // Exeter's three all file "Does not have a sixth
    // form". Birkdale's list serves to five miles
    // (BUG-109), so three secondaries stand: Lift
    // Maltings files "Does not have a sixth form"; the
    // two the wider radius serves both file "Has a
    // sixth form".
    expect(
      category("exeter1", "schools-secondary").places.map((p) => [p.name, p.sixthForm]),
    ).toEqual([
      ["Rokeby School", false],
      ["Royal Docks Academy", false],
      ["Cumberland Community School", false],
    ]);
    expect(
      category("birkdale1", "schools-secondary").places.map((p) => [p.name, p.sixthForm]),
    ).toEqual([
      ["Lift Maltings", false],
      ["Lift New Rickstones", true],
      ["Plume School", true],
    ]);
    // The marker's null value has no witness among the
    // fixture's served secondaries (every one files Has
    // or Does-not); it is pinned in tests/sixth-forms
    // .test.ts and in the contracts pin. Here the key's
    // presence is asserted on every served secondary at
    // every golden home.
    for (const tag of Object.keys(HOMES)) {
      const n = get(tag).nearby;
      if (n.kind !== "distances") continue;
      const secondary = n.categories.find((c) => c.category === "schools-secondary");
      for (const place of secondary?.places ?? []) expect(place).toHaveProperty("sixthForm");
    }

    // Birkdale: nothing within on the fixture filing.
    // The beyond pool starts beyond the five-mile list
    // radius (BUG-110), so the flagged secondaries the
    // radius serves (Lift New Rickstones, 3.212 miles;
    // Plume School, 4.488) can no longer be named here.
    // On the fixture cut the nearest ruling-4 witness
    // beyond five miles is Ilford County High School at
    // 25.896 miles — and no beyond name is served: the
    // distance sanity bound (NEAREST_SANITY_MILES = 25,
    // BUG-106, unit-pinned in tests/bug106-stack.test
    // .ts) caps every essential category's beyond name,
    // because a "nearest" further away than that is an
    // artefact of a thin filing, not a fact a family can
    // use. The bound is radius-independent — it governed
    // the beyond name identically under the two-mile
    // radius — and BUG-110 left the fallback otherwise
    // unchanged, so the served answer is the category's
    // honest absence line with no beyond name. (The cut
    // files no Essex sixth-form evidence nearer beyond
    // the radius; the national picture differs and is
    // not what this suite pins.)
    const birkdaleCat = category("birkdale1", "sixth-forms");
    expect(birkdaleCat.state).toBe("none-within");
    expect(birkdaleCat.countWithin).toBe(0);
    expect(birkdaleCat.beyondNearest).toBeNull();
    expect(birkdaleCat.line).toBe(
      "no sixth forms and colleges within 5 miles of the postcode point",
    );

    // Exeter: the beyond path on the fixture filing
    // names Bexley Grammar School, a flagged secondary —
    // the national within three are not in the fixture
    // cut (see the note above).
    const exeterCat = category("exeter1", "sixth-forms");
    expect(exeterCat.state).toBe("none-within");
    expect(exeterCat.beyondNearest?.name).toBe("Bexley Grammar School");
    expect(Math.abs((exeterCat.beyondNearest?.miles ?? 0) - 5.484)).toBeLessThan(0.005);

    // City Island: a second ruling-4 witness through the
    // real source. St Bonaventure's RC School (2.088
    // miles) stood as the beyond name under the 2-mile
    // radius; inside the five-mile radius now (BUG-110),
    // the beyond name is the nearest witness past five
    // miles — Bexley Grammar School, 5.785 miles.
    const cityCat = category("cityIsland2", "sixth-forms");
    expect(cityCat.state).toBe("none-within");
    expect(cityCat.beyondNearest?.name).toBe("Bexley Grammar School");
    expect(Math.abs((cityCat.beyondNearest?.miles ?? 0) - 5.785)).toBeLessThan(0.005);
  });

  it("school destinations (M6.34, D51/D65): both stages served on the core three through the real source; 16-plus rows filed but never served", async () => {
    // The destinations filing is the runner's fixture pass
    // over the cut-down real release files (the loader's
    // own goldens, tests/load-school-destinations.test
    // .ts); the shares below are the release's filed
    // values for the 2023/24 cohort, read off the files at
    // the step's first checks.
    const category = (tag: string, key: string) => {
      const n = get(tag).nearby;
      if (n.kind !== "distances") throw new Error("expected distances");
      const found = n.categories.find((c) => c.category === key);
      if (!found) throw new Error(`category ${key} missing at ${tag}`);
      return found;
    };
    // The helper returns the place's destinations block
    // itself — the stages live at place.destinations.ks4 /
    // .ks5, never on the place — joined with the URN the
    // join stood on, so the assertions below read the
    // served shape exactly as the brain composes it.
    const served = (tag: string, name: string): { ks4: unknown; ks5: unknown; urn?: string } => {
      const secondary = category(tag, "schools-secondary");
      const place = secondary.places.find((p) => p.name === name);
      if (!place?.destinations) throw new Error(`no destinations for ${name} at ${tag}`);
      return { urn: place.urn, ks4: place.destinations.ks4, ks5: place.destinations.ks5 };
    };
    const shares = (stage: unknown) => {
      const s = stage as {
        state: string;
        cohortCount?: number;
        overall?: { value: number | null };
        education?: { value: number | null };
        higherEducation?: { value: number | null } | null;
        apprenticeships?: { value: number | null };
        employment?: { value: number | null };
      };
      return [
        s.state,
        s.cohortCount,
        s.overall?.value,
        s.education?.value,
        s.higherEducation?.value ?? null,
        s.apprenticeships?.value,
        s.employment?.value,
      ];
    };

    // Birkdale: the one secondary's KS4 block, exact; no
    // KS5 block (the marker is false).
    const maltings = served("birkdale1", "Lift Maltings");
    expect(maltings.urn).toBe("135653");
    expect(shares(maltings.ks4)).toEqual(["served", 171, 84.8, 72.5, null, 5.3, 7.0]);
    expect(maltings.ks5).toBeNull();

    // Exeter: all three secondaries' KS4 blocks, exact;
    // no KS5 blocks (all three markers false).
    expect(shares(served("exeter1", "Rokeby School").ks4)).toEqual([
      "served",
      146,
      90.4,
      90.4,
      null,
      0,
      0,
    ]);
    expect(shares(served("exeter1", "Royal Docks Academy").ks4)).toEqual([
      "served",
      168,
      82.1,
      81.5,
      null,
      0.6,
      0,
    ]);
    expect(shares(served("exeter1", "Cumberland Community School").ks4)).toEqual([
      "served",
      297,
      88.6,
      88.2,
      null,
      0,
      0.3,
    ]);
    for (const name of ["Rokeby School", "Royal Docks Academy", "Cumberland Community School"])
      expect(served("exeter1", name).ks5).toBeNull();

    // Minerva: both stages on all three sixth-form
    // secondaries, exact — including the KS5 HE shares.
    expect(shares(served("minerva1", "Glyn School").ks4)).toEqual([
      "served",
      251,
      96.4,
      88.0,
      null,
      7.2,
      1.2,
    ]);
    expect(shares(served("minerva1", "Glyn School").ks5)).toEqual([
      "served",
      253,
      87.4,
      63.2,
      61.7,
      4.0,
      20.2,
    ]);
    expect(shares(served("minerva1", "Blenheim High School").ks4)).toEqual([
      "served",
      205,
      95.6,
      93.7,
      null,
      1.5,
      0.5,
    ]);
    expect(shares(served("minerva1", "Blenheim High School").ks5)).toEqual([
      "served",
      93,
      81.7,
      57.0,
      53.8,
      2.2,
      22.6,
    ]);
    expect(shares(served("minerva1", "Nonsuch High School for Girls").ks4)).toEqual([
      "served",
      209,
      97.1,
      95.2,
      null,
      0.0,
      1.9,
    ]);
    expect(shares(served("minerva1", "Nonsuch High School for Girls").ks5)).toEqual([
      "served",
      230,
      92.2,
      83.5,
      82.6,
      2.2,
      6.5,
    ]);

    // Every served secondary place at every golden home
    // carries the destinations key (the M6.34 contract).
    for (const tag of Object.keys(HOMES)) {
      const n = get(tag).nearby;
      if (n.kind !== "distances") continue;
      const secondary = n.categories.find((c) => c.category === "schools-secondary");
      for (const place of secondary?.places ?? []) expect(place).toHaveProperty("destinations");
    }

    // Minerva's sixth-forms place is NESCOT: its KS5 row
    // is in the filing (cohort 953, 70.4% overall — the
    // loader suite's golden), but ruling 5 keeps 16-plus
    // providers out of serving: the place carries
    // neither a destinations block nor a URN.
    const sixthForms = category("minerva1", "sixth-forms");
    const nescot = sixthForms.places.find((p) => p.name.includes("Surrey College"));
    if (!nescot) throw new Error("expected NESCOT among Minerva's sixth-forms places");
    expect(nescot).not.toHaveProperty("destinations");
    expect(nescot).not.toHaveProperty("urn");

    // The suppressed and no-row SERVING states have no
    // witness in this corpus — named at the D53 closure
    // pass, not silently absent: the only suppressed
    // rows the fixture filing carries belong to schools
    // no golden home serves (URN 105602 at KS4, URN
    // 106004 at KS5), and Plashet School (URN 152267),
    // the schools fixture's genuine no-row secondary,
    // stands outside every golden home's served three.
    // Both states are pinned verbatim in
    // tests/school-destinations.test.ts, and their
    // filing side in tests/load-school-destinations
    // .test.ts (Plashet files no row; the two witnesses
    // file suppressed with cohort 1). See the matrix's
    // D53 entry.
  });

  it("live flood warnings + school deadlines (M6.22, D42): composition over the real flood source; the deadline line at the regional witnesses", async () => {
    // The two EA alerts captured live at the step's first
    // contact, replayed through the fake warning source
    // against Birkdale's real filed flood layers: the
    // composition is serve-time only — the stored replay
    // bundle above carries liveWarnings null.
    expect(get("birkdale1").flood.kind).toBe("flood");
    const stored = get("birkdale1").flood;
    if (stored.kind === "flood" && stored.flood.state === "served")
      expect(stored.flood.liveWarnings).toBeNull();

    const warnings = new FakeFloodWarningSource();
    warnings.items = [LEADON_ITEM, BURE_ITEM];
    const flood = await buildFloodBundle(get("birkdale1").resolution, createFloodSource(pool), {
      warningSource: warnings,
      now: WARNING_NOW,
    });
    if (flood.kind !== "flood" || flood.flood.state !== "served")
      throw new Error("expected a served flood bundle");
    expect(flood.flood.liveWarnings?.state).toBe("warnings");
    expect(flood.flood.liveWarnings?.warnings.map((w) => w.line)).toEqual([
      "Flood alert — The tidal Rivers Bure, Ant and Thurne",
      "Flood alert — River Leadon catchment",
    ]);
    expect(flood.flood.liveWarnings?.warnings[1]?.message).toBe(LEADON_ITEM.message);
    expect(flood.flood.liveWarnings?.checkedAt).toBe("06:54 on 16 November 2026");

    // The derived short carries the headline form — and
    // nowhere the EA's message text.
    const short = buildShortBundle({
      nearby: get("birkdale1").nearby,
      soldPrices: get("birkdale1").sold,
      crime: get("birkdale1").crime,
      flood,
      area: get("birkdale1").area,
    });
    if (short.kind !== "short-bundle") throw new Error("expected a short bundle");
    expect(short.sections.flood.state).toBe("served");
    if (short.sections.flood.state === "served") {
      expect(short.sections.flood.liveWarnings?.warnings).toHaveLength(2);
      expect(short.sections.flood.liveWarnings?.warnings[0]?.line).toBe(
        "Flood alert — The tidal Rivers Bure, Ant and Thurne",
      );
    }
    expect(JSON.stringify(short)).not.toContain("impassable");

    // School deadlines at the regional witnesses, from the
    // stored nearby bundles: England's statutory line,
    // Wales's council line, nothing for Scotland.
    const birkdaleNearby = get("birkdale1").nearby;
    if (birkdaleNearby.kind !== "distances") throw new Error("expected distances");
    expect(birkdaleNearby.schoolDeadlines).toEqual({
      state: "england",
      line: SCHOOL_DEADLINES_ENGLAND_LINE,
    });
    const cardiffNearby = get("cardiff2").nearby;
    if (cardiffNearby.kind !== "distances") throw new Error("expected distances");
    expect(cardiffNearby.schoolDeadlines).toEqual({
      state: "wales",
      line: SCHOOL_DEADLINES_WALES_LINE,
    });
    const edinburghNearby = get("edinburgh2").nearby;
    if (edinburghNearby.kind !== "distances") throw new Error("expected distances");
    expect(edinburghNearby.schoolDeadlines).toBeNull();
    // The 60s budget (not the 5s default): since M8.3 a
    // fresh flood composition pays the two map-dissolve
    // queries, and this test composes several homes end
    // to end — CI #266 timed out at 5011ms. Production
    // pays the cost once per cached bundle.
  }, 60_000);

  it("maternity units (M6.24): the category serves through the real source — within at Exeter and Minerva, the beyond-nearest golden at Birkdale", () => {
    const category = (tag: string, key: string) => {
      const n = get(tag).nearby;
      if (n.kind !== "distances") throw new Error(`${tag}: expected distances`);
      const found = n.categories.find((c) => c.category === key);
      if (!found) throw new Error(`${tag}: no ${key} answer`);
      return found;
    };
    // Added at the D53 closure pass: the CQC replay cell
    // below reads maternity places for their ratings, but
    // the category's own states — above all Birkdale's
    // beyond-nearest golden, the honest answer for a
    // home with no unit inside the radius — had no
    // real-source proof. The goldens are the matrix's
    // M6.24 entry, computed from the filed fixture data;
    // premise-checked through the real source at the
    // closure pass.
    const birkdale = category("birkdale1", "maternity");
    expect(birkdale.state).toBe("none-within");
    expect(birkdale.countWithin).toBe(0);
    expect(birkdale.places).toEqual([]);
    expect(birkdale.beyondNearest).toEqual({
      name: "Broomfield Hospital",
      miles: 5.89,
      latitude: 51.774662,
      longitude: 0.466021,
    });
    expect(birkdale.line).toBe(
      "none within 2 miles — nearest is Broomfield Hospital, 5.89 miles away",
    );
    // The within arm at the other two universal homes:
    // the one unit inside the radius, at its filed
    // distance.
    const exeter = category("exeter1", "maternity");
    expect(exeter.state).toBe("within");
    expect(exeter.countWithin).toBe(1);
    expect(exeter.places.map((p) => [p.name, p.miles])).toEqual([
      ["Newham University Hospital", 0.782],
    ]);
    const minerva = category("minerva1", "maternity");
    expect(minerva.state).toBe("within");
    expect(minerva.countWithin).toBe(1);
    expect(minerva.places.map((p) => [p.name, p.miles])).toEqual([
      ["Epsom General Hospital", 1.732],
    ]);
  });

  it("CQC ratings (M6.25): the filed ratings serve through the real source, on the loader's own join", () => {
    // The ratings were filed at M4.7 and served by no brain
    // until this step. Through the real database source the
    // join is cqc_ratings.health_point_id — the link the
    // loader itself filed — and the values are the filed
    // ones, exactly.
    const placesOf = (tag: string, category: string) => {
      const nearby = get(tag).nearby;
      if (nearby.kind !== "distances") throw new Error(`expected distances for ${tag}`);
      const answer = nearby.categories.find((c) => c.category === category);
      if (!answer) throw new Error(`no ${category} answer for ${tag}`);
      return answer.places;
    };
    // Exeter: Newham's Requires improvement on both its
    // rows (the maternity row carries the OVERALL rating),
    // and Custom House's Good at the head of the GP list.
    expect(placesOf("exeter1", "ae")[0]).toMatchObject({
      name: "Newham University Hospital",
      cqcRating: { rating: "Requires improvement", date: "2026-07-17" },
    });
    expect(placesOf("exeter1", "maternity")[0]).toMatchObject({
      name: "Newham University Hospital",
      cqcRating: { rating: "Requires improvement", date: "2026-07-17" },
    });
    expect(placesOf("exeter1", "gp")[0]).toMatchObject({
      name: "CUSTOM HOUSE SURGERY",
      cqcRating: { rating: "Good", date: "2026-06-01" },
    });
    // Minerva: Epsom General's Good on both its rows.
    expect(placesOf("minerva1", "ae")[0]).toMatchObject({
      name: "Epsom General Hospital",
      cqcRating: { rating: "Good", date: "2026-06-11" },
    });
    expect(placesOf("minerva1", "maternity")[0]).toMatchObject({
      name: "Epsom General Hospital",
      cqcRating: { rating: "Good", date: "2026-06-11" },
    });
    // Birkdale: the branch serves the null absence; Douglas
    // Grove carries its filed Good.
    expect(placesOf("birkdale1", "gp").map((p) => [p.name, p.cqcRating])).toEqual([
      ["SYDNEY HOUSE SURGERY", null],
      ["DOUGLAS GROVE SURGERY", { rating: "Good", date: "2026-07-17" }],
    ]);
    // Dentists carry no rating field at all.
    for (const place of placesOf("exeter1", "dentist")) expect("cqcRating" in place).toBe(false);
    // Wales is never rated (CQC covers England only; the
    // loader files no rating row for a Welsh point): every
    // Cardiff health place serves the null absence.
    for (const category of ["gp", "ae", "maternity"])
      for (const place of placesOf("cardiff2", category)) expect(place.cqcRating).toBeNull();
  });

  it("EPC construction (M6.26, D48): the filed descriptions serve through the real source, verbatim", () => {
    // The replay's EPC artefacts are filed by the REAL
    // loader over the fixture corpus, so the construction
    // blocks below prove the whole path: the register's
    // descriptions (ratings dropped at filing) through the
    // widened minimisation into the brain's served shape.
    const area = (tag: string) => {
      const a = get(tag).area;
      if (a.kind !== "area-bundle") throw new Error(`${tag}: expected an area bundle`);
      return a.sections;
    };
    const linesOf = (tag: string, certificateNumber: string) => {
      const epc = area(tag).epc;
      if (epc.state !== "served") throw new Error(`expected a served EPC section for ${tag}`);
      const cert = epc.certificates.find((c) => c.certificateNumber === certificateNumber);
      if (!cert) throw new Error(`no certificate ${certificateNumber} for ${tag}`);
      return cert.construction;
    };
    // Birkdale: the new-build SAP set, U-values as text.
    const birkdale = linesOf("birkdale1", "2490-1633-0432-1002-3023");
    expect(birkdale?.uValueLine).toBe(
      "the U-value in a description is the register's measure of how fast heat passes through that part of the home, in watts per square metre for each degree of temperature difference — lower lets less heat escape.",
    );
    expect(birkdale?.groups.map((g) => g.line)).toEqual([
      "Walls: Average thermal transmittance 0.27 W/m²K",
      "Roofs: Average thermal transmittance 0.11 W/m²K",
      "Floors: Average thermal transmittance 0.15 W/m²K",
      "Windows: High performance glazing",
      "Lighting: Low energy lighting in all fixed outlets",
      "Main heating: Boiler and radiators, mains gas",
      "Hot water: From main system, waste water heat recovery",
    ]);
    // Exeter: the disagreement stands whole — the 2023
    // RdSAP certificate records no windows group (its own
    // named absence, not the 2013 certificate's glazing),
    // and carries no transmittance text.
    const exeter2023 = linesOf("exeter1", "2041-1785-8070-7006-5925");
    expect(exeter2023?.uValueLine).toBeNull();
    expect(exeter2023?.groups.find((g) => g.key === "windows")?.line).toBe(
      "Windows: not recorded on this certificate",
    );
    expect(exeter2023?.groups.find((g) => g.key === "walls")?.line).toBe(
      "Walls: Cavity wall, as built, insulated (assumed)",
    );
    const exeter2013 = linesOf("exeter1", "9248-9925-7330-1627-9930");
    expect(exeter2013?.groups.find((g) => g.key === "windows")?.line).toBe(
      "Windows: Fully double glazed",
    );
    // Minerva Flat 4: the other-premises pair, and the
    // register's own ampersand unescaped.
    const minerva = linesOf("minerva1", "8401-7039-6529-6723-9906");
    expect(minerva?.groups.find((g) => g.key === "roofs")?.line).toBe(
      "Roofs: (other premises above)",
    );
    expect(minerva?.groups.find((g) => g.key === "floors")?.line).toBe(
      "Floors: (other premises below)",
    );
    expect(minerva?.groups.find((g) => g.key === "mainHeating")?.line).toBe(
      "Main heating: Boiler& underfloor, mains gas",
    );
    // No element rating rides anywhere in the served
    // certificates: the blocks' leaves are strings or null.
    for (const tag of ["birkdale1", "exeter1", "minerva1"]) {
      const epc = area(tag).epc;
      if (epc.state !== "served") continue;
      expect(JSON.stringify(epc.certificates)).not.toContain("efficiency_rating");
      for (const cert of epc.certificates) {
        const walk = (value: unknown): string[] => {
          if (Array.isArray(value)) return value.flatMap(walk);
          if (value !== null && typeof value === "object")
            return Object.values(value).flatMap(walk);
          return [value === null ? "null" : typeof value];
        };
        for (const type of walk(cert.construction)) expect(["string", "null"]).toContain(type);
      }
    }
  });

  it("recorded defences (M6.27, D49/D54): the AIMS register serves through the real source, capped, as filed", () => {
    // The defences fixture is filed by the REAL loader in
    // the runner's fixture pass (the CI database job), so
    // the blocks below prove the whole path: the published
    // GeoPackage subset through the vocabulary contract and
    // the staged swap into the brain's PostGIS geography
    // read — the serving basis, which is what these figures
    // lock (the loader's BNG-plane pins are its own filing
    // checks, in the loader suite).
    const defencesOf = (tag: string) => {
      const f = get(tag).flood;
      if (f.kind !== "flood" || f.flood.state !== "served")
        throw new Error(`${tag}: expected a served flood bundle`);
      return f.flood.defences;
    };
    // Birkdale: 26 within two miles, the River Ter natural
    // high ground nearest, in full.
    const birkdale = defencesOf("birkdale1");
    expect(birkdale.state).toBe("served");
    expect(birkdale.totalWithin).toBe(26);
    expect(birkdale.defences).toHaveLength(25);
    expect(birkdale.overflowLine).toBe("and 1 more recorded defences within two miles");
    expect(birkdale.caveat).toContain("Flood defences reduce the chance of flooding");
    expect(birkdale.bridgeLine).toContain("already counts the flood defences in place");
    const bFirst = birkdale.defences[0];
    expect(bFirst.assetId).toBe("73925");
    expect(bFirst.type).toBe("Natural High Ground");
    expect(bFirst.watercourse).toBe("River Ter");
    expect(bFirst.maintainer).toBe("Environment Agency");
    expect(bFirst.condition).toBe("Fair");
    expect(bFirst.designSop).toBe(10);
    expect(bFirst.miles).toBeCloseTo(0.851, 2);
    // Exeter: 443 within two miles — the cap serves 25 and
    // the overflow line carries the true total. The nearest
    // is the tied Lea wall pair (assets 14473 and 8140 at
    // the same distance; the asset_id tie-break orders
    // them deterministically).
    const exeter = defencesOf("exeter1");
    expect(exeter.state).toBe("served");
    expect(exeter.totalWithin).toBe(443);
    expect(exeter.defences).toHaveLength(25);
    expect(exeter.overflowLine).toBe("and 418 more recorded defences within two miles");
    const eFirst = exeter.defences[0];
    expect(["14473", "8140"]).toContain(eFirst.assetId);
    expect(eFirst.type).toBe("Wall");
    expect(eFirst.protectionType).toBe("Tidal");
    expect(eFirst.watercourse).toBe("River Lea or Lee");
    expect(eFirst.maintainer).toBe("Private individual, Company or Charity");
    expect(eFirst.condition).toBeNull();
    expect(eFirst.designSop).toBe(1000);
    expect(eFirst.miles).toBeCloseTo(0.579, 2);
    // Minerva: 52 within two miles, the Hogsmill natural
    // high ground nearest.
    const minerva = defencesOf("minerva1");
    expect(minerva.state).toBe("served");
    expect(minerva.totalWithin).toBe(52);
    expect(minerva.defences).toHaveLength(25);
    expect(minerva.overflowLine).toBe("and 27 more recorded defences within two miles");
    const mFirst = minerva.defences[0];
    expect(mFirst.assetId).toBe("80375");
    expect(mFirst.type).toBe("Natural High Ground");
    expect(mFirst.watercourse).toBe("Hogsmill River");
    expect(mFirst.maintainer).toBe("Private individual, Company or Charity");
    expect(mFirst.designSop).toBe(25);
    expect(mFirst.miles).toBeCloseTo(0.429, 2);
  });

  it("climate outlook (M6.28, D49/D55): the scenario bands serve through the real source, per source, in their own epochs", () => {
    // The climate fixtures are filed by the REAL loaders in
    // the runner's fixture pass (the CI database job), so
    // the blocks below prove the whole path: the published
    // Climate Change 1 subsets through the vocabulary
    // contracts and the staged swaps into flood_climate_layers,
    // read back through the brain's covering query — the
    // serving basis, which is what these states lock (the
    // prep's golden table, Section 5.4).
    const climateOf = (tag: string) => {
      const f = get(tag).flood;
      if (f.kind !== "flood" || f.flood.state !== "served")
        throw new Error(`${tag}: expected a served flood bundle`);
      return f.flood.climate;
    };
    // Birkdale: no band published at the point under either
    // scenario source.
    const birkdale = climateOf("birkdale1");
    expect(birkdale.sources.map((s) => s.pointState)).toEqual([
      "no-band-published",
      "no-band-published",
    ]);
    expect(birkdale.sources.map((s) => s.band)).toEqual([null, null]);
    // Exeter: rivers & sea inside Low; surface water no band.
    const exeter = climateOf("exeter1");
    expect(exeter.sources.map((s) => s.pointState)).toEqual(["inside", "no-band-published"]);
    expect(exeter.sources[0].band?.label).toBe("Low");
    expect(exeter.sources[0].band?.displayLabel).toBe("Low");
    // Minerva: rivers & sea no band; surface water inside Low.
    const minerva = climateOf("minerva1");
    expect(minerva.sources.map((s) => s.pointState)).toEqual(["no-band-published", "inside"]);
    expect(minerva.sources[1].band?.label).toBe("Low");
    // Every block names its scenario basis per source, in
    // its own epochs, and carries each source's own edition.
    for (const block of [birkdale, exeter, minerva]) {
      expect(block.heading).toBe("Climate outlook");
      expect(block.sources[0].scenarioLine).toContain("UKCP18");
      expect(block.sources[0].scenarioLine).toContain("2040–2069");
      expect(block.sources[0].scenarioLine).toContain("2036–2065");
      expect(block.sources[1].scenarioLine).toContain("UKCP18");
      expect(block.sources[1].scenarioLine).toContain("2040–2060");
      expect(block.sources[0].sourceDate).toBe("2026-11-03");
      expect(block.sources[1].sourceDate).toBe("2026-11-10");
      for (const s of block.sources) {
        expect(s.scenarioLine).not.toContain("between 2036 and 2069");
        expect(s.line).not.toContain("Very low");
      }
    }
  });

  it("short bundle: the universal headlines carry the locked figures", () => {
    const birkdale = get("birkdale1").short;
    expect(Object.keys(birkdale.sections).sort()).toHaveLength(13);
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

  it("report view (M8.1): the golden homes' reports carry the locked figures, section by section", () => {
    // The on-screen report built from the REAL bundles —
    // the Birkdale and Exeter reports on screen match the
    // approved samples section by section, with figures
    // identical to the bundles (the step's own check).
    const viewOf = (tag: string) => {
      const b = get(tag);
      return buildReportView({
        resolution: b.resolution,
        nearby: b.nearby,
        flood: b.flood,
        area: b.area,
        sold: b.sold,
        crime: b.crime,
        now: NOW,
      });
    };
    const birkdale = viewOf("birkdale1");
    // Ten sections since the print-check regrouping
    // (item 14): the Census grid below stands in the new
    // Section 6 at the same index it always had.
    expect(birkdale.sections).toHaveLength(10);
    const birkdaleText = JSON.stringify(birkdale);
    expect(birkdaleText).toContain("£588,995");
    expect(birkdaleText).toContain("330 incidents");
    expect(birkdaleText).toContain(
      " recorded within 1 mile of this home, October 2025 to September 2026 (Police.uk).",
    );
    expect(birkdaleText).toContain("51.7 recorded crimes for every 1,000 residents here");
    expect(birkdaleText.toLowerCase()).not.toContain("childminder");
    // The snapshot is plain data end to end.
    expect(JSON.parse(JSON.stringify(birkdale))).toEqual(birkdale);
    // Section 5's map pins real named places from the
    // filed corpus, and never a school.
    const mapBlock = birkdale.sections[4].blocks.find((b) => b.type === "map");
    if (!mapBlock || mapBlock.type !== "map") throw new Error("expected a map block");
    expect(mapBlock.map.pins.length).toBeGreaterThan(0);
    expect(mapBlock.map.pins.map((p) => p.name)).not.toContain("St Andrew's Junior School");
    // The M8.2 charts on the real bundles: Birkdale's dot
    // plot carries all 29 counted sales with the home's
    // dot on the median line, and both crime charts
    // reconcile with the section's 330 total.
    const dotBlock = birkdale.sections[1].blocks.find((b) => b.type === "dotPlot");
    if (!dotBlock || dotBlock.type !== "dotPlot") throw new Error("expected a dot plot");
    expect(dotBlock.plot.dots).toHaveLength(29);
    expect(dotBlock.plot.home?.x).toBe(dotBlock.plot.median.x);
    const catBlock = birkdale.sections[3].blocks.find((b) => b.type === "bars");
    if (!catBlock || catBlock.type !== "bars") throw new Error("expected the category chart");
    // All 14 published categories stand (zero-filled); a
    // served no-category bucket would add a fifteenth row.
    expect(catBlock.rows.length).toBeGreaterThanOrEqual(14);
    expect(catBlock.rows[0]).toMatchObject({
      label: "Violence and sexual offences",
      value: "133",
      strong: true,
    });
    // Chart values are printed counts ("4,000"), so the
    // reconciliation reads them as a reader copies them —
    // separators stripped. (CI #263: Number("4,000") is NaN;
    // Birkdale's sub-1,000 figures had masked it.)
    const printedCount = (value: string) => Number(value.replace(/,/g, ""));
    expect(catBlock.rows.reduce((sum, row) => sum + printedCount(row.value), 0)).toBe(330);
    const monthBlock = birkdale.sections[3].blocks.find((b) => b.type === "monthChart");
    if (!monthBlock || monthBlock.type !== "monthChart")
      throw new Error("expected the month chart");
    expect(monthBlock.chart.bars).toHaveLength(12);
    expect(monthBlock.chart.bars.reduce((sum, bar) => sum + printedCount(bar.value), 0)).toBe(330);
    // The Census grid stands on the real tables: the Age
    // tile opens it, captioned with the calculated basis.
    const gridBlock = birkdale.sections[5].blocks.find((b) => b.type === "chartGrid");
    if (!gridBlock || gridBlock.type !== "chartGrid") throw new Error("expected the census grid");
    const ageCard = gridBlock.cards[0];
    if (!ageCard || ageCard.type !== "statTile") throw new Error("expected the Age tile");
    expect(ageCard.value).toBe("46.5 years");
    expect(ageCard.caption).toContain("calculated from the Census's single years of age");
    expect(JSON.stringify(gridBlock)).not.toContain("Age by five-year age bands");

    const exeter = viewOf("exeter1");
    const exeterText = JSON.stringify(exeter);
    expect(exeterText).toContain("£310,000");
    expect(exeterText).toContain("10,722 incidents");
    expect(exeterText).toContain(
      " recorded within 1 mile of this home, October 2025 to September 2026 (Police.uk).",
    );
    expect(exeterText).toContain("122.5 recorded crimes for every 1,000 residents here");
    // The plan's own dot-plot check on the real bundle:
    // 9 dots, and on the one linear scale the £270,000
    // home dot stands left of the £310,000 median line.
    const exeterDot = exeter.sections[1].blocks.find((b) => b.type === "dotPlot");
    if (!exeterDot || exeterDot.type !== "dotPlot") throw new Error("expected a dot plot");
    expect(exeterDot.plot.dots).toHaveLength(9);
    expect(exeterDot.plot.medianLine).toBe(
      "Median value £310,000 — the middle recorded sale price in this postcode, from the 9 counted sales. Not a valuation of this home.",
    );
    expect(exeterDot.plot.home?.label).toBe("This home — £270,000");
    expect(exeterDot.plot.home?.x).toBeLessThan(exeterDot.plot.median.x);
    // Exeter's crime charts reconcile with its 10,722
    // total, on the adapted axis the high counts need.
    const exeterCat = exeter.sections[3].blocks.find((b) => b.type === "bars");
    if (!exeterCat || exeterCat.type !== "bars") throw new Error("expected the category chart");
    expect(exeterCat.rows.reduce((sum, row) => sum + printedCount(row.value), 0)).toBe(10722);
    const exeterMonths = exeter.sections[3].blocks.find((b) => b.type === "monthChart");
    if (!exeterMonths || exeterMonths.type !== "monthChart")
      throw new Error("expected the month chart");
    expect(exeterMonths.chart.bars.reduce((sum, bar) => sum + printedCount(bar.value), 0)).toBe(
      10722,
    );

    const minerva = viewOf("minerva1");
    const minervaText = JSON.stringify(minerva);
    expect(minervaText).toContain("£420,000");
    expect(minervaText).toContain("1,956 incidents");
    expect(minervaText).toContain(
      " recorded within 1 mile of this home, October 2025 to September 2026 (Police.uk).",
    );
    expect(minervaText).toContain("49.0 recorded crimes for every 1,000 residents here");

    // A Northern Ireland postcode report renders the
    // bundles' not-covered states in the affected
    // sections — never blanks, never England data.
    const belfastBrains = get("belfast2");
    const belfast = viewOf("belfast2");
    expect(belfast.sections).toHaveLength(10);
    if (belfastBrains.crime.kind === "not-covered") {
      // The report prints the brain's reason as a standalone
      // line, so it stands sentence-cased (print-check item
      // 15) — the assertion follows the composed form, not
      // the brain's raw fragment.
      const reason = belfastBrains.crime.crime.reason;
      expect(JSON.stringify(belfast.sections[3])).toContain(
        reason.charAt(0).toUpperCase() + reason.slice(1),
      );
    }
    if (belfastBrains.flood.kind === "not-covered") {
      // Same sentence-casing as the crime reason above.
      const floodReason = belfastBrains.flood.flood.reason;
      expect(JSON.stringify(belfast.sections[7])).toContain(
        floodReason.charAt(0).toUpperCase() + floodReason.slice(1),
      );
    }
  });

  it("report view (M8.10): Section 7's additions carry the served depth on the real bundles", () => {
    // The M8.10 blocks on the REAL bundles: building
    // safety in its locked forms, the improvements
    // introduction, brownfield's per-site rows, the
    // static mortgage & stamp duty figures on each
    // home's own last recorded sale, and the registered
    // parks & gardens layer in its not-filed state (the
    // wiring lands ahead of the national filing).
    const viewOf = (tag: string) => {
      const b = get(tag);
      return buildReportView({
        resolution: b.resolution,
        nearby: b.nearby,
        flood: b.flood,
        area: b.area,
        sold: b.sold,
        crime: b.crime,
        now: NOW,
      });
    };
    const s7 = (tag: string) => JSON.stringify(viewOf(tag).sections[6]);

    for (const tag of ["birkdale1", "exeter1", "minerva1"]) {
      const text = s7(tag);
      // The tribunal line in its locked as-at wording —
      // the fixture corpus files no decision naming any
      // of the three postcodes. The as-at date is the
      // filing pass's own date (the table's retrieved_at),
      // so the expectation follows the bundle's served
      // line, sentence-cased with its full stop as the
      // report composes it — never a hardcoded calendar
      // date (CI files the corpus on the run date).
      const area = get(tag).area;
      const tribunalLine =
        area.kind === "area-bundle" ? area.sections.buildingSafety.tribunal.line : null;
      if (!tribunalLine) throw new Error(`${tag}: no tribunal line served on the real bundle`);
      expect(tribunalLine).toMatch(
        /^no published building-safety orders naming this postcode(, as at .+)?$/,
      );
      expect(text).toContain(tribunalLine.charAt(0).toUpperCase() + tribunalLine.slice(1) + ".");
      // Parks & gardens: wired, unfiled, named as such.
      expect(text).toContain(
        "The registered park and garden data is not filed yet, so no registered park and garden answer can be given yet.",
      );
      // The prohibitions hold on the real bundles too.
      expect(text.toLowerCase()).not.toContain("no tribunal decisions found");
      expect(text.toLowerCase()).not.toContain("total monthly");
    }

    // The two houses take the register scope line;
    // Minerva's flat takes the hand-off with the
    // official search link.
    for (const tag of ["birkdale1", "exeter1"]) {
      expect(s7(tag)).toContain(
        "The Building Safety Regulator's register covers high-rise residential buildings — buildings of 7 or more storeys or 18 metres or more, with 2 or more residential units; a house is outside what the register is for.",
      );
    }
    const minerva = s7("minerva1");
    expect(minerva).toContain("can only be checked on the register's own search service");
    expect(minerva).toContain(
      "https://www.register-high-rise-building.service.gov.uk/public-register/search",
    );

    // Birkdale: the improvements introduction in the
    // register's own words, and brownfield's nearest
    // site as a row with the register's dwelling fact.
    const birkdale = s7("birkdale1");
    expect(birkdale).toContain(
      "The certificate's suggested improvements, in the register's order — the register's modelled steps for this home, not advice.",
    );
    expect(birkdale).toContain(
      "10 recorded brownfield sites within 5 miles of the postcode point.",
    );
    expect(birkdale).toContain("Universal Garage, The Street, Hatfield Peverel");
    expect(birkdale).toContain("The register publishes 9 net dwellings for the site.");

    // The static figures, on each home's own last
    // recorded sale at the D44 assumptions (the
    // calculators' arithmetic, to the penny since
    // BUG-262's no-rounding ruling, 24 Nov 2026):
    // Birkdale £588,995 → £2,455.37 a month and
    // £19,450 duty; Exeter £270,000 → £1,125.56 a
    // month and £3,500 duty.
    expect(birkdale).toContain(
      "Worked on this home's last recorded sale price — £588,995 on 15 June 2023",
    );
    expect(birkdale).toContain("£2,455.37 a month, repayment.");
    expect(birkdale).toContain(
      "Stamp duty on that price would be £19,450 at the standard rates for a buyer moving from their own home.",
    );
    const exeter = s7("exeter1");
    expect(exeter).toContain("£1,125.56 a month, repayment.");
    expect(exeter).toContain(
      "Stamp duty on that price would be £3,500 at the standard rates for a buyer moving from their own home.",
    );
  });

  it("report view (M8.3): the flood-map promise — Birkdale's street unshaded, Exeter's shading matches the data", () => {
    // THE PROMISE TEST, layer 1 (geometry) — the plan
    // step's own check, run against the DRAWN geometry:
    // the report models' projected point arrays are what
    // the pictures actually shade, so the assertions read
    // the models, never the filed tables. (Layer 2 is the
    // independent visual audit after the build; layer 3
    // the visual-guard baselines at M8.7.) The street the
    // Birkdale assertion runs against is the home's own
    // street line AS DRAWN (the model's flagged street,
    // projected from the filed street_lines geometry) —
    // the stronger of the brief's two forms: not merely
    // the home point, the street itself.
    const viewOf = (tag: string) => {
      const b = get(tag);
      return buildReportView({
        resolution: b.resolution,
        nearby: b.nearby,
        flood: b.flood,
        area: b.area,
        sold: b.sold,
        crime: b.crime,
        now: NOW,
      });
    };
    type FloodMap = Extract<
      ReturnType<typeof buildReportView>["sections"][number]["blocks"][number],
      { type: "floodMap" }
    >["map"];
    const floodMapsOf = (view: ReturnType<typeof buildReportView>): FloodMap[] =>
      view.sections[7].blocks
        .filter((b) => b.type === "floodMap")
        .map((b) => (b as { map: FloodMap }).map);
    // Even–odd ray casting over one polygon's rings (outer
    // ring and holes together).
    const pointInPolygon = (x: number, y: number, rings: { x: number; y: number }[][]): boolean => {
      let inside = false;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i];
          const b = ring[j];
          if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
            inside = !inside;
        }
      }
      return inside;
    };
    // BUG-170: the model carries path data only, so the
    // geometry is read back out of the drawn paths — a
    // shade's rings are its M…Z subpaths, with the
    // closing point restored (the thinned path drops
    // the filed repeat; the Z closes the shape). The
    // even–odd reading runs over the shade's rings
    // together, which is exactly the renderer's own
    // fill rule for the path.
    const parsePathPoints = (d: string): { x: number; y: number }[] =>
      [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => ({
        x: Number(match[1]),
        y: Number(match[2]),
      }));
    const parseShadeRings = (d: string): { x: number; y: number }[][] =>
      [...d.matchAll(/M[^Z]*Z/g)].map((match) => {
        const points = parsePathPoints(match[0]);
        if (points.length > 0) points.push(points[0]);
        return points;
      });
    const shadeAt = (map: FloodMap, x: number, y: number): string | null => {
      for (const shade of map.shades)
        if (pointInPolygon(x, y, parseShadeRings(shade.d))) return shade.label;
      return null;
    };
    const segIntersects = (
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      p3: { x: number; y: number },
      p4: { x: number; y: number },
    ): boolean => {
      const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
      if (d === 0) return false;
      const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
      const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    };
    const pointSegDistance = (
      p: { x: number; y: number },
      a: { x: number; y: number },
      b: { x: number; y: number },
    ): number => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t =
        len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    // Does any drawn shading touch the drawn street? A
    // street point inside a shaded polygon, a street
    // segment crossing a ring edge, or a ring vertex
    // within 2px of the street (the drawn line's own
    // half-width, so a boundary merely kissing the
    // street's edge does not fail the promise — the
    // shading must actually reach the street).
    const streetTouchedByShading = (
      map: FloodMap,
      streetPoints: { x: number; y: number }[],
    ): boolean => {
      for (const shade of map.shades) {
        const rings = parseShadeRings(shade.d);
        for (const point of streetPoints) if (pointInPolygon(point.x, point.y, rings)) return true;
        for (const ring of rings)
          for (let i = 0; i < ring.length - 1; i++) {
            for (let s = 0; s < streetPoints.length - 1; s++)
              if (segIntersects(streetPoints[s], streetPoints[s + 1], ring[i], ring[i + 1]))
                return true;
            for (let s = 0; s < streetPoints.length - 1; s++)
              if (pointSegDistance(ring[i], streetPoints[s], streetPoints[s + 1]) < 2) return true;
          }
      }
      return false;
    };

    // --- Birkdale: the street is visibly unshaded, the
    // shaded areas held away from it.
    const birkdale = viewOf("birkdale1");
    const birkdaleMaps = floodMapsOf(birkdale);
    const birkdaleZones = birkdaleMaps.find((m) => m.title.startsWith("Flood zones"));
    if (!birkdaleZones) throw new Error("expected Birkdale's flood-zones picture to be drawn");
    const birkdaleShaded = birkdaleZones.shades.reduce((n, s) => n + s.areas, 0);
    expect(birkdaleShaded).toBeGreaterThanOrEqual(1);
    expect(shadeAt(birkdaleZones, birkdaleZones.homeX, birkdaleZones.homeY)).toBeNull();
    const birkdaleStreet = birkdaleZones.streets.find((s) => s.home);
    if (!birkdaleStreet) throw new Error("expected Birkdale Rise to be drawn as the home street");
    expect(streetTouchedByShading(birkdaleZones, parsePathPoints(birkdaleStreet.d))).toBe(false);
    expect(birkdaleZones.caption).toContain("sits outside them");

    // --- Exeter: the shading picture matches the data.
    const exeterBrains = get("exeter1");
    if (exeterBrains.flood.kind !== "flood" || exeterBrains.flood.flood.state !== "served")
      throw new Error("expected a served Exeter flood bundle");
    const exeterLayers = exeterBrains.flood.flood.layers;
    const exeter = viewOf("exeter1");
    const exeterMaps = floodMapsOf(exeter);
    const exeterZones = exeterMaps.find((m) => m.title.startsWith("Flood zones"));
    if (!exeterZones) throw new Error("expected Exeter's flood-zones picture to be drawn");
    // The home point sits inside a drawn FZ3 polygon —
    // the filed answer for this home.
    expect(shadeAt(exeterZones, exeterZones.homeX, exeterZones.homeY)).toBe("FZ3");
    expect(exeterZones.caption).toContain("falls inside Flood Zone 3");
    // Where the bundle serves the defences bridge (the
    // defended story), the caption carries its point.
    if (exeterBrains.flood.flood.defences.bridgeLine !== null)
      expect(exeterZones.caption).toContain("already counts the flood defences in place");
    // Picture 2's band at the home point matches the
    // filed RoFSW answer for this home.
    const exeterSurface = exeterMaps.find((m) => m.title.startsWith("Flooding from surface water"));
    if (!exeterSurface) throw new Error("expected Exeter's surface-water picture to be drawn");
    const rofswLayer = exeterLayers.find((l) => l.layer === "rofsw");
    const filedBand =
      rofswLayer?.pointState === "inside" ? (rofswLayer.covering?.label ?? null) : null;
    expect(shadeAt(exeterSurface, exeterSurface.homeX, exeterSurface.homeY)).toBe(filedBand);
  });
});
