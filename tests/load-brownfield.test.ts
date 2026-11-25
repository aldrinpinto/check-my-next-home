import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processSites, siteAddress } from "../loaders/load-brownfield.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the brownfield loader (plan step M6.21, decision
// D41): the unified national brownfield land dataset files
// as POINTS (never polygons, never a plot-level claim),
// ended rows are excluded, republications and same-site
// records collapse under the loader's two dedupe rules,
// the free-text notes column is proven present in the
// source file and never filed, and the supplier gate files
// alongside. The fixture (real rows within 3 miles of the
// three universal homes, captured 16 Nov 2026 from the
// live bulk file) reproduces the locked goldens below —
// derived here from the raw rows by an independent
// implementation of the filing rules, not by the loader
// agreeing with itself. The loader's own golden checks run
// in both modes; the filing proof runs in CI against a
// real PostGIS.

const loader = readFileSync(join(process.cwd(), "loaders/load-brownfield.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/brownfield");

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

const csvText = readFileSync(join(fixtureDir, "brownfield-land.csv"), "utf8");
const header = csvText.split("\n")[0].split(",");
const all = parseCsv(csvText);

// The filing rules, re-derived: current rows with a point;
// republication dedupe on (reference, organisation) — an
// empty reference falls back to the entity — newest
// entry-date wins, first entry wins a tie; same-site
// collapse on (point at 4dp, address in the loader's
// normal form: upper case, punctuation becomes spaces).
function normAddress(text: string): string {
  return (text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function filedRows() {
  const current = all.filter((r) => r["end-date"] === "" && parsePoint(r["point"]) !== null);
  const byKey = new Map<string, Record<string, string>>();
  for (const row of current) {
    const reference = (row["reference"] ?? "").trim();
    const key = reference
      ? `${reference}|${row["organisation-entity"]}`
      : `entity-${row["entity"]}`;
    const prev = byKey.get(key);
    if (!prev || (row["entry-date"] ?? "") > (prev["entry-date"] ?? "")) byKey.set(key, row);
  }
  const bySite = new Map<string, Record<string, string>>();
  for (const row of byKey.values()) {
    const point = parsePoint(row["point"])!;
    const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}|${normAddress(row["site-address"])}`;
    const prev = bySite.get(key);
    if (!prev || (row["entry-date"] ?? "") > (prev["entry-date"] ?? "")) bySite.set(key, row);
  }
  return [...bySite.values()];
}

describe("brownfield loader sources", () => {
  it("files the unified national dataset from the files host, OGL v3.0", () => {
    expect(loader).toContain("files.planning.data.gov.uk/dataset/brownfield-land.csv");
    expect(loader).toContain("Open Government Licence v3.0");
  });

  it("proves the notes column exists in the source and never files it", () => {
    expect(header).toContain("notes");
    expect(loader).toContain('"notes" in rows[0]');
    // The notes column is never read into a filed row and
    // never appears in the insert: free text from hundreds
    // of councils is not ours to serve.
    expect(loader).not.toContain('row["notes"]');
    expect(loader).not.toContain("notes,");
    expect(loader).toContain("site_plan_url");
    expect(loader).toContain("The site-plan URL files\n//     but never serves");
  });

  it("files points only — no polygon path exists in the loader", () => {
    expect(loader).not.toContain("parseWktGeometry");
    expect(loader).toContain("brownfield_sites");
    expect(loader).toContain("brownfield_publishers");
  });

  it("stamps the retrieval date as the source date (no edition exists)", () => {
    expect(loader).toContain("retrieval date");
    expect(loader).toContain("new Date().toISOString().slice(0, 10)");
  });
});

describe("brownfield fixture goldens (16 Nov 2026 capture)", () => {
  it("the cut holds 520 rows: 464 current, 56 ended", () => {
    expect(all).toHaveLength(520);
    expect(all.filter((r) => r["end-date"] !== "")).toHaveLength(56);
    expect(all.filter((r) => r["end-date"] === "")).toHaveLength(464);
  });

  it("the two dedupe rules file 334 sites from the 464 current rows", () => {
    expect(filedRows()).toHaveLength(334);
  });

  it("pins the three homes' counts and nearest sites", () => {
    const filed = filedRows().map((r) => ({ row: r, point: parsePoint(r["point"])! }));
    const within = (home: { lat: number; lng: number }) =>
      filed
        .map((f) => ({ ...f, miles: haversineMiles(home.lat, home.lng, f.point.lat, f.point.lng) }))
        .filter((f) => f.miles <= 2)
        .sort((a, b) => a.miles - b.miles);

    const birkdale = within(HOMES.birkdale);
    expect(birkdale).toHaveLength(2);
    expect(birkdale[0].row["site-address"]).toBe("Universal Garage, The Street, Hatfield Peverel");
    expect(birkdale[0].miles).toBeGreaterThan(0.24);
    expect(birkdale[0].miles).toBeLessThan(0.27);
    expect(birkdale[0].row["planning-permission-status"]).toBe("permissioned");

    const exeter = within(HOMES.exeter);
    expect(exeter).toHaveLength(97);
    // The prep's nearest (Freemasons Road) is superseded by
    // the filed data: 45 Beckton Road, recorded by both
    // Newham and the GLA, is nearer — see
    // docs/backend-m6.21.md.
    expect(exeter[0].row["site-address"]).toBe("45 Beckton Road, Canning Town, London, E16 4EA");
    expect(exeter[0].miles).toBeGreaterThan(0.15);
    expect(exeter[0].miles).toBeLessThan(0.18);

    const epsom = within(HOMES.epsom);
    expect(epsom).toHaveLength(30);
    expect(epsom[0].row["site-address"]).toBe("Etwell House and former coach, Station Approach");
    expect(epsom[0].miles).toBeGreaterThan(0.21);
    expect(epsom[0].miles).toBeLessThan(0.24);
  });

  it("the gate files every supplying organisation in the cut, the three homes' councils among them", () => {
    const orgs = new Set(filedRows().map((r) => r["organisation-entity"]));
    expect(orgs.size).toBe(16);
    expect(orgs.has("56")).toBe(true); // Braintree
    expect(orgs.has("246")).toBe(true); // Newham
    expect(orgs.has("129")).toBe(true); // Epsom and Ewell
  });
});

// BUG-265: the scan carries the shared progress logger — a
// tally every 5,000 rows against the file's own row count.
describe("progress logging (BUG-265)", () => {
  it("scans the fixture with a closing process line, and the filing set is unchanged", () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-brownfield",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const processed = processSites(all, { progress });
    expect(processed.filed).toHaveLength(334);
    expect(processed.total).toBe(520);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · process 520\/520 rows \(100%\)$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("emits tally lines at 5,000-row steps on a larger scan", () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-brownfield",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const rows = Array.from({ length: 10001 }, (_, i) => ({
      "end-date": "",
      point: `POINT (${(0.6 + i * 0.0002).toFixed(6)} 51.770000)`,
      reference: `R${i}`,
      "organisation-entity": "56",
      "entry-date": "2026-01-01",
      "site-address": `Site ${i}`,
    }));
    const processed = processSites(rows, { progress });
    expect(processed.filed).toHaveLength(10001);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/progress · process 5,000\/10,001 rows \(50%\)$/);
    expect(lines[1]).toMatch(/progress · process 10,000\/10,001 rows \(100%\)$/);
    expect(lines[2]).toMatch(/progress · process 10,001\/10,001 rows \(100%\)$/);
  });
});

describe("recorded spelling correction (BUG-344(b))", () => {
  it("files the Stratigic site address as Strategic — one exact string, never a pattern", () => {
    // The register's own spelling ("Stratigic") is a typo
    // for "Strategic"; the live register carries it, and
    // the fixture keeps it — the loader corrects it at
    // filing, so a re-file keeps the fix instead of
    // re-filing the typo. The map keys the filed string
    // whole (name plus street), as filed.
    expect(
      siteAddress({
        "site-address":
          "East of England Stratigic Health Authority Offices, 8 Collingwood Road, Witham",
      }),
    ).toBe("East of England Strategic Health Authority Offices, 8 Collingwood Road, Witham");
    // Every other address files verbatim.
    expect(siteAddress({ "site-address": "Universal Garage, The Street, Hatfield Peverel" })).toBe(
      "Universal Garage, The Street, Hatfield Peverel",
    );
    expect(siteAddress({})).toBe("");
  });

  it("the fixture's typo'd row files corrected, and the filing set is unchanged", () => {
    const processed = processSites(all, {});
    expect(processed.filed).toHaveLength(334);
    expect(processed.total).toBe(520);
    const corrected = processed.filed.filter(
      (f) =>
        f.row["site-address"] ===
        "East of England Strategic Health Authority Offices, 8 Collingwood Road, Witham",
    );
    expect(corrected).toHaveLength(1);
    expect(processed.filed.some((f) => (f.row["site-address"] ?? "").includes("Stratigic"))).toBe(
      false,
    );
  });
});
