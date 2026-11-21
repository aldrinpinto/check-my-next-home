import { describe, expect, it } from "vitest";
import type { AddressResolution, DirectoryPostcode } from "../lib/address";
import {
  buildAreaBundle,
  projectHeadline,
  type AreaDataSource,
  type ChargingZoneRow,
  type ChargingZonesFacts,
  type ChargingZonesSection,
} from "../lib/area-bundle";
import { SCHEMES } from "../loaders/load-charging-zones.mjs";
import { BANNED_WORDING } from "./banned-wording";

// Guards the charging zones section (plan step M6.31,
// decisions D50, D61 and D63): the inside states in
// their family forms, the outside answer in its two
// forms (the full line behind the completeness gate;
// the named-gap line while the set is incomplete), the
// not-covered states, and the depth boundary — the
// section is report depth only, so the headline
// projection must be identical with and without it.

const NOT_FILED: ChargingZonesFacts = {
  filedCount: 0,
  filedKeys: [],
  oldestLoadedDate: null,
  covering: null,
};

const ALL_KEYS = SCHEMES.map((s) => s.key);
const FILED_KEYS = SCHEMES.filter((s) => s.source !== null).map((s) => s.key);

const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const today = () => daysAgo(0);

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const inWords = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

function row(partial: Partial<ChargingZoneRow> & { name: string }): ChargingZoneRow {
  return {
    schemeKey: "synthetic",
    family: "caz",
    class: null,
    operator: "Synthetic Council",
    inForceDate: "2023-02-27",
    checkerUrl: "https://www.gov.uk/clean-air-zones",
    sourceName: "Synthetic Council — boundary service",
    sourceDate: null,
    ...partial,
  };
}

const SHEFFIELD = row({
  schemeKey: "sheffield",
  name: "Sheffield Clean Air Zone",
  class: "C",
  operator: "Sheffield City Council",
  inForceDate: "2023-02-27",
  sourceName: "Sheffield City Council — Clean Air Zone Boundary",
});
const BIRMINGHAM = row({
  schemeKey: "birmingham",
  name: "Birmingham Clean Air Zone",
  class: "D",
  operator: "Birmingham City Council",
  inForceDate: "2021-06-14",
});
const ULEZ = row({
  schemeKey: "ulez",
  name: "London Ultra Low Emission Zone (ULEZ)",
  family: "ulez",
  operator: "Transport for London",
  inForceDate: "2023-08-29",
  checkerUrl: "https://tfl.gov.uk/modes/driving/check-your-vehicle/",
});
const EDINBURGH = row({
  schemeKey: "edinburgh",
  name: "Edinburgh Low Emission Zone",
  family: "lez",
  operator: "City of Edinburgh Council",
  inForceDate: "2024-06-01",
  checkerUrl: "https://vehicleemissionscheck.service.gov.scot/",
});

const insideFacts = (covering: ChargingZoneRow, extra: Partial<ChargingZonesFacts> = {}) => ({
  filedCount: 11,
  filedKeys: FILED_KEYS,
  oldestLoadedDate: today(),
  covering,
  ...extra,
});
const gapFacts = (): ChargingZonesFacts => ({
  filedCount: 11,
  filedKeys: FILED_KEYS,
  oldestLoadedDate: today(),
  covering: null,
});
const fullFacts = (oldestLoadedDate: string): ChargingZonesFacts => ({
  filedCount: 12,
  filedKeys: ALL_KEYS,
  oldestLoadedDate,
  covering: null,
});

// A source whose every answer is empty except the
// charging-zones facts under test.
class FakeSource implements AreaDataSource {
  cz: ChargingZonesFacts = NOT_FILED;
  async planningLayerFacts() {
    return {
      filedCount: 0,
      covering: [],
      nearestWithin: [],
      nearestBeyond: null,
      sourceName: null,
      sourceDate: null,
    } as never;
  }
  async designationFacts() {
    const empty = {
      filedCount: 0,
      covering: [],
      nearestWithin: [],
      nearestBeyond: null,
      sourceName: null,
      sourceDate: null,
    };
    return {
      byType: { sssi: empty, sac: empty, spa: empty, ramsar: empty },
      overlaps: [] as [number, number][],
    } as never;
  }
  async listedFacts() {
    return {
      filedCount: 0,
      within: [],
      nearestBeyond: null,
      sourceName: null,
      sourceDate: null,
    } as never;
  }
  async phiFacts() {
    return {
      filedCount: 0,
      nearest: null,
      typesWithin: [],
      sourceName: null,
      sourceDate: null,
    } as never;
  }
  async article4Gate() {
    return false;
  }
  async brownfieldFacts() {
    return {
      filedCount: 0,
      within: [],
      nearestBeyond: null,
      sourceName: null,
      sourceDate: null,
    } as never;
  }
  async brownfieldGate() {
    return false;
  }
  async epcArtefact() {
    return null;
  }
  async loadEpc() {}
  async councilTaxRow() {
    return null;
  }
  async censusRow() {
    return null;
  }
  async imdRow() {
    return null;
  }
  async airSquare() {
    return null;
  }
  async aqmaFacts() {
    return { filedCount: 0, covering: [], nearestWithin: null, sourceName: null, sourceDate: null };
  }
  async chargingZonesFacts() {
    return this.cz;
  }
  async noiseRows() {
    return { filedCount: 0, rows: [], sourceName: null, sourceDate: null };
  }
  async benefits() {
    return { claimantCount: null, ucPeople: null, ucHouseholds: null, bases: null };
  }
  async solarCell() {
    return { gridFiledCount: 0, cell: null };
  }
  async companyOwnershipFacts() {
    return {
      ccodFiledCount: 0,
      ocodFiledCount: 0,
      editions: {
        ccod: { sourceName: null, sourceDate: null },
        ocod: { sourceName: null, sourceDate: null },
      },
      titles: [],
      snapshots: {},
    } as never;
  }
  async tribunalFacts() {
    return { filedCount: 0, lastFiledAt: null, sourceName: null, rows: [] } as never;
  }
  async broadbandAnswer() {
    return null;
  }
  async mobileAnswer() {
    return null;
  }
}

function directory(partial: Partial<DirectoryPostcode> & { postcode: string }): DirectoryPostcode {
  return {
    latitude: 0,
    longitude: 0,
    council: null,
    ward: null,
    region: null,
    lsoaCode: null,
    msoaCode: null,
    ...partial,
  };
}

const EXETER: AddressResolution = {
  rung: 1,
  kind: "home",
  directory: directory({
    postcode: "E16 1GN",
    latitude: 51.515224,
    longitude: 0.021177,
    council: "Newham",
    lsoaCode: "E01003511",
    msoaCode: "E02000749",
  }),
  address: {
    postcode: "E16 1GN",
    paon: "6",
    saon: null,
    street: "EXETER ROAD",
    town: null,
    label: "6 Exeter Road",
  } as never,
};

async function section(facts: ChargingZonesFacts): Promise<ChargingZonesSection> {
  const source = new FakeSource();
  source.cz = facts;
  const bundle = await buildAreaBundle(EXETER, source);
  if (bundle.kind !== "area-bundle") throw new Error("expected an area bundle");
  return bundle.sections.chargingZones;
}

const BASIS =
  "Charging zones are areas where driving a vehicle that does not meet the zone's emission standard can cost the driver money. Whether a vehicle is charged depends on the vehicle, not on the home. The date shown for a zone is the date its charges, or its penalties, began.";

describe("charging zones — inside, in the family forms (D61)", () => {
  it("a Class C zone: the class line names GOV.UK's vehicle list, and the cars line serves", async () => {
    const s = await section(insideFacts(SHEFFIELD));
    expect(s.state).toBe("inside");
    expect(s.line).toBe("This postcode point is inside the Sheffield Clean Air Zone.");
    expect(s.scheme?.classLine).toBe(
      "Sheffield City Council runs this Class C zone. A Class C zone charges buses, coaches, taxis, private hire vehicles, heavy goods vehicles, vans and minibuses that do not meet its emission standards.",
    );
    expect(s.scheme?.carsLine).toBe("Private cars are not charged in this zone.");
    expect(s.scheme?.dateLine).toBe("Charges in this zone began on 27 February 2023.");
    expect(s.scheme?.checkerUrl).toBe("https://www.gov.uk/clean-air-zones");
    expect(s.scheme?.checkerLabel).toBe("Check a vehicle on GOV.UK");
    expect(s.basisLine).toBe(BASIS);
    expect(s.filedCount).toBe(11);
    expect(s.sourceName).toBe("Sheffield City Council — Clean Air Zone Boundary");
    expect(s.setDate).toBeNull();
  });

  it("a Class D zone charges cars: the cars line is null", async () => {
    const s = await section(insideFacts(BIRMINGHAM));
    expect(s.scheme?.classLine).toBe(
      "Birmingham City Council runs this Class D zone. A Class D zone charges buses, coaches, taxis, private hire vehicles, heavy goods vehicles, vans, minibuses and cars that do not meet its emission standards.",
    );
    expect(s.scheme?.carsLine).toBeNull();
    expect(s.scheme?.dateLine).toBe("Charges in this zone began on 14 June 2021.");
  });

  it("Classes A and B carry the cars line too, with their own vehicle lists", async () => {
    const a = await section(
      insideFacts(row({ name: "A Zone", class: "A", operator: "A Council" })),
    );
    expect(a.scheme?.classLine).toContain(
      "charges buses, coaches, taxis, private hire vehicles that do not meet",
    );
    expect(a.scheme?.carsLine).toBe("Private cars are not charged in this zone.");
    const b = await section(
      insideFacts(row({ name: "B Zone", class: "B", operator: "B Council" })),
    );
    expect(b.scheme?.classLine).toContain(
      "charges buses, coaches, taxis, private hire vehicles, heavy goods vehicles that do not meet",
    );
    expect(b.scheme?.carsLine).toBe("Private cars are not charged in this zone.");
  });

  it("the ULEZ: its own class line, the boundary date line, the TfL checker", async () => {
    const s = await section(insideFacts(ULEZ));
    expect(s.line).toBe("This postcode point is inside the London Ultra Low Emission Zone (ULEZ).");
    expect(s.scheme?.classLine).toBe(
      "Transport for London runs the zone. It applies to cars, motorcycles, vans, minibuses, buses, coaches and heavy goods vehicles that do not meet its emission standards.",
    );
    expect(s.scheme?.class).toBeNull();
    expect(s.scheme?.carsLine).toBeNull();
    expect(s.scheme?.dateLine).toBe(
      "Charges in this zone, at this boundary, began on 29 August 2023.",
    );
    expect(s.scheme?.checkerUrl).toBe("https://tfl.gov.uk/modes/driving/check-your-vehicle/");
    expect(s.scheme?.checkerLabel).toBe("Check a vehicle with TfL");
  });

  it("a Scottish LEZ: the penalty model in words, penalties date line, Scotland's checker", async () => {
    const s = await section(insideFacts(EDINBURGH));
    expect(s.line).toBe("This postcode point is inside the Edinburgh Low Emission Zone.");
    expect(s.scheme?.classLine).toBe(
      "City of Edinburgh Council runs this Low Emission Zone. A vehicle that does not meet the zone's emission standard may not be driven in the zone. There is no charge to pay to enter: driving a vehicle that does not meet the standard in the zone can lead to a penalty charge notice.",
    );
    expect(s.scheme?.classLine).toContain("penalty");
    expect(s.scheme?.dateLine).toBe("Penalties in this zone began on 1 June 2024.");
    expect(s.scheme?.checkerUrl).toBe("https://vehicleemissionscheck.service.gov.scot/");
    expect(s.scheme?.checkerLabel).toBe("Check a vehicle on Scotland's LEZ checker");
  });

  it("inside serves on its own evidence with the gate wide shut (one scheme filed, a year old)", async () => {
    const s = await section(
      insideFacts(SHEFFIELD, {
        filedCount: 1,
        filedKeys: ["sheffield"],
        oldestLoadedDate: daysAgo(400),
      }),
    );
    expect(s.state).toBe("inside");
    expect(s.scheme?.name).toBe("Sheffield Clean Air Zone");
  });
});

describe("charging zones — outside, in its two forms, and the gate (D61/D63)", () => {
  it("the full outside line serves behind the open gate, naming the set date", async () => {
    const stamp = today();
    const s = await section(fullFacts(stamp));
    expect(s.state).toBe("outside");
    expect(s.line).toBe(
      `This postcode point is not inside any Clean Air Zone, the London Ultra Low Emission Zone, or any Scottish Low Emission Zone in force on ${inWords(stamp)}.`,
    );
    expect(s.setDate).toBe(stamp);
    expect(s.filedCount).toBe(12);
    expect(s.basisLine).toBe(BASIS);
    expect(s.scheme).toBeNull();
  });

  it("the gate holds at exactly 120 days and closes at 121", async () => {
    const at120 = await section(fullFacts(daysAgo(120)));
    expect(at120.state).toBe("outside");
    expect(at120.setDate).toBe(daysAgo(120));
    const at121 = await section(fullFacts(daysAgo(121)));
    expect(at121.state).toBe("not-covered");
  });

  it("while Portsmouth is unfiled, a home far from it gets the plain outside line (D63, reach-bound by BUG-085)", async () => {
    // The fixture home stands in London — far outside
    // Portsmouth's broad reach, so the uncheckable zone
    // is not named for it; the blind spot's standing
    // record is the air How-we-check page.
    const s = await section(gapFacts());
    expect(s.state).toBe("outside");
    expect(s.line).toBe(
      "This postcode point is not inside any charging zone whose boundary is published.",
    );
    expect(s.setDate).toBeNull();
    expect(s.filedCount).toBe(11);
    expect(s.basisLine).toBe(BASIS);
  });

  it("while Portsmouth is unfiled, a home within its reach gets the named-gap line (D63)", async () => {
    const source = new FakeSource();
    source.cz = gapFacts();
    const near: AddressResolution = {
      ...EXETER,
      directory: directory({
        postcode: "PO1 1AA",
        latitude: 50.81,
        longitude: -1.08,
        council: "Portsmouth",
        lsoaCode: "E01017068",
        msoaCode: "E02001374",
      }),
    };
    const bundle = await buildAreaBundle(near, source);
    if (bundle.kind !== "area-bundle") throw new Error("expected an area bundle");
    const s = bundle.sections.chargingZones;
    expect(s.state).toBe("outside");
    expect(s.line).toBe(
      "This postcode point is not inside any charging zone whose boundary is published. The Portsmouth Clean Air Zone is in force, but its boundary is not published, so it cannot be checked here.",
    );
  });

  it("a complete but stale set serves not-covered — a negative that old is not proof", async () => {
    const s = await section(fullFacts(daysAgo(200)));
    expect(s.state).toBe("not-covered");
    expect(s.line).toBe(
      "Charging zones — the charging zone data on file is out of date, so no charging zone answer can be given yet",
    );
    expect(s.basisLine).toBeNull();
    expect(s.filedCount).toBeNull();
  });

  it("an unfiled table serves the D30 two-part not-covered line", async () => {
    const s = await section(NOT_FILED);
    expect(s.state).toBe("not-covered");
    expect(s.line).toBe(
      "Charging zones — the charging zone data is not filed yet, so no charging zone answer can be given yet",
    );
    expect(s.basisLine).toBeNull();
    expect(s.scheme).toBeNull();
    expect(s.filedCount).toBeNull();
    expect(s.setDate).toBeNull();
  });
});

describe("charging zones — the depth boundary and the wording fences", () => {
  it("the headline projection is identical with and without the section's evidence", async () => {
    const source = new FakeSource();
    source.cz = insideFacts(ULEZ);
    const withEvidence = await buildAreaBundle(EXETER, source);
    source.cz = NOT_FILED;
    const without = await buildAreaBundle(EXETER, source);
    if (withEvidence.kind !== "area-bundle" || without.kind !== "area-bundle")
      throw new Error("expected area bundles");
    expect(withEvidence.sections.chargingZones.state).toBe("inside");
    expect(projectHeadline(withEvidence)).toEqual(projectHeadline(without));
    const headline = projectHeadline(withEvidence);
    expect(headline).not.toBeNull();
    expect("chargingZones" in (headline as unknown as Record<string, unknown>)).toBe(false);
    expect(JSON.stringify(headline)).not.toContain("ULEZ");
    expect(JSON.stringify(headline)).not.toContain("Charging zones");
  });

  it("no distance to a zone is ever served: the shape has no miles leaf anywhere", async () => {
    for (const facts of [insideFacts(ULEZ), gapFacts(), fullFacts(today()), NOT_FILED]) {
      const s = await section(facts);
      const keys: string[] = [];
      const walk = (value: unknown) => {
        if (value && typeof value === "object")
          for (const [k, v] of Object.entries(value)) {
            keys.push(k);
            walk(v);
          }
      };
      walk(s);
      expect(keys).not.toContain("miles");
      expect(JSON.stringify(s)).not.toContain("1.362");
    }
  });

  it("no charging amount appears in any served state (D50)", async () => {
    for (const facts of [
      insideFacts(SHEFFIELD),
      insideFacts(ULEZ),
      insideFacts(EDINBURGH),
      gapFacts(),
      fullFacts(today()),
      NOT_FILED,
    ]) {
      const s = await section(facts);
      expect(JSON.stringify(s)).not.toContain("£");
      expect(JSON.stringify(s)).not.toMatch(/\d\s?(pounds|pence|per day)/i);
    }
  });

  it("the model words never cross: CAZ/ULEZ lines carry no 'penalty', LEZ lines carry it", async () => {
    for (const covering of [SHEFFIELD, BIRMINGHAM, ULEZ]) {
      const s = await section(insideFacts(covering));
      const strings = [s.scheme?.classLine ?? "", s.scheme?.dateLine ?? ""].join(" ");
      expect(strings.toLowerCase()).not.toContain("penalty");
    }
    const lez = await section(insideFacts(EDINBURGH));
    expect((lez.scheme?.classLine ?? "").toLowerCase()).toContain("penalty");
    expect((lez.scheme?.dateLine ?? "").toLowerCase()).toContain("penalt");
  });

  it("the banned-wording scan: with scheme names stripped, nothing banned survives", async () => {
    const names = [
      ...SCHEMES.map((s) => s.name),
      "Clean Air Zone",
      "Low Emission Zone",
      "Ultra Low Emission Zone",
    ].sort((a, b) => b.length - a.length);
    const strip = (text: string) => {
      let out = text.toLowerCase();
      for (const name of names) out = out.split(name.toLowerCase()).join(" ");
      return out;
    };
    for (const facts of [
      insideFacts(SHEFFIELD),
      insideFacts(ULEZ),
      insideFacts(EDINBURGH),
      gapFacts(),
      fullFacts(today()),
      NOT_FILED,
    ]) {
      const s = await section(facts);
      const strings: string[] = [];
      const walk = (value: unknown) => {
        if (typeof value === "string") strings.push(value);
        else if (value && typeof value === "object") for (const v of Object.values(value)) walk(v);
      };
      walk(s);
      for (const text of strings) {
        const stripped = strip(text);
        for (const banned of BANNED_WORDING)
          expect(stripped, `${banned} in "${text}"`).not.toContain(banned);
      }
      // And the proof the strip is what saves the scan:
      // "clean air" occurs in the served strings ONLY
      // inside the zone names stripped above.
      const joined = strings.join(" ").toLowerCase();
      if (joined.includes("clean air")) expect(strip(joined)).not.toContain("clean air");
    }
  });
});

describe("charging zones — the brain's register matches the loader's (anti-drift pin)", () => {
  it("the loader register is the gate's register: twelve keys, Portsmouth the gap", () => {
    // The brain's register is module-private; its
    // observable behaviour is the gate and the gap line.
    // The loader's copy is pinned here, and the serving
    // tests above pin the brain's behaviour against the
    // same twelve keys (full set opens the gate; the
    // eleven filed keys serve the Portsmouth gap line).
    expect(SCHEMES).toHaveLength(12);
    expect(FILED_KEYS).toHaveLength(11);
    expect(ALL_KEYS).toContain("portsmouth");
  });
});
