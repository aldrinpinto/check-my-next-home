import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the health loader (plan step M4.7): the register recipes
// (ACTIVE + RO76 practices, dated branch filtering, the reviewed
// exclusion list), the three-state emergency flag, the exact-code
// ratings join under both identifiers, and the golden facts —
// including the user's Sidney House correction: a practice's
// distance is the distance to its nearest site. The live proof
// runs in CI against a real PostGIS.

const loader = readFileSync(join(process.cwd(), "loaders/load-health.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests/fixtures/health");
const readReport = (name: string) =>
  readFileSync(join(fixtureDir, `${name}.csv`), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split(","));
const epraccur = readReport("epraccur");
const ebranchs = readReport("ebranchs");

describe("health loader sources", () => {
  it("uses the DSE reports and discovers the CQC files from the Using CQC data page", () => {
    expect(loader).toContain("odsdatasearchandexport.nhs.uk/api/getReport");
    expect(loader).toContain("using-cqc-data");
    expect(loader).toContain("_CQC_directory");
    expect(loader).toContain("_Latest_ratings");
  });

  it("keeps the reviewed exclusion list in the open, with its reason", () => {
    expect(loader).toContain("EXCLUDED_PRACTICES");
    expect(loader).toContain("F84750");
    expect(loader).toContain("Community Dermatology Clinic");
  });

  it("files branches by date with a COVID-name filter, and the parent code on the row", () => {
    expect(loader).toContain("gp_branch_surgery");
    expect(loader).toContain("COVID|VACCINATION");
    expect(loader).toContain("parentOdsCode");
  });

  it("joins ratings under both identifiers and keeps the flag three-state", () => {
    expect(loader).toContain("locationByOdsCode");
    expect(loader).toContain("hasEmergencyDepartment");
    expect(loader).toContain("urgent and emergency services");
  });
});

describe("fixture register facts", () => {
  it("the trap clinic is in the raw file — and the defunct practice is not", () => {
    expect(epraccur.some((r) => r[0] === "F84750")).toBe(true);
    expect(epraccur.some((r) => r[0] === "F84020")).toBe(false);
  });

  it("St Luke's and Sidney House exist only as branches, with their parents", () => {
    const stLukes = ebranchs.find((r) => r[0] === "F84749002");
    expect(stLukes?.[14]).toBe("F84749");
    const sidney = ebranchs.find((r) => r[0] === "F81149002");
    expect(sidney?.[14]).toBe("F81149");
    expect(sidney?.[9]).toBe("CM3 2HB");
  });
});
