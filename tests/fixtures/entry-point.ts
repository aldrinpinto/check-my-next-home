// Entry-point scenario fixtures (entry-point build,
// 18 Nov 2026) — the founder's requirement: named
// postcodes for each hybrid scenario, somewhere permanent.
//
// Four postcodes carry the four scenarios the specs in
// tests/entry-point.test.ts prove, each against an
// in-memory filed world and a scripted fake Postio:
//
//   (a) CM3 2JT — Birkdale Rise, Hatfield Peverel.
//       LOCAL ONLY. Thirty filed sale addresses (19
//       Birkdale Rise among them) — a complete local list,
//       so the backstop is never called. The fake Postio
//       knows the street too; the scenario asserts it was
//       not asked.
//   (b) KT17 1FH — Minerva House, Ceres Crescent, Epsom.
//       POSTIO ONLY. The directory holds the postcode; no
//       sale is filed. Postio returns Flats 3–9 of Minerva
//       House as separate delivery points (the founder's
//       18 Nov live test saw exactly this shape); Flat 4 is
//       the scenario's pick.
//   (c) CM1 6ER — Beaulieu, Chelmsford (the D72 witness:
//       0 filed sales, 49 filed EPC certificates — and no
//       EPC parser in this build). FALLBACK. Local is
//       empty and the fake Postio is scripted to fail
//       (error / timeout / zero-balance / empty in turn):
//       the journey lands on the whole-postcode check, with
//       the notice when a pick was attempted.
//   (d) EX1 1AA — High Street (a fixture postcode).
//       COMBINATION. Two homes filed locally; Postio
//       returns those same two plus two more — the merged
//       list dedupes to four, local rows first. The pick of
//       3 High Street starts Postio-only and PROMOTES to
//       its home key once the scenario files its sale (the
//       cold load landing).
//
// The filed world is mutable (addFiledRow) so scenario (d)
// can land its cold load mid-test.

import type {
  AddressDataSource,
  DirectoryPostcode,
  LoadedAddressParts,
} from "../../lib/address";
import type { PostioAddress } from "../../lib/server/postio";
import type { SuggestionSource } from "../../lib/server/suggestions";

export const BIRKDALE = "CM3 2JT";
export const MINERVA = "KT17 1FH";
export const BEAULIEU = "CM1 6ER";
export const COMBINATION = "EX1 1AA";

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

  const source = {
    async directoryPostcode(postcode: string) {
      return directory.get(postcode) ?? null;
    },
    async addressesInPostcode(postcode: string) {
      return filedRows.filter((row) => row.postcode === postcode);
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
    postioLists: {
      [BIRKDALE]: birkdalePostio,
      [MINERVA]: minervaFlats,
      [COMBINATION]: combinationPostio,
      // (c) Beaulieu: the fake is scripted per-scenario in
      // the specs (failures), and its healthy list is one
      // house — used by the "empty" turn of the fallback.
      [BEAULIEU]: [
        postioAddress(
          "4001",
          {
            postcode: BEAULIEU,
            paon: "1",
            saon: null,
            street: "CENTENARY WAY",
            town: "CHELMSFORD",
          },
          "1 Centenary Way",
        ),
      ],
    },
  };
}
