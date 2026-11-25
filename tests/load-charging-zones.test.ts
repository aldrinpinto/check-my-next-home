import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AREA_TOLERANCE,
  PENDING_SCHEMES,
  SCHEMES,
  SCHEME_COUNT,
  SOURCED_SCHEMES,
  assembleFiling,
  checkGolden,
  fileChargingZones,
  polygonsContain,
  processScheme,
  schemeAreaKm2,
} from "../loaders/load-charging-zones.mjs";
import { probeCazRegister, probeScotlandLez } from "../loaders/canary.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the charging zones loader (plan step M6.31,
// decisions D50, D61 and D63): twelve schemes in the
// register, eleven filing from their operators' own
// published boundaries, Portsmouth pending (no boundary
// published — decision D63). The fixtures are cuts of
// the real published boundaries, captured live at build
// (16 Nov 2026) and simplified for the repo; the loader's
// own golden checks run over them; the filing proof runs
// in CI against a real PostGIS (the golden replay), and
// the transaction contract is pinned here against a
// recording fake client.

const loader = readFileSync(join(process.cwd(), "loaders/load-charging-zones.mjs"), "utf8");
const runner = readFileSync(join(process.cwd(), "loaders/run-loaders.mjs"), "utf8");
const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/charging-zones");

type RawBody = { features: { properties: Record<string, unknown>; geometry: unknown }[] };
const loadFixture = (name: string): RawBody =>
  JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as RawBody;

const schemeByKey = (key: string) => {
  const scheme = SCHEMES.find((s) => s.key === key);
  if (!scheme) throw new Error(`no scheme ${key}`);
  return scheme;
};

function processedFixtures() {
  const byKey = new Map();
  for (const scheme of SOURCED_SCHEMES) {
    byKey.set(scheme.key, processScheme(scheme, loadFixture(`${scheme.key}.geojson`)));
  }
  return byKey;
}

describe("charging zones register (prep sections 1–2, decisions D61/D63)", () => {
  it("holds exactly twelve schemes: 7 CAZs, the ULEZ and 4 LEZs", () => {
    expect(SCHEME_COUNT).toBe(12);
    expect(SCHEMES.filter((s) => s.family === "caz")).toHaveLength(7);
    expect(SCHEMES.filter((s) => s.family === "ulez")).toHaveLength(1);
    expect(SCHEMES.filter((s) => s.family === "lez")).toHaveLength(4);
    expect(new Set(SCHEMES.map((s) => s.key)).size).toBe(12);
  });

  it("pins every scheme's name, operator, class and charging-start date (D61)", () => {
    const expected: Record<string, [string, string, string | null, string]> = {
      bath: ["Bath Clean Air Zone", "Bath and North East Somerset Council", "C", "2021-03-15"],
      birmingham: ["Birmingham Clean Air Zone", "Birmingham City Council", "D", "2021-06-14"],
      bradford: [
        "Bradford Clean Air Zone",
        "City of Bradford Metropolitan District Council",
        "C",
        "2022-09-26",
      ],
      bristol: ["Bristol Clean Air Zone", "Bristol City Council", "D", "2022-11-28"],
      portsmouth: ["Portsmouth Clean Air Zone", "Portsmouth City Council", "B", "2021-11-29"],
      sheffield: ["Sheffield Clean Air Zone", "Sheffield City Council", "C", "2023-02-27"],
      tyneside: [
        "Tyneside Clean Air Zone (Newcastle and Gateshead)",
        "Newcastle City Council and Gateshead Council",
        "C",
        "2023-01-30",
      ],
      ulez: ["London Ultra Low Emission Zone (ULEZ)", "Transport for London", null, "2023-08-29"],
      glasgow: ["Glasgow Low Emission Zone", "Glasgow City Council", null, "2023-06-01"],
      edinburgh: ["Edinburgh Low Emission Zone", "City of Edinburgh Council", null, "2024-06-01"],
      dundee: ["Dundee Low Emission Zone", "Dundee City Council", null, "2024-05-30"],
      aberdeen: ["Aberdeen Low Emission Zone", "Aberdeen City Council", null, "2024-06-01"],
    };
    for (const scheme of SCHEMES) {
      const [name, operator, cls, date] = expected[scheme.key];
      expect([scheme.name, scheme.operator, scheme.class, scheme.inForceDate]).toEqual([
        name,
        operator,
        cls,
        date,
      ]);
    }
  });

  it("only Birmingham, Bristol and the ULEZ charge cars among the charging schemes", () => {
    const carCharging = SCHEMES.filter(
      (s) => s.family === "ulez" || (s.family === "caz" && s.class === "D"),
    ).map((s) => s.key);
    expect(carCharging.sort()).toEqual(["birmingham", "bristol", "ulez"]);
  });

  it("every scheme's checker is one of the three published landings, with no query string", () => {
    const landings = new Set([
      "https://www.gov.uk/clean-air-zones",
      "https://vehicleemissionscheck.service.gov.scot/",
      "https://tfl.gov.uk/modes/driving/check-your-vehicle/",
    ]);
    for (const scheme of SCHEMES) {
      expect(landings.has(scheme.checkerUrl)).toBe(true);
      expect(scheme.checkerUrl).not.toContain("?");
      if (scheme.family === "caz")
        expect(scheme.checkerUrl).toBe("https://www.gov.uk/clean-air-zones");
      if (scheme.family === "lez")
        expect(scheme.checkerUrl).toBe("https://vehicleemissionscheck.service.gov.scot/");
    }
  });

  it("Portsmouth is the one pending scheme: register facts recorded, no source (D63)", () => {
    expect(PENDING_SCHEMES.map((s) => s.key)).toEqual(["portsmouth"]);
    expect(schemeByKey("portsmouth").source).toBeNull();
    expect(SOURCED_SCHEMES).toHaveLength(11);
  });

  it("every sourced scheme carries its terms basis and publisher name (the terms register, 11 of 11)", () => {
    for (const scheme of SOURCED_SCHEMES) {
      expect(scheme.sourceName, scheme.key).toBeTruthy();
      expect(scheme.termsNote, scheme.key).toBeTruthy();
      expect(scheme.referenceAreaKm2, scheme.key).toBeGreaterThan(0);
    }
    // The recorded positions, verbatim where the prep pinned them:
    expect(schemeByKey("bath").termsNote).toContain("Open Government Licence v3.0");
    expect(schemeByKey("bath").termsNote).toContain("edition April 2024");
    expect(schemeByKey("ulez").termsNote).toContain("Open Government Licence v2.0");
    expect(schemeByKey("tyneside").termsNote).toContain("no licence text");
    expect(schemeByKey("aberdeen").termsNote).toContain("no licence text");
    expect(schemeByKey("edinburgh").termsNote).toContain("Open Government Licence v3.0");
  });

  it("no register field can hold a charging amount (D50): the field set is closed", () => {
    const allowed = new Set([
      "key",
      "name",
      "family",
      "class",
      "operator",
      "inForceDate",
      "checkerUrl",
      "sourceName",
      "sourceDate",
      "termsNote",
      "referenceAreaKm2",
      "source",
    ]);
    for (const scheme of SCHEMES)
      for (const field of Object.keys(scheme)) expect(allowed.has(field)).toBe(true);
    expect(loader).not.toMatch(/chargeAmount|dailyCharge|chargePence|penaltyAmount/);
  });
});

describe("charging zones loader wiring", () => {
  it("is registered quarterly, with its friendly names, fixture pass and npm script", () => {
    expect(runner).toContain(
      '{ item: "load-charging-zones", cadence: "quarterly", timeoutMinutes: 30 }',
    );
    expect(runner).toContain('"load-charging-zones":');
    expect(runner).toContain(
      'await runAndLog("load-charging-zones", ["--file", fx("charging-zones")])',
    );
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["load:charging-zones"]).toBe("node loaders/load-charging-zones.mjs");
  });

  it("files into its own table by a whole-set swap — never into planning_layers", () => {
    expect(loader).toContain("DELETE FROM charging_zones");
    expect(loader).toContain("INSERT INTO charging_zones");
    expect(loader).not.toContain("planning_layers");
  });
});

describe("charging zones fixtures — the published boundaries, cut at build", () => {
  const byKey = processedFixtures();
  const filing = assembleFiling(byKey);

  it("files eleven schemes and reports Portsmouth pending", () => {
    expect(filing.filed).toHaveLength(11);
    expect(filing.pending.map((s) => s.key)).toEqual(["portsmouth"]);
  });

  it("each scheme's measured area sits within ±25% of its pinned reference (and close to it)", () => {
    for (const entry of filing.filed) {
      const km2 = schemeAreaKm2(entry.polygons);
      const reference = entry.scheme.referenceAreaKm2 ?? 0;
      expect(km2, entry.scheme.key).toBeGreaterThan(reference * (1 - AREA_TOLERANCE));
      expect(km2, entry.scheme.key).toBeLessThan(reference * (1 + AREA_TOLERANCE));
      expect(km2, entry.scheme.key).toBeCloseTo(reference, 0);
    }
  });

  it("passes the loader's own golden checks on the fixture filing", () => {
    expect(() => checkGolden(filing.filed)).not.toThrow();
  });

  it("the ULEZ fixture files in EPSG:4326 despite its source's EPSG:27700 coordinates", () => {
    const ulez = byKey.get("ulez");
    const lons = ulez.polygons.flatMap((p: number[][][]) =>
      p.flatMap((r: number[][]) => r.map((pair: number[]) => pair[0])),
    );
    const lats = ulez.polygons.flatMap((p: number[][][]) =>
      p.flatMap((r: number[][]) => r.map((pair: number[]) => pair[1])),
    );
    expect(Math.min(...lons)).toBeGreaterThan(-0.6);
    expect(Math.max(...lons)).toBeLessThan(0.4);
    expect(Math.min(...lats)).toBeGreaterThan(51.2);
    expect(Math.max(...lats)).toBeLessThan(51.75);
    expect(polygonsContain(ulez.polygons, 0.021177, 51.515224)).toBe(true);
  });

  it("every scheme's own witness point falls inside it and inside no other filed scheme", () => {
    const witnesses: Record<string, [number, number]> = {
      bath: [-2.360698, 51.383238],
      birmingham: [-1.90138, 52.47893],
      bradford: [-1.74966, 53.804833],
      bristol: [-2.594164, 51.451031],
      sheffield: [-1.472652, 53.381252],
      tyneside: [-1.618449, 54.969547],
      ulez: [-0.09885, 51.491527],
      glasgow: [-4.253855, 55.860464],
      edinburgh: [-3.199695, 55.948497],
      dundee: [-2.971307, 56.461576],
      aberdeen: [-2.105825, 57.145086],
    };
    for (const entry of filing.filed) {
      const [lng, lat] = witnesses[entry.scheme.key];
      const inside = filing.filed
        .filter((other) => polygonsContain(other.polygons, lng, lat))
        .map((other) => other.scheme.key);
      expect(inside, entry.scheme.key).toEqual([entry.scheme.key]);
    }
  });
});

describe("charging zones per-scheme filing contract", () => {
  it("the WECA 'Proposed' Bristol copy is refused by the STATUS assertion", () => {
    const weca = loadFixture("bristol-weca.geojson");
    expect(weca.features[0].properties.STATUS).toBe("Proposed");
    expect(() => processScheme(schemeByKey("bristol"), weca)).toThrow(/STATUS/);
    expect(() => processScheme(schemeByKey("bristol"), weca)).toThrow(/In force/);
  });

  it("the council production Bristol fixture carries STATUS 'In force' and files", () => {
    const bristol = loadFixture("bristol.geojson");
    expect(bristol.features[0].properties.STATUS).toBe("In force");
    expect(() => processScheme(schemeByKey("bristol"), bristol)).not.toThrow();
  });

  it("an empty feature set, an error envelope and a truncated response all fail the scheme", () => {
    const bath = schemeByKey("bath");
    expect(() => processScheme(bath, { features: [] })).toThrow(/no features/);
    expect(() => processScheme(bath, { error: { code: 500, message: "boom" } })).toThrow(
      /error envelope/,
    );
    const body = loadFixture("bath.geojson") as RawBody & { exceededTransferLimit?: boolean };
    body.exceededTransferLimit = true;
    expect(() => processScheme(bath, body)).toThrow(/truncated/);
  });

  it("a feature with no geometry fails the scheme", () => {
    const body = loadFixture("bath.geojson");
    body.features[0].geometry = null;
    expect(() => processScheme(schemeByKey("bath"), body)).toThrow(/no geometry/);
  });

  it("a sourced scheme missing from the assembly fails the whole filing", () => {
    const byKey = processedFixtures();
    byKey.delete("dundee");
    expect(() => assembleFiling(byKey)).toThrow(/Dundee/);
  });
});

// A recording fake client in the load-ev-chargers
// pattern: it answers the staged checks from the
// register (areas at their references, no overlaps)
// unless a test overrides an answer, and records every
// statement so the transaction's shape is pinned.
function recordingClient(
  overrides: { overlap?: boolean; areaScale?: number; invalidKey?: string } = {},
) {
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      const head = sql.trim().replace(/\s+/g, " ");
      statements.push(head);
      if (head.includes("ST_Area(ST_Transform")) {
        return {
          rows: SOURCED_SCHEMES.map((s) => ({
            scheme_key: s.key,
            valid: s.key !== overrides.invalidKey,
            km2: (s.referenceAreaKm2 ?? 0) * (overrides.areaScale ?? 1),
          })),
        };
      }
      if (head.includes("cz_stage a JOIN cz_stage b")) {
        return { rows: overrides.overlap ? [{ a: "bath", b: "ulez" }] : [] };
      }
      if (head.includes("count(*)::int AS n FROM cz_stage")) return { rows: [{ n: 11 }] };
      if (head.includes("count(*)::int AS n FROM charging_zones")) return { rows: [{ n: 11 }] };
      return { rows: [], rowCount: 0 };
    },
  };
  return { statements, client };
}

describe("charging zones filing — the whole-set transaction", () => {
  const filing = assembleFiling(processedFixtures());

  it("stages, validates and swaps inside one transaction — BEGIN first, COMMIT last", async () => {
    const rec = recordingClient();
    const result = await fileChargingZones(rec.client as never, filing);
    expect(result).toEqual({ filedCount: 11, pendingCount: 1 });
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    expect(rec.statements[0]).toBe("BEGIN");
    expect(at("CREATE TEMP TABLE cz_stage")).toBeGreaterThan(0);
    expect(at("INSERT INTO cz_stage")).toBeGreaterThan(at("CREATE TEMP TABLE cz_stage"));
    expect(at("DELETE FROM charging_zones")).toBeGreaterThan(at("INSERT INTO cz_stage"));
    expect(at("INSERT INTO charging_zones")).toBeGreaterThan(at("DELETE FROM charging_zones"));
    expect(rec.statements.at(-1)).toBe("COMMIT");
    expect(rec.statements).not.toContain("ROLLBACK");
  });

  it("a staged overlap refuses the filing and rolls back — disjointness is a filing contract", async () => {
    const rec = recordingClient({ overlap: true });
    await expect(fileChargingZones(rec.client as never, filing)).rejects.toThrow(/overlap/);
    await expect(
      fileChargingZones(recordingClient({ overlap: true }).client as never, filing),
    ).rejects.toThrow(/Bath Clean Air Zone/);
    expect(rec.statements).toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.statements.some((s) => s.startsWith("DELETE FROM charging_zones"))).toBe(false);
  });

  it("a staged area outside ±25% of its reference refuses the filing, naming the scheme", async () => {
    const rec = recordingClient({ areaScale: 1.4 });
    await expect(fileChargingZones(rec.client as never, filing)).rejects.toThrow(/outside ±25%/);
    expect(rec.statements).toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
  });

  it("an invalid staged boundary refuses the filing", async () => {
    const rec = recordingClient({ invalidKey: "dundee" });
    await expect(fileChargingZones(rec.client as never, filing)).rejects.toThrow(/not valid/);
    expect(rec.statements).toContain("ROLLBACK");
  });
});

describe("charging-zone register canaries (prep check 20)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const cazPage = (cities: string[]) => {
    const rows = cities.map((c) => `<tr><td>${c}</td><td>C</td><td>1.0</td></tr>`).join("");
    return `<html><body><h2>Cities with Clean Air Zones</h2><table><tr><th>City</th></tr>${rows}</table><h2>Types of Clean Air Zones</h2></body></html>`;
  };
  const stubPage = (html: string) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => html })),
    );

  it("is registered in the canary run with its friendly names", () => {
    expect(canary).toContain("probeCazRegister");
    expect(canary).toContain('await run("govuk-caz", probeCazRegister)');
    expect(canary).toContain("probeScotlandLez");
    expect(canary).toContain('await run("scotland-lez", probeScotlandLez)');
    expect(runner).toContain('"govuk-caz": "Clean Air Zone register');
    expect(runner).toContain('"scotland-lez": "Low Emission Zone register');
  });

  it("a GOV.UK table naming all seven CAZs passes clean", async () => {
    stubPage(
      cazPage(["Bath", "Birmingham", "Bradford", "Bristol", "Portsmouth", "Sheffield", "Tyneside"]),
    );
    const outcome = await probeCazRegister();
    expect(outcome.warning).toBeUndefined();
    expect(outcome.logLine).toContain("7 of 7");
    expect(outcome.logLine).toContain("7 table rows");
  });

  it("a GOV.UK page whose cities section carries no table rows is a shape change, not a row count", async () => {
    stubPage(
      `<html><body><h2>Cities with Clean Air Zones</h2><p>Bath, Birmingham, Bradford, Bristol, Portsmouth, Sheffield and Tyneside.</p><h2>Types of Clean Air Zones</h2></body></html>`,
    );
    await expect(probeCazRegister()).rejects.toThrow(
      /changed shape — the cities table was not found/,
    );
  });

  it("an escaped copy of the content ahead of the rendered body does not hide the cities table", async () => {
    // GOV.UK embeds the guidance in a JSON payload whose markup
    // is escaped text: the headings and city names read there as
    // plain text, but the table is not markup. The probe must
    // slice the rendered section that follows, not that copy.
    const escapedCopy =
      `<script type="application/json">{"content":"` +
      `\\u003ch2\\u003eCities with Clean Air Zones\\u003c/h2\\u003e` +
      `\\u003cp\\u003eBath, Birmingham, Bradford, Bristol, Portsmouth, Sheffield and Tyneside.\\u003c/p\\u003e` +
      `\\u003ctable\\u003e\\u003ctr\\u003e\\u003ctd\\u003eBath\\u003c/td\\u003e\\u003c/tr\\u003e\\u003c/table\\u003e` +
      `\\u003ch2\\u003eTypes of Clean Air Zones\\u003c/h2\\u003e"}</script>`;
    stubPage(
      `<html><body>${escapedCopy}${cazPage(["Bath", "Birmingham", "Bradford", "Bristol", "Portsmouth", "Sheffield", "Tyneside"])}</body></html>`,
    );
    const outcome = await probeCazRegister();
    expect(outcome.warning).toBeUndefined();
    expect(outcome.logLine).toContain("7 of 7");
    expect(outcome.logLine).toContain("7 table rows");
  });

  it("a vanished CAZ warns (never fails) and names it", async () => {
    stubPage(cazPage(["Bath", "Birmingham", "Bradford", "Bristol", "Sheffield", "Tyneside"]));
    const outcome = await probeCazRegister();
    expect(outcome.warning).toBe(true);
    expect(outcome.logLine).toContain("Portsmouth");
  });

  it("Scotland's four LEZs named, count four: passes clean", async () => {
    stubPage(
      `<html><body><p>There are four LEZs in Scotland, located in the city centres of Aberdeen, Dundee, Edinburgh and Glasgow.</p></body></html>`,
    );
    const outcome = await probeScotlandLez();
    expect(outcome.warning).toBeUndefined();
    expect(outcome.logLine).toContain("4 of 4");
  });

  it("a fifth Scottish LEZ warns (never fails)", async () => {
    stubPage(
      `<html><body><p>There are five LEZs in Scotland: Aberdeen, Dundee, Edinburgh, Glasgow and Perth.</p></body></html>`,
    );
    const outcome = await probeScotlandLez();
    expect(outcome.warning).toBe(true);
    expect(outcome.logLine).toContain("5");
  });
});

// BUG-265: the filing carries the shared progress logger —
// a stage marker naming the validation the swap runs.
describe("progress logging (BUG-265)", () => {
  it("files the fixture set with a filing stage line", async () => {
    const rec = recordingClient();
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-charging-zones",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const filing = assembleFiling(processedFixtures());
    const result = await fileChargingZones(rec.client as never, filing, { progress });
    expect(result).toEqual({ filedCount: 11, pendingCount: 1 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /progress · filing 11 schemes — validity, area and disjointness checks, then the swap$/,
    );
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});
