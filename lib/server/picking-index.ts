// The picking index's read model (plan step M7.15B):
// the UNION of the homes a check has filed in
// price_paid and the homes the national preload filed
// in picking_index (migration 0030), deduped by the
// home key's own normalisation — the same partsKey the
// hybrid ladder dedupes by.
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
import { createAddressSource } from "../address";
import { partsKey } from "./hybrid";

export interface PickingIndexSource {
  // Filed price_paid rows for the postcode.
  filedAddressesInPostcode(postcode: string): Promise<LoadedAddressParts[]>;
  // Index-only rows: picking_index rows whose home key
  // no filed row carries.
  indexOnlyAddressesInPostcode(postcode: string): Promise<LoadedAddressParts[]>;
  // The union: filed rows first (they win), then the
  // index-only rows, in the index's filed order.
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
    const [filedRows, index] = await Promise.all([
      filed.addressesInPostcode(postcode),
      indexRows(postcode),
    ]);
    const filedKeys = new Set(filedRows.map((parts) => partsKey(parts)));
    return {
      filedRows,
      indexOnlyRows: index.filter((parts) => !filedKeys.has(partsKey(parts))),
    };
  }

  return {
    filedAddressesInPostcode: (postcode) => filed.addressesInPostcode(postcode),
    indexOnlyAddressesInPostcode: async (postcode) => (await split(postcode)).indexOnlyRows,
    async unionAddressesInPostcode(postcode) {
      const { filedRows, indexOnlyRows } = await split(postcode);
      return [...filedRows, ...indexOnlyRows];
    },
  };
}
