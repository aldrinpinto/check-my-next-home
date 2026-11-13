import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GROUP_PRIORITY,
  SOURCE_NAME,
  classifyTags,
  dedupePlaces,
  detailFor,
  extractDataDate,
  goldenChecks,
  haversineMiles,
  md5Matches,
  parsePublishedMd5,
  placeName,
  sanityChecks,
} from "../loaders/load-osm-places.mjs";

// Nearby places loader — OpenStreetMap (plan step M5.6),
// tested against the fixture in tests/fixtures/osm-places:
// per-home .osm captures cut from the prep's verified
// Geofabrik extracts (england-261112.osm.pbf, md5
// d2e0ec318af8a4f6139e9de3f7b60fbb against Geofabrik's
// published hash; wales-261112.osm.pbf likewise) by the same
// representative-point rule the prep measured with (node
// position, way node-average centre). The golden figures are
// the prep's verified reads (golden-reads.json). The
// recomputation below re-derives the filed rows from the
// captures with the loader's rules written out again here —
// the transport tests' pattern — so a mapping, priority or
// dedupe regression in the loader shows up as a mismatch
// against the prep's figures, not against the loader itself.

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/osm-places");
const loaderSource = readFileSync(join(process.cwd(), "loaders/load-osm-places.mjs"), "utf8");
const extractSource = readFileSync(join(process.cwd(), "loaders/osm-extract.py"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "db/migrations/0009_osm_points_detail.sql"),
  "utf8",
);
const schemaDoc = readFileSync(join(process.cwd(), "docs/schema.md"), "utf8");

// --- the recomputation --------------------------------------

type Tags = Record<string, string>;
type El = { kind: "node" | "way" | "relation"; id: number; tags: Tags; lat: number; lon: number };

const unesc = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function parseOsm(xml: string): El[] {
  const nodes = new Map<number, { lat: number; lon: number; tags: Tags }>();
  const ways = new Map<number, { refs: number[]; tags: Tags }>();
  const relations = new Map<number, { members: { type: string; ref: number }[]; tags: Tags }>();
  const tagsOf = (body: string): Tags => {
    const tags: Tags = {};
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
  const els: El[] = [];
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

type Row = {
  kind: string;
  osmId: number;
  name: string | null;
  placeType: string;
  detail: string | null;
  lat: number;
  lon: number;
  home: string;
  amenity: string | undefined;
};

const HOMES: Record<string, { lat: number; lon: number }> = {
  birkdale: { lat: 51.776176, lon: 0.60387 },
  exeter: { lat: 51.515224, lon: 0.021177 },
  epsom: { lat: 51.344571, lon: -0.247104 },
  oxford: { lat: 51.751268, lon: -1.264073 },
  hilgay: { lat: 52.507481, lon: 0.33491 },
  cardiff: { lat: 51.467947, lon: -3.192837 },
  cityisland: { lat: 51.511184, lon: 0.005102 },
};

const rawByHome = new Map<string, Row[]>();
const filedByHome = new Map<string, Row[]>();
for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".osm"))) {
  const home = file.replace(/\.osm$/, "");
  const els = parseOsm(readFileSync(join(FIXTURE_DIR, file), "utf8"));
  const raw: Row[] = [];
  for (const el of els) {
    const placeType = classifyTags(el.tags);
    if (placeType === null) continue;
    raw.push({
      kind: el.kind,
      osmId: el.id,
      name: placeName(el.tags),
      placeType,
      detail: detailFor(placeType, el.tags),
      lat: el.lat,
      lon: el.lon,
      home,
      amenity: el.tags.amenity,
    });
  }
  rawByHome.set(home, raw);
  filedByHome.set(home, dedupePlaces(raw).rows);
}
const allFiled = [...filedByHome.values()].flat();
const dist = (home: string, row: { lat: number; lon: number }) =>
  haversineMiles(HOMES[home].lat, HOMES[home].lon, row.lat, row.lon);
const nearestNamed = (home: string, placeType: string) =>
  (filedByHome.get(home) ?? [])
    .filter((r) => r.placeType === placeType && r.name !== null)
    .map((r) => ({ row: r, d: dist(home, r) }))
    .sort((a, b) => a.d - b.d)[0];

// --- the tests ----------------------------------------------

describe("T1 — the md5 oracle and the dated-extract stamp", () => {
  it("parses Geofabrik's published md5 format and compares hashes", () => {
    expect(parsePublishedMd5("d2e0ec318af8a4f6139e9de3f7b60fbb  england-latest.osm.pbf\n")).toBe(
      "d2e0ec318af8a4f6139e9de3f7b60fbb",
    );
    expect(() => parsePublishedMd5("not a hash")).toThrow();
    expect(md5Matches("D2E0EC318AF8A4F6139E9DE3F7B60FBB", "d2e0ec318af8a4f6139e9de3f7b60fbb")).toBe(
      true,
    );
    expect(md5Matches("a".repeat(32), "b".repeat(32))).toBe(false);
  });

  it("derives the data date from the dated filename the -latest name resolves to", () => {
    expect(
      extractDataDate("https://download.geofabrik.de/europe/united-kingdom/england-261112.osm.pbf"),
    ).toBe("2026-11-12");
    expect(() => extractDataDate("https://example.com/england-latest.osm.pbf")).toThrow();
  });

  it("the loader refuses an unverified extract and a short read in its source", () => {
    expect(loaderSource).toContain("refusing to file from an unverified extract");
    expect(loaderSource).toContain("the read does not reconcile");
    expect(loaderSource).toContain("EXTRACT_FLOORS");
  });

  it("the extract cutter rides the C++ filters, not a per-object Python pass (L11)", () => {
    expect(extractSource).toContain("FileProcessor");
    expect(extractSource).toContain("KeyFilter");
    expect(extractSource).toContain("IdFilter");
  });
});

describe("the group mapping, the priority and the recorded detail (rulings 3 and 4; T7, T11)", () => {
  it("assigns exactly one primary group, in the ruled priority order", () => {
    expect(GROUP_PRIORITY).toEqual([
      "visit",
      "worship",
      "leisure",
      "library",
      "food_and_drink",
      "vet",
      "pet_shop",
      "pet_boarding",
      "supermarket",
      "park",
    ]);
    // T11's case: tourism beats the library role.
    expect(classifyTags({ tourism: "attraction", amenity: "library" })).toBe("visit");
    expect(classifyTags({ amenity: "place_of_worship", leisure: "park" })).toBe("worship");
    expect(classifyTags({ amenity: "cafe", leisure: "park" })).toBe("food_and_drink");
    expect(classifyTags({ leisure: "park" })).toBe("park");
    expect(classifyTags({ amenity: "veterinary" })).toBe("vet");
    expect(classifyTags({ shop: "pet" })).toBe("pet_shop");
    expect(classifyTags({ amenity: "animal_boarding" })).toBe("pet_boarding");
    expect(classifyTags({ shop: "supermarket" })).toBe("supermarket");
    expect(classifyTags({ amenity: "library" })).toBe("library");
    expect(classifyTags({ amenity: "gym" })).toBe("leisure");
    expect(classifyTags({ leisure: "swimming_pool" })).toBe("leisure");
  });

  it("food & drink is any sort of food option (ruling 3)", () => {
    for (const amenity of ["restaurant", "pub", "cafe", "fast_food", "bar"])
      expect(classifyTags({ amenity })).toBe("food_and_drink");
  });

  it("does not file the deliberately-excluded tags (L6)", () => {
    expect(classifyTags({ shop: "garden_centre" })).toBeNull();
    expect(classifyTags({ leisure: "playground" })).toBeNull();
    expect(classifyTags({ leisure: "pitch" })).toBeNull();
    expect(classifyTags({ leisure: "dog_park" })).toBeNull();
    expect(classifyTags({ amenity: "parking" })).toBeNull();
    expect(classifyTags({})).toBeNull();
  });

  it("carries the worship religion verbatim in detail, and nothing else (T7)", () => {
    expect(detailFor("worship", { religion: "pagan;christian" })).toBe("pagan;christian");
    expect(detailFor("worship", { religion: "multifaith" })).toBe("multifaith");
    expect(detailFor("worship", {})).toBeNull();
    expect(detailFor("food_and_drink", { religion: "christian" })).toBeNull();
    expect(placeName({ name: "  " })).toBeNull();
    expect(placeName({})).toBeNull();
    expect(placeName({ name: " Galu " })).toBe("Galu");
  });

  it("migration 0009 adds the detail column, and the schema doc records the shape (T12's OSM half)", () => {
    expect(migration).toContain("ALTER TABLE osm_points");
    expect(migration).toContain("ADD COLUMN detail text");
    expect(schemaDoc).toContain("© OpenStreetMap contributors");
    expect(schemaDoc).toContain("ODbL");
    expect(SOURCE_NAME).toContain("© OpenStreetMap contributors");
  });
});

describe("dedupe (T6)", () => {
  const row = (kind: string, osmId: number, name: string | null, lat: number, lon: number) => ({
    kind,
    osmId,
    name,
    placeType: "food_and_drink",
    detail: null,
    lat,
    lon,
    sourceDate: "2026-11-12",
  });

  it("files a node+way pair once, preferring the way; counts both drop kinds", () => {
    const { rows, droppedDuplicates } = dedupePlaces([
      row("node", 1, "Galu", 51.36, -0.21),
      row("way", 2, "Galu", 51.3601, -0.2101),
    ]);
    expect(rows.length).toBe(1);
    expect(rows[0].kind).toBe("way");
    expect(droppedDuplicates).toBe(1);
  });

  it("prefers a relation over a way, and never merges on name alone", () => {
    const rel = dedupePlaces([
      row("way", 2, "The Park", 51.36, -0.21),
      row("relation", 3, "The Park", 51.3601, -0.2101),
    ]);
    expect(rel.rows.length).toBe(1);
    expect(rel.rows[0].kind).toBe("relation");
    const two = dedupePlaces([
      row("node", 4, "Pets at Home", 51.75, -1.26),
      row("node", 5, "Pets at Home", 51.76, -1.24),
    ]);
    expect(two.rows.length).toBe(2);
  });

  it("files the same element twice only once, and never dedupes unnamed rows", () => {
    const { rows, droppedElements } = dedupePlaces([
      row("way", 7, "Crossings", 52.6, 0.4),
      row("way", 7, "Crossings", 52.6, 0.4),
      row("way", 8, null, 52.6, 0.4),
      row("node", 9, null, 52.6, 0.4),
    ]);
    expect(droppedElements).toBe(1);
    expect(rows.length).toBe(3);
  });
});

describe("the fixture recomputation — the golden figures", () => {
  it("passes the loader's own golden checks over the recomputed rows", () => {
    expect(goldenChecks(allFiled)).toEqual([]);
  });

  it("T4 — Exeter: the vet at 1.169 and both supermarkets at 0.46, with the nearer convenience store filed as tagged", () => {
    const vet = nearestNamed("exeter", "vet");
    expect(vet.row.name).toBe("Goddard Vets Plaistow");
    expect(vet.d).toBeCloseTo(1.169, 2);
    const supermarkets = (filedByHome.get("exeter") ?? []).filter(
      (r) => r.placeType === "supermarket" && r.name !== null,
    );
    // The nearest row carrying the name — a capture this size
    // holds more than one Lidl.
    const byName = (part: string) =>
      supermarkets
        .filter((r) => r.name?.includes(part))
        .sort((a, b) => dist("exeter", a) - dist("exeter", b))[0];
    expect(dist("exeter", byName("Lidl")!)).toBeCloseTo(0.463, 2);
    expect(dist("exeter", byName("Morrisons")!)).toBeCloseTo(0.464, 2);
    expect(dist("exeter", byName("Local Express")!)).toBeCloseTo(0.392, 2);
  });

  it("ruling 3 in the filed data: Exeter files hundreds of fast-food rows and dozens of bars", () => {
    const food = (filedByHome.get("exeter") ?? []).filter((r) => r.placeType === "food_and_drink");
    expect(food.filter((r) => r.amenity === "fast_food").length).toBeGreaterThan(400);
    expect(food.filter((r) => r.amenity === "bar").length).toBeGreaterThan(40);
    const classic = food.filter((r) => ["restaurant", "pub", "cafe"].includes(r.amenity ?? ""));
    // The prep's pre-ruling food total for Exeter was 1,430
    // (restaurant 671, pub 163, cafe 596, membership counts);
    // single-group priority moves a handful, never hundreds.
    expect(Math.abs(classic.length - 1430)).toBeLessThanOrEqual(6);
  });

  it("T5 — City Island: the unnamed residents' pool files at 0.075 with no name, while the served line leads with a real name", () => {
    const rows = filedByHome.get("cityisland") ?? [];
    const pool = rows
      .filter((r) => r.placeType === "leisure" && r.name === null)
      .map((r) => dist("cityisland", r))
      .filter((d) => Math.abs(d - 0.075) <= 0.015);
    expect(pool.length).toBeGreaterThanOrEqual(1);
    const named = nearestNamed("cityisland", "leisure");
    expect(named.row.name).toBe("The Strength Room");
    expect(named.d).toBeCloseTo(0.041, 1);
  });

  it("T6 — Epsom's Galu files once; Oxford's two Pets at Home both file; Hilgay's node+way vet pair files once", () => {
    const galu = (filedByHome.get("epsom") ?? []).filter(
      (r) => r.placeType === "food_and_drink" && r.name === "Galu",
    );
    expect(galu.length).toBe(1);
    expect(galu[0].kind).toBe("way");
    const pets = (filedByHome.get("oxford") ?? [])
      .filter((r) => r.placeType === "pet_shop" && r.name === "Pets at Home")
      .map((r) => dist("oxford", r))
      .sort((a, b) => a - b);
    expect(pets.length).toBe(2);
    expect(pets[0]).toBeCloseTo(0.944, 1);
    expect(pets[1]).toBeCloseTo(2.33, 1);
    const rawVets = (rawByHome.get("hilgay") ?? []).filter((r) => r.placeType === "vet");
    const filedVets = (filedByHome.get("hilgay") ?? []).filter((r) => r.placeType === "vet");
    expect(rawVets.length).toBe(5);
    expect(filedVets.length).toBe(4);
  });

  it("T7 — Oxford: the verbatim multi-value religion files, coverage is high, and a no-religion row files NULL", () => {
    const worship = (filedByHome.get("oxford") ?? []).filter((r) => r.placeType === "worship");
    expect(worship.some((r) => r.detail === "pagan;christian")).toBe(true);
    expect(worship.some((r) => r.detail === null)).toBe(true);
    const withReligion = worship.filter((r) => r.detail !== null).length;
    expect(withReligion / worship.length).toBeGreaterThanOrEqual(0.9);
  });

  it("T11 — Oxford: Radcliffe Camera files under visit, not library", () => {
    const camera = allFiled.find((r) => r.name === "Radcliffe Camera");
    expect(camera?.placeType).toBe("visit");
    expect(dist("oxford", camera!)).toBeCloseTo(0.456, 1);
  });

  it("T8 — Birkdale: zero vets and zero pet shops file (the map's truth), boarding and library do", () => {
    const rows = filedByHome.get("birkdale") ?? [];
    expect(rows.filter((r) => r.placeType === "vet").length).toBe(0);
    expect(rows.filter((r) => r.placeType === "pet_shop").length).toBe(0);
    const boarding = nearestNamed("birkdale", "pet_boarding");
    expect(boarding.row.name).toContain("Latneys");
    expect(boarding.d).toBeCloseTo(0.782, 1);
    const library = nearestNamed("birkdale", "library");
    expect(library.row.name).toBe("Hatfield Peverel Library");
    expect(library.d).toBeCloseTo(0.462, 1);
  });

  it("T9 — Hilgay: the served groups are empty within two miles and present at their measured distances beyond", () => {
    const rows = filedByHome.get("hilgay") ?? [];
    for (const placeType of ["vet", "supermarket", "worship", "library", "pet_boarding", "visit"])
      expect(rows.filter((r) => r.placeType === placeType && dist("hilgay", r) <= 2).length).toBe(
        0,
      );
    expect(nearestNamed("hilgay", "vet").d).toBeCloseTo(6.375, 1);
    expect(nearestNamed("hilgay", "supermarket").d).toBeCloseTo(3.545, 1);
    expect(nearestNamed("hilgay", "worship").d).toBeCloseTo(2.596, 1);
    expect(nearestNamed("hilgay", "library").d).toBeCloseTo(3.685, 1);
    expect(nearestNamed("hilgay", "pet_boarding").d).toBeCloseTo(5.517, 1);
    const ship = rows.find((r) => r.name === "The Ship Inn");
    expect(ship).toBeDefined();
    expect(dist("hilgay", ship!)).toBeCloseTo(1.412, 1);
  });

  it("T10 — Cardiff, from the Wales capture: Park Vets at 1.164 and Clare Foods at 0.335", () => {
    const vet = nearestNamed("cardiff", "vet");
    expect(vet.row.name).toBe("Park Vets");
    expect(vet.d).toBeCloseTo(1.164, 1);
    const supermarket = nearestNamed("cardiff", "supermarket");
    expect(supermarket.row.name).toBe("Clare Foods");
    expect(supermarket.d).toBeCloseTo(0.335, 1);
  });

  it("files through a stage-table swap, with the detail column among the filed columns (T12)", () => {
    expect(loaderSource).toContain("CREATE TEMP TABLE osm_places_stage");
    expect(loaderSource).toContain("DELETE FROM osm_points");
    expect(loaderSource).toContain("source_date");
    expect(loaderSource).toContain("detail");
    expect(loaderSource).toContain("ON COMMIT DROP");
  });
});

describe("national sanity", () => {
  it("is silent for partial loads and loud for a broken national picture", () => {
    expect(sanityChecks([], { national: false })).toEqual([]);
    const failures = sanityChecks([], { national: true });
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.join(" ")).toContain("national");
  });
});
