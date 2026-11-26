import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BANDS,
  FILEABLE_USAGE,
  buildSites,
  classifyPois,
  fileEvPoints,
  goldenChecks,
  groupSites,
  haversineMiles,
  mergeConnectors,
  normaliseTitle,
  poiDevices,
  readPoisFile,
} from "../loaders/load-ev-chargers.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

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

describe("filing — the stage-table transaction", () => {
  // CI runs 101 and 102's database jobs failed with
  // "relation ev_stage does not exist": fileEvPoints created
  // the ON COMMIT DROP stage BEFORE its BEGIN, so in
  // autocommit the stage was dropped again by the end of its
  // own CREATE statement and the first staged insert found
  // no table. This filer was written before the M5.6 fix
  // rounds and copied the then-buggy shape (the identical
  // defect CI run 98 hit in the nearby filers). The sandbox
  // proofs were all verify-only, so the filing path had
  // never run, and the source-guard tests above can only see
  // that the statements exist — never their order. No
  // Postgres exists in the sandbox (CI is the proof
  // environment), so the contract is pinned here against a
  // recording fake pool. BUG-368 changed the shape: the
  // stage table is persistent now and staging rides OUTSIDE
  // any transaction, so a killed run's staging survives as
  // its resume point; only the swap itself is a
  // transaction, opened in the swap step.
  function recordingPool(failOn?: string) {
    const statements: string[] = [];
    let released = false;
    const client = {
      async query(sql: string) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        if (failOn && head.startsWith(failOn)) throw new Error(`forced failure: ${failOn}`);
        return { rows: [], rowCount: 0 };
      },
      release() {
        released = true;
      },
    };
    return { statements, released: () => released, pool: { connect: async () => client } };
  }

  const sites = [
    {
      registryId: "130084",
      name: "Witham Leisure Centre",
      lat: 51.7965,
      lon: 0.6424,
      operator: "Charge Your Car",
      connectorTypes: "Type 2 (Socket Only)",
      chargingSpeed: "up to 22 kW",
      detail: { usage_type: "Public - Membership Required", devices: 1 },
    },
    {
      registryId: "200001",
      name: null,
      lat: 51.51,
      lon: 0.005,
      operator: null,
      connectorTypes: null,
      chargingSpeed: null,
      detail: { usage_type: "Public", devices: 2 },
    },
  ];

  it("stages outside the swap transaction — stage create first, BEGIN before the swap, COMMIT last", async () => {
    const rec = recordingPool();
    await fileEvPoints(rec.pool as never, sites as never, "2026-11-13", "2026-11-13T00:00:00Z");
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    expect(rec.statements[0].startsWith("CREATE TABLE IF NOT EXISTS ev_stage")).toBe(true);
    expect(at("INSERT INTO ev_stage")).toBeGreaterThan(0);
    // The swap's BEGIN comes after the staging, before the
    // DELETE; the clear's DELETEs come after the swap's
    // COMMIT, and the clear's COMMIT is the last statement.
    expect(at("BEGIN")).toBeGreaterThan(at("INSERT INTO ev_stage"));
    expect(at("DELETE FROM ev_points")).toBeGreaterThan(at("BEGIN"));
    expect(at("INSERT INTO ev_points")).toBeGreaterThan(at("DELETE FROM ev_points"));
    const lastAt = (prefix: string) => rec.statements.findLastIndex((s) => s.startsWith(prefix));
    expect(lastAt("DELETE FROM ev_stage")).toBeGreaterThan(at("INSERT INTO ev_points"));
    expect(rec.statements.at(-1)).toBe("COMMIT");
    expect(rec.released()).toBe(true);
  });

  it("a failure mid-staging leaves the staged rows in place and still releases the client", async () => {
    const rec = recordingPool("INSERT INTO ev_stage");
    await expect(
      fileEvPoints(rec.pool as never, sites as never, "2026-11-13", "2026-11-13T00:00:00Z"),
    ).rejects.toThrow("forced failure");
    // No transaction is open during staging (BUG-368), so
    // there is nothing to roll back and nothing to commit:
    // the staging stays as the next run's resume point.
    expect(rec.statements).not.toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });
});

describe("filing — the schema contract", () => {
  // The order tests above pin statement ORDER, not names.
  // This block pins the names, in the M5.6 fix-round
  // pattern: the live table's columns are parsed from the
  // migration files themselves (the proven contract) and
  // every column the filer issues is checked against them.
  // ev_points is exactly the table this guards hardest: it
  // was created in migration 0001 and reshaped in 0010, and
  // the stage table legitimately uses lat/lon where the
  // live table uses latitude/longitude — a mapping only a
  // DDL check can prove. This filer shipped before the
  // contract-test pattern existed, so it never had one.
  // No Postgres needed.
  function liveTableColumns(table: string): Set<string> {
    const dir = join(process.cwd(), "db", "migrations");
    const cols = new Set<string>();
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".sql")) continue;
      const sql = readFileSync(join(dir, file), "utf8");
      const create = new RegExp(`CREATE TABLE ${table} \\(`).exec(sql);
      if (create) {
        // Walk to the matching close paren, then split the
        // body on top-level commas only — column definitions
        // carry their own parens (geometry(Point, 4326), the
        // generated geom CASE).
        let depth = 0;
        let end = -1;
        for (let i = create.index; i < sql.length; i++) {
          if (sql[i] === "(") depth++;
          else if (sql[i] === ")") {
            depth--;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const body = sql.slice(sql.indexOf("(", create.index) + 1, end);
        const parts: string[] = [];
        let d = 0;
        let cur = "";
        for (const ch of body) {
          if (ch === "(") d++;
          else if (ch === ")") d--;
          if (ch === "," && d === 0) {
            parts.push(cur);
            cur = "";
          } else cur += ch;
        }
        if (cur.trim() !== "") parts.push(cur);
        for (const part of parts) {
          const name = part.trim().split(/\s+/)[0];
          if (name && !/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)$/i.test(name)) cols.add(name);
        }
      }
      // Whole ALTER statements, not single matches:
      // migration 0010 adds operator and detail in ONE
      // statement with two ADD COLUMN clauses.
      for (const alter of sql.matchAll(new RegExp(`ALTER TABLE ${table}([^;]*);`, "g"))) {
        for (const add of alter[1].matchAll(/ADD COLUMN (\w+)/g)) {
          cols.add(add[1]);
        }
      }
    }
    return cols;
  }

  function recordingPool() {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql.trim().replace(/\s+/g, " "));
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    return { statements, pool: { connect: async () => client } };
  }

  const sites = [
    {
      registryId: "130084",
      name: "Witham Leisure Centre",
      lat: 51.7965,
      lon: 0.6424,
      operator: "Charge Your Car",
      connectorTypes: "Type 2 (Socket Only)",
      chargingSpeed: "up to 22 kW",
      detail: { usage_type: "Public - Membership Required", devices: 1 },
    },
  ];

  function firstParenList(statement: string): string[] {
    const m = /\(([^)]+)\)/.exec(statement);
    return m ? m[1].split(",").map((c) => c.trim()) : [];
  }

  it("every column the filer inserts into ev_points exists in the migration DDL", async () => {
    const rec = recordingPool();
    await fileEvPoints(rec.pool as never, sites as never, "2026-11-13", "2026-11-13T00:00:00Z");
    const live = liveTableColumns("ev_points");
    // Sanity: the parser found the real contract, not nothing.
    expect(live.has("latitude")).toBe(true);
    expect(live.has("longitude")).toBe(true);
    expect(live.has("operator")).toBe(true); // migration 0010's ALTER
    expect(live.has("detail")).toBe(true); // migration 0010's ALTER, second clause
    const finalInsert = rec.statements.find((s) => s.startsWith("INSERT INTO ev_points ("))!;
    const target = firstParenList(finalInsert);
    expect(target.length).toBeGreaterThan(0);
    for (const col of target) expect(live.has(col)).toBe(true);
    // The identity and generated columns are the database's own.
    expect(target).not.toContain("id");
    expect(target).not.toContain("geom");
  });

  it("the stage table, the staged insert and the final SELECT agree with each other", async () => {
    const rec = recordingPool();
    await fileEvPoints(rec.pool as never, sites as never, "2026-11-13", "2026-11-13T00:00:00Z");
    const stageCreate = rec.statements.find((s) =>
      s.startsWith("CREATE TABLE IF NOT EXISTS ev_stage"),
    )!;
    const stageDefs = /\((.+)\)/.exec(stageCreate)![1];
    const stageCols = stageDefs.split(",").map((def) => def.trim().split(/\s+/)[0]);
    const stagedInsert = rec.statements.find((s) => s.startsWith("INSERT INTO ev_stage ("))!;
    for (const col of firstParenList(stagedInsert)) expect(stageCols).toContain(col);
    const finalInsert = rec.statements.find((s) => s.startsWith("INSERT INTO ev_points ("))!;
    const selectList = /SELECT (.+) FROM ev_stage/
      .exec(finalInsert)![1]
      .split(",")
      .map((c) => c.trim());
    // Position for position: the target list and the SELECT
    // list are the same length, and every named SELECT item
    // is a stage column (the $1 loaded_at parameter aside) —
    // this is where the stage's lat/lon prove they map onto
    // the live table's latitude/longitude by position.
    expect(selectList.length).toBe(firstParenList(finalInsert).length);
    for (const item of selectList) {
      if (/^[a-z_][a-z0-9_]*$/.test(item)) expect(stageCols).toContain(item);
    }
  });
});

describe("BUG-265 progress logging", () => {
  const collect = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  // The stage-table describe's recording pool, repeated
  // here: that helper is scoped to its own describe.
  function recordingPool(failOn?: string) {
    const statements: string[] = [];
    let released = false;
    const client = {
      async query(sql: string) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        if (failOn && head.startsWith(failOn)) throw new Error(`forced failure: ${failOn}`);
        return { rows: [], rowCount: 0 };
      },
      release() {
        released = true;
      },
    };
    return { statements, released: () => released, pool: { connect: async () => client } };
  }

  const sites = [
    {
      registryId: "130084",
      name: "Witham Leisure Centre",
      lat: 51.7965,
      lon: 0.6424,
      operator: "Charge Your Car",
      connectorTypes: "Type 2 (Socket Only)",
      chargingSpeed: "up to 22 kW",
      detail: { usage_type: "Public - Membership Required", devices: 1 },
    },
    {
      registryId: "200001",
      name: null,
      lat: 51.51,
      lon: 0.005,
      operator: null,
      connectorTypes: null,
      chargingSpeed: null,
      detail: { usage_type: "Public", devices: 2 },
    },
  ];

  it("logs a closing line with the genuine total", async () => {
    const rec = recordingPool();
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-ev-chargers", log });
    await fileEvPoints(rec.pool as never, sites as never, "2026-11-13", "2026-11-13T00:00:00Z", {
      progress,
    });
    // BUG-368: the checkpoint line and the staging-cleared
    // line join the file line — the closing file line is
    // still the one carrying the genuine total.
    expect(lines.some((l) => /file 2\/2 sites \(100%\)$/.test(l))).toBe(true);
    expect(lines.every((l) => !l.startsWith("load-"))).toBe(true);
  });

  it("reports a filing failure with the file stage and the staged count, then still releases the client", async () => {
    const rec = recordingPool("INSERT INTO ev_stage");
    const { lines, log } = collect();
    const progress = createProgressLogger({ name: "load-ev-chargers", log });
    await expect(
      fileEvPoints(rec.pool as never, sites as never, "2026-11-13", "2026-11-13T00:00:00Z", {
        progress,
      }),
    ).rejects.toThrow("forced failure");
    expect(lines).toContainEqual(
      expect.stringMatching(
        /load-ev-chargers failed · file · filed 0 of 2 · forced failure: INSERT INTO ev_stage · resume from the start \(nothing staged yet\)$/,
      ),
    );
    // BUG-368: no transaction is open during staging, so
    // there is nothing to roll back — the staging stays as
    // the next run's resume point.
    expect(rec.statements).not.toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });
});

describe("resume (BUG-368)", () => {
  // A fake pool whose client tracks the staged rows, the
  // live table and the loader_checkpoint row, with just
  // enough SQL to run the filer.
  type StagedRow = { registryId: string; seq: number };
  type CheckpointRow = {
    loader: string;
    edition: string;
    expected: number | null;
    next_start_index: number;
    read_count: number;
    filed_count: number;
    state: Record<string, unknown> | null;
  };
  function createFakePool() {
    let staged: StagedRow[] = [];
    let live: StagedRow[] = [];
    const checkpoints = new Map<string, CheckpointRow>();
    let insertCalls = 0;
    let failAfterInserts: number | null = null;
    let snapshot: {
      staged: StagedRow[];
      live: StagedRow[];
      checkpoints: Map<string, CheckpointRow>;
    } | null = null;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const text = sql.replace(/\s+/g, " ");
        if (text === "BEGIN") {
          snapshot = { staged: [...staged], live: [...live], checkpoints: new Map(checkpoints) };
          return { rows: [] };
        }
        if (text === "COMMIT") {
          snapshot = null;
          return { rows: [] };
        }
        if (text === "ROLLBACK") {
          if (snapshot) {
            staged = snapshot.staged;
            live = snapshot.live;
            checkpoints.clear();
            for (const [k, v] of snapshot.checkpoints) checkpoints.set(k, v);
          }
          snapshot = null;
          return { rows: [] };
        }
        if (/CREATE TABLE IF NOT EXISTS ev_stage/.test(text)) return { rows: [] };
        if (/INSERT INTO ev_stage/.test(text)) {
          insertCalls += 1;
          if (failAfterInserts !== null && insertCalls > failAfterInserts)
            throw new Error("simulated kill: the database connection dropped mid-insert");
          for (let r = 0; r < params.length / 11; r++) {
            const b = r * 11;
            staged.push({ registryId: params[b] as string, seq: params[b + 10] as number });
          }
          return { rows: [], rowCount: params.length / 11 };
        }
        if (
          /SELECT loader, edition, expected, next_start_index, read_count, filed_count, state, updated_at/.test(
            text,
          )
        ) {
          const row = checkpoints.get(params[0] as string);
          return { rows: row ? [row] : [] };
        }
        if (/INSERT INTO loader_checkpoint/.test(text)) {
          checkpoints.set(params[0] as string, {
            loader: params[0] as string,
            edition: params[1] as string,
            expected: params[2] as number | null,
            next_start_index: params[3] as number,
            read_count: params[4] as number,
            filed_count: params[5] as number,
            state: JSON.parse(params[6] as string) as Record<string, unknown>,
          });
          return { rows: [] };
        }
        if (/DELETE FROM loader_checkpoint WHERE loader =/.test(text)) {
          checkpoints.delete(params[0] as string);
          return { rows: [] };
        }
        if (/SELECT count\(\*\)::int AS n, coalesce\(sum\(seq\)/.test(text)) {
          return {
            rows: [
              {
                n: staged.length,
                s: staged.reduce((a, r) => a + r.seq, 0),
                m: staged.length ? Math.max(...staged.map((r) => r.seq)) : 0,
              },
            ],
          };
        }
        if (/DELETE FROM ev_stage WHERE seq >=/.test(text)) {
          staged = staged.filter((r) => r.seq < (params[0] as number));
          return { rows: [], rowCount: 0 };
        }
        if (/DELETE FROM ev_stage/.test(text)) {
          staged = [];
          return { rows: [] };
        }
        if (/SELECT count\(\*\)::int AS n FROM ev_stage/.test(text))
          return { rows: [{ n: staged.length }] };
        if (/DELETE FROM ev_points/.test(text)) {
          live = [];
          return { rows: [] };
        }
        if (/INSERT INTO ev_points/.test(text)) {
          live = [...staged];
          return { rows: [] };
        }
        throw new Error(`fake client: unhandled SQL: ${sql}`);
      },
      release() {},
    };
    return {
      pool: { connect: async () => client },
      staged: () => staged,
      live: () => live,
      checkpoints,
      setFailAfterInserts: (n: number | null) => {
        insertCalls = 0;
        failAfterInserts = n;
      },
    };
  }
  type FakePool = ReturnType<typeof createFakePool>;
  const EDITION = "2026-11-13:0123456789abcdef";
  const makeSites = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      registryId: String(100000 + i),
      name: `Site ${i}`,
      lat: 51.5 + i * 0.0001,
      lon: 0.02,
      operator: "Operator",
      connectorTypes: "Type 2",
      chargingSpeed: "up to 22 kW",
      detail: { usage_type: "Public", devices: 1 },
    }));

  it(
    "kill mid-file resumes from the last flushed chunk and files every site exactly once",
    { timeout: 60_000 },
    async () => {
      const fake = createFakePool();
      const sites = makeSites(1200);
      // The first 500-row flush lands and checkpoints at
      // 500; the second flush (insert 2) dies — 500 staged,
      // the checkpoint at 500.
      const killLines: string[] = [];
      const killProgress = createProgressLogger({
        name: "load-ev-chargers",
        log: (line: string) => killLines.push(line),
      });
      fake.setFailAfterInserts(1);
      await expect(
        fileEvPoints(fake.pool as never, sites as never, "2026-11-13", "2026-11-13T00:00:00Z", {
          progress: killProgress,
          edition: EDITION,
        }),
      ).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(500);
      expect(fake.checkpoints.get("load-ev-chargers")?.next_start_index).toBe(500);
      expect(
        killLines.some((l) =>
          /checkpoint 500\/1,200 sites \(42%\) · staged 500 · resume from 500/.test(l),
        ),
      ).toBe(true);

      fake.setFailAfterInserts(null);
      const lines: string[] = [];
      const progress = createProgressLogger({
        name: "load-ev-chargers",
        log: (line: string) => lines.push(line),
      });
      await fileEvPoints(fake.pool as never, sites as never, "2026-11-13", "2026-11-13T00:00:00Z", {
        progress,
        edition: EDITION,
      });
      expect(
        lines.some((l) =>
          /resuming from checkpoint · 500 rows staged · edition 2026-11-13:0123456789abcdef · resume from 500/.test(
            l,
          ),
        ),
      ).toBe(true);
      expect(fake.live().length).toBe(1200);
      expect(new Set(fake.live().map((r) => r.registryId)).size).toBe(1200);
      expect(fake.staged().length).toBe(0);
      expect(fake.checkpoints.get("load-ev-chargers")).toBeUndefined();
    },
  );

  it(
    "an edition change discards the staged rows and starts from zero",
    { timeout: 60_000 },
    async () => {
      const fake = createFakePool();
      fake.setFailAfterInserts(1);
      await expect(
        fileEvPoints(
          fake.pool as never,
          makeSites(1200) as never,
          "2026-11-13",
          "2026-11-13T00:00:00Z",
          {
            edition: EDITION,
          },
        ),
      ).rejects.toThrow(/simulated kill/);
      expect(fake.staged().length).toBe(500);

      fake.setFailAfterInserts(null);
      await fileEvPoints(
        fake.pool as never,
        makeSites(1200) as never,
        "2026-11-13",
        "2026-11-13T00:00:00Z",
        {
          edition: "2026-11-14:fedcba9876543210",
        },
      );
      expect(fake.live().length).toBe(1200);
      expect(fake.checkpoints.get("load-ev-chargers")).toBeUndefined();
    },
  );

  it("--restart discards the checkpoint and starts from zero", { timeout: 60_000 }, async () => {
    const fake = createFakePool();
    fake.setFailAfterInserts(1);
    await expect(
      fileEvPoints(
        fake.pool as never,
        makeSites(1200) as never,
        "2026-11-13",
        "2026-11-13T00:00:00Z",
        {
          edition: EDITION,
        },
      ),
    ).rejects.toThrow(/simulated kill/);
    expect(fake.staged().length).toBe(500);

    fake.setFailAfterInserts(null);
    await fileEvPoints(
      fake.pool as never,
      makeSites(1200) as never,
      "2026-11-13",
      "2026-11-13T00:00:00Z",
      {
        edition: EDITION,
        restart: true,
      },
    );
    expect(fake.live().length).toBe(1200);
    expect(fake.checkpoints.get("load-ev-chargers")).toBeUndefined();
  });
});
