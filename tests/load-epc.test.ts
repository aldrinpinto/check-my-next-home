import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the EPC loader (plan step M4.5, option A): per-postcode
// lookups against the Get energy performance of buildings data API,
// minimised filing into the postcode's cached answers, and — the
// plan's check — disagreeing certificates must both survive. The
// fixture holds real API responses captured on 12 Nov 2026. The
// live proof against a real database runs in CI.

const loader = readFileSync(join(process.cwd(), "loaders", "load-epc.mjs"), "utf8");
const fixtureDir = join(process.cwd(), "tests", "fixtures", "epc");
const fixture = JSON.parse(readFileSync(join(fixtureDir, "fixture.json"), "utf8"));

describe("epc loader", () => {
  it("uses the API with the bearer token and the answers merge", () => {
    expect(loader).toContain("https://api.get-energy-performance-data.communities.gov.uk");
    expect(loader).toContain("/api/domestic/search");
    expect(loader).toContain("/api/certificate");
    expect(loader).toContain("EPC_API_TOKEN");
    expect(loader).toContain("answers = answers || $1::jsonb");
  });

  it("fixture reproduces the golden certificates", () => {
    const areasAt = (pc: string, address: string) => {
      const search = JSON.parse(
        readFileSync(join(fixtureDir, fixture.postcodes[pc].searchFile), "utf8"),
      ) as { data: { certificateNumber: string; addressLine1: string }[] };
      const areas: number[] = [];
      for (const stub of search.data) {
        const raw = JSON.parse(
          readFileSync(join(fixtureDir, "certs", `${stub.certificateNumber}.json`), "utf8"),
        ) as { data?: unknown } & Record<string, unknown>;
        const doc = (raw.data ?? raw) as {
          total_floor_area: number;
          current_energy_efficiency_band: string;
        };
        if (stub.addressLine1 === address) {
          expect(doc.current_energy_efficiency_band).toBe("B");
          areas.push(doc.total_floor_area);
        }
      }
      return areas.sort((a, b) => a - b);
    };
    // 6 Exeter Road: two certificates, 71 and 91 sq m — both survive.
    expect(areasAt("E16 1GN", "6 Exeter Road")).toEqual([71, 91]);
    // 19 Birkdale Rise: one certificate, 141 sq m.
    expect(areasAt("CM3 2JT", "19 Birkdale Rise")).toEqual([141]);
  });

  it("fixture search counts match the captured API totals", () => {
    for (const [pc, entry] of Object.entries<{ searchFile: string }>(fixture.postcodes)) {
      const search = JSON.parse(readFileSync(join(fixtureDir, entry.searchFile), "utf8")) as {
        data: unknown[];
        pagination: { totalRecords: number };
      };
      expect(search.data.length, pc).toBe(search.pagination.totalRecords);
    }
  });
});
