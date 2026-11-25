import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPoints } from "../loaders/load-health.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

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

  it("files the ratings population groups on hospital points only (M6.24)", () => {
    expect(loader).toContain("cqcPopulationGroups");
    expect(loader).toContain("cqc_population_groups");
    // "Overall" is the rating's own marker in that column and
    // never files as a group.
    expect(loader).toContain('group !== "overall"');
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

describe("the maternity signal (M6.24)", () => {
  // The step's founding fact, pinned at the fixture: the CQC
  // directory's vocabulary carries no maternity value at all —
  // the word does not appear in the file — while the ratings
  // file's "Service / Population Group" column (cell 17, the
  // column the loader's ratings aggregator reads) names
  // Maternity for exactly four locations.
  const directoryText = readFileSync(join(fixtureDir, "cqc-directory.csv"), "utf8");
  const ratings = readReport("cqc-ratings");

  it("the directory fixture never mentions maternity", () => {
    expect(directoryText).not.toContain("Maternity");
  });

  it("the ratings fixture carries the Maternity group for exactly the four units", () => {
    const locations = new Set(ratings.filter((r) => r[17] === "Maternity").map((r) => r[0]));
    expect([...locations].sort()).toEqual(["R1HNH", "RAJ32", "RVR05", "RVR50"]);
  });
});

// BUG-265: the point build carries the shared progress
// logger — a tally every 5,000 points built, and a closing
// line, with no total (points built is not the rows read).
describe("progress logging (BUG-265)", () => {
  const practiceRow = (code: string): string[] => {
    const row = new Array<string>(27).fill("");
    row[0] = code;
    row[1] = `Practice ${code}`;
    row[9] = "CM3 2JT";
    row[12] = "ACTIVE";
    row[25] = "RO76";
    return row;
  };
  const epraccur = Array.from({ length: 5001 }, (_, i) =>
    practiceRow(`F${String(i).padStart(5, "0")}`),
  );
  const buildArgs = (progress?: ReturnType<typeof createProgressLogger>) => ({
    epraccur,
    ebranchs: [],
    edispensary: [],
    egdpprac: [],
    directoryRows: [],
    positionOf: () => ({ lat: 51.776176, lng: 0.60387 }),
    today: new Date("2026-11-25T00:00:00Z"),
    progress: progress ?? null,
  });

  it("emits a tally line every 5,000 points and a closing line", () => {
    const lines: string[] = [];
    const progress = createProgressLogger({
      name: "load-health",
      log: (...args: unknown[]) => lines.push(args.join(" ")),
    });
    const { points } = buildPoints(buildArgs(progress));
    expect(points).toHaveLength(5001);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/progress · build 5,000 points$/);
    expect(lines[1]).toMatch(/progress · build 5,001 points$/);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("builds the same points without a logger", () => {
    const { points } = buildPoints(buildArgs());
    expect(points).toHaveLength(5001);
  });
});
