import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import proj4 from "proj4";
import { describe, expect, it } from "vitest";
import {
  resolveAddressInput,
  type AddressDataSource,
  type DirectoryPostcode,
  type LoadedAddressParts,
} from "../lib/address";
import {
  DISTANCE_BASIS_LABEL,
  buildNearbyBundle,
  haversineMiles,
  type NearbyBundle,
  type NearbyDataSource,
  type NearbyPoint,
} from "../lib/nearby";
// The pipelines below re-derive the filed rows from the loaders'
// own fixtures with the loaders' rules written out again — the
// transport/schools/OSM test pattern — so the brain is tested
// against filed truth, not against the loaders themselves.
// buildSites/readPoisFile and the greenspace reader are pure
// file→rows functions, imported directly like their own tests do.
import { buildSites, readPoisFile } from "../loaders/load-ev-chargers.mjs";
import { readGreenspaceFile } from "../loaders/load-os-greenspace.mjs";
import { classifyTags, dedupePlaces, detailFor, placeName } from "../loaders/load-osm-places.mjs";

// Distances and What's Nearby (plan step M6.2, decision D22).
// Locked figures (the prep's Section 4) must reproduce in the
// brain's own basis — the loaders' haversine, earth radius
// 3,956 — at the locked rounding. Figures marked TO-FIX were
// fixed from the filed fixture data during the build and are
// locked here; the golden-matrix records which of them the
// full-size rehearsal proved again at national volume.

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
    "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);

const round3 = (miles: number) => Math.round(miles * 1000) / 1000;

// --- the address resolutions the bundles hang off -------------
// The M6.1 fake, mirrored: the same fixture rows (the Land
// Registry excerpt + the KT17 1FH address fixture), plus the
// Hilgay directory point the transport prep verified.

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

// --- transport rows (mirror of tests/load-transport.test.ts) --

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

type TransportRow = { name: string; type: string; latitude: number; longitude: number };
const transportRows: TransportRow[] = (() => {
  const text = readFileSync(join(process.cwd(), "tests/fixtures/transport/naptan.csv"), "utf8");
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const header = splitCsvLine(lines[0]).map((h) => h.replace(/^﻿/, "").trim());
  const raw = lines
    .slice(1)
    .map((l) => Object.fromEntries(header.map((h, i) => [h, (splitCsvLine(l)[i] ?? "").trim()])));
  const families = new Set(["BCT", "BCS", "BST", "RLY", "MET", "TMU", "FER", "FBT", "FTD"]);
  const rows: TransportRow[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (row["Status"] !== "active") continue;
    if (!families.has(row["StopType"])) continue;
    let lat: number | null = null;
    let lng: number | null = null;
    const pLat = Number(row["Latitude"]);
    const pLng = Number(row["Longitude"]);
    if (
      row["Latitude"] !== "" &&
      row["Longitude"] !== "" &&
      pLat >= 49.8 &&
      pLat <= 58.9 &&
      pLng >= -8.7 &&
      pLng <= 1.9
    ) {
      lat = pLat;
      lng = pLng;
    } else if (row["Easting"] !== "" && row["Northing"] !== "") {
      const converted = proj4("EPSG:27700", "EPSG:4326", [
        Number(row["Easting"]),
        Number(row["Northing"]),
      ]);
      lng = converted[0];
      lat = converted[1];
    }
    if (lat === null || lng === null) continue;
    if (seen.has(row["ATCOCode"])) continue;
    seen.add(row["ATCOCode"]);
    rows.push({ name: row["CommonName"], type: row["StopType"], latitude: lat, longitude: lng });
  }
  return rows;
})();

// --- schools rows (mirror of loaders/load-schools.mjs) --------

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
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
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.length > 1 || (r[0] ?? "") !== "")
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

type SchoolRow = {
  name: string;
  phase: string | null;
  admissionsPolicy: string | null;
  latitude: number;
  longitude: number;
};
const schoolRows: SchoolRow[] = (() => {
  // Fallback positions for schools with no register coordinates:
  // their own postcode's directory position (the loader's rule),
  // read here from the ONSPD excerpt fixture.
  const fallback = new Map<string, { lat: number; lng: number }>();
  const dataDir = join(process.cwd(), "tests/fixtures/onspd/Data");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(join(dir, e.name))
        : e.name.endsWith(".csv")
          ? [join(dir, e.name)]
          : [],
    );
  for (const file of walk(dataDir)) {
    const lines = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "");
    const header = splitCsvLine(lines[0]).map((h) => h.trim());
    const ip = header.indexOf("pcds");
    const ilat = header.indexOf("lat");
    const ilong = header.indexOf("long");
    if (ip < 0) continue;
    for (const line of lines.slice(1)) {
      const f = splitCsvLine(line);
      if (f[ilat] && f[ilong])
        fallback.set(f[ip].trim(), { lat: Number(f[ilat]), lng: Number(f[ilong]) });
    }
  }
  const text = new TextDecoder("windows-1252").decode(
    readFileSync(join(process.cwd(), "tests/fixtures/schools/edubase.csv")),
  );
  const blank = (v: string | undefined) => {
    const t = (v ?? "").trim();
    return t === "" ? null : t;
  };
  const rows: SchoolRow[] = [];
  for (const row of parseCsv(text)) {
    if (row["EstablishmentStatus (name)"] !== "Open") continue;
    const easting = Number(row["Easting"]);
    const northing = Number(row["Northing"]);
    let lat: number | null = null;
    let lng: number | null = null;
    if (
      Number.isFinite(easting) &&
      Number.isFinite(northing) &&
      (easting !== 0 || northing !== 0)
    ) {
      const converted = proj4("EPSG:27700", "EPSG:4326", [easting, northing]);
      lng = converted[0];
      lat = converted[1];
    } else {
      const fb = fallback.get((row["Postcode"] ?? "").trim().toUpperCase());
      if (fb) {
        lat = fb.lat;
        lng = fb.lng;
      }
    }
    if (lat === null || lng === null) continue;
    rows.push({
      name: (row["EstablishmentName"] ?? "").trim(),
      phase: blank(row["PhaseOfEducation (name)"]),
      admissionsPolicy: blank(row["AdmissionsPolicy (name)"]),
      latitude: lat,
      longitude: lng,
    });
  }
  return rows;
})();

// --- health rows (the loader's own filing, dumped — see
// tests/fixtures/nearby/README.md) -------------------------------

type HealthRow = {
  name: string;
  serviceType: string;
  emergency: boolean | null;
  latitude: number;
  longitude: number;
};
const healthRows: HealthRow[] = (
  JSON.parse(
    readFileSync(join(process.cwd(), "tests/fixtures/nearby/health-points.json"), "utf8"),
  ) as {
    name: string;
    service_type: string;
    has_emergency_department: boolean | null;
    latitude: string;
    longitude: string;
  }[]
).map((r) => ({
  name: r.name,
  serviceType: r.service_type,
  emergency: r.has_emergency_department,
  latitude: Number(r.latitude),
  longitude: Number(r.longitude),
}));

// --- OSM rows (mirror of tests/load-osm-places.test.ts) --------

type OsmEl = {
  kind: "node" | "way" | "relation";
  id: number;
  tags: Record<string, string>;
  lat: number;
  lon: number;
};
const unesc = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
function parseOsm(xml: string): OsmEl[] {
  const nodes = new Map<number, { lat: number; lon: number; tags: Record<string, string> }>();
  const ways = new Map<number, { refs: number[]; tags: Record<string, string> }>();
  const relations = new Map<
    number,
    { members: { type: string; ref: number }[]; tags: Record<string, string> }
  >();
  const tagsOf = (body: string): Record<string, string> => {
    const tags: Record<string, string> = {};
    for (const m of body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g))
      tags[unesc(m[1])] = unesc(m[2]);
    return tags;
  };
  for (const m of xml.matchAll(
    /<node id="(\d+)" lat="([\d.-]+)" lon="([\d.-]+)"( ?\/>|>([\s\S]*?)<\/node>)/g,
  ))
    nodes.set(Number(m[1]), {
      lat: Number(m[2]),
      lon: Number(m[3]),
      tags: m[5] ? tagsOf(m[5]) : {},
    });
  for (const m of xml.matchAll(/<way id="(\d+)">([\s\S]*?)<\/way>/g))
    ways.set(Number(m[1]), {
      refs: [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map((x) => Number(x[1])),
      tags: tagsOf(m[2]),
    });
  for (const m of xml.matchAll(/<relation id="(\d+)">([\s\S]*?)<\/relation>/g))
    relations.set(Number(m[1]), {
      members: [...m[2].matchAll(/<member type="(node|way|relation)" ref="(\d+)"/g)].map((x) => ({
        type: x[1],
        ref: Number(x[2]),
      })),
      tags: tagsOf(m[2]),
    });
  const els: OsmEl[] = [];
  for (const [id, n] of nodes) els.push({ kind: "node", id, tags: n.tags, lat: n.lat, lon: n.lon });
  for (const [id, w] of ways) {
    const pts = w.refs.map((r) => nodes.get(r)).filter((p) => p !== undefined);
    if (pts.length === 0) continue;
    els.push({
      kind: "way",
      id,
      tags: w.tags,
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
    });
  }
  for (const [id, r] of relations) {
    const type = r.tags.type;
    if (!(type === undefined || type === "" || type === "multipolygon" || type === "boundary"))
      continue;
    const pts: { lat: number; lon: number }[] = [];
    for (const member of r.members) {
      if (member.type === "way") {
        const w = ways.get(member.ref);
        if (w)
          for (const ref of w.refs) {
            const n = nodes.get(ref);
            if (n) pts.push(n);
          }
      } else if (member.type === "node") {
        const n = nodes.get(member.ref);
        if (n) pts.push(n);
      }
    }
    if (pts.length === 0) continue;
    els.push({
      kind: "relation",
      id,
      tags: r.tags,
      lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
      lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length,
    });
  }
  return els;
}
type OsmRow = {
  name: string | null;
  placeType: string;
  detail: string | null;
  latitude: number;
  longitude: number;
};
const osmRows: OsmRow[] = (() => {
  const rows: OsmRow[] = [];
  const dir = join(process.cwd(), "tests/fixtures/osm-places");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".osm"))) {
    const els = parseOsm(readFileSync(join(dir, file), "utf8"));
    const raw: Record<string, unknown>[] = [];
    for (const el of els) {
      const placeType = classifyTags(el.tags) as string | null;
      if (placeType === null) continue;
      raw.push({
        kind: el.kind,
        osmId: el.id,
        name: placeName(el.tags) as string | null,
        placeType,
        detail: detailFor(placeType, el.tags) as string | null,
        lat: el.lat,
        lon: el.lon,
      });
    }
    for (const r of dedupePlaces(raw).rows as {
      name: string | null;
      placeType: string;
      detail: string | null;
      lat: number;
      lon: number;
    }[])
      rows.push({
        name: r.name,
        placeType: r.placeType,
        detail: r.detail,
        latitude: r.lat,
        longitude: r.lon,
      });
  }
  return rows;
})();

// --- greenspace centre rows (the loader's own reader, on the
// fixture GeoPackage decoded exactly as its fixture mode does) --

type ParkRow = { name: string | null; latitude: number; longitude: number };
const parkRows: ParkRow[] = (() => {
  const encoded = readFileSync(
    join(process.cwd(), "tests/fixtures/os-greenspace/opgrsp_gb.gpkg.b64"),
    "utf8",
  );
  const path = join(tmpdir(), "cmnh-nearby-test-opgrsp.gpkg");
  writeFileSync(path, Buffer.from(encoded.replace(/\s+/g, ""), "base64"));
  try {
    const read = readGreenspaceFile(path, "2026-08-14") as {
      rows: { name: string | null; pointRole: string; lat: number; lon: number }[];
    };
    return read.rows
      .filter((r) => r.pointRole === "centre")
      .map((r) => ({ name: r.name, latitude: r.lat, longitude: r.lon }));
  } finally {
    unlinkSync(path);
  }
})();

// --- EV sites (the loader's own grouping, on its fixture) -----

type EvRow = { name: string | null; detail: string | null; latitude: number; longitude: number };
const evRows: EvRow[] = (
  buildSites(readPoisFile(join(process.cwd(), "tests/fixtures/ev-chargers"))) as {
    sites: { name: string | null; lat: number; lon: number; detail: { usage_type: string } }[];
  }
).sites.map((s) => ({
  name: s.name,
  detail: s.detail.usage_type,
  latitude: s.lat,
  longitude: s.lon,
}));

// --- nurseries: NO loader files the nurseries table, so no
// filed rows exist to build goldens from. These two synthetic
// rows (plus one beyond the radius) exercise the category's
// behaviour only; they are not data and lock no figures. -------

const EPSOM = { lat: 51.344571, lon: -0.247104 };
const nurseryRows: NearbyPoint[] = [
  {
    name: "Little Acorns Day Nursery (synthetic)",
    latitude: EPSOM.lat + 0.00724,
    longitude: EPSOM.lon,
  },
  { name: "Tiny Steps Nursery (synthetic)", latitude: EPSOM.lat + 0.01738, longitude: EPSOM.lon },
  { name: "Far Away Nursery (synthetic)", latitude: EPSOM.lat + 0.03621, longitude: EPSOM.lon },
];

// --- the fake source -------------------------------------------

const STATION_TYPES = new Set(["RLY", "MET", "TMU"]);
const BUS_TYPES = new Set(["BCT", "BCS", "BST"]);
const TABLES: Record<string, NearbyPoint[]> = {
  "schools-primary": schoolRows
    .filter((s) => s.phase === "Primary")
    .map((s) => ({ name: s.name, latitude: s.latitude, longitude: s.longitude })),
  "schools-secondary": schoolRows
    .filter((s) => s.phase === "Secondary")
    .map((s) => ({
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      selective: s.admissionsPolicy === "Selective",
    })),
  nurseries: nurseryRows,
  gp: healthRows
    .filter((h) => h.serviceType === "gp_practice" || h.serviceType === "gp_branch_surgery")
    .map((h) => ({ name: h.name, latitude: h.latitude, longitude: h.longitude })),
  dentist: healthRows
    .filter((h) => h.serviceType === "dentist")
    .map((h) => ({ name: h.name, latitude: h.latitude, longitude: h.longitude })),
  pharmacy: healthRows
    .filter((h) => h.serviceType === "pharmacy")
    .map((h) => ({ name: h.name, latitude: h.latitude, longitude: h.longitude })),
  ae: healthRows
    .filter((h) => h.serviceType === "hospital" && h.emergency === true)
    .map((h) => ({ name: h.name, latitude: h.latitude, longitude: h.longitude })),
  station: transportRows
    .filter((t) => STATION_TYPES.has(t.type))
    .map((t) => ({ name: t.name, latitude: t.latitude, longitude: t.longitude })),
  "bus-stop": transportRows
    .filter((t) => BUS_TYPES.has(t.type))
    .map((t) => ({ name: t.name, latitude: t.latitude, longitude: t.longitude })),
  "ev-chargers": evRows.map((s) => ({
    name: s.name,
    detail: s.detail,
    latitude: s.latitude,
    longitude: s.longitude,
  })),
  supermarket: osmRows
    .filter((p) => p.placeType === "supermarket")
    .map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })),
  "food-and-drink": osmRows
    .filter((p) => p.placeType === "food_and_drink")
    .map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })),
  leisure: osmRows
    .filter((p) => p.placeType === "leisure")
    .map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })),
  "places-to-visit": osmRows
    .filter((p) => p.placeType === "visit")
    .map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })),
  "places-of-worship": osmRows
    .filter((p) => p.placeType === "worship")
    .map((p) => ({
      name: p.name,
      detail: p.detail,
      latitude: p.latitude,
      longitude: p.longitude,
    })),
  libraries: osmRows
    .filter((p) => p.placeType === "library")
    .map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })),
  vets: osmRows
    .filter((p) => p.placeType === "vet")
    .map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })),
  "pet-shops": osmRows
    .filter((p) => p.placeType === "pet_shop")
    .map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })),
  "pet-boarding": osmRows
    .filter((p) => p.placeType === "pet_boarding")
    .map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })),
  parks: parkRows.map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude })),
};

const fakeSource: NearbyDataSource = {
  async pointsWithin(category, latitude, longitude, radiusMiles) {
    return (TABLES[category] ?? []).filter(
      (p) => haversineMiles(latitude, longitude, p.latitude, p.longitude) <= radiusMiles,
    );
  },
  async nearestPoint(category, latitude, longitude) {
    let best: NearbyPoint | null = null;
    let bestMiles = Infinity;
    for (const p of TABLES[category] ?? []) {
      const d = haversineMiles(latitude, longitude, p.latitude, p.longitude);
      if (d < bestMiles) {
        bestMiles = d;
        best = p;
      }
    }
    return best;
  },
};

async function bundleFor(input: string): Promise<NearbyBundle> {
  const resolution = await resolveAddressInput(input, addressSource);
  return buildNearbyBundle(resolution, fakeSource);
}
function category(bundle: NearbyBundle, key: string) {
  if (bundle.kind !== "distances")
    throw new Error(`expected a distances bundle, got ${bundle.kind}`);
  const found = bundle.categories.find((c) => c.category === key);
  if (!found) throw new Error(`category ${key} missing from the bundle`);
  return found;
}
const top = (bundle: NearbyBundle, key: string) =>
  category(bundle, key).places.map((p) => [p.name, p.miles]);

// --- the basis --------------------------------------------------

describe("nearby basis (M6.2)", () => {
  it("computes distances in the loaders' haversine basis (earth radius 3,956)", () => {
    expect(haversineMiles(51.515224, 0.021177, 51.515224, 0.021177)).toBe(0);
    // The Custom House station point from the Exeter Road home —
    // the locked point fact, in the module's own function.
    const customHouseDistances = TABLES["station"]
      .filter((p) => p.name === "Custom House Station")
      .map((p) => round3(haversineMiles(51.515224, 0.021177, p.latitude, p.longitude)));
    expect(customHouseDistances).toContain(0.44);
  });

  it("labels every figure with the basis, and no line talks about walking or minutes", async () => {
    expect(DISTANCE_BASIS_LABEL).toBe("straight-line distance from the postcode point");
    for (const input of ["19 Birkdale Rise, CM3 2JT", "6 Exeter Road, E16 1GN", "KT17 1FH"]) {
      const bundle = await bundleFor(input);
      if (bundle.kind !== "distances") throw new Error("expected distances");
      expect(bundle.basisLabel).toBe(DISTANCE_BASIS_LABEL);
      for (const c of bundle.categories) {
        expect(c.basisLabel).toBe(DISTANCE_BASIS_LABEL);
        if (c.line !== null) {
          expect(c.line.toLowerCase()).not.toContain("walk");
          expect(c.line.toLowerCase()).not.toContain("minute");
        }
        expect(c.places.length).toBeLessThanOrEqual(3);
        const miles = c.places.map((p) => p.miles);
        expect(miles).toEqual([...miles].sort((a, b) => a - b));
        for (const p of c.places) expect(p.name).not.toBeNull();
      }
    }
  });

  it("serves the twenty categories in the documented order", async () => {
    const bundle = await bundleFor("CM3 2JT");
    if (bundle.kind !== "distances") throw new Error("expected distances");
    expect(bundle.categories.map((c) => c.category)).toEqual([
      "schools-primary",
      "schools-secondary",
      "nurseries",
      "gp",
      "dentist",
      "pharmacy",
      "ae",
      "station",
      "bus-stop",
      "ev-chargers",
      "supermarket",
      "food-and-drink",
      "leisure",
      "places-to-visit",
      "places-of-worship",
      "libraries",
      "vets",
      "pet-shops",
      "pet-boarding",
      "parks",
    ]);
  });
});

// --- Birkdale (CM3 2JT) -----------------------------------------

describe("nearby bundle — 19 Birkdale Rise, CM3 2JT", () => {
  it("serves the locked transport figures and counts bus stops on the filed-rows basis", async () => {
    const bundle = await bundleFor("19 Birkdale Rise, CM3 2JT");
    if (bundle.kind !== "distances") throw new Error("expected distances");
    expect(bundle.postcode).toBe("CM3 2JT");
    expect(top(bundle, "station")).toEqual([["Hatfield Peverel Rail Station", 0.563]]);
    // The New Road pair, on the filed rows — two real stops.
    expect(top(bundle, "bus-stop").slice(0, 2)).toEqual([
      ["New Road", 0.124],
      ["New Road", 0.126],
    ]);
    expect(category(bundle, "bus-stop").countWithin).toBe(63);
  });

  it("names the Sidney House BRANCH as the nearest GP point, never the Witham main site", async () => {
    const bundle = await bundleFor("CM3 2JT");
    // The filed point at 0.369 is the branch surgery F81149002 in
    // the village (see tests/fixtures/nearby/README.md); the
    // practice's main site is in Witham. Douglas Grove is the
    // nearest practice main site, at the locked 1.98.
    expect(top(bundle, "gp")).toEqual([
      ["SYDNEY HOUSE SURGERY", 0.369],
      ["DOUGLAS GROVE SURGERY", 1.976],
    ]);
  });

  it("lists both dental contracts on the shared postcode, and Boots as the nearest pharmacy", async () => {
    const bundle = await bundleFor("CM3 2JT");
    expect(top(bundle, "dentist")).toEqual([
      ["ARUNDEL HOUSE", 0.25],
      ["HATFIELD PEVEREL DENTAL SURGERY", 0.25],
    ]);
    expect(top(bundle, "pharmacy")).toEqual([["BOOTS", 0.415]]);
  });

  it("names Broomfield as the nearest A&E beyond the radius, in the ruled words", async () => {
    const bundle = await bundleFor("CM3 2JT");
    const ae = category(bundle, "ae");
    expect(ae.state).toBe("none-within");
    expect(ae.places).toEqual([]);
    expect(ae.beyondNearest).toEqual({ name: "Broomfield Hospital", miles: 5.89 });
    expect(ae.line).toBe(
      "none within 2 miles — nearest is Broomfield Hospital, 5.89 miles away (straight-line distance from the postcode point)",
    );
  });

  it("serves the Witham Leisure Centre EV site with its membership class showing", async () => {
    const bundle = await bundleFor("CM3 2JT");
    const evCat = category(bundle, "ev-chargers");
    expect(evCat.places).toHaveLength(1);
    expect(evCat.places[0].name).toBe("Witham Leisure Centre");
    expect(evCat.places[0].detail).toBe("Public - Membership Required");
    // The prep's locked figure is 1.866 — measured with the EV
    // loader's own haversine, whose earth radius is 3,959. The
    // brain serves ONE basis (D22): radius 3,956, the M5.2/M5.5
    // basis, under which this distance is 1.864. The difference
    // is the radius alone (the same filed point measures 1.8656
    // at radius 3,959 — the M6.2 rehearsal proves both), never
    // more than ~0.003 mi on any EV figure.
    expect(evCat.places[0].miles).toBe(1.864);
    expect(Math.abs(evCat.places[0].miles - 1.866)).toBeLessThanOrEqual(0.005);
  });

  it("serves schools, supermarkets and the What's Nearby groups from the filed data", async () => {
    const bundle = await bundleFor("CM3 2JT");
    // The tied Hatfield Peverel primary pair (locked by the
    // schools loader) leads the primary list.
    expect(top(bundle, "schools-primary")).toEqual([
      ["Hatfield Peverel Infant and Nursery School", 0.289],
      ["Hatfield Peverel St Andrew's Junior School", 0.289],
      ["Chipping Hill Primary School", 1.291],
    ]);
    expect(top(bundle, "schools-secondary")).toEqual([["Lift Maltings", 1.884]]);
    expect(category(bundle, "schools-secondary").nearestSelective).toBeNull();
    expect(top(bundle, "supermarket")).toEqual([
      ["The Co-operative Food", 0.258],
      ["ALDI", 1.14],
      ["Lidl", 1.941],
    ]);
    expect(top(bundle, "food-and-drink")).toEqual([
      ["Hatfield Tandori", 0.109],
      ["D's Cafe Diner", 0.158],
      ["Duke of Wellington", 0.218],
    ]);
    expect(category(bundle, "food-and-drink").countWithin).toBe(14);
    expect(top(bundle, "libraries")).toEqual([["Hatfield Peverel Library", 0.463]]);
    // Unnamed leisure points count towards the total but never
    // lead the list (10 filed within 2 miles, 4 named).
    expect(category(bundle, "leisure").countWithin).toBe(10);
    expect(top(bundle, "leisure")).toEqual([
      ["Club House", 1.846],
      ["Benton Hall Golf & Country Club", 1.859],
      ["Witham Leisure Centre", 1.878],
    ]);
    // Parks come from Greenspace CENTRE rows: 22 centres filed
    // within 2 miles, the nearest named is Strutt Memorial.
    expect(category(bundle, "parks").countWithin).toBe(22);
    expect(top(bundle, "parks")).toEqual([
      ["Strutt Memorial Recreation Ground", 0.218],
      ["The Green", 0.338],
      ["Keith Bigden Memorial Ground", 0.647],
    ]);
    expect(top(bundle, "pet-boarding")).toEqual([["Latneys Boarding Kennelsl and Cattery", 0.77]]);
  });

  it("says in words that the map holds no vets near Birkdale — the honestly-empty state", async () => {
    const bundle = await bundleFor("CM3 2JT");
    for (const key of ["vets", "pet-shops", "places-to-visit"]) {
      const c = category(bundle, key);
      expect(c.state).toBe("empty-map");
      expect(c.places).toEqual([]);
      expect(c.countWithin).toBe(0);
      expect(c.line).toContain("a gap in the map is not proof that none exists");
    }
  });
});

// --- Exeter Road (E16 1GN) ---------------------------------------

describe("nearby bundle — 6 Exeter Road, E16 1GN", () => {
  it("returns stations in pure distance order — Royal Victoria's point before Custom House", async () => {
    const bundle = await bundleFor("6 Exeter Road, E16 1GN");
    expect(top(bundle, "station")).toEqual([
      ["Royal Victoria Station", 0.414],
      ["Royal Victoria DLR Station", 0.423],
      ["Royal Victoria Station", 0.437],
    ]);
    // No service judgement in the brain: the list is distance
    // order only, and the Custom House POINT fact (0.440) is a
    // fact about that point, asserted at the source above.
    expect(category(bundle, "station").countWithin).toBe(72);
    expect(top(bundle, "bus-stop").slice(0, 2)).toEqual([
      ["Canning Town Recreation Ground", 0.172],
      ["Canning Town Recreation Ground", 0.186],
    ]);
  });

  it("serves health: Newham University Hospital as the A&E at the locked 0.78", async () => {
    const bundle = await bundleFor("E16 1GN");
    expect(top(bundle, "ae")).toEqual([["Newham University Hospital", 0.782]]);
    expect(top(bundle, "gp").slice(0, 2)).toEqual([
      ["CUSTOM HOUSE SURGERY", 0.24],
      ["CUMBERLAND MEDICAL CENTRE", 0.383],
    ]);
    // The St Luke's branch files as its own point, separately
    // from every practice main site.
    expect(top(bundle, "gp")[2]).toEqual(["CARPENTERS PRACTICE - ST LUKE'S PRACTICE SITE", 0.396]);
    expect(top(bundle, "pharmacy")[0]).toEqual(["DAY LEWIS PHARMACY", 0.361]);
    expect(top(bundle, "dentist")[0]).toEqual(["APPLEBY CENTRE", 0.265]);
  });

  it("serves schools: 13 secondaries within 2 miles, none of them selective", async () => {
    const bundle = await bundleFor("E16 1GN");
    expect(top(bundle, "schools-secondary")).toEqual([
      ["Rokeby School", 0.333],
      ["Royal Docks Academy", 0.66],
      ["Cumberland Community School", 0.696],
    ]);
    expect(category(bundle, "schools-secondary").countWithin).toBe(13);
    expect(category(bundle, "schools-secondary").nearestSelective).toBeNull();
    // The GIAS fixture cut holds no primary near E16 (it was cut
    // around the secondaries), so the primary answer exercises
    // the beyond-radius path here; the national figure is fixed
    // in the golden matrix from the M6.2 rehearsal.
    const primary = category(bundle, "schools-primary");
    expect(primary.state).toBe("none-within");
    expect(primary.beyondNearest).toEqual({ name: "Cheam Fields Primary Academy", miles: 14.671 });
  });

  it("serves EV, supermarkets, groups and parks (centre basis)", async () => {
    const bundle = await bundleFor("E16 1GN");
    const evCat = category(bundle, "ev-chargers");
    expect(evCat.places[0].name).toBe("Shell Recharge/Ubitricity");
    expect(evCat.places[0].miles).toBe(0.277);
    expect(evCat.places[0].detail).toBe("Public - Pay At Location");
    expect(top(bundle, "supermarket")).toEqual([
      ["Local Express", 0.392],
      ["Lidl", 0.463],
      ["Lidl", 0.463],
    ]);
    expect(top(bundle, "places-of-worship")[0]).toEqual(["Keir Hardie Methodist Church", 0.079]);
    expect(top(bundle, "libraries")[0]).toEqual(["Custom House Library", 0.437]);
    expect(top(bundle, "vets")[0]).toEqual(["Goddard Vets Plaistow", 1.169]);
    expect(top(bundle, "pet-boarding")[0]).toEqual(["Ponyo’s House", 0.517]);
    // Fisher Street Open Space is the nearest named centre;
    // Canning Town Recreation Ground files from a Playing Field
    // site — a public-parks-only cut would miss it.
    expect(top(bundle, "parks").slice(0, 2)).toEqual([
      ["Fisher Street Open Space", 0.275],
      ["Canning Town Recreation Ground", 0.315],
    ]);
  });
});

// --- Minerva House, Epsom (KT17 1FH) ------------------------------

describe("nearby bundle — Flat 4, Minerva House, KT17 1FH", () => {
  it("serves the locked Epsom school figures, selective fact included", async () => {
    const bundle = await bundleFor("Flat 4, Minerva House, 12 Ceres Crescent, KT17 1FH");
    expect(top(bundle, "schools-primary")[0]).toEqual([
      "Ewell Grove Primary and Nursery School",
      0.292,
    ]);
    expect(top(bundle, "schools-secondary")).toEqual([
      ["Glyn School", 0.385],
      ["Blenheim High School", 0.746],
      ["Nonsuch High School for Girls", 1.25],
    ]);
    expect(category(bundle, "schools-secondary").nearestSelective).toEqual({
      name: "Nonsuch High School for Girls",
      miles: 1.25,
    });
  });

  it("serves the tied GP pair as two real places, and Epsom General as the A&E", async () => {
    const bundle = await bundleFor("KT17 1FH");
    expect(top(bundle, "gp").slice(0, 2)).toEqual([
      ["FOUNTAIN PRACTICE", 0.459],
      ["SPRING STREET SURGERY", 0.459],
    ]);
    expect(top(bundle, "ae")).toEqual([["Epsom General Hospital", 1.732]]);
    expect(top(bundle, "dentist")[0]).toEqual(["BOURNE HALL DENTAL PRACTICE", 0.459]);
    expect(top(bundle, "pharmacy")[0]).toEqual(["EWELL HOUSE PHARMACY & TRAVEL CLINIC", 0.235]);
  });

  it("serves transport, EV and the What's Nearby groups", async () => {
    const bundle = await bundleFor("KT17 1FH");
    expect(top(bundle, "station")).toEqual([
      ["Ewell East Rail Station", 0.246],
      ["Ewell West Rail Station", 0.57],
      ["Epsom Rail Station", 1.17],
    ]);
    expect(top(bundle, "bus-stop").slice(0, 2)).toEqual([
      ["Hazel Mead", 0.128],
      ["Hazel Mead", 0.128],
    ]);
    const evCat = category(bundle, "ev-chargers");
    expect(evCat.places[0].name).toBe("Wilsons of Epsom Nissan");
    expect(evCat.places[0].miles).toBe(0.579);
    expect(Math.abs(evCat.places[0].miles - 0.58)).toBeLessThanOrEqual(0.005);
    // Three distinct Wilsons sites file; a name never merges them.
    expect(evCat.places.map((p) => p.miles)).toEqual([0.579, 0.622, 0.668]);
    expect(top(bundle, "supermarket")[0]).toEqual(["Sainsbury's", 0.51]);
    expect(top(bundle, "food-and-drink")[0]).toEqual(["The Famous Green Man", 0.236]);
    expect(top(bundle, "libraries")[0]).toEqual(["Bourne Hall", 0.463]);
    expect(top(bundle, "vets")).toEqual([
      ["Goddard Veterinary Group", 0.929],
      ["The Bridge Veterinary Surgery", 1.452],
    ]);
    expect(top(bundle, "parks")[0]).toEqual(["Gibraltar Recreation Ground", 0.493]);
    expect(category(bundle, "pet-boarding").state).toBe("empty-map");
  });

  it("serves the nurseries category from filed rows, stopping at 2 miles (synthetic rows)", async () => {
    const bundle = await bundleFor("KT17 1FH");
    const nurseries = category(bundle, "nurseries");
    // Synthetic behaviour rows only (see the fixture note): the
    // two inside the radius list in distance order, the one at
    // ~2.5 miles does not appear and is never named as a
    // beyond-radius nearest — nurseries stop at 2 miles.
    expect(nurseries.places.map((p) => p.name)).toEqual([
      "Little Acorns Day Nursery (synthetic)",
      "Tiny Steps Nursery (synthetic)",
    ]);
    expect(nurseries.places[0].miles).toBeCloseTo(0.5, 1);
    expect(nurseries.places[1].miles).toBeCloseTo(1.2, 1);
    expect(nurseries.beyondNearest).toBeNull();
    const birkdale = await bundleFor("CM3 2JT");
    const none = category(birkdale, "nurseries");
    expect(none.state).toBe("empty");
    expect(none.line).toContain("no nursery within 2 miles");
  });
});

// --- Hilgay (CB6 1EH, rung 2) --------------------------------------

describe("nearby bundle — Hilgay, CB6 1EH", () => {
  it("names Littleport station beyond the radius at the locked 3.208", async () => {
    const bundle = await bundleFor("CB6 1EH");
    const station = category(bundle, "station");
    expect(station.state).toBe("none-within");
    expect(station.beyondNearest).toEqual({ name: "Littleport Rail Station", miles: 3.208 });
    expect(station.line).toContain("nearest is Littleport Rail Station, 3.208 miles away");
  });

  it("serves the grid-only bus pair at 0.044 and counts 7 stops within 2 miles", async () => {
    const bundle = await bundleFor("CB6 1EH");
    expect(top(bundle, "bus-stop").slice(0, 2)).toEqual([
      ["Railway Cottages", 0.044],
      ["Railway Cottages", 0.044],
    ]);
    expect(category(bundle, "bus-stop").countWithin).toBe(7);
  });

  it("names the nearest EV site beyond the radius, and no school is within it", async () => {
    const bundle = await bundleFor("CB6 1EH");
    const evCat = category(bundle, "ev-chargers");
    expect(evCat.state).toBe("none-within");
    expect(evCat.beyondNearest?.name).toBe("The Coach House At Lodge Farm");
    expect(Math.abs((evCat.beyondNearest?.miles ?? 0) - 3.538)).toBeLessThanOrEqual(0.005);
    // The GIAS fixture cut holds no Hilgay-area schools at all;
    // both school answers take the beyond-radius path here. The
    // real nearest schools are fixed in the golden matrix from
    // the nationally-filed M6.2 rehearsal — the gap the prep
    // flagged, closed by assertion there.
    for (const key of ["schools-primary", "schools-secondary"]) {
      const c = category(bundle, key);
      expect(c.state).toBe("none-within");
      expect(c.places).toEqual([]);
      expect(c.beyondNearest).not.toBeNull();
    }
    // Two Greenspace centres file within 2 miles, neither named:
    // the parks line says so rather than inventing a name.
    const parks = category(bundle, "parks");
    expect(parks.countWithin).toBe(2);
    expect(parks.places).toEqual([]);
    expect(parks.line).toContain("no named greenspace site within 2 miles");
  });
});

// --- the ladder rungs ----------------------------------------------

describe("nearby bundle — ladder rungs (M6.2)", () => {
  it("measures rung 1 and rung 2 from the same postcode point", async () => {
    const rung1 = await bundleFor("19 Birkdale Rise, CM3 2JT");
    const rung2 = await bundleFor("Birkdale Rise, CM3 2JT");
    expect(rung1.rung).toBe(1);
    expect(rung2.rung).toBe(2);
    expect(top(rung2, "station")).toEqual(top(rung1, "station"));
    if (rung2.kind !== "distances") throw new Error("expected distances");
    expect(rung2.postcode).toBe("CM3 2JT");
  });

  it("returns NO distance payload at rung 3 — the named state only", async () => {
    const resolution = await resolveAddressInput("CM3", addressSource);
    expect(resolution.rung).toBe(3);
    const bundle = await buildNearbyBundle(resolution, fakeSource);
    expect(bundle).toEqual({
      rung: 3,
      kind: "wider-area",
      distances: { state: "unavailable", reason: "distances need an exact postcode" },
    });
    // Structural honesty, mirroring M6.1: nothing in the bundle
    // can be read as a distance answer for a wider area.
    const serialised = JSON.stringify(bundle);
    expect(serialised).not.toContain("categories");
    expect(serialised).not.toContain("Hatfield Peverel");
    expect(serialised).not.toContain("miles");
  });

  it("returns the no-location state at rung 4", async () => {
    const resolution = await resolveAddressInput("Birkdale Rise, Hatfield Peverel", addressSource);
    expect(resolution.rung).toBe(4);
    const bundle = await buildNearbyBundle(resolution, fakeSource);
    expect(bundle).toEqual({
      rung: 4,
      kind: "no-location",
      distances: { state: "unavailable", reason: "distances need an exact postcode" },
    });
  });
});
