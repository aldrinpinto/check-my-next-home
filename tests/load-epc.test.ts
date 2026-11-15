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
    // The assessment type is filed so a predicted (SAP) rating can
    // be labelled predicted (decision D7), and the dwelling type is
    // normalised across the register's two shapes.
    expect(loader).toContain("assessment_type");
    expect(loader).toContain("dwelling.value");
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

  it("files the register's modelled energy costs, GBP only (M6.14 widening, D33)", () => {
    // The six cost fields, current and potential, are read
    // from the certificate document — and a non-GBP figure
    // is never filed as a number the product could serve.
    for (const field of [
      "heating_cost_current",
      "hot_water_cost_current",
      "lighting_cost_current",
      "heating_cost_potential",
      "hot_water_cost_potential",
      "lighting_cost_potential",
    ])
      expect(loader).toContain(field);
    expect(loader).toContain('cost.currency !== "GBP"');
  });

  it("fixture carries the golden modelled energy costs (M6.14)", () => {
    const totalsAt = (pc: string, address: string, side: "current" | "potential") => {
      const search = JSON.parse(
        readFileSync(join(fixtureDir, fixture.postcodes[pc].searchFile), "utf8"),
      ) as { data: { certificateNumber: string; addressLine1: string }[] };
      const totals: number[] = [];
      for (const stub of search.data) {
        if (stub.addressLine1 !== address) continue;
        const raw = JSON.parse(
          readFileSync(join(fixtureDir, "certs", `${stub.certificateNumber}.json`), "utf8"),
        ) as { data?: unknown } & Record<string, unknown>;
        const doc = (raw.data ?? raw) as Record<
          string,
          { value: number; currency: string } | undefined
        >;
        const parts = [
          doc[`heating_cost_${side}`],
          doc[`hot_water_cost_${side}`],
          doc[`lighting_cost_${side}`],
        ];
        for (const part of parts) expect(part?.currency).toBe("GBP");
        totals.push(parts.reduce((sum, part) => sum + (part?.value ?? 0), 0));
      }
      return totals.sort((a, b) => a - b);
    };
    // 19 Birkdale Rise: £489 current, £455 potential a year.
    expect(totalsAt("CM3 2JT", "19 Birkdale Rise", "current")).toEqual([489]);
    expect(totalsAt("CM3 2JT", "19 Birkdale Rise", "potential")).toEqual([455]);
    // 6 Exeter Road: the disagreement — £351 (2013) and
    // £1,104 (2023) a year, both sides.
    expect(totalsAt("E16 1GN", "6 Exeter Road", "current")).toEqual([351, 1104]);
    expect(totalsAt("E16 1GN", "6 Exeter Road", "potential")).toEqual([351, 1104]);
    // Flat 4, Minerva House: captured from the register for
    // M6.14 — £278 a year on both sides.
    expect(totalsAt("KT17 1FH", "Flat 4 Minerva House", "current")).toEqual([278]);
    expect(totalsAt("KT17 1FH", "Flat 4 Minerva House", "potential")).toEqual([278]);
  });
});
