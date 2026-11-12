import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the green belt loader (plan step M5.2): the filed name
// is the belt itself (green-belt-core), never the compiling
// district (gap L5), and the fixture (real rows captured 12 Nov
// 2026) holds the golden geography — no Braintree piece exists,
// and the Epsom and Ewell piece belongs to the London belt whose
// edge sits 0.101 miles from the flat.

const loader = readFileSync(join(process.cwd(), "loaders/load-green-belt.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/green-belt");

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

const gb = parseCsv(readFileSync(join(fixtureDir, "green-belt.csv"), "utf8"));

describe("green belt loader sources", () => {
  it("reads the planning.data.gov.uk green-belt file and files shapes via PostGIS", () => {
    expect(loader).toContain("files.planning.data.gov.uk/dataset/green-belt.csv");
    expect(loader).toContain("ST_Multi(ST_GeomFromText");
    expect(loader).toContain("green_belt");
  });

  it("names pieces by the belt, never by district (L5)", () => {
    expect(loader).toContain('item.row["green-belt-core"]');
    expect(loader).toContain("never by district");
  });

  it("counts ended and geometry-less rows in the log line", () => {
    expect(loader).toContain("without geometry counted");
    expect(loader).toContain("ended excluded");
  });
});

describe("fixture golden facts", () => {
  it("holds the golden districts' pieces plus two other belts", () => {
    expect(gb).toHaveLength(6);
    const cores = new Set(gb.map((r) => r["green-belt-core"]));
    expect(cores.has("London")).toBe(true);
    expect(cores.size).toBeGreaterThan(1);
  });

  it("the Epsom and Ewell piece belongs to the London belt", () => {
    const epsom = gb.find((r) => r["local-authority-district"] === "E07000208");
    expect(epsom?.["green-belt-core"]).toBe("London");
    expect(epsom?.["name"]).toBe("Epsom and Ewell"); // the district name the loader must NOT serve
  });

  it("no piece exists for Braintree district — absence is genuine (MHCLG compiles all)", () => {
    expect(gb.some((r) => r["local-authority-district"] === "E07000067")).toBe(false);
  });
});
