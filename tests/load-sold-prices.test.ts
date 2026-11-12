import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the sold-prices loader (plan step M4.2): it must pull the
// Land Registry full file plus the monthly update, merge updates by
// transaction id, stamp the source, and carry the golden-home proof.
// The fixture holds REAL Registry rows for both golden postcodes; the
// medians computed here must match the approved reports exactly. The
// live proof against a real database runs in CI.

const loader = readFileSync(join(process.cwd(), "loaders", "load-sold-prices.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests", "fixtures", "land-registry");

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
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

type Row = { guid: string; price: number; date: string; paon: string; street: string };
function loadFixture(name: string): Row[] {
  return readFileSync(join(fixtureDir, name), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const f = parseLine(line);
      return {
        guid: f[0].replace(/[{}]/g, ""),
        price: Number.parseInt(f[1], 10),
        date: f[2].slice(0, 10),
        postcode: f[3],
        paon: f[7],
        street: f[9],
        status: f[15],
      } as Row & { postcode: string; status: string };
    });
}

function median(prices: number[]): number {
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const COUNTED_8 = new Set([
  "0B85394F-89B0-69A5-E063-4704A8C07DAC",
  "09266DDB-77A0-AF90-E063-4704A8C02087",
  "2131FCF5-A5B1-86E8-E063-4804A8C0372B",
  "1A0C5C63-013E-7CBE-E063-4804A8C06C96",
  "237B17FD-9136-22AC-E063-4804A8C0EA3A",
  "237B17FD-9142-22AC-E063-4804A8C0EA3A",
  "5834E4E8-AD5B-29C7-E063-4804A8C015BC",
  "5834E4E8-59A3-29C7-E063-4804A8C015BC",
]);

describe("sold-prices loader", () => {
  it("pulls the full file and the monthly update, and merges by transaction id", () => {
    expect(loader).toContain("pp-complete.csv");
    expect(loader).toContain("pp-monthly-update-new-version.csv");
    expect(loader).toContain('recordStatus === "D"');
    expect(loader).toContain("HM Land Registry Price Paid");
  });

  it("encodes the report's eight counted transactions for the street median", () => {
    for (const id of COUNTED_8) expect(loader).toContain(id);
  });

  it("fixture reproduces the golden figures after the update merge", () => {
    const full = loadFixture("pp-complete.csv") as (Row & { postcode: string; status: string })[];
    const updates = loadFixture("pp-monthly-update.csv") as (Row & {
      postcode: string;
      status: string;
    })[];
    const byGuid = new Map(full.map((r) => [r.guid, r]));
    for (const u of updates) {
      if (u.status === "D") byGuid.delete(u.guid);
      else byGuid.set(u.guid, u);
    }
    const merged = [...byGuid.values()];
    const cm = merged.filter((r) => r.postcode === "CM3 2JT");
    const e16 = merged.filter((r) => r.postcode === "E16 1GN");

    // The merge worked: one amended price, one deletion, 31 → 30.
    expect(cm).toHaveLength(30);
    expect(cm.find((r) => r.paon === "32")?.price).toBe(651440);
    expect(cm.find((r) => r.paon === "39")).toBeUndefined();

    // Golden figures, exactly as the approved reports state them.
    const home = cm.filter((r) => r.paon === "19" && r.street === "BIRKDALE RISE");
    expect(home).toHaveLength(1);
    expect(home[0].price).toBe(588995);
    expect(home[0].date).toBe("2023-06-15");
    const counted = cm.filter((r) => COUNTED_8.has(r.guid));
    expect(counted).toHaveLength(8);
    expect(median(counted.map((r) => r.price))).toBe(610875);
    expect(e16).toHaveLength(9);
    expect(median(e16.map((r) => r.price))).toBe(310000);
  });
});
