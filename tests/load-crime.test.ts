import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeBasisResidents,
  englandResidents,
  nationalForWindow,
} from "../loaders/load-crime.mjs";

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

  // M6.20 (decision D39): the fixture pins the Basis B
  // populations — the values measured at the step's prep on
  // the full filed directory. The loader's fixture mode
  // files the pin verbatim and never computes (the trap:
  // CI's lsoa_bases fixture holds only the three golden
  // rows, so a computation there would silently return the
  // own-LSOA population — basis A — while the count
  // goldens above still passed).
  it("fixture pins the measured Basis B populations (M6.20)", () => {
    expect(fixture.basisResidents).toEqual({ "CM3 2JT": 6380, "E16 1GN": 87519 });
    expect(loader).toContain("fixture.basisResidents");
    expect(loader).toContain("computeBasisResidents");
  });
});

// The loader's live basis path, driven through a fake pool
// (the loader-contracts gold standard): the SQL's candidate
// box is applied by the fake, the haversine cut and the
// whole-LSOA sum are the loader's own.
describe("crime loader — Basis B computation (M6.20)", () => {
  const POINT = { lat: 51.0, lng: 0.0 };
  // A synthetic directory around the point: LSOA A holds the
  // point and a neighbour 0.35 miles north; B's only
  // postcode sits 0.69 miles north (inside — B counts
  // WHOLE); C's only postcode sits 1.11 miles north
  // (outside — C is missed, the basis's named bias).
  const DIRECTORY = [
    { lsoa_code: "E01000001", latitude: 51.0, longitude: 0.0 },
    { lsoa_code: "E01000001", latitude: 51.005, longitude: 0.0 },
    { lsoa_code: "E01000002", latitude: 51.01, longitude: 0.0 },
    { lsoa_code: "E01000003", latitude: 51.016, longitude: 0.0 },
    { lsoa_code: null, latitude: 51.002, longitude: 0.0 },
  ];
  const BASES: Record<string, number> = { E01000001: 1000, E01000002: 2000, E01000003: 4000 };

  function fakeClient(bases: Record<string, number>) {
    return {
      async query(text: string, params?: readonly unknown[]) {
        if (text.includes("FROM postcode_cache")) {
          const [latLo, latHi, lngLo, lngHi] = params as number[];
          return {
            rows: DIRECTORY.filter(
              (r) =>
                // The loader's SQL filters lsoa_code IS NOT
                // NULL (directory rows with no LSOA — the
                // null row above — never reach the set).
                r.lsoa_code !== null &&
                r.latitude >= latLo &&
                r.latitude <= latHi &&
                r.longitude >= lngLo &&
                r.longitude <= lngHi,
            ),
          };
        }
        if (text.includes("FROM lsoa_bases WHERE lsoa_code = ANY")) {
          const codes = (params as unknown[][])[0] as string[];
          return {
            rows: codes
              .filter((c) => c in bases)
              .map((c) => ({ lsoa_code: c, residents: bases[c] })),
          };
        }
        throw new Error(`unexpected query: ${text}`);
      },
    };
  }

  it("sums the LSOAs of the in-mile postcodes, counted whole", async () => {
    // A (1,000) + B (2,000); C's 4,000 is outside the mile.
    expect(await computeBasisResidents(fakeClient(BASES) as never, POINT)).toBe(3000);
  });

  it("returns null when any in-set LSOA has no bases row — a partial sum is never filed", async () => {
    const partial = { E01000001: 1000, E01000003: 4000 };
    expect(await computeBasisResidents(fakeClient(partial) as never, POINT)).toBeNull();
  });

  it("pins the degradation the fixture mode must never fall into: own-LSOA alone is not the basis", async () => {
    // Basis A would file 1,000 here. The computed basis is
    // the multi-LSOA sum — if the loader's set logic ever
    // collapses to the point's own LSOA, this fails.
    const basis = await computeBasisResidents(fakeClient(BASES) as never, POINT);
    expect(basis).not.toBe(BASES.E01000001);
    expect(basis).toBe(3000);
  });
});

describe("crime loader — the England embedding (M6.20)", () => {
  const MONTHS = [
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
  ];

  function fakeClient(filedMonths: string[], basesAreas: number, basesSum: number) {
    return {
      async query(text: string, params?: readonly unknown[]) {
        if (text.includes("FROM crime_national_months")) {
          const wanted = (params as unknown[][])[0];
          return {
            rows: wanted
              .filter((m) => filedMonths.includes(m as string))
              .map((m) => ({ month: m, england_total: 100 })),
          };
        }
        if (text.includes("FROM lsoa_bases")) {
          return { rows: [{ residents: basesSum, areas: basesAreas }] };
        }
        throw new Error(`unexpected query: ${text}`);
      },
    };
  }

  it("embeds the window figure when all 12 months are filed", async () => {
    const national = await nationalForWindow(fakeClient(MONTHS, 33755, 56490108) as never, MONTHS);
    expect(national).toEqual({ total: 1200, residents: 56490108 });
  });

  it("embeds nothing while any month of the window is uncounted", async () => {
    const national = await nationalForWindow(
      fakeClient(MONTHS.slice(0, 11), 33755, 56490108) as never,
      MONTHS,
    );
    expect(national).toBeNull();
  });

  it("the denominator is the filed E01 sum — and null while the bases are unfiled", async () => {
    expect(await englandResidents(fakeClient([], 33755, 56490108) as never)).toBe(56490108);
    expect(await englandResidents(fakeClient([], 0, 0) as never)).toBeNull();
  });
});
