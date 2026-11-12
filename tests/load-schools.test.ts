import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the schools loader (plan step M4.6): the register is read
// by header name in its real Windows-1252 encoding, the selective
// flag is the register's own value with blank kept as not-recorded,
// Ofsted outcomes keep the graded word, the newest event and the
// report card apart, and the fixture (real rows captured 12 Nov
// 2026) reproduces the golden facts the prep and gap check
// established. The live proof runs in CI against a real PostGIS.

const loader = readFileSync(join(process.cwd(), "loaders/load-schools.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/schools");

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

const gias = parseCsv(
  new TextDecoder("windows-1252").decode(readFileSync(join(fixtureDir, "edubase.csv"))),
);
const ofsted = parseCsv(readFileSync(join(fixtureDir, "ofsted-latest-inspections.csv"), "utf8"));
const open = gias.filter((r) => r["EstablishmentStatus (name)"] === "Open");
const ofstedByUrn = new Map(ofsted.map((r) => [r["URN"], r]));

describe("schools loader sources", () => {
  it("reads the register by header name, in Windows-1252, GET-only dated URL", () => {
    expect(loader).toContain("edubasealldata");
    expect(loader).toContain('new TextDecoder("windows-1252")');
    expect(loader).toContain('"AdmissionsPolicy (name)"');
    expect(loader).toContain('"ReligiousCharacter (name)"');
    expect(loader).toContain("EPSG:27700");
  });

  it("discovers the Ofsted file from the gov.uk page instead of hard-coding it", () => {
    expect(loader).toContain("monthly-management-information-ofsteds-school-inspections-outcomes");
    expect(loader).toContain("latest_inspections");
  });

  it("keeps blank admissions policy as not-recorded, never non-selective", () => {
    expect(loader).toContain('blank(row["AdmissionsPolicy (name)"])');
    const blanks = open.filter(
      (r) =>
        r["LA (name)"] === "Newham" &&
        r["PhaseOfEducation (name)"] === "Secondary" &&
        r["AdmissionsPolicy (name)"] === "",
    );
    expect(blanks.map((r) => r["EstablishmentName"]).sort()).toEqual([
      "Harris Science Academy East London",
      "London Design and Engineering UTC",
    ]);
  });
});

describe("fixture golden facts", () => {
  it("Newham has 17 open secondaries and zero recorded selective", () => {
    const secondaries = open.filter(
      (r) => r["LA (name)"] === "Newham" && r["PhaseOfEducation (name)"] === "Secondary",
    );
    expect(secondaries).toHaveLength(17);
    expect(secondaries.filter((r) => r["AdmissionsPolicy (name)"] === "Selective")).toHaveLength(0);
  });

  it("Lift Maltings carries both its 2023 grade and its 2026 report card", () => {
    const row = ofstedByUrn.get("135653");
    expect(row?.["Latest OEIF overall effectiveness"]).toBe("3");
    expect(row?.["Inspection start date of latest OEIF graded inspection"]).toBe("19/09/2023");
    expect(row?.["Inspection start date"]).toBe("24/03/2026");
    expect(row?.["Curriculum and teaching"]).toBe("Expected standard");
    expect(row?.["Achievement"]).toBe("Needs attention");
    expect(row?.["Safeguarding standards"]).toBe("Met");
  });

  it("no-grade schools file their ungraded outcome, not a blank", () => {
    expect(ofstedByUrn.get("114974")?.["Ungraded inspection overall outcome"]).toBe(
      "School remains Good",
    );
    const blenheim = open.find((r) => r["EstablishmentName"] === "Blenheim High School");
    expect(blenheim).toBeDefined();
    expect(ofstedByUrn.get(blenheim!["URN"])?.["Ungraded inspection overall outcome"]).toBe(
      "Standards maintained",
    );
  });

  it("the flat's nearest schools include a Catholic primary and a girls' grammar", () => {
    const stClements = open.find((r) => r["EstablishmentName"]?.includes("St Clement"));
    expect(stClements?.["ReligiousCharacter (name)"]).toBe("Roman Catholic");
    const nonsuch = open.find((r) => r["EstablishmentName"] === "Nonsuch High School for Girls");
    expect(nonsuch?.["AdmissionsPolicy (name)"]).toBe("Selective");
    expect(nonsuch?.["Gender (name)"]).toBe("Girls");
  });
});
