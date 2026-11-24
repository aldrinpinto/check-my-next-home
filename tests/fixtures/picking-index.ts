// The picking index's fake database (plan step M7.15B):
// an in-memory client that answers the exact statements
// the two picking loaders, the shared filing machinery
// (loaders/picking-index-filing.mjs) and the union read
// model issue — including BEGIN/COMMIT/ROLLBACK snapshot
// semantics, so the edition swap's atomicity is testable
// without a database.
//
// It is deliberately strict: an unrecognised statement
// throws, naming the SQL. A loader that starts issuing
// a new shape fails here first, in the open, rather than
// silently passing against a permissive fake.

export interface PickingPartsRow {
  postcode: string;
  paon: string | null;
  saon: string | null;
  street: string | null;
  town: string | null;
  home_key: string;
}

export interface PickingIndexRow extends PickingPartsRow {
  sources: string[];
  sales_edition: string | null;
  epc_edition: string | null;
}

// One row of the derived street table (migration 0031,
// M7.15C): the (street, postcode) grain with its town
// and home count.
export interface PickingStreetRow {
  street_norm: string;
  street_display: string;
  town: string | null;
  town_norm: string;
  postcode: string;
  home_count: number;
}

// One row of the derived place table (migration 0032,
// M7.15D): the (place, district) grain with its display
// form and distinct postcode count.
export interface PickingPlaceRow {
  place_norm: string;
  place_display: string;
  outward: string;
  postcode_count: number;
}

// The home key's normalisation, mirrored in JS (the
// filing machinery's normKeyPart): upper case,
// punctuation to spaces, runs collapsed, trimmed.
function normKeyPartJs(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

export interface PickingEditionRow {
  source: string;
  edition: string | null;
  loaded_at: string | null;
  postcodes: number | null;
  homes: number | null;
  streets: number | null;
  previous_homes: number | null;
  last_rejected_homes: number | null;
  last_rejected_at: string | null;
}

function blankEdition(source: string): PickingEditionRow {
  return {
    source,
    edition: null,
    loaded_at: null,
    postcodes: null,
    homes: null,
    streets: null,
    previous_homes: null,
    last_rejected_homes: null,
    last_rejected_at: null,
  };
}

// Postgres ORDER BY ... ASC: nulls sort last.
function compareNullable(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function dedupeStage(rows: PickingPartsRow[]): PickingPartsRow[] {
  const sorted = [...rows].sort(
    (x, y) =>
      compareNullable(x.postcode, y.postcode) ||
      compareNullable(x.home_key, y.home_key) ||
      compareNullable(x.paon, y.paon) ||
      compareNullable(x.saon, y.saon) ||
      compareNullable(x.street, y.street) ||
      compareNullable(x.town, y.town),
  );
  const seen = new Set<string>();
  return sorted.filter((row) => {
    const key = `${row.postcode}\u0001${row.home_key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class FakePickingDb {
  salesStage: PickingPartsRow[] = [];
  epcStage: PickingPartsRow[] = [];
  salesExtract: PickingPartsRow[] = [];
  epcExtract: PickingPartsRow[] = [];
  index: PickingIndexRow[] = [];
  // The union's build copy (BUG-202): the rows of
  // picking_index_build while a rebuild constructs the
  // new union under its build name; null while no such
  // table exists. The retired copy
  // (picking_index_retired) likewise — the old union's
  // rows between the swap's renames and its drop.
  indexBuild: PickingIndexRow[] | null = null;
  indexRetired: PickingIndexRow[] | null = null;
  // Every statement issued, in order, whitespace-
  // normalised — the swap-shape pins read it. A record
  // of what was asked, not state: a rollback does not
  // un-issue a statement, so snapshots leave it alone.
  statements: string[] = [];
  // The derived street table (migration 0031): rebuilt
  // from the index by the filing machinery's hook on
  // every union rebuild, kill switch included.
  streets: PickingStreetRow[] = [];
  // The derived place table (migration 0032): rebuilt
  // by the same hook, on the same paths.
  places: PickingPlaceRow[] = [];
  editions: PickingEditionRow[] = [blankEdition("sales"), blankEdition("epc")];
  // price_paid rows for the read-model tests: full sale
  // rows (the sold-prices source's columns) — the
  // address source's DISTINCT read derives from them.
  pricePaid: Record<string, unknown>[] = [];
  // postcode_cache answers by postcode (the sold-prices
  // load-edition read).
  cacheAnswers: Record<string, Record<string, unknown>> = {};
  // When set, any statement containing this substring
  // throws — the atomicity tests' failure injection.
  failOn: string | null = null;

  private snapshot: string | null = null;

  private takeSnapshot() {
    this.snapshot = JSON.stringify({
      salesStage: this.salesStage,
      epcStage: this.epcStage,
      salesExtract: this.salesExtract,
      epcExtract: this.epcExtract,
      index: this.index,
      indexBuild: this.indexBuild,
      indexRetired: this.indexRetired,
      streets: this.streets,
      places: this.places,
      editions: this.editions,
    });
  }

  private restoreSnapshot() {
    if (this.snapshot === null) return;
    const state = JSON.parse(this.snapshot);
    this.salesStage = state.salesStage;
    this.epcStage = state.epcStage;
    this.salesExtract = state.salesExtract;
    this.epcExtract = state.epcExtract;
    this.index = state.index;
    this.indexBuild = state.indexBuild ?? null;
    this.indexRetired = state.indexRetired ?? null;
    this.streets = state.streets ?? [];
    this.places = state.places ?? [];
    this.editions = state.editions;
    this.snapshot = null;
  }

  // The union the filing machinery's join computes
  // from the two extracts as they stand: on a
  // collision the sales parts win and the row carries
  // both provenances; with includeEpc false (the kill
  // switch) the sales extract alone, EPC provenance
  // nowhere. Shared by the build insert's simulation.
  private computeUnionRows(includeEpc: boolean): PickingIndexRow[] {
    const salesEdition =
      this.editions.find((e) => e.source === "sales")?.edition ?? null;
    const epcEdition =
      this.editions.find((e) => e.source === "epc")?.edition ?? null;
    const byKey = new Map<string, PickingIndexRow>();
    for (const row of this.salesExtract) {
      byKey.set(`${row.postcode}\u0001${row.home_key}`, {
        ...row,
        sources: ["sales"],
        sales_edition: salesEdition,
        epc_edition: null,
      });
    }
    if (includeEpc) {
      for (const row of this.epcExtract) {
        const key = `${row.postcode}\u0001${row.home_key}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.sources = ["sales", "epc"];
          existing.epc_edition = epcEdition;
        } else {
          byKey.set(key, {
            ...row,
            sources: ["epc"],
            sales_edition: null,
            epc_edition: epcEdition,
          });
        }
      }
    }
    return [...byKey.values()];
  }

  async query(
    text: string,
    params: unknown[] = [],
  ): Promise<{ rows: Record<string, unknown>[] }> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.statements.push(sql);
    if (this.failOn !== null && sql.includes(this.failOn)) {
      throw new Error(`fake picking db: injected failure on ${this.failOn}`);
    }
    const p = params as (string | number | null)[];

    if (sql === "BEGIN") {
      this.takeSnapshot();
      return { rows: [] };
    }
    if (sql === "COMMIT") {
      this.snapshot = null;
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      this.restoreSnapshot();
      return { rows: [] };
    }
    if (sql === "TRUNCATE picking_sales_stage") {
      this.salesStage = [];
      return { rows: [] };
    }
    if (sql === "TRUNCATE picking_epc_stage") {
      this.epcStage = [];
      return { rows: [] };
    }

    const stageInsert = /^INSERT INTO (picking_sales_stage|picking_epc_stage) \(postcode, paon, saon, street, town, home_key\) VALUES /.exec(sql);
    if (stageInsert) {
      const target =
        stageInsert[1] === "picking_sales_stage" ? this.salesStage : this.epcStage;
      for (let i = 0; i + 5 < p.length; i += 6) {
        target.push({
          postcode: p[i] as string,
          paon: p[i + 1] as string | null,
          saon: p[i + 2] as string | null,
          street: p[i + 3] as string | null,
          town: p[i + 4] as string | null,
          home_key: p[i + 5] as string,
        });
      }
      return { rows: [] };
    }

    if (sql.startsWith("SELECT source, edition, loaded_at, postcodes, homes, streets, previous_homes, last_rejected_homes, last_rejected_at FROM picking_index_editions WHERE source = $1")) {
      const row = this.editions.find((e) => e.source === p[0]);
      return { rows: row ? [{ ...row } as Record<string, unknown>] : [] };
    }
    if (sql.startsWith("SELECT source, edition, loaded_at, postcodes, homes, streets, previous_homes, last_rejected_homes, last_rejected_at FROM picking_index_editions")) {
      return { rows: this.editions.map((e) => ({ ...e })) as Record<string, unknown>[] };
    }

    const stagedCounts = /^SELECT count\(DISTINCT postcode\) AS postcodes, count\(DISTINCT \(postcode, home_key\)\) AS homes FROM (picking_sales_stage|picking_epc_stage)$/.exec(sql);
    if (stagedCounts) {
      const stage =
        stagedCounts[1] === "picking_sales_stage" ? this.salesStage : this.epcStage;
      return {
        rows: [
          {
            postcodes: new Set(stage.map((r) => r.postcode)).size,
            homes: new Set(stage.map((r) => `${r.postcode}\u0001${r.home_key}`)).size,
          } as Record<string, unknown>,
        ],
      };
    }

    const extractCounts = /^SELECT count\(DISTINCT postcode\) AS postcodes, count\(\*\) AS homes, count\(DISTINCT \(street, town\)\) AS streets FROM (picking_sales_extract|picking_epc_extract)$/.exec(sql);
    if (extractCounts) {
      const extract =
        extractCounts[1] === "picking_sales_extract"
          ? this.salesExtract
          : this.epcExtract;
      return {
        rows: [
          {
            postcodes: new Set(extract.map((r) => r.postcode)).size,
            homes: extract.length,
            streets: new Set(
              extract.map((r) => `${r.street}\u0001${r.town}`),
            ).size,
          } as Record<string, unknown>,
        ],
      };
    }

    if (sql === "DELETE FROM picking_sales_extract") {
      this.salesExtract = [];
      return { rows: [] };
    }
    if (sql === "DELETE FROM picking_epc_extract") {
      this.epcExtract = [];
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO picking_sales_extract")) {
      this.salesExtract = dedupeStage(this.salesStage);
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO picking_epc_extract")) {
      this.epcExtract = dedupeStage(this.epcStage);
      return { rows: [] };
    }

    // The union rebuild's build-and-swap shape
    // (BUG-202): the new union is constructed under its
    // build name, indexed once, and swapped into the
    // served name by rename — the served table is never
    // deleted or inserted into.
    if (sql === "DROP TABLE IF EXISTS picking_index_build") {
      this.indexBuild = null;
      return { rows: [] };
    }
    if (sql === "DROP TABLE IF EXISTS picking_index_retired") {
      this.indexRetired = null;
      return { rows: [] };
    }
    if (sql.startsWith("CREATE TABLE picking_index_build")) {
      if (this.indexBuild !== null) {
        throw new Error(
          "fake picking db: relation \"picking_index_build\" already exists",
        );
      }
      this.indexBuild = [];
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO picking_index_build (postcode")) {
      if (this.indexBuild === null) {
        throw new Error(
          "fake picking db: insert into a picking_index_build that does not exist",
        );
      }
      this.indexBuild = this.computeUnionRows(sql.includes("FULL OUTER JOIN"));
      return { rows: [] };
    }
    if (sql === "ALTER TABLE picking_index_build ADD PRIMARY KEY (postcode, home_key)") {
      // Postgres refuses the key over duplicate homes.
      // The union's join can never produce one — the
      // fake holds the same line.
      const seen = new Set<string>();
      for (const row of this.indexBuild ?? []) {
        const key = `${row.postcode}\u0001${row.home_key}`;
        if (seen.has(key)) {
          throw new Error(
            "fake picking db: duplicate home for the build's primary key",
          );
        }
        seen.add(key);
      }
      return { rows: [] };
    }
    if (sql.startsWith("CREATE INDEX picking_index_build_")) {
      return { rows: [] };
    }
    if (sql === "ALTER TABLE picking_index RENAME TO picking_index_retired") {
      // Between the swap's two renames the served name
      // is vacant; nothing reads in that window (the
      // street and place rebuilds run after it), so the
      // fake simply holds the old rows under the
      // retired name and serves none under the name.
      this.indexRetired = this.index;
      this.index = [];
      return { rows: [] };
    }
    if (sql === "ALTER TABLE picking_index_build RENAME TO picking_index") {
      if (this.indexBuild === null) {
        throw new Error(
          "fake picking db: rename of a picking_index_build that does not exist",
        );
      }
      this.index = this.indexBuild;
      this.indexBuild = null;
      return { rows: [] };
    }
    if (sql === "DROP TABLE picking_index_retired") {
      this.indexRetired = null;
      return { rows: [] };
    }
    if (sql.startsWith("ALTER INDEX picking_index_build_")) {
      return { rows: [] };
    }

    if (sql === "DELETE FROM picking_streets") {
      this.streets = [];
      return { rows: [] };
    }
    if (sql.startsWith("WITH per_town AS")) {
      // The street rebuild (M7.15C): derive the table
      // from the index exactly as the SQL does — group
      // by (street_norm, postcode, town), the town a
      // (street, postcode) carries is its homes' most
      // filed town (ties by name, nulls last), the
      // display is the smallest filed street form.
      interface PerTown {
        streetNorm: string;
        postcode: string;
        town: string | null;
        homes: number;
        display: string;
      }
      const perTown = new Map<string, PerTown>();
      for (const row of this.index) {
        if (row.street === null) continue;
        const streetNorm = normKeyPartJs(row.street);
        const key = `${streetNorm}\u0001${row.postcode}\u0001${row.town ?? ""}`;
        const current = perTown.get(key) ?? {
          streetNorm,
          postcode: row.postcode,
          town: row.town,
          homes: 0,
          display: row.street,
        };
        current.homes += 1;
        if (row.street < current.display) current.display = row.street;
        perTown.set(key, current);
      }
      const perStreet = new Map<
        string,
        { streetNorm: string; postcode: string; display: string; towns: PerTown[]; homes: number }
      >();
      for (const townRow of perTown.values()) {
        const key = `${townRow.streetNorm}\u0001${townRow.postcode}`;
        const current = perStreet.get(key) ?? {
          streetNorm: townRow.streetNorm,
          postcode: townRow.postcode,
          display: townRow.display,
          towns: [],
          homes: 0,
        };
        if (townRow.display < current.display) current.display = townRow.display;
        current.towns.push(townRow);
        current.homes += townRow.homes;
        perStreet.set(key, current);
      }
      this.streets = [...perStreet.values()]
        .filter((street) => street.streetNorm !== "")
        .map((street) => {
          const towns = [...street.towns].sort(
            (a, b) => b.homes - a.homes || compareNullable(a.town, b.town),
          );
          const town = towns[0]?.town ?? null;
          return {
            street_norm: street.streetNorm,
            street_display: street.display,
            town,
            town_norm: town === null ? "" : normKeyPartJs(town),
            postcode: street.postcode,
            home_count: street.homes,
          };
        });
      return { rows: [] };
    }

    if (sql === "DELETE FROM picking_places") {
      this.places = [];
      return { rows: [] };
    }
    if (sql.startsWith("WITH per_place_town AS")) {
      // The place rebuild (M7.15D; derivation corrected
      // by migration 0033): derive the table from the
      // index exactly as the SQL does — group by
      // (place_norm, outward, town) counting distinct
      // postcodes and homes, then per (place, outward)
      // the display is the town form with the most
      // postcodes (ties by name) and the count is the
      // sum. The outward is the postcode's leading group
      // under the canonical grammar (the classifier's
      // normalisePostcode recipe, mirrored here as
      // normKeyPartJs mirrors the filing machinery): a
      // postcode that does not parse contributes no
      // pair, and a pair is filed only where the index
      // holds more than one home under the place's name
      // in the district (no single-record pairings —
      // the CM92 follow-up, 19 Nov 2026).
      interface PerPlaceTown {
        placeNorm: string;
        outward: string;
        town: string;
        postcodes: Set<string>;
        homes: number;
      }
      const perTown = new Map<string, PerPlaceTown>();
      for (const row of this.index) {
        if (row.town === null) continue;
        const placeNorm = normKeyPartJs(row.town);
        const compact = row.postcode.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const parsed = /^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/.exec(compact);
        if (!parsed) continue;
        const outward = parsed[1];
        const key = `${placeNorm}\u0001${outward}\u0001${row.town}`;
        const current = perTown.get(key) ?? {
          placeNorm,
          outward,
          town: row.town,
          postcodes: new Set<string>(),
          homes: 0,
        };
        current.postcodes.add(row.postcode);
        current.homes += 1;
        perTown.set(key, current);
      }
      const perPlace = new Map<
        string,
        {
          placeNorm: string;
          outward: string;
          towns: PerPlaceTown[];
          postcodes: number;
          homes: number;
        }
      >();
      for (const townRow of perTown.values()) {
        const key = `${townRow.placeNorm}\u0001${townRow.outward}`;
        const current = perPlace.get(key) ?? {
          placeNorm: townRow.placeNorm,
          outward: townRow.outward,
          towns: [],
          postcodes: 0,
          homes: 0,
        };
        current.towns.push(townRow);
        current.postcodes += townRow.postcodes.size;
        current.homes += townRow.homes;
        perPlace.set(key, current);
      }
      this.places = [...perPlace.values()]
        .filter((place) => place.placeNorm !== "" && place.homes >= 2)
        .map((place) => {
          const towns = [...place.towns].sort(
            (a, b) =>
              b.postcodes.size - a.postcodes.size || compareNullable(a.town, b.town),
          );
          return {
            place_norm: place.placeNorm,
            place_display: towns[0].town,
            outward: place.outward,
            postcode_count: place.postcodes,
          };
        });
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO picking_index_editions")) {
      const [source, edition, postcodes, homes, streets, previousHomes] = p;
      const row = this.editions.find((e) => e.source === source);
      const target = row ?? blankEdition(source as string);
      target.edition = edition as string;
      target.loaded_at = new Date().toISOString();
      target.postcodes = postcodes as number;
      target.homes = homes as number;
      target.streets = streets as number;
      target.previous_homes = previousHomes as number | null;
      target.last_rejected_homes = null;
      target.last_rejected_at = null;
      if (!row) this.editions.push(target);
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE picking_index_editions SET last_rejected_homes")) {
      const row = this.editions.find((e) => e.source === p[0]);
      if (row) {
        row.last_rejected_homes = p[1] as number;
        row.last_rejected_at = new Date().toISOString();
      }
      return { rows: [] };
    }

    if (sql.startsWith("SELECT postcode, paon, saon, street, town, home_key, sources FROM picking_index WHERE postcode = $1")) {
      return {
        rows: this.index
          .filter((r) => r.postcode === p[0])
          .map((r) => ({ ...r })) as Record<string, unknown>[],
      };
    }
    if (sql.startsWith("SELECT postcode, paon, saon, street, town, home_key FROM picking_index WHERE postcode = $1")) {
      return {
        rows: this.index
          .filter((r) => r.postcode === p[0])
          .map((r) => ({ ...r })) as Record<string, unknown>[],
      };
    }
    if (sql.startsWith("SELECT count(*) AS homes FROM picking_index")) {
      return { rows: [{ homes: this.index.length } as Record<string, unknown>] };
    }
    if (sql.startsWith("SELECT paon, saon, street, town, postcode FROM picking_index")) {
      const rows = this.index
        .filter((r) => r.postcode === p[0])
        .map((r) => ({
          paon: r.paon,
          saon: r.saon,
          street: r.street,
          town: r.town,
          postcode: r.postcode,
        }))
        .sort(
          (a, b) =>
            compareNullable(a.street, b.street) ||
            compareNullable(a.paon, b.paon) ||
            compareNullable(a.saon, b.saon),
        );
      return { rows: rows as Record<string, unknown>[] };
    }

    if (sql.startsWith("SELECT DISTINCT paon, saon, street, locality, town, postcode FROM price_paid WHERE postcode = $1")) {
      const seen = new Set<string>();
      const rows: Record<string, unknown>[] = [];
      for (const row of this.pricePaid) {
        if (row.postcode !== p[0]) continue;
        const key = JSON.stringify([
          row.paon, row.saon, row.street, row.locality, row.town, row.postcode,
        ]);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          paon: row.paon,
          saon: row.saon,
          street: row.street,
          locality: row.locality,
          town: row.town,
          postcode: row.postcode,
        });
      }
      return { rows };
    }
    if (sql.startsWith("SELECT transaction_id, price, sale_date::text AS sale_date, postcode, FROM price_paid") || sql.includes("FROM price_paid WHERE postcode = $1")) {
      return {
        rows: this.pricePaid
          .filter((r) => r.postcode === p[0])
          .map((r) => ({ ...r })),
      };
    }
    if (sql.includes("FROM postcode_cache WHERE postcode = $1")) {
      const answers = this.cacheAnswers[p[0] as string];
      const edition = (answers?.soldPricesLoad as { edition?: string } | undefined)
        ?.edition;
      return {
        rows:
          edition !== undefined
            ? [{ edition } as Record<string, unknown>]
            : [],
      };
    }

    throw new Error(`fake picking db: unrecognised statement: ${sql}`);
  }
}
