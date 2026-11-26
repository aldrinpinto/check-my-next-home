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
  filePlaces,
  goldenChecks,
  haversineMiles,
  md5Matches,
  parsePublishedMd5,
  placeName,
  sanityChecks,
} from "../loaders/load-osm-places.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

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

  it("corrects a typo'd source name to the business's own name (BUG-239)", () => {
    // OSM way 1319900560 carries a stray "l" in its
    // name tag ("Kennelsl"); the loader files the
    // corrected name, and a re-file keeps the fix.
    expect(placeName({ name: "Latneys Boarding Kennelsl and Cattery" })).toBe(
      "Latneys Boarding Kennels and Cattery",
    );
    // BUG-344(e): OSM node 1203700697 carries "Tandori";
    // the business's own spelling is "Tandoori" (its own
    // site hatfieldtandoorionline.com, and the Food Hygiene
    // Ratings entry for the same address) — the same
    // correction mechanism, one exact string.
    expect(placeName({ name: "Hatfield Tandori" })).toBe("Hatfield Tandoori");
    // Every other name files verbatim — the map is one
    // exact string, never a pattern.
    expect(placeName({ name: "Latneys Boarding Kennels and Cattery" })).toBe(
      "Latneys Boarding Kennels and Cattery",
    );
    expect(placeName({ name: "Some Other Kennels" })).toBe("Some Other Kennels");
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
    // BUG-239: the filed name is the corrected one —
    // the fixture's OSM way carries the typo ("Kennelsl")
    // and the loader corrects it at filing.
    expect(boarding.row.name).toBe("Latneys Boarding Kennels and Cattery");
    expect(boarding.d).toBeCloseTo(0.782, 1);
    // BUG-344(e): the filed food & drink name is the
    // business's own spelling — the fixture's OSM node
    // carries the typo ("Tandori") and the loader
    // corrects it at filing.
    const tandoori = nearestNamed("birkdale", "food_and_drink");
    expect(tandoori.row.name).toBe("Hatfield Tandoori");
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
    // BUG-368: the stage is persistent now — the TEMP
    // table and its ON COMMIT DROP are gone; the swap
    // still deletes the live table and inserts from the
    // stage, and the staging-clear is the resume clear.
    expect(loaderSource).toContain("CREATE TABLE IF NOT EXISTS osm_places_stage");
    expect(loaderSource).toContain("DELETE FROM osm_points");
    expect(loaderSource).toContain("source_date");
    expect(loaderSource).toContain("detail");
    expect(loaderSource).not.toContain("CREATE TEMP TABLE osm_places_stage");
    expect(loaderSource).not.toContain("ON COMMIT DROP");
    expect(loaderSource).toContain("resume.clear()");
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

describe("filing — the stage-table transaction", () => {
  // CI run 98's database job failed with "relation
  // osm_places_stage does not exist": filePlaces created the
  // ON COMMIT DROP stage BEFORE its BEGIN, so in autocommit
  // the stage was dropped again by the end of its own CREATE
  // statement and the first staged insert found no table.
  // BUG-368: the stage is persistent now, so that
  // discipline is gone — the CREATE TABLE IF NOT EXISTS
  // opens the run, staging commits per flush with a
  // checkpoint line each, and only the swap runs inside
  // one transaction (BEGIN after the staged inserts,
  // COMMIT last, then the staging-clear COMMIT). A
  // mid-staging failure leaves the staged rows +
  // checkpoint for the next run instead of rolling back.
  // No Postgres exists in the sandbox (CI is the proof
  // environment), so the contract is pinned here against a
  // recording fake pool.
  function recordingPool(failOn?: string) {
    const statements: string[] = [];
    let released = false;
    let staged = 0;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        if (/INSERT INTO osm_places_stage/.test(sql)) staged += params.length / 9;
        if (/SELECT count\(\*\)::int AS n FROM osm_places_stage/.test(sql))
          return { rows: [{ n: staged }], rowCount: 1 };
        if (failOn && head.startsWith(failOn)) throw new Error(`forced failure: ${failOn}`);
        return { rows: [], rowCount: 0 };
      },
      release() {
        released = true;
      },
    };
    return { statements, released: () => released, pool: { connect: async () => client } };
  }

  const rows = [
    {
      osmId: 101,
      name: "A Vet",
      placeType: "vet",
      detail: null,
      lat: 51.5,
      lon: 0.02,
      sourceDate: "2026-11-12",
    },
    {
      osmId: 102,
      name: null,
      placeType: "leisure",
      detail: null,
      lat: 51.51,
      lon: 0.005,
      sourceDate: "2026-11-12",
    },
  ];

  it("stages into a persistent table and swaps in its own transaction — CREATE first, COMMIT last", async () => {
    const rec = recordingPool();
    await filePlaces(rec.pool as never, rows as never, "2026-11-13T00:00:00Z");
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    expect(rec.statements[0]).toBe(
      "CREATE TABLE IF NOT EXISTS osm_places_stage ( osm_id bigint, name text, place_type text, detail text, latitude double precision, longitude double precision, source_name text, source_date date, seq bigint NOT NULL, UNIQUE (seq) )",
    );
    expect(at("INSERT INTO osm_places_stage")).toBeGreaterThan(
      at("CREATE TABLE IF NOT EXISTS osm_places_stage"),
    );
    expect(at("BEGIN")).toBeGreaterThan(at("INSERT INTO osm_places_stage"));
    expect(at("DELETE FROM osm_points")).toBeGreaterThan(at("BEGIN"));
    expect(at("INSERT INTO osm_points")).toBeGreaterThan(at("DELETE FROM osm_points"));
    expect(rec.statements.at(-1)).toBe("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("a failure mid-staging leaves the staged rows for the next run and still releases the client", async () => {
    const rec = recordingPool("INSERT INTO osm_places_stage");
    await expect(
      filePlaces(rec.pool as never, rows as never, "2026-11-13T00:00:00Z"),
    ).rejects.toThrow("forced failure");
    // BUG-368: staging is durable per flush — no ROLLBACK,
    // and no COMMIT either: the checkpoint stands for the
    // next run to resume from.
    expect(rec.statements).not.toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });
});

describe("filing — the schema contract", () => {
  // CI run 99's database job failed with "column lat of
  // relation osm_points does not exist": with the round-1
  // ordering fixed, filePlaces' final INSERT named the live
  // table's position columns lat/lon — the row objects'
  // property names — where migration 0001 defines latitude/
  // longitude, like every other point table. The fake-pool
  // tests above pin statement ORDER, not names, so this block
  // pins the names: the live table's columns are parsed from
  // the migration files themselves (the proven contract) and
  // every column the filer issues is checked against them.
  // No Postgres needed.
  function liveTableColumns(table: string): Set<string> {
    const dir = join(process.cwd(), "db", "migrations");
    const cols = new Set<string>();
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".sql")) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      const create = new RegExp(`CREATE TABLE ${table} \\(`).exec(sql);
      if (create) {
        // Walk to the matching close paren, then split the
        // body on top-level commas only — column definitions
        // carry their own parens (geometry(Point, 4326), the
        // generated geom CASE).
        let depth = 0;
        let end = -1;
        for (let i = create.index; i < sql.length; i++) {
          if (sql[i] === "(") depth++;
          else if (sql[i] === ")") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const body = sql.slice(sql.indexOf("(", create.index) + 1, end);
        const parts: string[] = [];
        let d = 0;
        let cur = "";
        for (const ch of body) {
          if (ch === "(") d++;
          else if (ch === ")") d--;
          if (ch === "," && d === 0) {
            parts.push(cur);
            cur = "";
          } else cur += ch;
        }
        if (cur.trim() !== "") parts.push(cur);
        for (const part of parts) {
          const name = part.trim().split(/\s+/)[0];
          if (name && !/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)$/i.test(name)) cols.add(name);
        }
      }
      for (const alter of sql.matchAll(
        new RegExp(`ALTER TABLE ${table}\\s+ADD COLUMN (\\w+)`, "g"),
      )) {
        cols.add(alter[1]);
      }
    }
    return cols;
  }

  function recordingPool() {
    const statements: string[] = [];
    let staged = 0;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        statements.push(sql.trim().replace(/\s+/g, " "));
        if (/INSERT INTO osm_places_stage/.test(sql)) staged += params.length / 9;
        if (/SELECT count\(\*\)::int AS n FROM osm_places_stage/.test(sql))
          return { rows: [{ n: staged }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    return { statements, pool: { connect: async () => client } };
  }

  const rows = [
    {
      osmId: 101,
      name: "A Vet",
      placeType: "vet",
      detail: null,
      lat: 51.5,
      lon: 0.02,
      sourceDate: "2026-11-12",
    },
  ];

  function firstParenList(statement: string): string[] {
    const m = /\(([^)]+)\)/.exec(statement);
    return m ? m[1].split(",").map((c) => c.trim()) : [];
  }

  it("every column the filer inserts into osm_points exists in the migration DDL", async () => {
    const rec = recordingPool();
    await filePlaces(rec.pool as never, rows as never, "2026-11-13T00:00:00Z");
    const live = liveTableColumns("osm_points");
    // Sanity: the parser found the real contract, not nothing.
    expect(live.has("latitude")).toBe(true);
    expect(live.has("longitude")).toBe(true);
    expect(live.has("detail")).toBe(true); // migration 0009's ALTER
    const finalInsert = rec.statements.find((s) => s.startsWith("INSERT INTO osm_points ("))!;
    const target = firstParenList(finalInsert);
    expect(target.length).toBeGreaterThan(0);
    for (const col of target) expect(live.has(col)).toBe(true);
    // The identity and generated columns are the database's own.
    expect(target).not.toContain("id");
    expect(target).not.toContain("geom");
  });

  it("the stage table, the staged insert and the final SELECT agree with each other", async () => {
    const rec = recordingPool();
    await filePlaces(rec.pool as never, rows as never, "2026-11-13T00:00:00Z");
    const stageCreate = rec.statements.find((s) =>
      s.startsWith("CREATE TABLE IF NOT EXISTS osm_places_stage"),
    )!;
    const stageDefs = /\((.+)\)/.exec(stageCreate)![1];
    const stageCols = stageDefs.split(",").map((def) => def.trim().split(/\s+/)[0]);
    const stagedInsert = rec.statements.find((s) =>
      s.startsWith("INSERT INTO osm_places_stage ("),
    )!;
    for (const col of firstParenList(stagedInsert)) expect(stageCols).toContain(col);
    const finalInsert = rec.statements.find((s) => s.startsWith("INSERT INTO osm_points ("))!;
    const selectList = /SELECT (.+) FROM osm_places_stage/
      .exec(finalInsert)![1]
      .split(",")
      .map((c) => c.trim());
    // Position for position: the target list and the SELECT
    // list are the same length, and every named SELECT item is
    // a stage column (the $1 loaded_at parameter aside).
    expect(selectList.length).toBe(firstParenList(finalInsert).length);
    for (const item of selectList) {
      if (/^[a-z_][a-z0-9_]*$/.test(item)) expect(stageCols).toContain(item);
    }
  });
});

describe("progress — BUG-265", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  function recordingPool(failOn?: string) {
    const statements: string[] = [];
    let released = false;
    let staged = 0;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        if (/INSERT INTO osm_places_stage/.test(sql)) staged += params.length / 9;
        if (/SELECT count\(\*\)::int AS n FROM osm_places_stage/.test(sql))
          return { rows: [{ n: staged }], rowCount: 1 };
        if (failOn && head.startsWith(failOn)) throw new Error(`forced failure: ${failOn}`);
        return { rows: [], rowCount: 0 };
      },
      release() {
        released = true;
      },
    };
    return { statements, released: () => released, pool: { connect: async () => client } };
  }

  const rows = [
    {
      osmId: 101,
      name: "A Vet",
      placeType: "vet",
      detail: null,
      lat: 51.5,
      lon: 0.02,
      sourceDate: "2026-11-12",
    },
    {
      osmId: 102,
      name: null,
      placeType: "leisure",
      detail: null,
      lat: 51.51,
      lon: 0.005,
      sourceDate: "2026-11-12",
    },
  ];

  it("logs the stage flushes with a real percentage and closes the tally", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-osm-places", log });
    const rec = recordingPool();
    await filePlaces(rec.pool as never, rows as never, "2026-11-13T00:00:00Z", { progress });
    expect(lines.some((l) => /progress · stage 1\/1 flushes \(100%\)$/.test(l))).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
    expect(rec.statements.at(-1)).toBe("COMMIT");
  });

  it("names a filing failure with the staged count and the resume point", async () => {
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-osm-places", log });
    const rec = recordingPool("INSERT INTO osm_places_stage");
    await expect(
      filePlaces(rec.pool as never, rows as never, "2026-11-13T00:00:00Z", { progress }),
    ).rejects.toThrow("forced failure");
    expect(
      lines.some((l) =>
        /failed · file · filed 0 of 2 · forced failure: INSERT INTO osm_places_stage · resume from the start \(nothing staged yet\)/.test(
          l,
        ),
      ),
    ).toBe(true);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pg pool: the staged rows, the live points and
  // the loader_checkpoint row as arrays, with just enough
  // SQL to run the filer.
  type StagedRow = { osmId: number; sourceDate: string; seq: number };
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  function createFakePool() {
    let staged: StagedRow[] = [];
    let live: StagedRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: { staged: StagedRow[]; live: StagedRow[] } | null = null;
    const query = async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, " ");
      if (text === "BEGIN") {
        snapshot = { staged: [...staged], live: [...live] };
        return { rows: [] };
      }
      if (text === "COMMIT") {
        snapshot = null;
        return { rows: [] };
      }
      if (text === "ROLLBACK") {
        if (snapshot) {
          staged = snapshot.staged;
          live = snapshot.live;
        }
        snapshot = null;
        return { rows: [] };
      }
      if (/CREATE TABLE IF NOT EXISTS osm_places_stage/.test(text)) return { rows: [] };
      if (/INSERT INTO osm_places_stage/.test(text)) {
        insertCalls += 1;
        if (failAfterInserts !== null && insertCalls > failAfterInserts)
          throw new Error("simulated kill: the database connection dropped mid-insert");
        for (let r = 0; r < params.length / 9; r++)
          staged.push({
            osmId: params[r * 9] as number,
            sourceDate: params[r * 9 + 7] as string,
            seq: params[r * 9 + 8] as number,
          });
        return { rows: [], rowCount: params.length / 9 };
      }
      if (/SELECT loader, edition, expected, next_start_index/.test(text)) {
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
      if (/DELETE FROM osm_places_stage WHERE seq >=/.test(text)) {
        staged = staged.filter((r) => r.seq < (params[0] as number));
        return { rows: [], rowCount: 0 };
      }
      if (/DELETE FROM osm_places_stage/.test(text)) {
        staged = [];
        return { rows: [] };
      }
      if (/SELECT count\(\*\)::int AS n FROM osm_places_stage/.test(text))
        return { rows: [{ n: staged.length }] };
      if (/DELETE FROM osm_points/.test(text)) {
        live = [];
        return { rows: [] };
      }
      if (/INSERT INTO osm_points/.test(text)) {
        live = [...staged];
        return { rows: [] };
      }
      throw new Error(`fake client: unhandled SQL: ${sql}`);
    };
    const client = { query, release: () => {} };
    return {
      pool: { connect: async () => client },
      staged: () => staged,
      live: () => live,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        insertCalls = 0;
        failAfterInserts = n;
      },
    };
  }
  const rows1200 = () =>
    Array.from({ length: 1200 }, (_, i) => ({
      osmId: 100000 + i,
      name: `Place ${i}`,
      placeType: "vet",
      detail: null,
      lat: 51.5,
      lon: 0.02,
      sourceDate: "2026-11-12",
    }));

  it("kill mid-staging resumes and files every place exactly once", async () => {
    const fake = createFakePool();
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-osm-places",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    fake.setFailAfterInserts(1);
    await expect(
      filePlaces(fake.pool as never, rows1200() as never, "2026-11-13T00:00:00Z", { progress }),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(500);
    expect(fake.checkpoints.get("load-osm-places")?.next_start_index).toBe(500);
    expect(
      lines.some((l) =>
        /checkpoint 500\/1,200 rows \(42%\) · staged 500 · resume from 500/.test(l),
      ),
    ).toBe(true);

    fake.setFailAfterInserts(null);
    const resumeLines: string[] = [];
    const resumeProgress = createProgressLogger({
      name: "load-osm-places",
      log: (...args: unknown[]) => resumeLines.push(args.join(" ")),
    });
    await filePlaces(fake.pool as never, rows1200() as never, "2026-11-13T00:00:00Z", {
      progress: resumeProgress,
    });
    expect(
      resumeLines.some((l) =>
        /resuming from checkpoint · 500 rows staged · edition osm-2026-11-12 · resume from 500/.test(
          l,
        ),
      ),
    ).toBe(true);
    expect(fake.live().length).toBe(1200);
    expect(new Set(fake.live().map((r) => r.osmId)).size).toBe(1200);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-osm-places")).toBeUndefined();
  });

  it("an extract-date change discards the staged rows and starts from zero", async () => {
    const fake = createFakePool();
    fake.setFailAfterInserts(1);
    await expect(
      filePlaces(fake.pool as never, rows1200() as never, "2026-11-13T00:00:00Z"),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(500);
    fake.setFailAfterInserts(null);
    const rowsNew = rows1200().map((r) => ({ ...r, sourceDate: "2026-11-19" }));
    await filePlaces(fake.pool as never, rowsNew as never, "2026-11-20T00:00:00Z");
    expect(fake.live().length).toBe(1200);
    expect(fake.live().every((r) => r.sourceDate === "2026-11-19")).toBe(true);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-osm-places")).toBeUndefined();
  });

  it("--restart discards the checkpoint and starts from zero", async () => {
    const fake = createFakePool();
    fake.setFailAfterInserts(1);
    await expect(
      filePlaces(fake.pool as never, rows1200() as never, "2026-11-13T00:00:00Z"),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(500);
    fake.setFailAfterInserts(null);
    await filePlaces(fake.pool as never, rows1200() as never, "2026-11-13T00:00:00Z", {
      restart: true,
    });
    expect(fake.live().length).toBe(1200);
    expect(new Set(fake.live().map((r) => r.osmId)).size).toBe(1200);
    expect(fake.staged().length).toBe(0);
    expect(fake.checkpoints.get("load-osm-places")).toBeUndefined();
  });
});
