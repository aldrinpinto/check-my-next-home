import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSettings } from "../loaders/load-nurseries.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

// Guards the nurseries loader (plan step M5.17): the Ofsted
// childcare register is discovered from the GOV.UK page by its
// dated asset name and read by header name past its preamble
// rows; only group settings file — "Childcare on non-domestic
// premises" in the Full day care and Sessional day care subtypes
// — while childminder-type rows never file (decision D5),
// domestic-premises rows (published REDACTED by Ofsted) never
// file, and out-of-school and blank-subtype rows stay out of a
// category the brain serves as nurseries. The fixture is real
// rows captured from the 30 June 2026 register file, and its
// golden facts reproduce the first filed load's figures.

const loader = readFileSync(join(process.cwd(), "loaders/load-nurseries.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/nurseries");

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const push = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    push();
    rows.push(row);
    row = [];
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
    else if (ch === "\n") endRow();
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) endRow();
  const headerAt = rows.findIndex((r) => r[1] === "Provider URN" && r[3] === "Provider type");
  const header = rows[headerAt].map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .slice(headerAt + 1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const records = parseCsv(readFileSync(join(fixtureDir, "providers.csv"), "utf8"));
const postcodes = JSON.parse(readFileSync(join(fixtureDir, "postcodes.json"), "utf8")) as Record<
  string,
  { lat: number; lng: number }
>;
const GROUP = "Childcare on non-domestic premises";
const filedClass = records.filter(
  (r) =>
    r["Provider type"] === GROUP &&
    r["Provider status"] === "Active" &&
    (r["Provider subtype"] === "Full day care" || r["Provider subtype"] === "Sessional day care") &&
    r["Provider Early Years Register flag"] === "Y",
);

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3956;
  const r = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const HOMES = {
  "CM3 2JT": { lat: 51.776176, lng: 0.60387 },
  "E16 1GN": { lat: 51.515224, lng: 0.021177 },
  "KT17 1FH": { lat: 51.344571, lng: -0.247104 },
};

describe("nurseries loader sources", () => {
  it("discovers the provider-data CSV from the GOV.UK page by its dated asset name", () => {
    expect(loader).toContain("childcare-providers-and-inspections-management-information");
    expect(loader).toContain("childcare_providers_data_as_at");
    expect(loader).toContain("as_at_(\\d{1,2})_([A-Za-z]+)_(\\d{4})");
  });

  it("reads the register by header name, past the preamble rows, with the as-at date as its stamp", () => {
    expect(loader).toContain('"Provider URN"');
    expect(loader).toContain('"Provider subtype"');
    expect(loader).toContain('r[1] === "Provider URN"');
    expect(loader).toContain("Ofsted childcare register (management information)");
  });

  it("files group settings only: the non-domestic type in the two nursery subtypes, on the Early Years Register (BUG-240)", () => {
    expect(loader).toContain('const GROUP_TYPE = "Childcare on non-domestic premises"');
    expect(loader).toContain('"Full day care"');
    expect(loader).toContain('"Sessional day care"');
    expect(loader).toContain('"Out-of-school day care"');
    expect(loader).toContain('"Provider Early Years Register flag"');
    expect(loader).toContain("notOnEarlyYearsRegister");
  });

  it("keeps childminders and the redacted domestic rows out by named class (D5)", () => {
    expect(loader).toContain('"Childminder"');
    expect(loader).toContain('"Home childcarer"');
    expect(loader).toContain('"Childminder without domestic premises"');
    expect(loader).toContain('const DOMESTIC_TYPE = "Childcare on domestic premises"');
  });

  it("takes no positional arguments and refuses any it does not recognise — nothing is silently dropped", () => {
    expect(loader).toContain("unrecognised argument");
    expect(loader).not.toContain("GOLDEN_POSTCODES");
  });

  it("positions settings from the postcode directory and counts the unresolved, never guessing", () => {
    expect(loader).toContain("FROM postcode_cache WHERE latitude IS NOT NULL");
    expect(loader).toContain("unresolvedPostcode");
  });
});

describe("nurseries fixture — real rows from the register as at 30 June 2026", () => {
  it("holds the exclusion classes the loader must never file, one row each", () => {
    const count = (type: string, subtype?: string) =>
      records.filter(
        (r) =>
          r["Provider type"] === type &&
          (subtype === undefined || r["Provider subtype"] === subtype),
      ).length;
    expect(count("Childminder")).toBe(1);
    expect(count("Home childcarer")).toBe(1);
    expect(count("Childcare on domestic premises")).toBe(1);
    expect(count(GROUP, "Out-of-school day care")).toBe(1);
    expect(count(GROUP, "")).toBe(1);
    // The childminder and domestic rows are REDACTED in the
    // published file itself — no name, no postcode to file.
    for (const r of records.filter((r) => r["Provider type"] !== GROUP)) {
      expect(r["Provider name"]).toBe("REDACTED");
      expect(r["Provider postcode"]).toBe("REDACTED");
    }
  });

  it("files 296 group settings, every one positioned by the fixture's postcode list", () => {
    expect(filedClass).toHaveLength(296);
    for (const r of filedClass) {
      expect(postcodes[r["Provider postcode"].toUpperCase()]).toBeDefined();
    }
    expect(new Set(filedClass.map((r) => r["Provider URN"])).size).toBe(296);
  });

  it("the Early Years Register rule drops only voluntary-register care, never a nursery (BUG-240)", () => {
    // 40 of the 336 subtype-filed rows are off the EYR —
    // every one a voluntary-register-only provider for
    // activity, tutoring or holiday care, not a nursery.
    const offEyr = records.filter(
      (r) =>
        r["Provider type"] === GROUP &&
        r["Provider status"] === "Active" &&
        (r["Provider subtype"] === "Full day care" ||
          r["Provider subtype"] === "Sessional day care") &&
        r["Provider Early Years Register flag"] !== "Y",
    );
    expect(offEyr).toHaveLength(40);
    for (const r of offEyr) {
      expect(r["Provider Voluntary Childcare Register flag"]).toBe("Y");
    }
    // The sample's own case: the maths tutor listed
    // under Nurseries is VCR-only, never EYR.
    const pearl = records.find(
      (r) => r["Provider name"] === "Maths Tutoring By Pearl Lily And Co Accountants",
    );
    expect(pearl?.["Provider Early Years Register flag"]).toBe("N");
    expect(pearl?.["Provider Voluntary Childcare Register flag"]).toBe("Y");
    expect(filedClass.some((r) => r["Provider name"].includes("Pearl Lily"))).toBe(false);
    // No dropped name is a day nursery or pre-school.
    for (const r of offEyr) {
      expect(r["Provider name"]).not.toMatch(/Day Nursery|Pre-School|Pre-school|Nursery School/i);
    }
  });

  it("reproduces the golden facts the first filed load locked", () => {
    const positioned = filedClass.map((r) => ({
      name: r["Provider name"],
      ...postcodes[r["Provider postcode"].toUpperCase()],
    }));
    const goldens = {
      "CM3 2JT": {
        nearest: "Shining Stars",
        miles: 0.11,
        count: 5,
        top3: ["Shining Stars", "The Little Bears Nursery", "Gershwin Park Day Nursery School"],
      },
      "E16 1GN": {
        nearest: "Cribs Day Nursery",
        miles: 0.088,
        count: 81,
        top3: ["Cribs Day Nursery", "Moksliukas", "Clever Cloggs Day Nursery"],
      },
      "KT17 1FH": {
        nearest: "Nestots Day Nursery",
        miles: 0.174,
        count: 35,
        top3: [
          "Nestots Day Nursery",
          "Lynton House Day Nursery",
          "Little Nick Nursery and Pre-School",
        ],
      },
    } as const;
    for (const [pc, golden] of Object.entries(goldens)) {
      const home = HOMES[pc as keyof typeof HOMES];
      const measured = positioned
        .map((s) => ({ s, miles: haversineMiles(home.lat, home.lng, s.lat, s.lng) }))
        .sort((a, b) => a.miles - b.miles || a.s.name.localeCompare(b.s.name));
      const within = measured.filter((m) => m.miles <= 2);
      expect(within[0].s.name).toBe(golden.nearest);
      expect(Math.round(within[0].miles * 1000) / 1000).toBe(golden.miles);
      expect(within).toHaveLength(golden.count);
      expect(within.slice(0, 3).map((m) => m.s.name)).toEqual([...golden.top3]);
    }
  });
});

// BUG-265: the register scan carries the shared progress
// logger — a tally every 5,000 rows against the file's own
// row count (a closing line only at fixture scale).
describe("progress logging (BUG-265)", () => {
  it("scans the fixture with a closing build line, and the settings are unchanged", () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-nurseries",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const positionOf = (pc: string) => postcodes[(pc ?? "").trim().toUpperCase()] ?? null;
    const { settings, stats } = buildSettings(records, positionOf, { progress });
    expect(settings).toHaveLength(296);
    expect(stats.total).toBe(341);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/progress · build 341\/341 rows \(100%\)$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });
});
