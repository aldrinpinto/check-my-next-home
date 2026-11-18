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
    this.editions = state.editions;
    this.snapshot = null;
  }

  async query(
    text: string,
    params: unknown[] = [],
  ): Promise<{ rows: Record<string, unknown>[] }> {
    const sql = text.replace(/\s+/g, " ").trim();
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

    if (sql === "DELETE FROM picking_index") {
      this.index = [];
      return { rows: [] };
    }
    if (sql.startsWith("INSERT INTO picking_index (postcode")) {
      const salesEdition =
        this.editions.find((e) => e.source === "sales")?.edition ?? null;
      const epcEdition =
        this.editions.find((e) => e.source === "epc")?.edition ?? null;
      const includeEpc = sql.includes("FULL OUTER JOIN");
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
      this.index = [...byKey.values()];
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
