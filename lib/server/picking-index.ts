// The picking index's read model (plan step M7.15B):
// the UNION of the homes a check has filed in
// price_paid and the homes the national preload filed
// in picking_index (migration 0030), deduped on the
// canonical home (lib/address.ts's canonicalHomeKey) —
// so one home filed in two part-shapes serves once,
// whatever layer each shape came from.
//
// The union is the picker's local tier: the suggestions
// endpoint and the picker's list both read it, so a
// postcode's homes are nameable from day one instead of
// only after a check has filed them. The rules that
// keep the union honest:
//
//   - price_paid WINS collisions. The filed sales are
//     the register's own parts for a home a check has
//     loaded; an index row for the same home key adds
//     nothing but its presence.
//   - The index is identity, never evidence. Nothing
//     here is read by any brain; the rows carry no
//     prices, no dates, no facts an answer could use.
//   - A database the migration has not reached (or an
//     index not yet loaded) reads as the filed rows
//     alone — the union degrades to exactly the
//     pre-preload behaviour, never to an error.

import type { AddressQueryable, LoadedAddressParts } from "../address";
import {
  canonicalHomeKey,
  compareAddressParts,
  createAddressSource,
  dedupeAddressParts,
} from "../address";

export interface PickingIndexSource {
  // Filed price_paid rows for the postcode.
  filedAddressesInPostcode(postcode: string): Promise<LoadedAddressParts[]>;
  // Index-only rows: picking_index rows whose home key
  // no filed row carries.
  indexOnlyAddressesInPostcode(postcode: string): Promise<LoadedAddressParts[]>;
  // The union: filed rows and index-only rows as ONE
  // list in natural address order (compareAddressParts,
  // founder fix 18 Nov 2026). The filed rows win
  // collisions at the dedupe (see split) — precedence
  // decides whose FORM serves, never a display grouping:
  // an index-only 3 sorts between a filed 1 and a filed
  // 10, exactly where a visitor expects it.
  unionAddressesInPostcode(postcode: string): Promise<LoadedAddressParts[]>;
}

export function createPickingIndexSource(db: AddressQueryable): PickingIndexSource {
  const filed = createAddressSource(db);

  async function indexRows(postcode: string): Promise<LoadedAddressParts[]> {
    try {
      const { rows } = await db.query(
        `SELECT paon, saon, street, town, postcode FROM picking_index
          WHERE postcode = $1
          ORDER BY street, paon, saon`,
        [postcode],
      );
      return rows.map((row) => ({
        postcode: row.postcode as string,
        paon: (row.paon as string | null) ?? null,
        saon: (row.saon as string | null) ?? null,
        street: (row.street as string | null) ?? null,
        // The index files no locality (neither source
        // carries one at this grain), so it stays null
        // and the picker's label falls back to the town,
        // exactly as it does for a filed row with no
        // locality.
        locality: null,
        town: (row.town as string | null) ?? null,
      }));
    } catch {
      // Migration 0030 not applied to this database yet:
      // the index reads as empty.
      return [];
    }
  }

  async function split(postcode: string) {
    const [filedRaw, index] = await Promise.all([
      filed.addressesInPostcode(postcode),
      indexRows(postcode),
    ]);
    // BUG-308: each layer dedupes on the canonical home
    // — the same home filed in two part-shapes (a PP
    // sale and an EPC row, or two sales) serves once.
    // The filed rows win collisions at the dedupe (see
    // split) — precedence decides whose FORM serves.
    const filedRows = dedupeAddressParts(filedRaw);
    const filedKeys = new Set(filedRows.map((parts) => canonicalHomeKey(parts)));
    return {
      filedRows,
      indexOnlyRows: dedupeAddressParts(
        index.filter((parts) => !filedKeys.has(canonicalHomeKey(parts))),
      ),
    };
  }

  return {
    filedAddressesInPostcode: (postcode) => filed.addressesInPostcode(postcode),
    indexOnlyAddressesInPostcode: async (postcode) => (await split(postcode)).indexOnlyRows,
    async unionAddressesInPostcode(postcode) {
      const { filedRows, indexOnlyRows } = await split(postcode);
      return [...filedRows, ...indexOnlyRows].sort(compareAddressParts);
    },
  };
}
