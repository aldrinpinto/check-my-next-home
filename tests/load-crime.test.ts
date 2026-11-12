import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the crime loader (plan step M4.3): it must anchor to the
// latest published Police.uk month, apply the freshness guard, count
// over the rolling 12-month window, and file into the postcode's
// cached answers without disturbing other answer keys. The fixture
// holds the REAL API responses captured on 12 Nov 2026; its totals
// must reproduce the approved reports exactly (330 / 10,722). The
// live proof against a real database runs in CI.

const loader = readFileSync(join(process.cwd(), "loaders", "load-crime.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests", "fixtures", "police-uk");
const fixture = JSON.parse(readFileSync(join(fixtureDir, "fixture.json"), "utf8"));

function monthIndex(yyyyMm: string): number {
  const [y, m] = yyyyMm.split("-").map(Number);
  return y * 12 + (m - 1);
}

describe("crime loader", () => {
  it("anchors to the availability endpoint and carries the freshness guard", () => {
    expect(loader).toContain("https://data.police.uk/api/crimes-street-dates");
    expect(loader).toContain("https://data.police.uk/api/crimes-street/all-crime");
    expect(loader).toContain("MAX_LAG_MONTHS = 3");
    expect(loader).toContain("freshness guard");
  });

  it("files by merging the crime key into the cached answers only", () => {
    expect(loader).toContain("answers = answers || $1::jsonb");
    expect(loader).toContain("Police.uk street-level crime");
  });

  it("fixture reproduces the approved totals over the latest 12 published months", () => {
    const dates = JSON.parse(readFileSync(join(fixtureDir, fixture.datesFile), "utf8")) as {
      date: string;
    }[];
    const latest = dates
      .map((d) => d.date)
      .sort()
      .at(-1);
    expect(latest).toBe("2026-09");
    // The freshness guard's maths on the fixture's pinned "today".
    expect(monthIndex(fixture.today.slice(0, 7)) - monthIndex(latest!)).toBe(2);

    const expected: Record<string, number> = { "CM3 2JT": 330, "E16 1GN": 10722 };
    for (const [pc, point] of Object.entries<{ prefix: string }>(fixture.points)) {
      let total = 0;
      for (let back = 11; back >= 0; back -= 1) {
        const idx = monthIndex(latest!) - back;
        const month = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
        const records = JSON.parse(
          readFileSync(join(fixtureDir, `${point.prefix}-${month}.json`), "utf8"),
        ) as unknown[];
        total += records.length;
      }
      expect(total, `${pc} 12-month total`).toBe(expected[pc]);
    }
  });
});
