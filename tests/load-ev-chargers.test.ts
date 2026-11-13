import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BANDS,
  FILEABLE_USAGE,
  buildSites,
  classifyPois,
  goldenChecks,
  groupSites,
  haversineMiles,
  mergeConnectors,
  normaliseTitle,
  poiDevices,
  readPoisFile,
} from "../loaders/load-ev-chargers.mjs";

// EV chargers loader (plan step M5.7), tested against the
// windowed fixture in tests/fixtures/ev-chargers — a trimmed
// cut of the 13 Nov 2026 gate capture (see the fixture
// README) — plus crafted records for the classes no golden
// window holds (UsageType 7 and 3 do not exist near the
// golden homes). The golden figures are the re-fixed ones:
// the plan's originals were the dead National Chargepoint
// Registry's and OpenStreetMap's, and could not survive the
// source change (gap P1).

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/ev-chargers");
const loaderSource = readFileSync(join(process.cwd(), "loaders/load-ev-chargers.mjs"), "utf8");
const fixturePois = readPoisFile(FIXTURE_DIR);
const fixture = buildSites(fixturePois);

// A minimal POI in the API's shape; tests override the
// fields they exercise.
function poi(overrides: Record<string, unknown> = {}) {
  return {
    ID: 1,
    UsageTypeID: 1,
    UsageType: { ID: 1, Title: "Public" },
    StatusTypeID: 50,
    StatusType: { ID: 50, Title: "Operational" },
    OperatorID: 99,
    OperatorInfo: { ID: 99, Title: "Test Operator" },
    DataProvider: { ID: 1, Title: "Open Charge Map Contributors" },
    NumberOfPoints: 1,
    DateLastStatusUpdate: "2026-01-15T10:00:00Z",
    AddressInfo: {
      Title: "Test Site",
      AddressLine1: "1 Test Street",
      AddressLine2: null,
      Town: "Test Town",
      Postcode: "TE1 1ST",
      Latitude: 51.5,
      Longitude: 0.5,
    },
    Connections: [
      {
        ConnectionType: { ID: 25, Title: "Type 2 (Socket Only)" },
        PowerKW: 7,
        Quantity: 1,
        StatusTypeID: 50,
      },
    ],
    ...overrides,
  };
}

describe("the explicit-public filter (gap L6, the founder's re-rule)", () => {
  it("files exactly UsageTypes 1, 4 and 5 — Public, Membership Required, Pay At Location", () => {
    expect([...FILEABLE_USAGE.keys()].sort()).toEqual([1, 4, 5]);
    for (const [id, usage] of [
      [1, "Public"],
      [4, "Public - Membership Required"],
      [5, "Public - Pay At Location"],
    ] as const) {
      const { usable, counts } = classifyPois([
        poi({ UsageTypeID: id, UsageType: { ID: id, Title: usage } }),
      ]);
      expect(usable).toHaveLength(1);
      expect(counts.filedPois).toBe(1);
    }
  });

  it("excludes every other class and counts each one — Notice Required, the private classes, unknown, and unrecorded", () => {
    const excluded: Array<[number | null, string | null]> = [
      [7, "Public - Notice Required"],
      [6, "Private - For Staff, Visitors or Customers"],
      [2, "Private - Restricted Access"],
      [3, "Privately Owned - Notice Required"],
      [0, "(Unknown)"],
      [null, null],
    ];
    const records = excluded.map(([id, title], i) =>
      poi({
        ID: 100 + i,
        UsageTypeID: id,
        UsageType: id === null ? null : { ID: id, Title: title },
      }),
    );
    const { usable, counts } = classifyPois(records);
    const byClass = counts.usageExcludedByClass as Record<string, number>;
    expect(usable).toHaveLength(0);
    expect(counts.usageExcluded).toBe(6);
    expect(byClass["Public - Notice Required"]).toBe(1);
    expect(byClass["Private - For Staff, Visitors or Customers"]).toBe(1);
    expect(byClass["Private - Restricted Access"]).toBe(1);
    expect(byClass["Privately Owned - Notice Required"]).toBe(1);
    expect(byClass["(Unknown)"]).toBe(1);
    expect(byClass["usage not recorded"]).toBe(1);
  });

  it("excludes Planned and Removed statuses, and Northern Ireland, and records with no position — each counted", () => {
    const planned = poi({
      ID: 201,
      StatusTypeID: 150,
      StatusType: { ID: 150, Title: "Planned For Future Date" },
    });
    const removed = poi({ ID: 202, StatusTypeID: 200, StatusType: { ID: 200, Title: "Removed" } });
    const belfast = poi({
      ID: 203,
      AddressInfo: {
        Title: "Belfast Site",
        AddressLine1: null,
        AddressLine2: null,
        Town: "Belfast",
        Postcode: "BT1 1AA",
        Latitude: 54.6,
        Longitude: -5.93,
      },
    });
    const noPosition = poi({
      ID: 204,
      AddressInfo: {
        Title: "Nowhere",
        AddressLine1: null,
        AddressLine2: null,
        Town: null,
        Postcode: null,
        Latitude: null,
        Longitude: null,
      },
    });
    const { usable, counts } = classifyPois([planned, removed, belfast, noPosition]);
    expect(usable).toHaveLength(0);
    expect(counts.statusExcluded).toBe(2);
    expect(counts.statusExcludedByClass).toEqual({ Planned: 1, Removed: 1 });
    expect(counts.northernIreland).toBe(1);
    expect(counts.noPosition).toBe(1);
  });

  it("accounts for every record exactly once on the fixture (the reconciliation the log line prints)", () => {
    expect(fixture.counts.read).toBe(901);
    const accounted =
      fixture.counts.filedPois +
      fixture.counts.noPosition +
      fixture.counts.northernIreland +
      fixture.counts.statusExcluded +
      fixture.counts.usageExcluded;
    expect(accounted).toBe(fixture.counts.read);
    expect(fixture.counts.filedPois).toBe(851);
    expect(fixture.counts.usageExcludedByClass).toEqual({
      "Private - For Staff, Visitors or Customers": 44,
      "(Unknown)": 2,
      "Private - Restricted Access": 3,
    });
    expect(fixture.counts.statusExcludedByClass).toEqual({ Planned: 1 });
  });
});

describe("membership-required files WITH its recorded class (the re-rule)", () => {
  it("Witham Leisure Centre — the Birkdale anchor — files as a site under its recorded class, never upgraded", () => {
    const site = fixture.sites.find((s) => s.registryId === "130084");
    expect(site).toBeDefined();
    expect(site!.name).toBe("Witham Leisure Centre");
    expect(site!.operator).toBe("Charge Your Car");
    expect(site!.detail.usage_type).toBe("Public - Membership Required");
    expect(site!.detail.usage_types).toEqual(["Public - Membership Required"]);
    expect(site!.detail.max_kw).toBe(22);
    expect(site!.chargingSpeed).toBe("up to 22 kW");
    expect(site!.detail.devices).toBe(2);
    expect(site!.detail.data_provider).toBe("Open Charge Map Contributors");
  });

  it("a merged site's served class is the most restrictive member class, with every class kept in the detail", () => {
    const plain = poi({ ID: 301 });
    const member = poi({
      ID: 302,
      UsageTypeID: 4,
      UsageType: { ID: 4, Title: "Public - Membership Required" },
      AddressInfo: {
        Title: "Test Site",
        AddressLine1: "1 Test Street",
        AddressLine2: null,
        Town: "Test Town",
        Postcode: "TE1 1ST",
        Latitude: 51.5001,
        Longitude: 0.5001,
      },
    });
    const sites = groupSites([plain, member]);
    expect(sites).toHaveLength(1);
    expect(sites[0].detail.usage_type).toBe("Public - Membership Required");
    expect(sites[0].detail.usage_types.sort()).toEqual(["Public", "Public - Membership Required"]);
    expect(sites[0].detail.pois_merged).toBe(2);
  });
});

describe("site grouping (gap L4 — the unit of filing is the site)", () => {
  it("groups same operator + same normalised title within 30 m; a different title or a distant twin stays separate", () => {
    const a = poi({ ID: 401 });
    const near = poi({
      ID: 402,
      AddressInfo: {
        Title: "Test  Site!",
        AddressLine1: "1 Test Street",
        AddressLine2: null,
        Town: "Test Town",
        Postcode: "TE1 1ST",
        Latitude: 51.5001,
        Longitude: 0.50005,
      },
    });
    const far = poi({
      ID: 403,
      AddressInfo: {
        Title: "Test Site",
        AddressLine1: "9 Far Road",
        AddressLine2: null,
        Town: "Test Town",
        Postcode: "TE1 1ST",
        Latitude: 51.51,
        Longitude: 0.51,
      },
    });
    const otherName = poi({
      ID: 404,
      AddressInfo: {
        Title: "Another Site",
        AddressLine1: "1 Test Street",
        AddressLine2: null,
        Town: "Test Town",
        Postcode: "TE1 1ST",
        Latitude: 51.50005,
        Longitude: 0.50002,
      },
    });
    const sites = groupSites([a, near, far, otherName]);
    expect(sites).toHaveLength(3);
    expect(sites.find((s) => s.registryId === "401")!.detail.pois_merged).toBe(2);
  });

  it("an unnamed record never name-clusters, even at the same spot", () => {
    const a = poi({
      ID: 501,
      AddressInfo: {
        Title: null,
        AddressLine1: "1 Test Street",
        AddressLine2: null,
        Town: "Test Town",
        Postcode: "TE1 1ST",
        Latitude: 51.5,
        Longitude: 0.5,
      },
    });
    const b = poi({
      ID: 502,
      AddressInfo: {
        Title: "",
        AddressLine1: "1 Test Street",
        AddressLine2: null,
        Town: "Test Town",
        Postcode: "TE1 1ST",
        Latitude: 51.50005,
        Longitude: 0.50002,
      },
    });
    expect(groupSites([a, b])).toHaveLength(2);
  });

  it("the fixture's real multi-record sites group: 851 records file as 831 sites", () => {
    expect(fixture.counts.merged).toBe(20);
    // Charlton Riverside Place files as several sites (one
    // development, chargers spread beyond the 30 m rule) —
    // the three-record cluster among them groups, with its
    // device count summed across the merged records.
    const charltons = fixture.sites.filter((s) => s.name === "Charlton Riverside Place");
    expect(charltons.length).toBeGreaterThan(1);
    const cluster = charltons.find((s) => s.detail.pois_merged === 3);
    expect(cluster).toBeDefined();
    expect(cluster!.detail.devices).toBe(6);
  });

  it("an unnamed filed record takes its serving name from the operator and street as recorded — never invented", () => {
    const [site] = groupSites([
      poi({
        ID: 601,
        AddressInfo: {
          Title: null,
          AddressLine1: "High Street",
          AddressLine2: null,
          Town: "Test Town",
          Postcode: "TE1 1ST",
          Latitude: 51.5,
          Longitude: 0.5,
        },
      }),
    ]);
    expect(site.name).toBe("Test Operator — High Street");
  });
});

describe("status is a dated record, never a live fact (gap L7)", () => {
  it("files the representative record's status and its recorded date", () => {
    const [site] = groupSites([poi({})]);
    expect(site.detail.status).toBe("Operational");
    expect(site.detail.status_date).toBe("2026-01-15");
  });

  it("an unrecorded status files as NULL status and NULL date — a normal state, not a failure", () => {
    const [site] = groupSites([
      poi({ ID: 701, StatusTypeID: null, StatusType: null, DateLastStatusUpdate: null }),
    ]);
    expect(site.detail.status).toBeNull();
    expect(site.detail.status_date).toBeNull();
  });

  it("the fixture holds real unrecorded-status sites, including registry-imported ones", () => {
    const hylands = fixture.sites.find((s) => s.name === "9 Hylands Mews");
    expect(hylands).toBeDefined();
    expect(hylands!.detail.status).toBeNull();
    expect(hylands!.detail.data_provider).toContain("National Charge Point Registry");
    expect(hylands!.detail.usage_type).toBe("Public - Membership Required");
  });
});

describe("connectors, power and devices (gap P3 — headline (ii), depth (i))", () => {
  it("merges connectors by type + power, summing quantities, fastest first", () => {
    const merged = mergeConnectors([
      poi({
        Connections: [
          {
            ConnectionType: { ID: 25, Title: "Type 2 (Socket Only)" },
            PowerKW: 7,
            Quantity: 2,
            StatusTypeID: 50,
          },
          {
            ConnectionType: { ID: 1036, Title: "CCS (Type 2)" },
            PowerKW: 50,
            Quantity: 1,
            StatusTypeID: 50,
          },
        ],
      }),
      poi({
        ID: 2,
        Connections: [
          {
            ConnectionType: { ID: 25, Title: "Type 2 (Socket Only)" },
            PowerKW: 7,
            Quantity: 3,
            StatusTypeID: 50,
          },
        ],
      }),
    ]);
    expect(merged).toEqual([
      { type: "CCS (Type 2)", kw: 50, quantity: 1 },
      { type: "Type 2 (Socket Only)", kw: 7, quantity: 5 },
    ]);
  });

  it("the headline speed is 'up to X kW' from the fastest connector; no published power means no speed at all", () => {
    const [rapid] = groupSites([
      poi({
        Connections: [
          {
            ConnectionType: { ID: 1036, Title: "CCS (Type 2)" },
            PowerKW: 50,
            Quantity: 1,
            StatusTypeID: 50,
          },
          {
            ConnectionType: { ID: 25, Title: "Type 2 (Socket Only)" },
            PowerKW: 7.4,
            Quantity: 1,
            StatusTypeID: 50,
          },
        ],
      }),
    ]);
    expect(rapid.detail.max_kw).toBe(50);
    expect(rapid.chargingSpeed).toBe("up to 50 kW");
    const [silent] = groupSites([
      poi({
        ID: 801,
        Connections: [
          {
            ConnectionType: { ID: 25, Title: "Type 2 (Socket Only)" },
            PowerKW: null,
            Quantity: null,
            StatusTypeID: 50,
          },
        ],
      }),
    ]);
    expect(silent.detail.max_kw).toBeNull();
    expect(silent.chargingSpeed).toBeNull();
    expect(silent.detail.connectors).toEqual([
      { type: "Type 2 (Socket Only)", kw: null, quantity: 1 },
    ]);
  });

  it("device count: the recorded NumberOfPoints wins; unrecorded derives a floor from the connectors, never zero", () => {
    expect(poiDevices(poi({ NumberOfPoints: 6 }))).toBe(6);
    expect(poiDevices(poi({ NumberOfPoints: null }))).toBe(1);
    expect(poiDevices(poi({ NumberOfPoints: null, Connections: [] }))).toBe(1);
  });
});

describe("golden homes — the re-fixed figures (gap P1)", () => {
  it("the fixture run passes every golden check", () => {
    expect(goldenChecks(fixture.sites, fixture.counts, { full: false })).toEqual([]);
  });

  it("Birkdale: exactly one site within 2 miles — the leisure centre at 1.866", () => {
    const home = { lat: 51.776176, lon: 0.60387 };
    const within = fixture.sites.filter(
      (s) => haversineMiles(home.lat, home.lon, s.lat, s.lon) <= 2.0,
    );
    expect(within).toHaveLength(1);
    expect(within[0].name).toBe("Witham Leisure Centre");
    expect(haversineMiles(home.lat, home.lon, within[0].lat, within[0].lon)).toBeCloseTo(1.866, 2);
  });

  it("Hilgay: the honest sparse — nothing within 2 miles, nearest 3.538", () => {
    const home = { lat: 52.507481, lon: 0.33491 };
    const within = fixture.sites.filter(
      (s) => haversineMiles(home.lat, home.lon, s.lat, s.lon) <= 2.0,
    );
    expect(within).toHaveLength(0);
    const nearest = Math.min(
      ...fixture.sites.map((s) => haversineMiles(home.lat, home.lon, s.lat, s.lon)),
    );
    expect(nearest).toBeCloseTo(3.538, 2);
  });

  it("the full-pull sanity bands fail loudly on a collapsed pull, and the membership floor guards the re-rule", () => {
    const collapsed = { ...fixture.counts, read: 100, filedPois: 90, sites: 85, membershipPois: 3 };
    const failures = goldenChecks(fixture.sites, collapsed, { full: true });
    expect(failures.some((f) => f.includes("sanity band"))).toBe(true);
    expect(failures.some((f) => f.includes("membership-required records filed"))).toBe(true);
    expect(BANDS.read.measured).toBe(27112);
    expect(BANDS.filedPois.measured).toBe(25040);
  });
});

describe("the loader's shape — source guards", () => {
  it("requests openly-licensed records only, scoped to GB", () => {
    expect(loaderSource).toContain('opendata: "true"');
    expect(loaderSource).toContain('countrycode: "GB"');
  });

  it("subdivides a capped tile instead of filing a truncated pull", () => {
    expect(loaderSource).toContain("TILE_MAX_DEPTH");
    expect(loaderSource).toContain("refusing to file a truncated pull");
  });

  it("sends the key as the X-API-Key header on the direct route, and never holds a key value", () => {
    expect(loaderSource).toContain('"X-API-Key": process.env.OPEN_CHARGE_MAP_API_KEY');
    expect(loaderSource).not.toMatch(/X-API-Key":\s*"/);
  });

  it("normalises titles the gate's way for the grouping key", () => {
    expect(normaliseTitle("St. Mary's & Sons — Café")).toBe("st marys and sons cafe");
    expect(normaliseTitle(null)).toBe("");
  });
});
