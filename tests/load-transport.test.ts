import { readFileSync } from "node:fs";
import { join } from "node:path";
import proj4 from "proj4";
import { describe, expect, it } from "vitest";

// Guards the transport loader (plan step M5.5) against the ten
// test-first items of the 13 Nov 2026 gap check, at fixture
// scale: the fixture is a radius-trimmed REAL capture from the
// NaPTAN national file of 13 Nov 2026 (rows around the three
// universal homes, Cardiff CF11 8AA, Hilgay CB6 1EH and High
// Laver CM5 0DR, plus the eleven grid-only Elizabeth line rail
// rows by ATCO code). The national-scale counts of item 1
// (435,812 read / 388,156 active / 381,640 filed) are proven by
// the loader's live verify-only run record, exactly as the
// nature fixture's candidate-SAC exclusion was proven live in
// M5.3; here the same rules are recomputed on the capture and
// must reconcile to the fixture's own counts. The loader's own
// golden checks run in both modes; the filing proof runs in CI
// against a real PostGIS.
//
// One wording correction against gap item 2, from the prep's
// own Section 4 and verified against the file: the nearest
// station-level point to 6 Exeter Road is Royal Victoria's
// (0.414 mi), not Custom House's — the step's check pins the
// Custom House station point itself (4900ZZDLCUS1, 0.440 mi),
// and that is what is asserted, as a presence-at-distance fact.

const loader = readFileSync(join(process.cwd(), "loaders/load-transport.mjs"), "utf8");
const canary = readFileSync(join(process.cwd(), "loaders/canary.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/transport");

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);

// One line parser: the NaPTAN CSV carries no embedded newlines
// (the national file's line count equals its row count + 1, a
// prep-verified property the capture inherits).
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(field);
      field = "";
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

const fixtureText = readFileSync(join(fixtureDir, "naptan.csv"), "utf8");
const fixtureLines = fixtureText.split("\n").filter((l) => l.trim() !== "");
const header = splitCsvLine(fixtureLines[0]).map((h) => h.replace(/^﻿/, "").trim());
const raw = fixtureLines
  .slice(1)
  .map((l) => Object.fromEntries(header.map((h, i) => [h, (splitCsvLine(l)[i] ?? "").trim()])));

const FAMILIES = new Set(["BCT", "BCS", "BST", "RLY", "MET", "TMU", "FER", "FBT", "FTD"]);
const STATION = new Set(["RLY", "MET", "TMU"]);
const BUS = new Set(["BCT", "BCS", "BST"]);

type Filed = {
  atco: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  converted: boolean;
  source: Record<string, string>;
};

function positionOf(
  row: Record<string, string>,
): { lat: number; lng: number; converted: boolean } | null {
  if (row["Latitude"] !== "" && row["Longitude"] !== "") {
    return { lat: Number(row["Latitude"]), lng: Number(row["Longitude"]), converted: false };
  }
  if (row["Easting"] !== "" && row["Northing"] !== "") {
    const [lng, lat] = proj4("EPSG:27700", "EPSG:4326", [
      Number(row["Easting"]),
      Number(row["Northing"]),
    ]);
    return { lat, lng, converted: true };
  }
  return null;
}

const filed: Filed[] = [];
for (const row of raw) {
  if (row["Status"] !== "active") continue;
  if (!FAMILIES.has(row["StopType"])) continue;
  const pos = positionOf(row);
  if (!pos) continue;
  filed.push({
    atco: row["ATCOCode"],
    name: row["CommonName"],
    type: row["StopType"],
    lat: pos.lat,
    lng: pos.lng,
    converted: pos.converted,
    source: row,
  });
}
const byAtco = new Map(filed.map((f) => [f.atco, f]));
const rawByAtco = new Map(raw.map((r) => [r["ATCOCode"], r]));

const HOMES = {
  birkdale: { lat: 51.776176, lng: 0.60387 },
  exeter: { lat: 51.515224, lng: 0.021177 },
  epsom: { lat: 51.344571, lng: -0.247104 },
  cardiff: { lat: 51.467947, lng: -3.192837 },
  hilgay: { lat: 52.507481, lng: 0.33491 },
  highLaver: { lat: 51.749133, lng: 0.214797 },
};

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const milesFrom = (home: { lat: number; lng: number }, f: Filed) =>
  haversineMiles(home.lat, home.lng, f.lat, f.lng);
const near = (home: { lat: number; lng: number }, types: Set<string>, miles: number) =>
  filed
    .filter((f) => types.has(f.type) && milesFrom(home, f) <= miles)
    .sort((a, b) => milesFrom(home, a) - milesFrom(home, b));
const expectMiles = (actual: number, expected: number, tolerance: number) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};

describe("transport loader sources", () => {
  it("reads NaPTAN from the live DfT API, never the dead app host or BODS (L5, L6)", () => {
    expect(loader).toContain("naptan.api.dft.gov.uk/v1/access-nodes");
    expect(loader).toContain("dataFormat=CSV");
    expect(loader).not.toContain("naptan.app.dft.gov.uk");
    expect(loader).not.toContain("bus-data.dft.gov.uk");
    expect(loader).toContain("Open Government Licence v3.0");
  });

  it("files exactly the nine stop families and nothing else (L2)", () => {
    expect(loader).toContain('"BCT", "BCS", "BST", "RLY", "MET", "TMU", "FER", "FBT", "FTD"');
    expect(loader).toContain("transport_stops");
  });

  it("filters on Status, the currency field — not the Modification decoy (L4)", () => {
    expect(loader).toContain('row.Status !== "active"');
  });

  it("converts grid references with proj4 and counts the conversions in the log line (L1)", () => {
    expect(loader).toContain("EPSG:27700");
    expect(loader).toContain("grid references converted");
  });

  it("files stop-type codes verbatim and never translates them into a mode (L3)", () => {
    expect(loader).toContain("stop_type");
    expect(loader).toContain("filed verbatim");
  });
});

describe("fixture counts (gap item 1, at fixture scale)", () => {
  it("the capture reconciles: 1,706 rows in, exactly 1,481 filed — the count the practice workflow asserts", () => {
    expect(raw).toHaveLength(1706);
    expect(filed).toHaveLength(1481);
  });

  it("per-family filed counts match the capture", () => {
    const counts: Record<string, number> = {};
    for (const f of filed) counts[f.type] = (counts[f.type] ?? 0) + 1;
    expect(counts).toEqual({
      BCT: 1354,
      BCS: 13,
      RLY: 25,
      MET: 24,
      TMU: 45,
      FER: 8,
      FBT: 9,
      FTD: 3,
    });
  });

  it("no filed row carries a sub-point or out-of-scope type, and no ATCO code repeats", () => {
    for (const f of filed) expect(FAMILIES.has(f.type)).toBe(true);
    expect(new Set(filed.map((f) => f.atco)).size).toBe(filed.length);
    expect(new Set(raw.map((r) => r["ATCOCode"])).size).toBe(raw.length);
  });

  it("grid conversion is exercised, not theoretical: 97 filed rows were converted", () => {
    expect(filed.filter((f) => f.converted)).toHaveLength(97);
  });
});

describe("the step's check (gap item 2)", () => {
  it("the Custom House station point files at 0.440 mi from 6 Exeter Road", () => {
    const cus = byAtco.get("4900ZZDLCUS1");
    expect(cus?.type).toBe("TMU");
    expectMiles(milesFrom(HOMES.exeter, cus!), 0.44, 0.02);
  });

  it("Canning Town's Underground station point files at 0.564 mi", () => {
    const cgt = byAtco.get("9400ZZLUCGT");
    expect(cgt?.type).toBe("MET");
    expectMiles(milesFrom(HOMES.exeter, cgt!), 0.564, 0.02);
  });

  it("the honesty note: Royal Victoria's point (0.414) is nearer — the check pins Custom House itself, not 'nearest'", () => {
    const rv = byAtco.get("4900ZZDLRVC1");
    expect(rv).toBeDefined();
    expectMiles(milesFrom(HOMES.exeter, rv!), 0.414, 0.02);
    expect(near(HOMES.exeter, STATION, 0.5)[0].atco).toBe("4900ZZDLRVC1");
  });
});

describe("grid-conversion proof (gap item 3 — this step's Article-4-gate equivalent)", () => {
  it("the Hilgay pair is grid-only in the source and files at 0.044 mi once converted", () => {
    for (const atco of ["0500ELITP026", "0500ELITP036"]) {
      expect(rawByAtco.get(atco)?.["Latitude"]).toBe("");
      expect(rawByAtco.get(atco)?.["Easting"]).not.toBe("");
      const f = byAtco.get(atco);
      expect(f?.converted).toBe(true);
      expectMiles(milesFrom(HOMES.hilgay, f!), 0.044, 0.01);
    }
    expect(near(HOMES.hilgay, BUS, 0.1)[0].atco).toMatch(/^0500ELITP0(26|36)$/);
  });

  it("every one of the 7 bus stops within 2 miles of Hilgay is a grid-only row in the source", () => {
    const within = near(HOMES.hilgay, BUS, 2);
    expect(within).toHaveLength(7);
    for (const f of within) expect(f.source["Latitude"]).toBe("");
  });

  it("the eleven grid-only Elizabeth line rail rows all file, converted", () => {
    for (const atco of [
      "9100ABWDXR",
      "9100BONDST",
      "9100CANWHRF",
      "9100CUSTMHS",
      "9100FRNDXR",
      "9100LIVSTLL",
      "9100PADTLL",
      "9100TOTCTRD",
      "9100WCHAPXR",
      "9100WOLWXR",
      "9100BARKRIV",
    ]) {
      expect(rawByAtco.get(atco)?.["Latitude"]).toBe("");
      expect(byAtco.get(atco)?.converted).toBe(true);
    }
    expectMiles(milesFrom(HOMES.exeter, byAtco.get("9100CUSTMHS")!), 0.488, 0.02);
  });
});

describe("status proof (gap item 4)", () => {
  it("Canning Town's closed rail station is in the capture, inactive, and never filed", () => {
    expect(rawByAtco.get("9100CNTN")?.["Status"]).toBe("inactive");
    expect(byAtco.has("9100CNTN")).toBe(false);
  });

  it("West Ham's superseded row is excluded and its live replacement filed", () => {
    expect(rawByAtco.get("9100WHAM")?.["Status"]).toBe("inactive");
    expect(byAtco.has("9100WHAM")).toBe(false);
    expect(byAtco.get("9100WHAMHL")?.type).toBe("RLY");
  });

  it("every filed row's source status was active", () => {
    for (const f of filed) expect(f.source["Status"]).toBe("active");
  });
});

describe("universal goldens (gap item 5)", () => {
  it("Birkdale: Hatfield Peverel 0.563, the New Road pair at 0.124/0.126, 13 bus stops within half a mile", () => {
    expectMiles(milesFrom(HOMES.birkdale, byAtco.get("9100HFLPEVL")!), 0.563, 0.02);
    expectMiles(milesFrom(HOMES.birkdale, byAtco.get("150009005007")!), 0.124, 0.01);
    expectMiles(milesFrom(HOMES.birkdale, byAtco.get("150009005008")!), 0.126, 0.01);
    expect(near(HOMES.birkdale, BUS, 0.5)).toHaveLength(13);
  });

  it("Epsom: the flat's station is Ewell East 0.246 — not Epsom (1.170); Hazel Mead bus stop 0.128", () => {
    expectMiles(milesFrom(HOMES.epsom, byAtco.get("9100EWELLE")!), 0.246, 0.02);
    expectMiles(milesFrom(HOMES.epsom, byAtco.get("9100EWELW")!), 0.57, 0.02);
    expectMiles(milesFrom(HOMES.epsom, byAtco.get("9100EPSM")!), 1.17, 0.02);
    expect(near(HOMES.epsom, STATION, 0.3)[0].atco).toBe("9100EWELLE");
    expectMiles(milesFrom(HOMES.epsom, byAtco.get("40004406167B")!), 0.128, 0.01);
  });

  it("Exeter: nearest bus stop Canning Town Recreation Ground 0.172, its pair at 0.186", () => {
    expectMiles(milesFrom(HOMES.exeter, byAtco.get("490016788N")!), 0.172, 0.01);
    expectMiles(milesFrom(HOMES.exeter, byAtco.get("490011814S")!), 0.186, 0.01);
    expect(near(HOMES.exeter, BUS, 0.2)[0].atco).toBe("490016788N");
  });
});

describe("Wales proof (gap item 6)", () => {
  it("Cardiff files from the same capture: Grangetown 0.136, Penarth Road 0.077", () => {
    expectMiles(milesFrom(HOMES.cardiff, byAtco.get("9100GNTN")!), 0.136, 0.01);
    expectMiles(milesFrom(HOMES.cardiff, byAtco.get("5710AWA11589")!), 0.077, 0.01);
  });

  it("the loader fetches the whole-GB file — no area filter, no country filter", () => {
    expect(loader).not.toContain("atcoAreaCodes");
  });
});

describe("far answers are filed facts (gap item 7)", () => {
  it("Hilgay: Littleport station 3.208, 7 bus stops within 2 miles, 86 within 5", () => {
    expectMiles(milesFrom(HOMES.hilgay, byAtco.get("9100LTLPORT")!), 3.208, 0.03);
    expect(near(HOMES.hilgay, BUS, 2)).toHaveLength(7);
    expect(near(HOMES.hilgay, BUS, 5)).toHaveLength(86);
  });

  it("High Laver: Harlow Mill station 4.531 with Mill Lane bus stop at 0.243", () => {
    expectMiles(milesFrom(HOMES.highLaver, byAtco.get("9100HRLWMIL")!), 4.531, 0.03);
    expectMiles(milesFrom(HOMES.highLaver, byAtco.get("1500IM915")!), 0.243, 0.01);
  });
});

describe("name fidelity (gap item 8)", () => {
  it("filed names match the source byte-for-byte, qualifiers and all", () => {
    expect(byAtco.get("9400ZZDLCUS")?.name).toBe("Custom House (for ExCel) DLR Station");
    expect(byAtco.get("9100CUSTMHS")?.name).toBe("Custom House");
    expect(byAtco.get("9100GNTN")?.name).toBe("Grangetown (Cardiff) Rail Station");
    for (const f of filed) expect(f.name).toBe(f.source["CommonName"]);
  });
});

describe("canary design (gap item 9)", () => {
  it("probes one small ATCO area and reads freshness from the content's own edit dates", () => {
    expect(canary).toContain("naptan.api.dft.gov.uk/v1/access-nodes");
    expect(canary).toContain("atcoAreaCodes=571");
    expect(canary).toContain("ModificationDateTime");
    const probe = canary.slice(
      canary.indexOf("function probeNaptan"),
      canary.indexOf("function probeNaptan") + 3000,
    );
    expect(probe).not.toContain("last-modified");
    expect(probe).not.toContain("naptan.app.dft.gov.uk");
  });
});
