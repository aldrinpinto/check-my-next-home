import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the heritage loader (plan step M5.2): listed buildings
// file as NHLE-keyed points with grades validated against the
// published vocabulary (gap L6), scheduled monuments file as
// shapes, ended rows are excluded, and the fixture (real rows
// captured 12 Nov 2026) reproduces the locked golden counts —
// 102 / 215 / 315 buildings within 2 miles — on the prep's
// haversine basis (earth radius 3956 miles; at E16 1GN one
// building sits at 2.000–2.001 miles, so the basis decides the
// count). The loader's own golden checks run in both modes; the
// filing proof runs in CI against a real PostGIS.

const loader = readFileSync(join(process.cwd(), "loaders/load-heritage.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/heritage");

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const push = () => {
    row.push(field);
    field = "";
  };
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
    else if (ch === ",") push();
    else if (ch === "\n") {
      push();
      rows.push(row);
      row = [];
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    push();
    rows.push(row);
  }
  const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .slice(1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const HOMES = {
  birkdale: { lat: 51.776176, lng: 0.60387 },
  exeter: { lat: 51.515224, lng: 0.021177 },
  epsom: { lat: 51.344571, lng: -0.247104 },
};
const GRADES = new Set(["I", "II*", "II"]);

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parsePoint(text: string): { lng: number; lat: number } | null {
  const s = (text ?? "").trim();
  if (!s.startsWith("POINT")) return null;
  const inner = s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"));
  const parts = inner.replace(",", " ").split(/\s+/).filter(Boolean).map(Number);
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return null;
  return { lng: parts[0], lat: parts[1] };
}

const lb = parseCsv(readFileSync(join(fixtureDir, "listed-building.csv"), "utf8"));
const sm = parseCsv(readFileSync(join(fixtureDir, "scheduled-monument.csv"), "utf8"));
const filed = lb.filter((r) => {
  if (r["end-date"] !== "") return false;
  if (!GRADES.has(r["listed-building-grade"])) return false;
  return parsePoint(r["point"]) !== null;
});

describe("heritage loader sources", () => {
  it("stamps Historic England's NHLE as the source of record", () => {
    expect(loader).toContain("National Heritage List for England");
    expect(loader).toContain("files.planning.data.gov.uk/dataset");
  });

  it("validates grades against the published vocabulary and quarantines the rest (L6)", () => {
    expect(loader).toContain('new Set(["I", "II*", "II"])');
    expect(loader).toContain("outside the grade vocabulary quarantined");
  });

  it("files monuments as shapes into planning_layers, never as points", () => {
    expect(loader).toContain("scheduled_monument");
    expect(loader).toContain("ST_Multi(ST_GeomFromText");
  });

  it("counts point-less and ended buildings instead of dropping them silently", () => {
    expect(loader).toContain("without a point counted");
    expect(loader).toContain("ended excluded");
  });
});

describe("fixture golden facts", () => {
  it("the locked counts within 2 miles reproduce on the prep's basis", () => {
    const counts = Object.values(HOMES).map(
      (home) =>
        filed.filter((r) => {
          const p = parsePoint(r["point"])!;
          return haversineMiles(home.lat, home.lng, p.lat, p.lng) <= 2.0;
        }).length,
    );
    expect(counts).toEqual([102, 215, 315]);
  });

  it("the nearest buildings are the locked ones", () => {
    const nearestRef = (home: { lat: number; lng: number }) =>
      filed
        .map((r) => {
          const p = parsePoint(r["point"])!;
          return { ref: r["reference"], miles: haversineMiles(home.lat, home.lng, p.lat, p.lng) };
        })
        .sort((a, b) => a.miles - b.miles)[0].ref;
    expect(nearestRef(HOMES.birkdale)).toBe("1123430"); // White Hart Cottage, II
    expect(nearestRef(HOMES.exeter)).toBe("1406622"); // Chapel of St George and St Helena, II
    expect(nearestRef(HOMES.epsom)).toBe("1214537"); // Pit House, II
  });

  it("the anomalous 'NL' row is in the file, current, to be quarantined", () => {
    const nl = lb.find((r) => r["reference"] === "1495697");
    expect(nl?.["listed-building-grade"]).toBe("NL");
    expect(nl?.["end-date"]).toBe("");
    expect(filed.some((r) => r["reference"] === "1495697")).toBe(false);
  });

  it("a known delisted building is in the file, ended, to be excluded (L4)", () => {
    const ended = lb.find((r) => r["reference"] === "1338507");
    expect(ended?.["end-date"]).toBe("2023-07-27");
    expect(filed.some((r) => r["reference"] === "1338507")).toBe(false);
  });

  it("the golden monuments are present by NHLE reference, with one ended row to exclude", () => {
    const refs = new Set(sm.map((r) => r["reference"]));
    for (const ref of ["1002150", "1003473", "1003721", "1017998"]) {
      expect(refs.has(ref)).toBe(true);
    }
    expect(sm.filter((r) => r["end-date"] !== "")).toHaveLength(1);
    expect(sm.find((r) => r["end-date"] !== "")?.["reference"]).toBe("1002166");
  });
});

// The M6.21 layers (decision D41): four more NHLE polygon
// datasets through the same path. Their published files
// double every site — a geometry row and a nameless,
// geometry-less stub entity sharing the reference — so the
// filed count is the GEOMETRY rows after the ended
// exclusion, never the row count. The cuts below were made
// from the live files on 16 Nov 2026 (the heritage
// fixture's README records the refs chosen).

const NEW_DATASETS = [
  {
    file: "world-heritage-site.csv",
    type: "world_heritage_site",
    rows: 8,
    current: 6,
    filed: 3,
    stubbed: true,
  },
  { file: "battlefield.csv", type: "battlefield", rows: 6, current: 6, filed: 3, stubbed: true },
  {
    file: "protected-wreck-site.csv",
    type: "protected_wreck_site",
    rows: 3,
    current: 2,
    filed: 2,
    stubbed: false,
  },
  {
    file: "world-heritage-site-buffer-zone.csv",
    type: "world_heritage_buffer_zone",
    rows: 3,
    current: 3,
    filed: 3,
    stubbed: false,
  },
] as const;

describe("heritage loader — the M6.21 layers", () => {
  it("carries the four datasets with their constraint types and live bands", () => {
    for (const dataset of NEW_DATASETS) {
      expect(loader).toContain(dataset.file.replace(".csv", ""));
      expect(loader).toContain(dataset.type);
    }
    expect(loader).toContain("NEW_LAYER_DATASETS");
  });

  it("the cuts hold the expected rows, and the filed counts are the geometry rows", () => {
    for (const dataset of NEW_DATASETS) {
      const rows = parseCsv(readFileSync(join(fixtureDir, dataset.file), "utf8"));
      expect(rows, dataset.file).toHaveLength(dataset.rows);
      const current = rows.filter((r) => r["end-date"] === "");
      expect(current, dataset.file).toHaveLength(dataset.current);
      const withGeometry = current.filter((r) => (r["geometry"] ?? "").trim() !== "");
      expect(withGeometry, dataset.file).toHaveLength(dataset.filed);
      // The doubling, where the dataset doubles (world
      // heritage sites and battlefields in these cuts):
      // every geometry row's reference also appears on a
      // nameless stub with no geometry, which the filing
      // counts as geometry-less and dedupes away.
      if (dataset.stubbed) {
        for (const geo of withGeometry) {
          const stubs = current.filter(
            (r) => r["reference"] === geo["reference"] && (r["geometry"] ?? "").trim() === "",
          );
          expect(stubs.length, `${dataset.file} ${geo["reference"]}`).toBeGreaterThanOrEqual(1);
          expect(stubs[0]["name"]).toBe("");
        }
      }
    }
  });

  it("registered parks & gardens (M8.10): the sixth dataset rides the same path, outside the absence-checked list", () => {
    // The platform dataset is "park-and-garden" (its
    // published title is "Historic parks and gardens"),
    // filing as registered_park_and_garden with the live
    // band the platform's own count supports (1,723
    // parks and gardens on its dataset page, 21 Nov
    // 2026).
    expect(loader).toContain("park-and-garden");
    expect(loader).toContain("registered_park_and_garden");
    expect(loader).toContain("PARK_AND_GARDEN_DATASET");
    expect(loader).toContain("band: [1600, 1850]");
    // It does NOT join NEW_LAYER_DATASETS: that list's
    // golden check asserts absence at all three homes,
    // and Nonsuch Park stands about half a mile from the
    // Epsom flat. Its own block must not list it.
    const newLayerBlock = loader.slice(
      loader.indexOf("const NEW_LAYER_DATASETS"),
      loader.indexOf("];", loader.indexOf("const NEW_LAYER_DATASETS")),
    );
    expect(newLayerBlock).not.toContain("park-and-garden");
    // No fixture cut is held yet (the capture rides with
    // the national filing), and the fixture README says
    // so — a fixture run skips the dataset by name.
    const readme = readFileSync(join(fixtureDir, "README.md"), "utf8");
    expect(readme).toContain("park-and-garden");
    expect(loader).toContain("no fixture captured");
  });

  it("the Bath witness rows are in the world heritage cut (City of Bath, 1000103)", () => {
    const whs = parseCsv(readFileSync(join(fixtureDir, "world-heritage-site.csv"), "utf8"));
    const bath = whs.find((r) => r["reference"] === "1000103" && (r["geometry"] ?? "") !== "");
    expect(bath?.["name"]).toBe("City of Bath");
    expect(bath?.["end-date"]).toBe("");
    // The delisted Liverpool rows ride along as the ended
    // witnesses: both entries for 1000104 carry end dates.
    const liverpool = whs.filter((r) => r["reference"] === "1000104");
    expect(liverpool).toHaveLength(2);
    expect(liverpool.every((r) => r["end-date"] !== "")).toBe(true);
  });
});

describe("progress — BUG-265", () => {
  // This loader's long phases live in main(), so the wiring
  // is pinned here in source and driven end-to-end in
  // tests/load-progress-bug265-c.test.ts.
  it("creates one logger and wires it through the reads and both staging loops", () => {
    expect(loader).toContain('createProgressLogger({ name: "load-heritage" })');
    expect(loader).toContain('label: "stage listed buildings"');
    expect(loader).toContain('label: "stage polygons"');
    expect(loader).toContain('label: "process listed-building"');
    expect(loader).toContain("progress.failed({");
    expect(loader).toContain("swap started — filing");
  });
});
