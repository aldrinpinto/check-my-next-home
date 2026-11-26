import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IMPROVEMENT_NAMES, improvementName } from "../lib/epc-improvements";
import {
  beginFiling,
  checkConstructionGolden,
  checkMeasuresGolden,
  fetchPostcodeAnswer,
  liveCertificates,
} from "../loaders/load-epc.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the EPC loader (plan step M4.5, option A): per-postcode
// lookups against the Get energy performance of buildings data API,
// minimised filing into the postcode's cached answers, and — the
// plan's check — disagreeing certificates must both survive. The
// fixture holds real API responses captured on 12 Nov 2026. The
// live proof against a real database runs in CI.

const loader = readFileSync(join(process.cwd(), "loaders", "load-epc.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests", "fixtures", "epc");
const fixture = JSON.parse(readFileSync(join(fixtureDir, "fixture.json"), "utf8"));

describe("epc loader", () => {
  it("uses the API with the bearer token and the answers merge", () => {
    expect(loader).toContain("https://api.get-energy-performance-data.communities.gov.uk");
    expect(loader).toContain("/api/domestic/search");
    expect(loader).toContain("/api/certificate");
    expect(loader).toContain("EPC_API_TOKEN");
    expect(loader).toContain("answers = answers || $1::jsonb");
    // The assessment type is filed so a predicted (SAP) rating can
    // be labelled predicted (decision D7), and the dwelling type is
    // normalised across the register's two shapes.
    expect(loader).toContain("assessment_type");
    expect(loader).toContain("dwelling.value");
  });

  it("fixture reproduces the golden certificates", () => {
    const areasAt = (pc: string, address: string) => {
      const search = JSON.parse(
        readFileSync(join(fixtureDir, fixture.postcodes[pc].searchFile), "utf8"),
      ) as { data: { certificateNumber: string; addressLine1: string }[] };
      const areas: number[] = [];
      for (const stub of search.data) {
        const raw = JSON.parse(
          readFileSync(join(fixtureDir, "certs", `${stub.certificateNumber}.json`), "utf8"),
        ) as { data?: unknown } & Record<string, unknown>;
        const doc = (raw.data ?? raw) as {
          total_floor_area: number;
          current_energy_efficiency_band: string;
        };
        if (stub.addressLine1 === address) {
          expect(doc.current_energy_efficiency_band).toBe("B");
          areas.push(doc.total_floor_area);
        }
      }
      return areas.sort((a, b) => a - b);
    };
    // 6 Exeter Road: two certificates, 71 and 91 sq m — both survive.
    expect(areasAt("E16 1GN", "6 Exeter Road")).toEqual([71, 91]);
    // 19 Birkdale Rise: one certificate, 141 sq m.
    expect(areasAt("CM3 2JT", "19 Birkdale Rise")).toEqual([141]);
  });

  it("fixture search counts match the captured API totals", () => {
    for (const [pc, entry] of Object.entries<{ searchFile: string }>(fixture.postcodes)) {
      const search = JSON.parse(readFileSync(join(fixtureDir, entry.searchFile), "utf8")) as {
        data: unknown[];
        pagination: { totalRecords: number };
      };
      expect(search.data.length, pc).toBe(search.pagination.totalRecords);
    }
  });

  it("files the register's modelled energy costs, GBP only (M6.14 widening, D33)", () => {
    // The six cost fields, current and potential, are read
    // from the certificate document — and a non-GBP figure
    // is never filed as a number the product could serve.
    for (const field of [
      "heating_cost_current",
      "hot_water_cost_current",
      "lighting_cost_current",
      "heating_cost_potential",
      "hot_water_cost_potential",
      "lighting_cost_potential",
    ])
      expect(loader).toContain(field);
    expect(loader).toContain('cost.currency !== "GBP"');
  });

  it("fixture carries the golden modelled energy costs (M6.14)", () => {
    const totalsAt = (pc: string, address: string, side: "current" | "potential") => {
      const search = JSON.parse(
        readFileSync(join(fixtureDir, fixture.postcodes[pc].searchFile), "utf8"),
      ) as { data: { certificateNumber: string; addressLine1: string }[] };
      const totals: number[] = [];
      for (const stub of search.data) {
        if (stub.addressLine1 !== address) continue;
        const raw = JSON.parse(
          readFileSync(join(fixtureDir, "certs", `${stub.certificateNumber}.json`), "utf8"),
        ) as { data?: unknown } & Record<string, unknown>;
        const doc = (raw.data ?? raw) as Record<
          string,
          { value: number; currency: string } | undefined
        >;
        const parts = [
          doc[`heating_cost_${side}`],
          doc[`hot_water_cost_${side}`],
          doc[`lighting_cost_${side}`],
        ];
        for (const part of parts) expect(part?.currency).toBe("GBP");
        totals.push(parts.reduce((sum, part) => sum + (part?.value ?? 0), 0));
      }
      return totals.sort((a, b) => a - b);
    };
    // 19 Birkdale Rise: £489 current, £455 potential a year.
    expect(totalsAt("CM3 2JT", "19 Birkdale Rise", "current")).toEqual([489]);
    expect(totalsAt("CM3 2JT", "19 Birkdale Rise", "potential")).toEqual([455]);
    // 6 Exeter Road: the disagreement — £351 (2013) and
    // £1,104 (2023) a year, both sides.
    expect(totalsAt("E16 1GN", "6 Exeter Road", "current")).toEqual([351, 1104]);
    expect(totalsAt("E16 1GN", "6 Exeter Road", "potential")).toEqual([351, 1104]);
    // Flat 4, Minerva House: captured from the register for
    // M6.14 — £278 a year on both sides.
    expect(totalsAt("KT17 1FH", "Flat 4 Minerva House", "current")).toEqual([278]);
    expect(totalsAt("KT17 1FH", "Flat 4 Minerva House", "potential")).toEqual([278]);
  });

  it("files the suggested improvements per measure, GBP-guarded (M6.21 widening, D41)", () => {
    expect(loader).toContain("suggested_improvements");
    expect(loader).toContain("suggestedImprovements: improvementsOf(doc)");
    // The saving files only as a GBP figure — the same
    // guard shape as the cost fields; a non-GBP saving
    // files null, never a converted number.
    expect(loader).toContain('step.typical_saving.currency === "GBP"');
    // The indicative cost files as the published string,
    // and both cumulative ratings file per step.
    expect(loader).toContain("indicative_cost");
    expect(loader).toContain("energy_performance_rating");
    expect(loader).toContain("environmental_impact_rating");
    expect(loader).toContain("improvement_details?.improvement_number");
    // The loader files the improvement NUMBER only: the
    // name resolves in the brain from the pinned published
    // list, never in the loader.
    expect(loader).not.toContain("improvementName");
    expect(loader).not.toContain("Solar water heating");
  });

  it("fixture carries the golden measures: Birkdale's two steps exactly, none for Exeter or Minerva (M6.21)", () => {
    const docAt = (pc: string, address: string) => {
      const search = JSON.parse(
        readFileSync(join(fixtureDir, fixture.postcodes[pc].searchFile), "utf8"),
      ) as { data: { certificateNumber: string; addressLine1: string }[] };
      const stub = search.data.find((s) => s.addressLine1 === address);
      const raw = JSON.parse(
        readFileSync(join(fixtureDir, "certs", `${stub!.certificateNumber}.json`), "utf8"),
      ) as { data?: unknown } & Record<string, unknown>;
      return (raw.data ?? raw) as Record<string, unknown>;
    };
    const birkdale = docAt("CM3 2JT", "19 Birkdale Rise") as {
      suggested_improvements: Record<string, unknown>[];
    };
    expect(birkdale.suggested_improvements).toHaveLength(2);
    const [step1, step2] = birkdale.suggested_improvements;
    expect(step1.sequence).toBe(1);
    expect(step1.improvement_details).toEqual({ improvement_number: 19 });
    expect(step1.typical_saving).toEqual({ value: 34, currency: "GBP" });
    expect(step1.indicative_cost).toBe("£4,000 - £6,000");
    expect(step1.energy_performance_rating).toBe(86);
    expect(step1.environmental_impact_rating).toBe(87);
    expect(step2.sequence).toBe(2);
    expect(step2.improvement_details).toEqual({ improvement_number: 34 });
    expect(step2.typical_saving).toEqual({ value: 383, currency: "GBP" });
    expect(step2.indicative_cost).toBe("£3,500 - £5,500");
    expect(step2.energy_performance_rating).toBe(93);
    expect(step2.environmental_impact_rating).toBe(94);
    // The two Exeter Road certificates and Minerva's Flat 4
    // certificate publish no measures at all — the key is
    // absent, which files as the named no-measures state.
    for (const [pc, address] of [
      ["E16 1GN", "6 Exeter Road"],
      ["KT17 1FH", "Flat 4 Minerva House"],
    ] as const) {
      const search = JSON.parse(
        readFileSync(join(fixtureDir, fixture.postcodes[pc].searchFile), "utf8"),
      ) as { data: { certificateNumber: string; addressLine1: string }[] };
      for (const stub of search.data.filter((s) => s.addressLine1 === address)) {
        const raw = JSON.parse(
          readFileSync(join(fixtureDir, "certs", `${stub.certificateNumber}.json`), "utf8"),
        ) as { data?: unknown } & Record<string, unknown>;
        const doc = (raw.data ?? raw) as Record<string, unknown>;
        expect("suggested_improvements" in doc).toBe(false);
      }
    }
  });

  it("files the construction descriptions only — the element ratings are dropped at filing (M6.26 widening, D48)", () => {
    expect(loader).toContain("constructionOf(doc)");
    expect(loader).toContain("construction: constructionOf(doc)");
    // The seven register groups are read by their API names.
    for (const field of [
      "walls",
      "roofs",
      "floors",
      "windows",
      "lighting",
      "hot_water",
      "main_heating",
    ])
      expect(loader).toContain(field);
    // The descriptions normalise across the register's two
    // shapes, exactly as dwelling_type does.
    expect(loader).toContain("description.value");
    // The per-element 0–5 ratings are never read, never
    // filed: the loader source names neither rating key
    // anywhere (the improvement ratings it does file are
    // the cumulative energy/environmental PERFORMANCE
    // ratings of a step — different keys, different facts).
    expect(loader).not.toContain("energy_efficiency_rating");
    expect(loader).not.toContain("environmental_efficiency_rating");
  });

  it("fixture carries the golden construction descriptions (M6.26)", () => {
    const docByNumber = (number: string) => {
      const raw = JSON.parse(readFileSync(join(fixtureDir, "certs", `${number}.json`), "utf8")) as {
        data?: unknown;
      } & Record<string, unknown>;
      return (raw.data ?? raw) as Record<string, unknown>;
    };
    // The register's two description shapes: a plain string,
    // or a { value, language } object whose value is the text.
    const text = (entry: unknown): string | null => {
      if (entry === null || typeof entry !== "object") return null;
      const description = (entry as { description?: unknown }).description;
      if (typeof description === "string") return description;
      if (description !== null && typeof description === "object")
        return ((description as { value?: unknown }).value as string) ?? null;
      return null;
    };
    const texts = (group: unknown): (string | null)[] =>
      Array.isArray(group) ? group.map(text) : [text(group)];
    // Birkdale's new-build SAP set — the U-values exist only
    // as text inside the descriptions.
    const birkdale = docByNumber("2490-1633-0432-1002-3023");
    expect(texts(birkdale.walls)).toEqual(["Average thermal transmittance 0.27 W/m²K"]);
    expect(texts(birkdale.roofs)).toEqual(["Average thermal transmittance 0.11 W/m²K"]);
    expect(texts(birkdale.floors)).toEqual(["Average thermal transmittance 0.15 W/m²K"]);
    expect(texts(birkdale.windows)).toEqual(["High performance glazing"]);
    expect(texts(birkdale.lighting)).toEqual(["Low energy lighting in all fixed outlets"]);
    expect(texts(birkdale.main_heating)).toEqual(["Boiler and radiators, mains gas"]);
    expect(texts(birkdale.hot_water)).toEqual(["From main system, waste water heat recovery"]);
    // Exeter's two certificates disagree, and the 2023
    // RdSAP certificate records no windows group at all.
    const exeter2023 = docByNumber("2041-1785-8070-7006-5925");
    expect(texts(exeter2023.walls)).toEqual(["Cavity wall, as built, insulated (assumed)"]);
    expect(texts(exeter2023.roofs)).toEqual(["(another dwelling above)"]);
    expect(texts(exeter2023.floors)).toEqual(["Solid, insulated (assumed)"]);
    expect(exeter2023.windows ?? null).toBeNull();
    expect(texts(exeter2023.main_heating)).toEqual(["Community scheme"]);
    const exeter2013 = docByNumber("9248-9925-7330-1627-9930");
    expect(texts(exeter2013.walls)).toEqual(["Average thermal transmittance 0.28 W/m²K"]);
    expect(texts(exeter2013.windows)).toEqual(["Fully double glazed"]);
    expect(texts(exeter2013.hot_water)).toEqual(["Community scheme with CHP"]);
    // Minerva Flat 4: the "(other premises above/below)"
    // pair, and the register's own ampersand, unescaped.
    const minerva = docByNumber("8401-7039-6529-6723-9906");
    expect(texts(minerva.roofs)).toEqual(["(other premises above)"]);
    expect(texts(minerva.floors)).toEqual(["(other premises below)"]);
    expect(texts(minerva.main_heating)).toEqual(["Boiler& underfloor, mains gas"]);
    // Corpus-wide: every group is present on every
    // certificate except windows, absent on exactly 6 of
    // the 128 — the first check's count, pinned.
    let windowsAbsent = 0;
    let total = 0;
    for (const pc of Object.values<{ searchFile: string }>(fixture.postcodes)) {
      const search = JSON.parse(readFileSync(join(fixtureDir, pc.searchFile), "utf8")) as {
        data: { certificateNumber: string }[];
      };
      for (const stub of search.data) {
        total += 1;
        const doc = docByNumber(stub.certificateNumber);
        for (const group of ["walls", "roofs", "floors", "lighting", "hot_water", "main_heating"])
          expect(doc[group], `${stub.certificateNumber} ${group}`).not.toBeNull();
        if (doc.windows === null || doc.windows === undefined) windowsAbsent += 1;
      }
    }
    expect(total).toBe(128);
    expect(windowsAbsent).toBe(6);
  });

  it("golden checks are insensitive to object key order — the jsonb read-back order (M6.26 gate fix)", () => {
    // The filed artefact lives in a jsonb column: PostgreSQL
    // returns its keys in its own order (by key length, then
    // bytewise), never the order minimise() built. The exact
    // found order from the CI failure of run #170 — identical
    // values, different key order — must PASS the loader's own
    // construction golden check, through the loader's own code.
    const birkdaleAsReadBack = {
      certificateNumber: "2490-1633-0432-1002-3023",
      construction: {
        roofs: ["Average thermal transmittance 0.11 W/m²K"],
        walls: ["Average thermal transmittance 0.27 W/m²K"],
        floors: ["Average thermal transmittance 0.15 W/m²K"],
        windows: "High performance glazing",
        hotWater: "From main system, waste water heat recovery",
        lighting: "Low energy lighting in all fixed outlets",
        mainHeating: ["Boiler and radiators, mains gas"],
      },
    };
    expect(() => checkConstructionGolden("CM3 2JT", [birkdaleAsReadBack])).not.toThrow();
    // Key order is the only thing forgiven: a changed value in
    // the same reordered shape still fails the check.
    const changed = {
      ...birkdaleAsReadBack,
      construction: {
        ...birkdaleAsReadBack.construction,
        walls: ["Average thermal transmittance 0.30 W/m²K"],
      },
    };
    expect(() => checkConstructionGolden("CM3 2JT", [changed])).toThrow(/golden check failed/);
    // The measures golden (M6.21) compares objects the same
    // way: step keys arriving scrambled still pass, a changed
    // saving still fails. Array order stays significant — the
    // steps below are in register sequence, as filed.
    const measuresAsReadBack = {
      certificateNumber: "2490-1633-0432-1002-3023",
      suggestedImprovements: [
        {
          typicalSaving: 34,
          sequence: 1,
          indicativeCost: "£4,000 - £6,000",
          improvementType: "N",
          energyRatingAfter: 86,
          improvementNumber: 19,
          environmentalRatingAfter: 87,
        },
        {
          environmentalRatingAfter: 94,
          improvementNumber: 34,
          energyRatingAfter: 93,
          improvementType: "U",
          indicativeCost: "£3,500 - £5,500",
          sequence: 2,
          typicalSaving: 383,
        },
      ],
    };
    expect(() => checkMeasuresGolden("CM3 2JT", [measuresAsReadBack])).not.toThrow();
    const measuresChanged = {
      ...measuresAsReadBack,
      suggestedImprovements: measuresAsReadBack.suggestedImprovements.map((step, i) =>
        i === 0 ? { ...step, typicalSaving: 35 } : step,
      ),
    };
    expect(() => checkMeasuresGolden("CM3 2JT", [measuresChanged])).toThrow(/golden check failed/);
    // The comparisons go through the canonical stringify in
    // the loader source — no bare JSON.stringify equality is
    // left on an object-valued golden.
    expect(loader).toContain("canonicalStringify(cert.construction ?? null)");
    expect(loader).toContain("canonicalStringify(comparable)");
  });

  it("the pinned improvement-name lookup resolves every fixture number and fails loud on unknown ones", () => {
    // Every improvement number filed anywhere in the
    // fixture corpus resolves to a published name — an
    // unresolvable number here means the transcription
    // drifted from the register's list.
    const numbers = new Set<number>();
    const certsDir = join(fixtureDir, "certs");
    for (const pc of Object.values<{ searchFile: string }>(fixture.postcodes)) {
      const search = JSON.parse(readFileSync(join(fixtureDir, pc.searchFile), "utf8")) as {
        data: { certificateNumber: string }[];
      };
      for (const stub of search.data) {
        const raw = JSON.parse(
          readFileSync(join(certsDir, `${stub.certificateNumber}.json`), "utf8"),
        ) as { data?: unknown } & Record<string, unknown>;
        const doc = (raw.data ?? raw) as {
          suggested_improvements?: { improvement_details: { improvement_number: number } }[];
        };
        for (const step of doc.suggested_improvements ?? [])
          numbers.add(step.improvement_details.improvement_number);
      }
    }
    expect([...numbers].sort((a, b) => a - b)).toEqual([5, 6, 14, 19, 34, 35, 58]);
    for (const n of numbers) expect(improvementName(n), `number ${n}`).not.toBeNull();
    expect(improvementName(19)).toBe("Solar water heating");
    expect(improvementName(34)).toBe("Solar photovoltaic panels, 2.5 kWp");
    // The list is the union of the register schemas'
    // published lists (65 numbers), cited in the module.
    expect(Object.keys(IMPROVEMENT_NAMES)).toHaveLength(65);
    expect(readFileSync(join(process.cwd(), "lib/epc-improvements.ts"), "utf8")).toContain(
      "communitiesuk/epb-data-warehouse",
    );
    // An unknown number serves NO name — figures only,
    // never a bare code dressed as a name, never invented.
    expect(improvementName(999)).toBeNull();
    expect(improvementName(null)).toBeNull();
    expect(improvementName(undefined)).toBeNull();
  });
});

describe("epc loader — the live fetch (BUG-173)", () => {
  it("fetches certificates concurrently, keeps the register's order, and skips a withdrawn certificate", async () => {
    const CERTS = 40;
    const stubs = Array.from({ length: CERTS }, (_, i) => ({
      certificateNumber: `cert-${i}`,
      addressLine1: `${i + 1} Test Street`,
    }));
    const realFetch = globalThis.fetch;
    let inFlight = 0;
    let maxInFlight = 0;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/domestic/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: stubs, pagination: { totalPages: 1 } }),
        };
      }
      const number = /certificate_number=cert-(\d+)/.exec(url)?.[1];
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 50));
      inFlight -= 1;
      if (number === "7") return { ok: false, status: 404, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            address_line_1: `${Number(number) + 1} Test Street`,
            postcode: "ZZ9 1AA",
            current_energy_efficiency_band: "C",
          },
        }),
      };
    }) as typeof fetch;
    try {
      const started = Date.now();
      const { certificates, skipped } = await liveCertificates("ZZ9 1AA", "test-token");
      const elapsed = Date.now() - started;
      // The withdrawn certificate is skipped and counted;
      // the rest file in the register's search order.
      expect(skipped).toBe(1);
      expect(certificates.length).toBe(CERTS - 1);
      expect(certificates[6]?.certificateNumber).toBe("cert-6");
      expect(certificates[7]?.certificateNumber).toBe("cert-8");
      // Concurrency is real but bounded — and the whole
      // fetch lands far inside the serial form's time
      // (40 × (50 ms + the old 100 ms pause) = 6 s).
      expect(maxInFlight).toBeGreaterThan(1);
      expect(maxInFlight).toBeLessThanOrEqual(8);
      expect(elapsed).toBeLessThan(2_000);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("BUG-265 progress logging — the live fetch", () => {
  it("logs the search stage and the certificate tally with the stub count as the total", async () => {
    const CERTS = 12;
    const stubs = Array.from({ length: CERTS }, (_, i) => ({
      certificateNumber: `cert-${i}`,
      addressLine1: `${i + 1} Test Street`,
    }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/api/domestic/search")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: stubs, pagination: { totalPages: 1 } }),
        };
      }
      const number = /certificate_number=cert-(\d+)/.exec(url)?.[1];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            address_line_1: `${Number(number) + 1} Test Street`,
            postcode: "ZZ9 1AA",
            current_energy_efficiency_band: "C",
          },
        }),
      };
    }) as typeof fetch;
    try {
      const lines: string[] = [];
      const progress = createProgressLogger({
        name: "load-epc",
        log: (line: string) => lines.push(line),
      });
      const { certificates } = await liveCertificates("ZZ9 1AA", "test-token", { progress });
      expect(certificates).toHaveLength(CERTS);
      expect(lines).toContainEqual(
        expect.stringMatching(/load-epc progress · searching the register for ZZ9 1AA$/),
      );
      expect(lines).toContainEqual(
        expect.stringMatching(
          /load-epc progress · fetch certificates 12\/12 certificates \(100%\)$/,
        ),
      );
      expect(lines).toContainEqual(expect.stringMatching(/load-epc heartbeat · fetch · 10\/12 · /));
      expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg client: the staged answers, the postcode
  // cache's live answers and the loader_checkpoint row as
  // arrays, with just enough SQL to run the filer. Answers
  // are stored as the JSON strings stageAnswer writes, and
  // the cache merge keeps them as parsed objects, as the
  // real jsonb column would.
  type StagedRow = { postcode: string; answer: string; skipped: number; seq: number };
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  const POSTCODES = ["CM1 6ER", "CM3 2JT", "E16 1GN", "KT17 1FH"];
  const EDITION = "2026-11-26";
  function createFakeClient() {
    let staged: StagedRow[] = [];
    const cache = new Map<string, { epc?: Record<string, unknown> }>(
      POSTCODES.map((pc) => [pc, {}]),
    );
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      staged: StagedRow[];
      cache: Map<string, { epc?: Record<string, unknown> }>;
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = {
          staged: [...staged],
          cache: new Map([...cache].map(([k, v]) => [k, { ...v }])),
          checkpoints: new Map(checkpoints),
        };
        return { rows: [] };
      }
      if (text === "COMMIT") {
        snapshot = null;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        if (snapshot) {
          staged = snapshot.staged;
          cache.clear();
          for (const [k, v] of snapshot.cache) cache.set(k, v);
          checkpoints.clear();
          for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS epc_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO epc_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        staged.push({
          postcode: params[0] as string,
          answer: params[1] as string,
          skipped: params[2] as number,
          seq: params[3] as number,
        });
        return { rows: [], rowCount: 1 };
      }
      if (
        /SELECT loader, edition, expected, next_start_index, read_count, filed_count, state, updated_at/.test(
          text,
        )
      ) {
        const row = checkpoints.get(params[0] as string);
        return { rows: row ? [row] : [] };
      }
      if (/INSERT INTO loader_checkpoint/.test(text)) {
        checkpoints.set(params[0] as string, {
          loader: params[0] as string,
          edition: params[1] as string,
          expected: params[2] as number | null,
          next_start_index: params[3] as number,
          read_count: params[4] as number,
          filed_count: params[5] as number,
          state: JSON.parse(params[6] as string) as Record<string, unknown>,
        });
        return { rows: [] };
      }
      if (/DELETE FROM loader_checkpoint WHERE loader =/.test(text)) {
        checkpoints.delete(params[0] as string);
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n, coalesce\(sum\(seq\)/.test(text)) {
        return {
          rows: [
            {
              n: staged.length,
              s: staged.reduce((a, r) => a + r.seq, 0),
              m: staged.length ? Math.max(...staged.map((r) => r.seq)) : 0,
            },
          ],
        };
      }
      if (/DELETE FROM epc_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM epc_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT postcode, answer, skipped FROM epc_stage ORDER BY seq/.test(text)) {
        return { rows: staged.map((r) => ({ ...r })) };
      }
      if (/UPDATE postcode_cache SET answers = answers \|\|/.test(text)) {
        const pc = params[1] as string;
        const row = cache.get(pc);
        if (!row) return { rows: [], rowCount: 0 };
        row.epc = JSON.parse(params[0] as string).epc as Record<string, unknown>;
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT answers->'epc' AS epc FROM postcode_cache/.test(text)) {
        const row = cache.get(params[0] as string);
        return { rows: row?.epc ? [{ epc: row.epc }] : [] };
      }
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    return {
      query,
      staged: () => staged,
      cacheEpc: (pc: string) => cache.get(pc)?.epc,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        failAfterInserts = n;
      },
    };
  }
  type FakeClient = ReturnType<typeof createFakeClient>;
  async function runEpc(
    fake: FakeClient,
    { restart = false, lines = null as string[] | null } = {},
  ) {
    const captured: string[] = lines ?? [];
    const progress = createProgressLogger({
      name: "load-epc",
      log: (line: string) => captured.push(line),
    });
    const filer = await beginFiling(progress, { client: fake as never, restart });
    await filer.prepareResume(EDITION, POSTCODES.length);
    const answers = new Map<string, Record<string, unknown>>();
    for (const { postcode, answer } of filer.stagedAnswers())
      answers.set(postcode, answer as Record<string, unknown>);
    for (const pc of POSTCODES) {
      if (answers.has(pc)) continue;
      const { answer, skipped } = await fetchPostcodeAnswer({
        fixture,
        fileDir: fixtureDir,
        pc,
        progress,
      });
      answers.set(pc, answer as Record<string, unknown>);
      await filer.stageAnswer(pc, answer, skipped);
    }
    await filer.finishFiling(POSTCODES, answers);
    return { filer, answers, lines: captured };
  }

  it("kill mid-fetch resumes and files every postcode exactly once", async () => {
    const fake = createFakeClient();
    // Kill after two staged postcodes: the checkpoint at 2,
    // the third postcode never fetched.
    const killLines: string[] = [];
    fake.setFailAfterInserts(2);
    await expect(runEpc(fake, { lines: killLines })).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(2);
    expect(fake.checkpoints.get("load-epc")?.next_start_index).toBe(2);
    expect(
      killLines.some((l) => /checkpoint 2\/4 postcodes \(50%\) · staged 2 · resume from 2/.test(l)),
    ).toBe(true);

    fake.setFailAfterInserts(null);
    const { filer, answers, lines } = await runEpc(fake);
    expect(answers.size).toBe(4);
    expect(
      lines.some((l) =>
        /resuming from checkpoint · 2 rows staged · edition 2026-11-26 · resume from 2/.test(l),
      ),
    ).toBe(true);
    // Every postcode filed once, with the fetched certificate counts.
    for (const pc of POSTCODES) {
      const filed = fake.cacheEpc(pc) as { certificateCount: number } | undefined;
      expect(filed?.certificateCount).toBe(
        (answers.get(pc) as { certificateCount: number }).certificateCount,
      );
      expect(filed?.certificateCount).toBeGreaterThan(0);
    }
    // The merge cleared staging and the checkpoint together.
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-epc")).toBeUndefined();
    expect(filer.resumeNote()).toBe("the start (nothing staged yet)");
  });

  it("an edition change discards the staged answers and starts from zero", async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(2);
    await expect(runEpc(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(2);

    const progress = createProgressLogger({ name: "load-epc", log: () => {} });
    const filer = await beginFiling(progress, { client: fake as never });
    const prep = await filer.prepareResume("2099-01-01", POSTCODES.length);
    expect(prep.resumed).toBe(false);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-epc")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakeClient();
    fake.setFailAfterInserts(2);
    await expect(runEpc(fake)).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(2);

    fake.setFailAfterInserts(null);
    const { answers } = await runEpc(fake, { restart: true });
    expect(answers.size).toBe(4);
    for (const pc of POSTCODES) {
      const filed = fake.cacheEpc(pc) as { certificateCount: number } | undefined;
      expect(filed?.certificateCount).toBe(
        (answers.get(pc) as { certificateCount: number }).certificateCount,
      );
    }
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-epc")).toBeUndefined();
  });
});
