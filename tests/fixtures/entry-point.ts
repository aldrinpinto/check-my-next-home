// Entry-point scenario fixtures (entry-point build,
// 18 Nov 2026; extended by M7.15B the same day) — the
// founder's requirement: named postcodes for each hybrid
// scenario, somewhere permanent.
//
// Five postcodes carry the five scenarios the specs in
// tests/entry-point.test.ts prove, each against an
// in-memory filed world and a scripted fake Postio:
//
//   (a) CM3 2JT — Birkdale Rise, Hatfield Peverel.
//       LOCAL ONLY. Thirty filed sale addresses (19
//       Birkdale Rise among them) — a complete local list,
//       so the backstop is never called. The fake Postio
//       knows the street too; the scenario asserts it was
//       not asked. The picking index holds duplicates of
//       five of the filed homes: the union dedupes them
//       away (M7.15B).
//   (b) KT17 1FH — Minerva House, Ceres Crescent, Epsom.
//       POSTIO ONLY. The directory holds the postcode; the
//       local tier (filed + index) knows nothing. Postio
//       returns Flats 3–9 of Minerva House as separate
//       delivery points (the founder's 18 Nov live test
//       saw exactly this shape); Flat 4 is the scenario's
//       pick.
//   (c) CM0 7AA — Southminster (the M7.15B fallback
//       witness, chosen because NEITHER source knows a
//       home there: it stands in the ONSPD excerpt the
//       directory fixture carries, and it appears in
//       neither the Price Paid fixture file nor the EPC
//       fixture — no filed sales, no index rows from
//       either source). FALLBACK. Local is empty and the
//       fake Postio is scripted to fail (error / timeout
//       / zero-balance / empty in turn): the journey lands
//       on the whole-postcode check, with the notice when
//       a pick was attempted.
//   (d) EX1 1AA — High Street (a fixture postcode).
//       COMBINATION. Two homes filed locally; Postio
//       returns those same two plus two more — the merged
//       list dedupes to four, local rows first. The pick of
//       3 High Street starts Postio-only and PROMOTES to
//       its home key once the scenario files its sale (the
//       cold load landing).
//   (e) CM1 6ER — Beaulieu, Chelmsford (the D72 witness:
//       0 filed sales, 49 EPC certificates). EPC-COVERED
//       (M7.15B): the picking index holds the 49
//       certificate homes (the odd numbers 1–97 on George
//       Heard Crescent, as the register's witnessed data
//       files them), so the local tier carries the picker
//       and Postio is never called. This postcode carried
//       scenario (c) until the preload; it flipped the
//       day the EPC half loaded, which is exactly the
//       behaviour the step exists to produce.
//
// The filed world is mutable (addFiledRow) so scenario (d)
// can land its cold load mid-test. The source's
// addressesInPostcode serves the UNION (filed rows +
// index rows, deduped by the home key, filed winning) —
// the read model lib/server/picking-index.ts serves in
// production.

import type {
  AddressDataSource,
  DirectoryPostcode,
  LoadedAddressParts,
} from "../../lib/address";
import { partsKey } from "../../lib/server/hybrid";
import type { PostioAddress } from "../../lib/server/postio";
import type { SuggestionSource } from "../../lib/server/suggestions";

export const BIRKDALE = "CM3 2JT";
export const MINERVA = "KT17 1FH";
export const BEAULIEU = "CM1 6ER";
export const COMBINATION = "EX1 1AA";
export const FALLBACK = "CM0 7AA";

function directoryRow(postcode: string, lsoaCode: string): DirectoryPostcode {
  return {
    postcode,
    latitude: 51.5,
    longitude: 0.5,
    council: null,
    ward: null,
    region: null,
    lsoaCode,
    msoaCode: null,
  };
}

export interface EntryFixture {
  source: AddressDataSource & SuggestionSource & {
    addFiledRow(parts: LoadedAddressParts): void;
  };
  postioLists: Record<string, PostioAddress[]>;
  filedRows: LoadedAddressParts[];
  indexRows: LoadedAddressParts[];
}

function postioAddress(
  udprn: string,
  parts: Omit<LoadedAddressParts, "postcode" | "locality"> & { postcode: string },
  label: string,
): PostioAddress {
  return { udprn, parts: { locality: null, ...parts }, label };
}

export function buildEntryFixture(): EntryFixture {
  const directory = new Map<string, DirectoryPostcode>([
    [BIRKDALE, directoryRow(BIRKDALE, "E01021395")],
    [MINERVA, directoryRow(MINERVA, "E01000001")],
    [BEAULIEU, directoryRow(BEAULIEU, "E01000002")],
    [COMBINATION, directoryRow(COMBINATION, "E01000003")],
    [FALLBACK, directoryRow(FALLBACK, "E01000004")],
  ]);

  const filedRows: LoadedAddressParts[] = [];
  // (a) Birkdale: thirty filed houses on Birkdale Rise.
  for (let n = 1; n <= 30; n += 1) {
    filedRows.push({
      postcode: BIRKDALE,
      paon: String(n),
      saon: null,
      street: "BIRKDALE RISE",
      locality: null,
      town: "CHELMSFORD",
    });
  }
  // (d) Combination: two filed houses on High Street.
  for (const n of [1, 2]) {
    filedRows.push({
      postcode: COMBINATION,
      paon: String(n),
      saon: null,
      street: "HIGH STREET",
      locality: null,
      town: "EXETER",
    });
  }

  // The picking index's rows (M7.15B): what the national
  // preload filed. The union the source serves is these
  // behind the filed rows, deduped by the home key.
  const indexRows: LoadedAddressParts[] = [];
  // (a) Birkdale: the index also names five of the filed
  // homes (both registers know them) — the union must
  // still serve thirty rows, not thirty-five.
  for (let n = 1; n <= 5; n += 1) {
    indexRows.push({
      postcode: BIRKDALE,
      paon: String(n),
      saon: null,
      street: "BIRKDALE RISE",
      locality: null,
      town: "CHELMSFORD",
    });
  }
  // (e) Beaulieu: the 49 certificate homes — the odd
  // numbers 1–97 on George Heard Crescent, exactly as
  // the register's witnessed data files them.
  for (let n = 1; n <= 97; n += 2) {
    indexRows.push({
      postcode: BEAULIEU,
      paon: String(n),
      saon: null,
      street: "GEORGE HEARD CRESCENT",
      locality: null,
      town: "CHELMSFORD",
    });
  }

  const source = {
    async directoryPostcode(postcode: string) {
      return directory.get(postcode) ?? null;
    },
    async addressesInPostcode(postcode: string) {
      // The union (M7.15B): filed rows first (they win),
      // then the index rows no filed row names.
      const filed = filedRows.filter((row) => row.postcode === postcode);
      const filedKeys = new Set(filed.map((row) => partsKey(row)));
      const indexOnly = indexRows.filter(
        (row) => row.postcode === postcode && !filedKeys.has(partsKey(row)),
      );
      return [...filed, ...indexOnly];
    },
    async districtSummary(outward: string) {
      const count = [...directory.keys()].filter((p) => p.split(" ")[0] === outward).length;
      return count > 0 ? { postcodeCount: count } : null;
    },
    async postcodesByPrefix(prefix: string, limit: number) {
      return [...directory.keys()]
        .filter((postcode) => postcode.startsWith(prefix))
        .sort()
        .slice(0, limit);
    },
    addFiledRow(parts: LoadedAddressParts) {
      filedRows.push(parts);
    },
  };

  const minervaFlats: PostioAddress[] = [3, 4, 5, 6, 7, 8, 9].map((flat) => ({
    udprn: `100${flat}`,
    parts: {
      postcode: MINERVA,
      paon: "MINERVA HOUSE, 12",
      saon: `FLAT ${flat}`,
      street: "CERES CRESCENT",
      locality: null,
      town: "EPSOM",
    },
    label: `Flat ${flat}, Minerva House, 12 Ceres Crescent`,
  }));

  const combinationPostio: PostioAddress[] = [1, 2, 3, 4].map((n) => ({
    udprn: `200${n}`,
    parts: {
      postcode: COMBINATION,
      paon: String(n),
      saon: null,
      street: "HIGH STREET",
      locality: null,
      town: "EXETER",
    },
    label: `${n} High Street`,
  }));

  const birkdalePostio: PostioAddress[] = [1, 2, 3].map((n) => ({
    udprn: `300${n}`,
    parts: {
      postcode: BIRKDALE,
      paon: String(n),
      saon: null,
      street: "BIRKDALE RISE",
      locality: null,
      town: "CHELMSFORD",
    },
    label: `${n} Birkdale Rise`,
  }));

  return {
    source,
    filedRows,
    indexRows,
    postioLists: {
      [BIRKDALE]: birkdalePostio,
      [MINERVA]: minervaFlats,
      [COMBINATION]: combinationPostio,
      // (c) Southminster: the fake is scripted per-scenario
      // in the specs (failures), and its healthy list is one
      // house — used by the "empty" turn of the fallback.
      [FALLBACK]: [
        postioAddress(
          "4001",
          {
            postcode: FALLBACK,
            paon: "1",
            saon: null,
            street: "STATION ROAD",
            town: "SOUTHMINSTER",
          },
          "1 Station Road",
        ),
      ],
    },
  };
}
