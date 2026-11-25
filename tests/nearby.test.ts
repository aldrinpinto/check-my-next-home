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
  RADIUS_MILES,
  SCHOOL_DEADLINES_ENGLAND_LINE,
  SCHOOL_DEADLINE_PRIMARY,
  SCHOOL_DEADLINE_SECONDARY,
  buildNearbyBundle,
  haversineMiles,
  normaliseCommaSpacing,
  type CqcRating,
  type DestinationRowFact,
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
  urn: string;
  name: string;
  phase: string | null;
  // The register's type and sixth-form flag as filed
  // (M6.33): the sixth-forms selection and the secondary
  // marker are written out against these below, mirroring
  // the brain's SQL clause for clause.
  type: string | null;
  sixthFormFlag: string | null;
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
      urn: (row["URN"] ?? "").trim(),
      name: (row["EstablishmentName"] ?? "").trim(),
      phase: blank(row["PhaseOfEducation (name)"]),
      type: blank(row["TypeOfEstablishment (name)"]),
      sixthFormFlag: blank(row["OfficialSixthForm (name)"]),
      admissionsPolicy: blank(row["AdmissionsPolicy (name)"]),
      latitude: lat,
      longitude: lng,
    });
  }
  return rows;
})();

// --- destinations rows (mirror of
// loaders/load-school-destinations.mjs) -------------------
//
// The filed destinations, re-derived from the loader's own
// fixture cut with its rules written out: headline rows
// only (Total breakdown, Percentage; KS5 also the Total
// cohort level), the newest cohort, consortium groups
// resolved to their combined row (identical figures, or
// the row whose cohort is the sum of the others'), "c" as
// the suppressed state, "low" as a flagged null share.
const destinationFacts = (() => {
  type Share = { value: number | null; low: boolean };
  const share = (cell: string): Share | "c" => {
    const v = (cell ?? "").trim();
    if (v === "c") return "c";
    if (v === "low") return { value: null, low: true };
    return { value: Number(v), low: false };
  };
  const FIELDS: Record<"ks4" | "ks5", [string, string][]> = {
    ks4: [
      ["overall", "overall"],
      ["education", "education"],
      ["appren", "apprenticeships"],
      ["all_work", "employment"],
    ],
    ks5: [
      ["overall", "overall"],
      ["education", "education"],
      ["he", "higherEducation"],
      ["appren", "apprenticeships"],
      ["all_work", "employment"],
    ],
  };
  const byUrn = new Map<
    string,
    { ks4: DestinationRowFact | null; ks5: DestinationRowFact | null }
  >();
  for (const stage of ["ks4", "ks5"] as const) {
    const text = readFileSync(
      join(process.cwd(), `tests/fixtures/school-destinations/${stage}.csv`),
      "utf8",
    );
    const rows = parseCsv(text).filter(
      (r) =>
        r.breakdown_topic === "Total" &&
        r.breakdown === "Total" &&
        r.data_type === "Percentage" &&
        (stage === "ks4" || (r.cohort_level_group === "Total" && r.cohort_level === "Total")),
    );
    const newest = rows
      .map((r) => r.time_period)
      .sort()
      .at(-1);
    const groups = new Map<string, Record<string, string>[]>();
    for (const r of rows) {
      if (r.time_period !== newest) continue;
      const list = groups.get(r.school_urn) ?? [];
      list.push(r);
      groups.set(r.school_urn, list);
    }
    for (const [urn, group] of groups) {
      let row = group[0];
      if (group.length > 1) {
        const signature = (r: Record<string, string>) =>
          JSON.stringify([r.cohort_count, ...FIELDS[stage].map(([c]) => r[c])]);
        if (!group.every((r) => signature(r) === signature(group[0]))) {
          row =
            group.find(
              (r) =>
                Number(r.cohort_count) ===
                group.reduce((sum, o) => (o === r ? sum : sum + Number(o.cohort_count)), 0),
            ) ?? group[0];
        }
      }
      const cells = new Map(FIELDS[stage].map(([col, field]) => [field, share(row[col])]));
      const suppressed = [...cells.values()].every((c) => c === "c");
      const blank: Share = { value: null, low: false };
      const pick = (field: string): Share => {
        const cell = cells.get(field);
        return suppressed || cell === undefined || cell === "c" ? blank : cell;
      };
      const fact: DestinationRowFact = {
        cohortYear: "2023/24",
        version: (row.version ?? "").trim(),
        cohortCount: Number(row.cohort_count),
        state: suppressed ? "suppressed" : "served",
        overall: pick("overall"),
        education: pick("education"),
        higherEducation: pick("higherEducation"),
        apprenticeships: pick("apprenticeships"),
        employment: pick("employment"),
      };
      const entry = byUrn.get(urn) ?? { ks4: null, ks5: null };
      entry[stage] = fact;
      byUrn.set(urn, entry);
    }
  }
  return byUrn;
})();
// The fixture filing's release facts: 75 rows filed from
// the cut (36 KS4 + 39 KS5), cohort 2023/24, published
// 15 October 2026 (the fixture README records the cut).
const destinationsReleaseFacts = {
  filedCount: [...destinationFacts.values()].reduce(
    (n, e) => n + (e.ks4 ? 1 : 0) + (e.ks5 ? 1 : 0),
    0,
  ),
  ks4: { cohortYear: "2023/24", sourceDate: "2026-10-15" },
  ks5: { cohortYear: "2023/24", sourceDate: "2026-10-15" },
};

// --- health rows (the loader's own filing, dumped — see
// tests/fixtures/nearby/README.md) -------------------------------

// The filed CQC ratings, captured from the same loader
// filing as the points (see tests/fixtures/nearby/
// README.md): one row per rated point, keyed by the
// point's ODS code — the portable form of the loader's
// filed health_point_id link. A point with no row here
// files no rating: the fake's LEFT JOIN, mirroring the
// brain's real source.
const healthRatings = new Map<string, CqcRating>(
  (
    JSON.parse(
      readFileSync(join(process.cwd(), "tests/fixtures/nearby/health-ratings.json"), "utf8"),
    ) as {
      ods_code: string;
      rating: string;
      rating_date: string | null;
    }[]
  ).map((r) => [r.ods_code, { rating: r.rating, date: r.rating_date }]),
);

type HealthRow = {
  name: string;
  odsCode: string;
  serviceType: string;
  emergency: boolean | null;
  populationGroups: string[];
  // The point's filed overall CQC rating, or null where
  // the loader filed none (M6.25).
  cqcRating: CqcRating | null;
  latitude: number;
  longitude: number;
};
const healthRows: HealthRow[] = (
  JSON.parse(
    readFileSync(join(process.cwd(), "tests/fixtures/nearby/health-points.json"), "utf8"),
  ) as {
    name: string;
    ods_code: string;
    service_type: string;
    has_emergency_department: boolean | null;
    cqc_population_groups: string | null;
    latitude: string;
    longitude: string;
  }[]
).map((r) => ({
  name: r.name,
  odsCode: r.ods_code,
  serviceType: r.service_type,
  emergency: r.has_emergency_department,
  populationGroups: r.cqc_population_groups ? r.cqc_population_groups.split("|") : [],
  cqcRating: healthRatings.get(r.ods_code) ?? null,
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
      // The brain's CASE over the filed flag, written out
      // (M6.33, D64 ruling 7): true/false on the flag's
      // own two values, null on anything else filed.
      sixthForm:
        s.sixthFormFlag === "Has a sixth form"
          ? true
          : s.sixthFormFlag === "Does not have a sixth form"
            ? false
            : null,
      // The URN and the filed destinations rows the
      // loader's joins yield (M6.34): both stages' facts
      // ride the point; the brain composes the served
      // block and gates the KS5 stage on the marker.
      urn: s.urn,
      destinations: destinationFacts.get(s.urn) ?? { ks4: null, ks5: null },
    })),
  // Sixth forms and colleges (M6.33, D51/D64): the brain's
  // selection written out — the phase clause (every
  // "16 plus" row) or the flag clause (flagged, any phase
  // except Secondary), minus the D64 type exclusions.
  "sixth-forms": schoolRows
    .filter(
      (s) =>
        (s.phase === "16 plus" ||
          (s.sixthFormFlag === "Has a sixth form" && s.phase !== "Secondary")) &&
        !/special/i.test(s.type ?? "") &&
        !/independent/i.test(s.type ?? "") &&
        s.type !== "British schools overseas" &&
        s.type !== "Welsh establishment",
    )
    .map((s) => ({
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      detail: s.type,
    })),
  nurseries: nurseryRows,
  gp: healthRows
    .filter((h) => h.serviceType === "gp_practice" || h.serviceType === "gp_branch_surgery")
    .map((h) => ({
      name: h.name,
      latitude: h.latitude,
      longitude: h.longitude,
      cqcRating: h.cqcRating,
    })),
  dentist: healthRows
    .filter((h) => h.serviceType === "dentist")
    .map((h) => ({ name: h.name, latitude: h.latitude, longitude: h.longitude })),
  pharmacy: healthRows
    .filter((h) => h.serviceType === "pharmacy")
    .map((h) => ({ name: h.name, latitude: h.latitude, longitude: h.longitude })),
  ae: healthRows
    .filter((h) => h.serviceType === "hospital" && h.emergency === true)
    .map((h) => ({
      name: h.name,
      latitude: h.latitude,
      longitude: h.longitude,
      cqcRating: h.cqcRating,
    })),
  maternity: healthRows
    .filter((h) => h.serviceType === "hospital" && h.populationGroups.includes("Maternity"))
    .map((h) => ({
      name: h.name,
      latitude: h.latitude,
      longitude: h.longitude,
      cqcRating: h.cqcRating,
    })),
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

// The sixth-forms beyond pool (M6.33, D64 ruling 4): the
// within selection UNION the flagged secondaries, under
// the same type exclusions — the mirror of the brain's
// CATEGORY_NEAREST_SQL.
const SIXTH_FORMS_BEYOND: NearbyPoint[] = schoolRows
  .filter(
    (s) =>
      (s.phase === "16 plus" || s.sixthFormFlag === "Has a sixth form") &&
      !/special/i.test(s.type ?? "") &&
      !/independent/i.test(s.type ?? "") &&
      s.type !== "British schools overseas" &&
      s.type !== "Welsh establishment",
  )
  .map((s) => ({
    name: s.name,
    latitude: s.latitude,
    longitude: s.longitude,
    detail: s.type,
  }));

const fakeSource: NearbyDataSource = {
  async pointsWithin(category, latitude, longitude, radiusMiles) {
    return (TABLES[category] ?? []).filter(
      (p) => haversineMiles(latitude, longitude, p.latitude, p.longitude) <= radiusMiles,
    );
  },
  // The fixture filings stand for filed national tables
  // (the M6.9/D30 guard is pinned in the state matrix).
  async filedCount() {
    return 100000;
  },
  async nearestPoint(category, latitude, longitude) {
    // The sixth-forms beyond read mirrors the real source:
    // the wider pool, and only points strictly beyond the
    // radius may be named (a flagged secondary inside it
    // is never the beyond name).
    const pool = category === "sixth-forms" ? SIXTH_FORMS_BEYOND : (TABLES[category] ?? []);
    let best: NearbyPoint | null = null;
    let bestMiles = Infinity;
    for (const p of pool) {
      const d = haversineMiles(latitude, longitude, p.latitude, p.longitude);
      if (category === "sixth-forms" && d <= 5) continue; // BUG-110: beyond pool starts beyond the 5-mile list radius
      if (d < bestMiles) {
        bestMiles = d;
        best = p;
      }
    }
    return best;
  },
  // The Pollution Inventory (M6.32): filed, nothing near
  // these fixture homes — the block rides along in its
  // none state and no assertion in this suite reads it
  // (the industrial-sites suite owns the block).
  async industrialSiteFacts() {
    return {
      filedCount: 2856,
      dataYear: 2024,
      sourceName: "Environment Agency Pollution Inventory",
      sourceDate: "2025-11-20",
      sites: [],
    };
  },
  // The destinations release (M6.34): the fixture
  // filing's facts, derived from the loader's cut above.
  async destinationsRelease() {
    return destinationsReleaseFacts;
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
        // The general list carries three; EV chargers
        // carry their own five (BUG-123).
        expect(c.places.length).toBeLessThanOrEqual(c.category === "ev-chargers" ? 5 : 3);
        const miles = c.places.map((p) => p.miles);
        expect(miles).toEqual([...miles].sort((a, b) => a - b));
        for (const p of c.places) expect(p.name).not.toBeNull();
      }
    }
  });

  it("serves the twenty-two categories in the documented order", async () => {
    const bundle = await bundleFor("CM3 2JT");
    if (bundle.kind !== "distances") throw new Error("expected distances");
    expect(bundle.categories.map((c) => c.category)).toEqual([
      "schools-primary",
      "schools-secondary",
      "sixth-forms",
      "nurseries",
      "gp",
      "dentist",
      "pharmacy",
      "ae",
      "maternity",
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
    expect(ae.beyondNearest).toEqual({
      name: "Broomfield Hospital",
      miles: 5.89,
      latitude: 51.774662,
      longitude: 0.466021,
    });
    expect(ae.line).toBe("none within 2 miles — nearest is Broomfield Hospital, 5.89 miles away");
  });

  it("names Broomfield as the nearest maternity unit beyond the radius, in the same words (M6.24)", async () => {
    const bundle = await bundleFor("CM3 2JT");
    const maternity = category(bundle, "maternity");
    expect(maternity.label).toBe("maternity units");
    expect(maternity.state).toBe("none-within");
    expect(maternity.places).toEqual([]);
    expect(maternity.countWithin).toBe(0);
    expect(maternity.beyondNearest).toEqual({
      name: "Broomfield Hospital",
      miles: 5.89,
      latitude: 51.774662,
      longitude: 0.466021,
    });
    expect(maternity.line).toBe(
      "none within 2 miles — nearest is Broomfield Hospital, 5.89 miles away",
    );
  });

  it("serves the Witham Leisure Centre EV site with its membership class showing", async () => {
    const bundle = await bundleFor("CM3 2JT");
    const evCat = category(bundle, "ev-chargers");
    // Chargers list across five miles in the second
    // pass (BUG-093): four file within the field, and
    // the list now carries all four — EV chargers list
    // their nearest five (BUG-123).
    expect(evCat.countWithin).toBe(4);
    expect(evCat.places).toHaveLength(4);
    expect(evCat.places[0].name).toBe("Witham Leisure Centre");
    expect(evCat.places[0].detail).toBe("Public - Membership Required");
    expect(evCat.places[1].name).toBe("Car Park, Newlands Drive");
    expect(evCat.places[1].miles).toBe(2.202);
    expect(evCat.places[2].name).toBe("Witham station Car Park");
    expect(evCat.places[2].miles).toBe(2.599);
    // The lock is 1.864 — the product's ONE basis (D22):
    // haversine, earth radius 3,956, the M5.2/M5.5 basis. The
    // EV loader originally fixed this figure at 1.866 on its
    // own haversine (radius 3,959), a filing-layer artefact;
    // the founder ruled on 14 Nov 2026 that the locks be
    // re-stated on the single basis. The difference is the
    // radius alone (the same filed point measures 1.8656 at
    // radius 3,959 — the M6.2 rehearsal proves both), never
    // more than ~0.003 mi on any EV figure.
    expect(evCat.places[0].miles).toBe(1.864);
    expect(Math.abs(evCat.places[0].miles - 1.864)).toBeLessThanOrEqual(0.005);
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
    // Re-pinned (BUG-109): the secondary list radius is
    // five miles, so the two further secondaries serve.
    expect(top(bundle, "schools-secondary")).toEqual([
      ["Lift Maltings", 1.884],
      ["Lift New Rickstones", 3.212],
      ["Plume School", 4.488],
    ]);
    expect(category(bundle, "schools-secondary").nearestSelective).toBeNull();
    expect(top(bundle, "supermarket")).toEqual([
      ["The Co-operative Food", 0.258],
      ["ALDI", 1.14],
      ["Lidl", 1.941],
    ]);
    // BUG-344(e): the OSM name tag spells it "Tandori";
    // the business's own spelling is "Tandoori" (its own
    // site hatfieldtandoorionline.com, and the Food Hygiene
    // Ratings entry for the same address), and the loader
    // files the correction.
    expect(top(bundle, "food-and-drink")).toEqual([
      ["Hatfield Tandoori", 0.109],
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
    // Pet boarding always serves its two nearest
    // (BUG-079), however far the second stands.
    // BUG-239: the name is filed corrected — the OSM
    // name tag carries a stray "l" ("Kennelsl"), and
    // the loader files the business's own name.
    expect(top(bundle, "pet-boarding")).toEqual([
      ["Latneys Boarding Kennels and Cattery", 0.77],
      ["Ponyo’s House", 31.304],
    ]);
  });

  it("says in words that the map holds no places to visit near Birkdale — the honestly-empty state", async () => {
    const bundle = await bundleFor("CM3 2JT");
    const c = category(bundle, "places-to-visit");
    expect(c.state).toBe("empty-map");
    expect(c.places).toEqual([]);
    expect(c.countWithin).toBe(0);
    expect(c.line).toContain("a gap in the map is not proof that none exists");
    // The pet categories no longer take the empty
    // state: each serves its two nearest regardless of
    // distance (BUG-079) — in this fixture world the
    // nearest filed vets and pet shops stand far away.
    expect(top(bundle, "vets")).toEqual([
      ["Goddard Vets Plaistow", 29.708],
      ["Medivet", 30.378],
    ]);
    expect(top(bundle, "pet-shops")).toEqual([
      ["Manor Aquatics Centre", 28.54],
      ["Pets at Home", 28.878],
    ]);
    expect(category(bundle, "vets").countWithin).toBe(0);
    expect(category(bundle, "pet-shops").countWithin).toBe(0);
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
    // M6.24: the same hospital is the home's maternity unit —
    // Newham's ratings rows carry the Maternity group, and it
    // is the only maternity unit within the radius.
    expect(top(bundle, "maternity")).toEqual([["Newham University Hospital", 0.782]]);
    expect(category(bundle, "maternity").countWithin).toBe(1);
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

  it("serves schools: 17 secondaries within 5 miles (BUG-109), none selective among them; the grammar search finds Bexley Grammar beyond the radius", async () => {
    const bundle = await bundleFor("E16 1GN");
    expect(top(bundle, "schools-secondary")).toEqual([
      ["Rokeby School", 0.333],
      ["Royal Docks Academy", 0.66],
      ["Cumberland Community School", 0.696],
    ]);
    expect(category(bundle, "schools-secondary").countWithin).toBe(17);
    // Re-pinned (parity fix batch, item 12): the grammar
    // fact now searches the wider grammar radius (10 mi)
    // when no selective school is within the list — the
    // fixture corpus holds Bexley Grammar School 5.484 mi
    // away, so the fact serves where it previously read
    // null under the 2-mile-only search. None of the 13
    // within-radius secondaries is selective (the count
    // and list above are unchanged).
    expect(category(bundle, "schools-secondary").nearestSelective).toEqual({
      name: "Bexley Grammar School",
      miles: 5.484,
    });
    expect(category(bundle, "schools-secondary").nearestSelectiveLine).toContain(
      "Bexley Grammar School",
    );
    // The GIAS fixture cut holds no primary near E16 (it was cut
    // around the secondaries), so the primary answer exercises
    // the beyond-radius path here; the national figure is fixed
    // in the golden matrix from the M6.2 rehearsal.
    const primary = category(bundle, "schools-primary");
    expect(primary.state).toBe("none-within");
    expect(primary.beyondNearest).toEqual({
      name: "Cheam Fields Primary Academy",
      miles: 14.671,
      latitude: 51.364813450683094,
      longitude: -0.21960787959021302,
    });
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
    // M6.24: Epsom General is also the home's maternity unit
    // (its ratings rows carry the Maternity group); St Helier,
    // the fixture's other nearby maternity hospital, sits
    // beyond the radius.
    expect(top(bundle, "maternity")).toEqual([["Epsom General Hospital", 1.732]]);
    expect(category(bundle, "maternity").countWithin).toBe(1);
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
    // The list carries the nearest five chargers (BUG-123):
    // the three Wilsons sites, then the next two in reach.
    expect(evCat.places.map((p) => p.miles)).toEqual([0.579, 0.622, 0.668, 0.672, 0.955]);
    expect(top(bundle, "supermarket")[0]).toEqual(["Sainsbury's", 0.51]);
    expect(top(bundle, "food-and-drink")[0]).toEqual(["The Famous Green Man", 0.236]);
    expect(top(bundle, "libraries")[0]).toEqual(["Bourne Hall", 0.463]);
    expect(top(bundle, "vets")).toEqual([
      ["Goddard Veterinary Group", 0.929],
      ["The Bridge Veterinary Surgery", 1.452],
    ]);
    expect(top(bundle, "parks")[0]).toEqual(["Gibraltar Recreation Ground", 0.493]);
    // Pet boarding serves its two nearest even here
    // (BUG-079): two filed points of the same practice.
    expect(category(bundle, "pet-boarding").state).toBe("within");
    expect(top(bundle, "pet-boarding")).toEqual([
      ["Tailwaggers East", 15.938],
      ["Tailwaggers East", 15.938],
    ]);
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

// --- CQC ratings on health rows (M6.25) ----------------------
// The ratings are the loader's filed rows (cqc_ratings,
// filed since M4.7), joined on the loader's own filed
// link. The goldens below are the filed values for the
// golden homes' served places, read off the fixture
// capture the fake files — never re-derived here.

describe("nearby CQC ratings (M6.25)", () => {
  const ratingsOf = (bundle: NearbyBundle, key: string) =>
    category(bundle, key).places.map((p) => [p.name, p.cqcRating]);

  it("the fixture capture is the loader's filed join: every rating resolves to a filed point, on rated types only", () => {
    // 499 ratings filed from the fixture corpus: 494 on GP
    // practice points, 5 on hospital points — none on a
    // branch surgery, a dentist or a pharmacy (no ratings
    // file for them), and every one keyed to a point the
    // same filing holds.
    expect(healthRatings.size).toBe(499);
    const byCode = new Map(healthRows.map((h) => [h.odsCode, h]));
    for (const code of healthRatings.keys()) {
      const point = byCode.get(code);
      if (!point) throw new Error(`rating filed for unknown point ${code}`);
      expect(["gp_practice", "hospital"]).toContain(point.serviceType);
    }
  });

  it("Birkdale: the branch serves unrated, Douglas Grove carries its filed Good", async () => {
    const bundle = await bundleFor("CM3 2JT");
    expect(ratingsOf(bundle, "gp")).toEqual([
      // The Sidney House branch files no rating — branches
      // are never the rated location.
      ["SYDNEY HOUSE SURGERY", null],
      ["DOUGLAS GROVE SURGERY", { rating: "Good", date: "2026-07-17" }],
    ]);
    // A&E and maternity serve no places here (Broomfield
    // is the beyond-radius nearest for both) — the beyond
    // pointer carries name and miles only, as it does for
    // every filed fact.
    expect(category(bundle, "ae").places).toEqual([]);
    expect(category(bundle, "maternity").places).toEqual([]);
  });

  it("Exeter: Newham carries Requires improvement on both its rows; the GP list mixes rated and unrated as filed", async () => {
    const bundle = await bundleFor("E16 1GN");
    expect(ratingsOf(bundle, "ae")).toEqual([
      ["Newham University Hospital", { rating: "Requires improvement", date: "2026-07-17" }],
    ]);
    // The maternity row carries the location's OVERALL
    // rating — the same filed row, never a
    // maternity-specific rating.
    expect(ratingsOf(bundle, "maternity")).toEqual([
      ["Newham University Hospital", { rating: "Requires improvement", date: "2026-07-17" }],
    ]);
    expect(ratingsOf(bundle, "gp")).toEqual([
      ["CUSTOM HOUSE SURGERY", { rating: "Good", date: "2026-06-01" }],
      // Cumberland files no rating row: the null absence,
      // never a neighbour's rating borrowed.
      ["CUMBERLAND MEDICAL CENTRE", null],
      ["CARPENTERS PRACTICE - ST LUKE'S PRACTICE SITE", null],
    ]);
  });

  it("Minerva: Epsom General carries Good on both its rows; the tied GP pair splits as filed", async () => {
    const bundle = await bundleFor("KT17 1FH");
    expect(ratingsOf(bundle, "ae")).toEqual([
      ["Epsom General Hospital", { rating: "Good", date: "2026-06-11" }],
    ]);
    expect(ratingsOf(bundle, "maternity")).toEqual([
      ["Epsom General Hospital", { rating: "Good", date: "2026-06-11" }],
    ]);
    expect(ratingsOf(bundle, "gp").slice(0, 2)).toEqual([
      ["FOUNTAIN PRACTICE", null],
      ["SPRING STREET SURGERY", { rating: "Good", date: "2020-08-20" }],
    ]);
  });

  it("every health place carries the key; dentists and pharmacies never do", async () => {
    for (const input of ["CM3 2JT", "E16 1GN", "KT17 1FH"]) {
      const bundle = await bundleFor(input);
      for (const key of ["gp", "ae", "maternity"])
        for (const place of category(bundle, key).places)
          expect("cqcRating" in place, `${input} ${key} ${place.name}`).toBe(true);
      for (const key of ["dentist", "pharmacy"])
        for (const place of category(bundle, key).places)
          expect("cqcRating" in place, `${input} ${key} ${place.name}`).toBe(false);
    }
  });
});

// --- Hilgay (CB6 1EH, rung 2) --------------------------------------

describe("nearby bundle — Hilgay, CB6 1EH", () => {
  it("names Littleport station beyond the radius at the locked 3.208", async () => {
    const bundle = await bundleFor("CB6 1EH");
    const station = category(bundle, "station");
    expect(station.state).toBe("none-within");
    expect(station.beyondNearest).toEqual({
      name: "Littleport Rail Station",
      miles: 3.208,
      latitude: 52.46238052394,
      longitude: 0.31655932377,
    });
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

  it("serves the EV site inside the widened charger field, and no school is within the radius", async () => {
    const bundle = await bundleFor("CB6 1EH");
    const evCat = category(bundle, "ev-chargers");
    // The charger field is five miles in the second
    // pass (BUG-093): the site at 3.535 miles, beyond
    // the old two-mile radius, now serves in the list
    // and no beyond-nearest stands.
    expect(evCat.state).toBe("within");
    expect(evCat.places[0].name).toBe("The Coach House At Lodge Farm");
    expect(Math.abs((evCat.places[0].miles ?? 0) - 3.535)).toBeLessThanOrEqual(0.005);
    expect(evCat.beyondNearest).toBeNull();
    // The GIAS fixture cut holds no Hilgay-area schools at all;
    // both school answers take the beyond-radius path here. The
    // real nearest schools are fixed in the golden matrix from
    // the nationally-filed M6.2 rehearsal — the gap the prep
    // flagged, closed by assertion there.
    // Re-pinned (BUG-106 distance sanity): the fixture's
    // nearest filed schools stand beyond the 25-mile
    // sanity bound, so neither school answer names one —
    // the honest absence line serves instead.
    for (const key of ["schools-primary", "schools-secondary"]) {
      const c = category(bundle, key);
      expect(c.state).toBe("none-within");
      expect(c.places).toEqual([]);
      expect(c.beyondNearest).toBeNull();
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

describe("nearby bundle — school application deadlines (M6.22, D42)", () => {
  it("the pinned constants are the School Admissions Code's national closing dates", () => {
    expect(SCHOOL_DEADLINE_SECONDARY).toBe("31 October");
    expect(SCHOOL_DEADLINE_PRIMARY).toBe("15 January");
    expect(SCHOOL_DEADLINES_ENGLAND_LINE).toBe(
      "School application deadlines in England: 31 October for secondary places and 15 January for primary places — the national closing dates set in the School Admissions Code, for a place the following September. Some schools also ask for a supplementary form, which can have its own deadline.",
    );
  });

  it("an England home serves the one national line, at both rungs", async () => {
    const rung1 = await bundleFor("19 Birkdale Rise, CM3 2JT");
    if (rung1.kind !== "distances") throw new Error("expected distances");
    expect(rung1.schoolDeadlines).toEqual({
      state: "england",
      line: SCHOOL_DEADLINES_ENGLAND_LINE,
    });
    const rung2 = await bundleFor("Birkdale Rise, CM3 2JT");
    if (rung2.kind !== "distances") throw new Error("expected distances");
    expect(rung2.schoolDeadlines).toEqual(rung1.schoolDeadlines);
  });

  it("a postcode whose filed area code does not place it serves nothing — never the English dates by default", async () => {
    // The Hilgay fixture directory carries no LSOA code:
    // the nation cannot be read, so no line serves (the
    // failure direction is always away from serving).
    const bundle = await bundleFor("CB6 1EH");
    if (bundle.kind !== "distances") throw new Error("expected distances");
    expect(bundle.schoolDeadlines).toBeNull();
  });
});

// --- sixth forms (M6.33, decisions D51 and D64) ----------------------
// The fixture-basis outcomes, computed from the same filed
// fixture rows the mirror above files (the national outcomes
// are the prep's measured goldens, recorded in
// docs/backend-m6.33.md).

describe("nearby bundle — sixth forms (M6.33, D51/D64)", () => {
  it("Minerva: the category serves NESCOT alone — an FE college whose flag files 'Not applicable', entering on the phase clause alone", async () => {
    const bundle = await bundleFor("KT17 1FH");
    const cat = category(bundle, "sixth-forms");
    expect(cat.label).toBe("sixth forms and colleges");
    expect(cat.state).toBe("within");
    expect(cat.countWithin).toBe(1);
    expect(cat.places).toEqual([
      {
        name: "North East Surrey College of Technology",
        miles: 0.174,
        detail: "Further education",
        latitude: 51.342566348710996,
        longitude: -0.2446780801513962,
      },
    ]);
    // No marker, no rating: the category's places serve
    // name, type as filed, distance — nothing else.
    expect(cat.places[0]).not.toHaveProperty("sixthForm");
    expect(cat.places[0]).not.toHaveProperty("cqcRating");
    expect(cat.places[0]).not.toHaveProperty("selective");
  });

  it("Minerva: every served secondary carries the marker, true where the flag files 'Has a sixth form'", async () => {
    const bundle = await bundleFor("KT17 1FH");
    const secondary = category(bundle, "schools-secondary");
    expect(secondary.places.map((p) => [p.name, p.sixthForm])).toEqual([
      ["Glyn School", true],
      ["Blenheim High School", true],
      ["Nonsuch High School for Girls", true],
    ]);
    // The primary list carries no marker — the field is
    // the secondary category's own.
    for (const place of category(bundle, "schools-primary").places)
      expect(place).not.toHaveProperty("sixthForm");
  });

  it("Exeter: the served secondaries carry the marker false, and the category names its beyond from the flagged-secondary pool", async () => {
    const bundle = await bundleFor("6 Exeter Road, E16 1GN");
    const secondary = category(bundle, "schools-secondary");
    expect(secondary.places.map((p) => [p.name, p.sixthForm])).toEqual([
      ["Rokeby School", false],
      ["Royal Docks Academy", false],
      ["Cumberland Community School", false],
    ]);
    // The fixture cut holds no within-selection row near
    // Exeter (the national three — East London Arts &
    // Music, New City College, Oasis School 21 — are the
    // prep's live-extract goldens), so the category takes
    // the beyond path and names a flagged secondary under
    // ruling 4.
    const cat = category(bundle, "sixth-forms");
    expect(cat.state).toBe("none-within");
    expect(cat.places).toEqual([]);
    expect(cat.countWithin).toBe(0);
    expect(cat.beyondNearest).toEqual({
      name: "Bexley Grammar School",
      miles: 5.484,
      latitude: 51.45649902018651,
      longitude: 0.10705184745984281,
    });
    // Re-pinned (BUG-110): the sixth-forms radius is
    // five miles, so the beyond line names five.
    expect(cat.line).toBe(
      "none within 5 miles — nearest is Bexley Grammar School, 5.484 miles away",
    );
  });

  it("Birkdale: the category's beyond name is the flagged secondary, not a within-selection row", async () => {
    const bundle = await bundleFor("19 Birkdale Rise, CM3 2JT");
    const secondary = category(bundle, "schools-secondary");
    // Re-pinned (BUG-109): the secondary list serves to
    // five miles, so three secondaries stand.
    expect(secondary.places.map((p) => [p.name, p.sixthForm])).toEqual([
      ["Lift Maltings", false],
      ["Lift New Rickstones", true],
      ["Plume School", true],
    ]);
    const cat = category(bundle, "sixth-forms");
    // Re-pinned (BUG-110): the sixth-forms list radius
    // is five miles and the beyond pool starts beyond
    // it — the flagged secondaries at 3.2 and 4.5 miles
    // are inside the radius now (they serve in the
    // secondary list, and the within selection never
    // repeats flagged secondaries), so the category
    // takes its honest none-within path at five miles.
    expect(cat.state).toBe("none-within");
    expect(cat.countWithin).toBe(0);
    expect(cat.places).toEqual([]);
  });
});

describe("served detail comma spacing (BUG-246)", () => {
  it("puts a space after a comma that lacks one, in the audit's own cases", () => {
    // The sample report's Section 3 nursery line and its
    // Section 4 hospital lines, as filed: the comma sits
    // inside a single source field, so no join can repair
    // it — the serve layer normalises it instead.
    expect(normaliseCommaSpacing("Waterfront Studios Business Centre,1 Dock Road, London")).toBe(
      "Waterfront Studios Business Centre, 1 Dock Road, London",
    );
    expect(normaliseCommaSpacing("Glen Road,Plaistow,London")).toBe("Glen Road, Plaistow, London");
  });

  it("leaves a correct ', ' and a thousands separator untouched", () => {
    expect(normaliseCommaSpacing("19 Birkdale Rise, Hatfield Peverel, CM3 2JT")).toBe(
      "19 Birkdale Rise, Hatfield Peverel, CM3 2JT",
    );
    expect(normaliseCommaSpacing("1,000 homes within 2 miles")).toBe("1,000 homes within 2 miles");
    expect(normaliseCommaSpacing("No comma here")).toBe("No comma here");
  });

  it("BUG-316: collapses a comma run with an empty segment between the commas", () => {
    // The filed brownfield address for SE16 5EJ: the
    // empty segment is filed noise, never a separator.
    expect(normaliseCommaSpacing("259,Rotherhithe Street,,SE16 5EJ")).toBe(
      "259, Rotherhithe Street, SE16 5EJ",
    );
    expect(normaliseCommaSpacing("High Street, ,London")).toBe("High Street, London");
    expect(normaliseCommaSpacing("1,000, 2,000 homes")).toBe("1,000, 2,000 homes");
  });
});

describe("served-list dedupe (BUG-342)", () => {
  // The audit's sample listed the same place twice. The
  // pipeline serves filed rows verbatim, so a place the
  // filing carries twice (a node and a way, a re-filed
  // row) serves twice — unless the brain collapses it.
  // The dedupe is name + point, and only on the
  // schools, nurseries and health categories: the same
  // normalised name at effectively the same point
  // (within the OSM loader's 30 metres) serves once,
  // nearest first; name alone never dedupes, and unnamed
  // points never dedupe. Bus stops, stations,
  // supermarkets and chargers keep their filed rows
  // verbatim — two directions, two modes, two chargers
  // at one point are real rows, and the locked counts
  // pin that basis.
  const HOME = { lat: 51.776176, lng: 0.60387 };
  const north = (miles: number) => HOME.lat + miles / 69.0;
  type DedupeRow = { name: string | null; lat: number; lng: number };
  const dedupeSource = (rows: DedupeRow[]): NearbyDataSource => ({
    async pointsWithin(category, latitude, longitude, radiusMiles): Promise<NearbyPoint[]> {
      if (category !== "nurseries") return [];
      return rows
        .filter((r) => haversineMiles(latitude, longitude, r.lat, r.lng) <= radiusMiles)
        .map((r) => ({ name: r.name, latitude: r.lat, longitude: r.lng, detail: null }));
    },
    async nearestPoint(): Promise<NearbyPoint | null> {
      return null;
    },
    async filedCount(): Promise<number> {
      return 1000;
    },
    async industrialSiteFacts() {
      return { filedCount: 0, dataYear: null, sourceName: null, sourceDate: null, sites: [] };
    },
    async destinationsRelease() {
      return { filedCount: 0, ks4: null, ks5: null };
    },
  });

  it("serves one filing of a place the source carries twice at the same point", async () => {
    const source = dedupeSource([
      { name: "Twin Nursery", lat: north(0.5), lng: HOME.lng },
      // The twin filing, 10 metres north — inside the
      // 30-metre dedupe radius.
      { name: "Twin Nursery", lat: north(0.5) + 10 / 111320, lng: HOME.lng },
      { name: "Other Nursery", lat: north(0.6), lng: HOME.lng },
    ]);
    const resolution = await resolveAddressInput("19 Birkdale Rise, CM3 2JT", addressSource);
    const bundle = await buildNearbyBundle(resolution, source);
    if (bundle.kind !== "distances") throw new Error("expected distances");
    const nurseries = bundle.categories.find((c) => c.category === "nurseries");
    expect(nurseries?.places.map((p) => p.name)).toEqual(["Twin Nursery", "Other Nursery"]);
    expect(nurseries?.places[0]?.miles).toBe(0.5);
    // The count stands on the deduped filing, so no count
    // line can promise a place the list no longer serves.
    expect(nurseries?.countWithin).toBe(2);
  });

  it("keeps two branches of one name that stand apart — name alone never dedupes", async () => {
    const source = dedupeSource([
      { name: "Twin Nursery", lat: north(0.5), lng: HOME.lng },
      { name: "Twin Nursery", lat: north(1.5), lng: HOME.lng },
    ]);
    const resolution = await resolveAddressInput("19 Birkdale Rise, CM3 2JT", addressSource);
    const bundle = await buildNearbyBundle(resolution, source);
    if (bundle.kind !== "distances") throw new Error("expected distances");
    const nurseries = bundle.categories.find((c) => c.category === "nurseries");
    expect(nurseries?.places.map((p) => p.name)).toEqual(["Twin Nursery", "Twin Nursery"]);
    expect(nurseries?.countWithin).toBe(2);
  });
});
