import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AddressResolution, DirectoryPostcode, ResolvedAddress } from "../lib/address";
import {
  buildAreaBundle,
  type AreaDataSource,
  type BroadbandAnswerFacts,
  type CensusFacts,
  type CouncilTaxFacts,
  type DesignationFacts,
  type EpcArtefact,
  type EpcCertificate,
  type ImdFacts,
  type ListedFacts,
  type PlanningLayerFacts,
  type PlanningLayerKind,
} from "../lib/area-bundle";
import { buildCrimeBundle, type CrimeDataSource, type FiledCrimeAnswer } from "../lib/crime";
import {
  buildFloodBundle,
  type FloodDataSource,
  type FloodDefencesFacts,
  type FloodLayerFacts,
  type FloodLayerType,
} from "../lib/flood";
import { buildNearbyBundle, type NearbyDataSource, type NearbyPoint } from "../lib/nearby";
import { buildShortBundle, type ShortBundle } from "../lib/short-bundle";
import {
  buildSoldPricesBundle,
  type SoldPriceRow,
  type SoldPricesDataSource,
} from "../lib/sold-prices";
import { DATASETS, buildRows, parseDatasetCsv } from "../loaders/load-census.mjs";
import { imdSummaryFor } from "../loaders/load-imd.mjs";
import { BANNED_WORDING, GIGABIT_FIGURE, VALUATION_DISCLAIMER } from "./banned-wording";
import {
  BURE_ITEM,
  LEADON_ITEM,
  WARNING_NOW,
  FakeFloodWarningSource,
} from "./flood-warning-fixtures";

// The short-version bundle (plan step M6.7, decision D28).
//
// One pure derivation over the five full bundles — never a
// second read of the tables. The full bundles below are built
// by the real brain builders from fake sources carrying the
// rehearsal-measured facts each brain suite locks (the same
// fixture pattern as M6.2–M6.6), so every headline assertion
// here is an assertion about the derivation's picks from
// served truth, not about new arithmetic. D28's rulings:
// section order sold prices, flood, crime, EPC, council tax,
// constraints, heritage, nature, air, noise, nearby; six
// nearby categories; heritage and nature slimmed; Article 4
// as its plain inside line only (codes and translations stay
// at report depth); crime's total line plus anti-social
// behaviour as its own line, stale line travelling; flood's
// three layer lines never merged; sold prices' own last sale
// AND postcode median (plus the building median for flats),
// never a comparison; the council-tax figure inside its
// correction line; no broadband slot; IMD, Census, benefits
// and solar never headline in any shape.

// --- directories and resolutions ------------------------------

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

function home(
  dir: DirectoryPostcode,
  address: Partial<ResolvedAddress> & { label: string },
): AddressResolution {
  return {
    rung: 1,
    kind: "home",
    directory: dir,
    address: {
      postcode: dir.postcode,
      paon: null,
      saon: null,
      street: null,
      locality: null,
      town: null,
      ...address,
    },
  };
}

function addressList(
  dir: DirectoryPostcode,
  street: string | null = null,
  building: string | null = null,
): AddressResolution {
  return { rung: 2, kind: "address-list", directory: dir, street, building, addresses: [] };
}

const BIRKDALE_DIR = directory({
  postcode: "CM3 2JT",
  latitude: 51.776176,
  longitude: 0.60387,
  council: "Braintree",
  lsoaCode: "E01021395",
  msoaCode: "E02004463",
});
const EXETER_DIR = directory({
  postcode: "E16 1GN",
  latitude: 51.515224,
  longitude: 0.021177,
  council: "Newham",
  lsoaCode: "E01003511",
  msoaCode: "E02000749",
});
const MINERVA_DIR = directory({
  postcode: "KT17 1FH",
  latitude: 51.344571,
  longitude: -0.247104,
  council: "Epsom and Ewell",
  lsoaCode: "E01030396",
  msoaCode: "E02006837",
});
const EWELL_DIR = directory({
  postcode: "KT17 1DR",
  latitude: 51.350243,
  longitude: -0.256581,
  council: "Epsom and Ewell",
  lsoaCode: "E01030396",
  msoaCode: null,
});
const CRAWFORD_DIR = directory({
  postcode: "E16 1EG",
  latitude: 51.5125,
  longitude: 0.0245,
  council: "Newham",
  lsoaCode: "E01003511",
  msoaCode: "E02000749",
});
const BEAULIEU_DIR = directory({
  postcode: "CM1 6ER",
  latitude: 51.7425,
  longitude: 0.492,
  council: "Chelmsford",
  lsoaCode: "E01000002",
  msoaCode: null,
});
const SCOTLAND_DIR = directory({
  postcode: "EH1 1AA",
  latitude: 55.9533,
  longitude: -3.1883,
  council: null,
  lsoaCode: "S01014710",
  msoaCode: null,
});

const BIRKDALE = home(BIRKDALE_DIR, {
  label: "19 Birkdale Rise",
  paon: "19",
  street: "BIRKDALE RISE",
});
const EXETER = home(EXETER_DIR, { label: "6 Exeter Road", paon: "6", street: "EXETER ROAD" });
const MINERVA = home(MINERVA_DIR, {
  label: "Flat 4, Minerva House, 12 Ceres Crescent",
  paon: "MINERVA HOUSE, 12",
  saon: "FLAT 4",
  street: "CERES CRESCENT",
});
const EWELL = home(EWELL_DIR, {
  label: "Ewell Village, KT17 1DR",
  paon: "1",
  street: "HIGH STREET",
});
const CRAWFORD = home(CRAWFORD_DIR, {
  label: "Flat 24, Crawford Point, E16 1EG",
  paon: "CRAWFORD POINT",
  saon: "FLAT 24",
  street: "EXETER ROAD",
});
const BEAULIEU = home(BEAULIEU_DIR, {
  label: "1 Beaulieu Square, CM1 6ER",
  paon: "1",
  street: "BEAULIEU SQUARE",
});
const SCOTLAND = home(SCOTLAND_DIR, {
  label: "1 Princes Street, EH1 1AA",
  paon: "1",
  street: "PRINCES STREET",
});

const NOW = new Date("2026-11-14T00:00:00.000Z");

// --- sold prices: the filed rows ------------------------------

function row(partial: Partial<SoldPriceRow> & { price: number; saleDate: string }): SoldPriceRow {
  return {
    transactionId: null,
    postcode: "",
    propertyType: "D",
    newBuild: false,
    tenure: "F",
    paon: null,
    saon: null,
    street: null,
    locality: null,
    town: null,
    category: "A",
    sourceName: "HM Land Registry Price Paid",
    sourceDate: "2026-10-28",
    ...partial,
  };
}

// Birkdale: 29 category-A sales, the home's own £588,995 sale
// of 15 Jun 2023 the median of them; span 20 Dec 1996 to
// 20 Jul 2026; two category-B rows recorded beside them
// (31 recorded, 29 counted — the M6.3 locks).
const BIRKDALE_ROWS: SoldPriceRow[] = [
  row({
    price: 250000,
    saleDate: "1996-12-20",
    postcode: "CM3 2JT",
    paon: "1",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 275000,
    saleDate: "1998-04-02",
    postcode: "CM3 2JT",
    paon: "2",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 300000,
    saleDate: "2000-09-15",
    postcode: "CM3 2JT",
    paon: "3",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 320000,
    saleDate: "2002-03-28",
    postcode: "CM3 2JT",
    paon: "4",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 350000,
    saleDate: "2004-06-11",
    postcode: "CM3 2JT",
    paon: "5",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 375000,
    saleDate: "2006-01-19",
    postcode: "CM3 2JT",
    paon: "6",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 400000,
    saleDate: "2007-11-30",
    postcode: "CM3 2JT",
    paon: "7",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 425000,
    saleDate: "2009-05-22",
    postcode: "CM3 2JT",
    paon: "8",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 450000,
    saleDate: "2011-08-05",
    postcode: "CM3 2JT",
    paon: "9",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 475000,
    saleDate: "2013-02-14",
    postcode: "CM3 2JT",
    paon: "10",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 500000,
    saleDate: "2015-07-24",
    postcode: "CM3 2JT",
    paon: "11",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 525000,
    saleDate: "2017-10-06",
    postcode: "CM3 2JT",
    paon: "12",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 550000,
    saleDate: "2019-12-13",
    postcode: "CM3 2JT",
    paon: "14",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 575000,
    saleDate: "2021-06-25",
    postcode: "CM3 2JT",
    paon: "16",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 588995,
    saleDate: "2023-06-15",
    postcode: "CM3 2JT",
    paon: "19",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 600000,
    saleDate: "2023-09-01",
    postcode: "CM3 2JT",
    paon: "20",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 615000,
    saleDate: "2023-11-17",
    postcode: "CM3 2JT",
    paon: "21",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 630000,
    saleDate: "2024-02-09",
    postcode: "CM3 2JT",
    paon: "22",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 650000,
    saleDate: "2024-05-31",
    postcode: "CM3 2JT",
    paon: "23",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 675000,
    saleDate: "2024-08-16",
    postcode: "CM3 2JT",
    paon: "24",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 700000,
    saleDate: "2024-11-08",
    postcode: "CM3 2JT",
    paon: "25",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 725000,
    saleDate: "2025-01-24",
    postcode: "CM3 2JT",
    paon: "26",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 750000,
    saleDate: "2025-04-11",
    postcode: "CM3 2JT",
    paon: "27",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 800000,
    saleDate: "2025-07-04",
    postcode: "CM3 2JT",
    paon: "28",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 850000,
    saleDate: "2025-09-19",
    postcode: "CM3 2JT",
    paon: "29",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 900000,
    saleDate: "2025-12-05",
    postcode: "CM3 2JT",
    paon: "30",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 950000,
    saleDate: "2026-02-20",
    postcode: "CM3 2JT",
    paon: "31",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 1000000,
    saleDate: "2026-05-01",
    postcode: "CM3 2JT",
    paon: "33",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 1100000,
    saleDate: "2026-07-20",
    postcode: "CM3 2JT",
    paon: "35",
    street: "BIRKDALE RISE",
  }),
  row({
    price: 1,
    saleDate: "2022-12-29",
    postcode: "CM3 2JT",
    paon: "32",
    street: "BIRKDALE RISE",
    category: "B",
  }),
  row({
    price: 1,
    saleDate: "2022-12-29",
    postcode: "CM3 2JT",
    paon: "39",
    street: "BIRKDALE RISE",
    category: "B",
  }),
];

// Exeter: 9 category-A sales, median £310,000, span
// 20 Sep 2013 to 31 Jan 2024; the home's own sale £270,000,
// 17 Jan 2014, served as filed (the M6.3 locks).
const EXETER_ROWS: SoldPriceRow[] = [
  row({
    price: 180000,
    saleDate: "2013-09-20",
    postcode: "E16 1GN",
    paon: "1",
    street: "EXETER ROAD",
  }),
  row({
    price: 220000,
    saleDate: "2013-11-08",
    postcode: "E16 1GN",
    paon: "2",
    street: "EXETER ROAD",
  }),
  row({
    price: 270000,
    saleDate: "2014-01-17",
    postcode: "E16 1GN",
    paon: "6",
    street: "EXETER ROAD",
  }),
  row({
    price: 295000,
    saleDate: "2016-03-04",
    postcode: "E16 1GN",
    paon: "3",
    street: "EXETER ROAD",
  }),
  row({
    price: 310000,
    saleDate: "2018-06-22",
    postcode: "E16 1GN",
    paon: "4",
    street: "EXETER ROAD",
  }),
  row({
    price: 340000,
    saleDate: "2020-02-14",
    postcode: "E16 1GN",
    paon: "5",
    street: "EXETER ROAD",
  }),
  row({
    price: 390000,
    saleDate: "2021-10-01",
    postcode: "E16 1GN",
    paon: "7",
    street: "EXETER ROAD",
  }),
  row({
    price: 450000,
    saleDate: "2023-04-21",
    postcode: "E16 1GN",
    paon: "8",
    street: "EXETER ROAD",
  }),
  row({
    price: 520000,
    saleDate: "2024-01-31",
    postcode: "E16 1GN",
    paon: "10",
    street: "EXETER ROAD",
  }),
];

// Minerva: 27 category-A sales of 31 recorded in the
// postcode, median £399,999, span 30 Aug 2019 to 6 Jul 2026.
// Minerva House itself holds 12 of them, median £392,499.50,
// span 29 Nov 2019 to 18 Sep 2024; Flat 4's own sale is
// £420,000, 3 Dec 2019. Jupiter House's Flat 4 (£341,000)
// is a different home in the same postcode — the trap.
const MINERVA_BUILDING: [number, string, string][] = [
  [340000, "2019-11-29", "FLAT 1"],
  [355000, "2020-03-06", "FLAT 2"],
  [365000, "2020-08-21", "FLAT 3"],
  [420000, "2019-12-03", "FLAT 4"],
  [385000, "2021-06-04", "FLAT 5"],
  [390000, "2022-02-18", "FLAT 6"],
  [394999, "2022-09-30", "FLAT 7"],
  [405000, "2023-03-24", "FLAT 8"],
  [410000, "2023-08-11", "FLAT 9"],
  [415000, "2024-02-02", "FLAT 10"],
  [375000, "2021-01-15", "FLAT 11"],
  [435000, "2024-09-18", "FLAT 12"],
];
const MINERVA_OTHERS: [number, string, string, string | null][] = [
  [341000, "2021-05-14", "JUPITER HOUSE, 10", "FLAT 4"],
  [350000, "2020-05-29", "JUPITER HOUSE, 10", "FLAT 1"],
  [360000, "2021-09-17", "JUPITER HOUSE, 10", "FLAT 2"],
  [370000, "2022-04-08", "JUNO HOUSE, 16", "FLAT 1"],
  [380000, "2022-11-25", "JUNO HOUSE, 16", "FLAT 2"],
  [395000, "2023-05-19", "JUNO HOUSE, 16", "FLAT 4"],
  [399999, "2023-10-27", "JUPITER HOUSE, 10", "FLAT 7"],
  [402000, "2024-03-15", "JUNO HOUSE, 16", "FLAT 5"],
  [408000, "2024-06-28", "JUPITER HOUSE, 10", "FLAT 8"],
  [412000, "2024-11-01", "JUNO HOUSE, 16", "FLAT 6"],
  [418000, "2025-02-21", "JUPITER HOUSE, 10", "FLAT 9"],
  [425000, "2025-06-13", "JUNO HOUSE, 16", "FLAT 7"],
  [440000, "2025-10-03", "JUPITER HOUSE, 10", "FLAT 10"],
  [460000, "2019-08-30", "JUNO HOUSE, 16", "FLAT 8"],
  [500000, "2026-07-06", "JUPITER HOUSE, 10", "FLAT 11"],
];
const MINERVA_ROWS: SoldPriceRow[] = [
  ...MINERVA_BUILDING.map(([price, saleDate, saon]) =>
    row({
      price,
      saleDate,
      postcode: "KT17 1FH",
      paon: "MINERVA HOUSE, 12",
      saon,
      street: "CERES CRESCENT",
      propertyType: "F",
      tenure: "L",
    }),
  ),
  ...MINERVA_OTHERS.map(([price, saleDate, paon, saon]) =>
    row({
      price,
      saleDate,
      postcode: "KT17 1FH",
      paon,
      saon,
      street: "CERES CRESCENT",
      propertyType: "F",
      tenure: "L",
    }),
  ),
  row({
    price: 1,
    saleDate: "2022-06-10",
    postcode: "KT17 1FH",
    paon: "MINERVA HOUSE, 12",
    saon: "FLAT 2",
    street: "CERES CRESCENT",
    category: "B",
  }),
  row({
    price: 1,
    saleDate: "2022-06-10",
    postcode: "KT17 1FH",
    paon: "JUPITER HOUSE, 10",
    saon: "FLAT 3",
    street: "CERES CRESCENT",
    category: "B",
  }),
  row({
    price: 1,
    saleDate: "2023-01-20",
    postcode: "KT17 1FH",
    paon: "JUNO HOUSE, 16",
    saon: "FLAT 3",
    street: "CERES CRESCENT",
    category: "B",
  }),
  row({
    price: 1,
    saleDate: "2023-01-20",
    postcode: "KT17 1FH",
    paon: "MINERVA HOUSE, 12",
    saon: "FLAT 9",
    street: "CERES CRESCENT",
    category: "B",
  }),
];

// Crawford Point, E16 1EG: exactly one recorded sale — Flat
// 24, £148,000, 5 Jun 2009 (the M6.3 lock) — so the median
// serves its too-few state.
const CRAWFORD_ROWS: SoldPriceRow[] = [
  row({
    price: 148000,
    saleDate: "2009-06-05",
    postcode: "E16 1EG",
    paon: "CRAWFORD POINT",
    saon: "FLAT 24",
    street: "EXETER ROAD",
    propertyType: "F",
    tenure: "L",
  }),
];

// Ewell Village: three recorded sales — a served postcode
// set under the median floor, so the too-few line headlines.
const EWELL_ROWS: SoldPriceRow[] = [
  row({
    price: 525000,
    saleDate: "2019-04-12",
    postcode: "KT17 1DR",
    paon: "2",
    street: "HIGH STREET",
  }),
  row({
    price: 610000,
    saleDate: "2021-08-27",
    postcode: "KT17 1DR",
    paon: "4",
    street: "HIGH STREET",
  }),
  row({
    price: 585000,
    saleDate: "2023-02-10",
    postcode: "KT17 1DR",
    paon: "6",
    street: "HIGH STREET",
  }),
];

class FakeSoldPricesSource implements SoldPricesDataSource {
  constructor(
    private rowsByPostcode: Map<string, SoldPriceRow[]>,
    private editions: Map<string, string>,
  ) {}
  async salesInPostcode(postcode: string) {
    return this.rowsByPostcode.get(postcode) ?? [];
  }
  async loadEdition(postcode: string) {
    return this.editions.get(postcode) ?? null;
  }
  async loadPostcode() {}
}

const soldPricesSource = new FakeSoldPricesSource(
  new Map([
    ["CM3 2JT", BIRKDALE_ROWS],
    ["E16 1GN", EXETER_ROWS],
    ["KT17 1FH", MINERVA_ROWS],
    ["E16 1EG", CRAWFORD_ROWS],
    ["KT17 1DR", EWELL_ROWS],
  ]),
  // CM1 6ER was loaded and filed none — the stamp is the
  // proof (the M6.3 zero-sales postcode).
  new Map([["CM1 6ER", "2026-10-28"]]),
);

// --- crime: the filed artefacts -------------------------------

function crimeArtefact(total: number, asb: number): FiledCrimeAnswer {
  const months: { month: string; count: number }[] = [];
  const per = Math.floor(total / 12);
  for (let back = 11; back >= 0; back -= 1) {
    const monthIndex = 2026 * 12 + 8 - back;
    const y = Math.floor(monthIndex / 12);
    const m = (monthIndex % 12) + 1;
    months.push({
      month: `${y}-${String(m).padStart(2, "0")}`,
      count: back === 0 ? total - per * 11 : per,
    });
  }
  return {
    total,
    windowFrom: "2025-10",
    windowTo: "2026-09",
    months,
    categories: {
      "violent-crime": Math.floor((total - asb) / 2),
      "anti-social-behaviour": asb,
      "other-theft": total - asb - Math.floor((total - asb) / 2),
    },
    basis: "Street-level crimes recorded within 1 mile of the postcode point (Police.uk API)",
    sourceName: "Police.uk street-level crime",
    sourceDate: "2026-09",
    loadedAt: "2026-11-12T00:00:00.000Z",
  };
}

class FakeCrimeSource implements CrimeDataSource {
  constructor(private artefacts: Map<string, FiledCrimeAnswer>) {}
  async crimeAnswer(postcode: string) {
    return this.artefacts.get(postcode) ?? null;
  }
  // The cold load (M6.9/D30): this fake's loads fail — an
  // unfiled postcode (E16 1EG, CM1 6ER) serves not-filed,
  // the load-attempted-and-failed state its witnesses use.
  async loadPostcode(): Promise<void> {
    throw new Error("the Police.uk load failed");
  }
}

// The locked totals and ASB counts (M6.4): Birkdale 330 / 65,
// Exeter 10,722 / 1,852, Minerva 1,956 / 332, Ewell Village
// 2,361 at first load. E16 1EG and CM1 6ER hold no artefact —
// the not-filed witness. Birkdale's artefact also carries
// the M6.20 calibration fields (its measured Basis B
// population; a synthetic England embedding at 100.0 per
// 1,000) so the short calibration lines are asserted; the
// other homes' artefacts predate the step, so their short
// calibration lines are null.
const crimeSource = new FakeCrimeSource(
  new Map([
    [
      "CM3 2JT",
      {
        ...crimeArtefact(330, 65),
        basisResidents: 6380,
        national: { total: 5649011, residents: 56490108 },
      },
    ],
    ["E16 1GN", crimeArtefact(10722, 1852)],
    ["KT17 1FH", crimeArtefact(1956, 332)],
    ["KT17 1DR", crimeArtefact(2361, 402)],
  ]),
);

// --- flood: the filed facts, as measured ----------------------

const ZONES_SOURCE = "Environment Agency — Flood Map for Planning (Flood Zones 2 and 3)";
const ROFRS_SOURCE = "Environment Agency — Risk of Flooding from Rivers and Sea";
const ROFSW_SOURCE = "Environment Agency — Risk of Flooding from Surface Water";

function floodFacts(
  partial: Partial<FloodLayerFacts> & { sourceName: string; sourceDate: string },
): FloodLayerFacts {
  return { filedCount: 1000, covering: [], nearestWithin: [], nearestBeyond: null, ...partial };
}

const FLOOD_FACTS = new Map<string, Record<FloodLayerType, FloodLayerFacts>>();
function fileFloodFacts(dir: DirectoryPostcode, layers: Record<FloodLayerType, FloodLayerFacts>) {
  FLOOD_FACTS.set(`${dir.latitude},${dir.longitude}`, layers);
}

// Birkdale: the three absences (M6.5 locks) — zones remainder,
// rivers & sea no band published, surface water below the
// lowest band, each with its own nearest edges.
fileFloodFacts(BIRKDALE_DIR, {
  flood_zone: floodFacts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    nearestWithin: [
      { riskLabel: "FZ2", detail: "river · direct rainfall model", miles: 0.841 },
      { riskLabel: "FZ3", detail: "river · modelled", miles: 0.845 },
    ],
  }),
  rofrs: floodFacts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.841 },
      { riskLabel: "High", detail: ">0 m", miles: 0.845 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.845 },
      { riskLabel: "Very low", detail: ">0 m", miles: 1.307 },
    ],
  }),
  rofsw: floodFacts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.03 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.032 },
      { riskLabel: "High", detail: ">0 m", miles: 0.079 },
    ],
  }),
});

// Exeter: the disagreement case — Flood Zone 3 covers the
// point while rivers & sea file Very low over the same point.
fileFloodFacts(EXETER_DIR, {
  flood_zone: floodFacts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    covering: [{ riskLabel: "FZ3", detail: "river and sea · modelled" }],
    nearestWithin: [{ riskLabel: "FZ2", detail: "river · modelled", miles: 0.138 }],
  }),
  rofrs: floodFacts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    covering: [{ riskLabel: "Very low", detail: ">0 m" }],
    nearestWithin: [
      { riskLabel: "High", detail: ">0 m", miles: 0.159 },
      { riskLabel: "Low", detail: ">0 m", miles: 0.497 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.741 },
    ],
  }),
  rofsw: floodFacts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.005 },
      { riskLabel: "High", detail: ">0 m", miles: 0.016 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.017 },
    ],
  }),
});

// Minerva (the Epsom point): zones remainder, rivers & sea no
// band published, surface water Low AT the point.
fileFloodFacts(MINERVA_DIR, {
  flood_zone: floodFacts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    nearestWithin: [
      { riskLabel: "FZ2", detail: "river · modelled", miles: 0.404 },
      { riskLabel: "FZ3", detail: "river · modelled", miles: 0.412 },
    ],
  }),
  rofrs: floodFacts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    nearestWithin: [
      { riskLabel: "Low", detail: ">0 m", miles: 0.404 },
      { riskLabel: "High", detail: ">0 m", miles: 0.412 },
      { riskLabel: "Medium", detail: ">0 m", miles: 0.412 },
    ],
  }),
  rofsw: floodFacts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    covering: [{ riskLabel: "Low", detail: ">0 m" }],
    nearestWithin: [
      { riskLabel: "Medium", detail: ">0 m", miles: 0.007 },
      { riskLabel: "High", detail: ">0 m", miles: 0.028 },
    ],
  }),
});

// Ewell Village: the same Epsom-side picture, simplified —
// the step's witness here is constraints, not flood.
fileFloodFacts(EWELL_DIR, {
  flood_zone: floodFacts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    nearestWithin: [{ riskLabel: "FZ2", detail: "river · modelled", miles: 0.31 }],
  }),
  rofrs: floodFacts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    nearestWithin: [{ riskLabel: "Low", detail: ">0 m", miles: 0.31 }],
  }),
  rofsw: floodFacts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [{ riskLabel: "Low", detail: ">0 m", miles: 0.012 }],
  }),
});

// Crawford Point: plain absences on all three layers.
fileFloodFacts(CRAWFORD_DIR, {
  flood_zone: floodFacts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    nearestWithin: [{ riskLabel: "FZ2", detail: "river · modelled", miles: 0.5 }],
  }),
  rofrs: floodFacts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    nearestWithin: [{ riskLabel: "Low", detail: ">0 m", miles: 0.5 }],
  }),
  rofsw: floodFacts({
    sourceName: ROFSW_SOURCE,
    sourceDate: "2026-11-10",
    nearestWithin: [{ riskLabel: "Low", detail: ">0 m", miles: 0.02 }],
  }),
});

// Beaulieu: the surface-water layer is NOT FILED — its named
// not-filed state is the witness; the other layers serve
// their absences.
fileFloodFacts(BEAULIEU_DIR, {
  flood_zone: floodFacts({
    sourceName: ZONES_SOURCE,
    sourceDate: "2026-10-21",
    nearestWithin: [{ riskLabel: "FZ2", detail: "river · modelled", miles: 1.204 }],
  }),
  rofrs: floodFacts({
    sourceName: ROFRS_SOURCE,
    sourceDate: "2026-11-03",
    nearestWithin: [{ riskLabel: "Low", detail: ">0 m", miles: 1.204 }],
  }),
  rofsw: floodFacts({ sourceName: ROFSW_SOURCE, sourceDate: "2026-11-10", filedCount: 0 }),
});

class FakeFloodSource implements FloodDataSource {
  async layerFacts(layer: FloodLayerType, latitude: number, longitude: number) {
    const record = FLOOD_FACTS.get(`${latitude},${longitude}`);
    if (!record) throw new Error(`no fake flood facts for ${latitude},${longitude}`);
    return record[layer];
  }
  // M6.27: unfiled by default in this fake world; the
  // identity test below files a served block to prove the
  // short derivation never reads it.
  defencesFacts: FloodDefencesFacts = {
    filedCount: 0,
    totalWithin: 0,
    sourceName: null,
    sourceDate: null,
    defences: [],
  };
  async defencesNear() {
    return this.defencesFacts;
  }
  // M6.28: unfiled by default in this fake world; the
  // identity test below files a served block to prove the
  // short derivation never reads it.
  climateFactsByLayer: Record<string, object> = {};
  async climateFacts(layer: string) {
    return (this.climateFactsByLayer[layer] ?? {
      filedCount: 0,
      coveringLabel: null,
      sourceName: null,
      sourceDate: null,
    }) as never;
  }
}

const floodSource = new FakeFloodSource();

// --- nearby: points due north at the locked miles -------------

// A point due north of the postcode point at exactly the
// given haversine miles (earth radius 3,956, the brain's own
// basis): along a meridian the haversine is exact, so the
// brain's round-3 serving reproduces the locked figure.
function northOf(dir: DirectoryPostcode, name: string, miles: number): NearbyPoint {
  return {
    name,
    latitude: dir.latitude + (miles / 3956) * (180 / Math.PI),
    longitude: dir.longitude,
  };
}

function series(
  dir: DirectoryPostcode,
  firstName: string,
  firstMiles: number,
  count: number,
  step: number,
  restPrefix: string,
): NearbyPoint[] {
  const points: NearbyPoint[] = [northOf(dir, firstName, firstMiles)];
  for (let i = 1; i < count; i += 1)
    points.push(northOf(dir, `${restPrefix} ${i}`, firstMiles + i * step));
  return points;
}

const NEARBY_POINTS = new Map<string, NearbyPoint[]>();
function fileNearby(dir: DirectoryPostcode, category: string, points: NearbyPoint[]) {
  NEARBY_POINTS.set(`${dir.latitude},${dir.longitude}:${category}`, points);
}

// Birkdale (M6.2/M5.17 locks): primary 0.289, supermarket
// 0.258, station 0.563, GP 0.369, nursery Shining Stars
// 0.110 with 5 within.
fileNearby(BIRKDALE_DIR, "schools-primary", [
  northOf(BIRKDALE_DIR, "Hatfield Peverel Infant and Nursery School", 0.289),
  northOf(BIRKDALE_DIR, "Hatfield Peverel Junior School", 0.31),
]);
fileNearby(BIRKDALE_DIR, "schools-secondary", [northOf(BIRKDALE_DIR, "Maltings Academy", 1.621)]);
fileNearby(
  BIRKDALE_DIR,
  "nurseries",
  series(BIRKDALE_DIR, "Shining Stars", 0.11, 5, 0.3, "Nursery"),
);
fileNearby(BIRKDALE_DIR, "station", [northOf(BIRKDALE_DIR, "Hatfield Peverel", 0.563)]);
fileNearby(BIRKDALE_DIR, "gp", [northOf(BIRKDALE_DIR, "Sydney House Surgery", 0.369)]);
fileNearby(BIRKDALE_DIR, "supermarket", [northOf(BIRKDALE_DIR, "The Co-operative Food", 0.258)]);

// Exeter: station Royal Victoria 0.414, nursery Cribs Day
// Nursery 0.088 with 96 within, GP Custom House 0.240.
fileNearby(EXETER_DIR, "schools-primary", [northOf(EXETER_DIR, "Drew Road Primary School", 0.512)]);
fileNearby(EXETER_DIR, "schools-secondary", [northOf(EXETER_DIR, "Royal Docks Academy", 0.884)]);
fileNearby(
  EXETER_DIR,
  "nurseries",
  series(EXETER_DIR, "Cribs Day Nursery", 0.088, 96, 0.019, "Nursery"),
);
fileNearby(EXETER_DIR, "station", [
  northOf(EXETER_DIR, "Royal Victoria Station", 0.414),
  northOf(EXETER_DIR, "Royal Victoria DLR Station", 0.423),
]);
fileNearby(EXETER_DIR, "gp", [northOf(EXETER_DIR, "Custom House Surgery", 0.24)]);
fileNearby(EXETER_DIR, "supermarket", [northOf(EXETER_DIR, "Tesco Express", 0.31)]);

// Minerva: station Ewell East 0.246, nursery Nestots 0.174
// with 39 within, primary Ewell Grove 0.292, secondary
// Glyn School 0.385.
fileNearby(MINERVA_DIR, "schools-primary", [
  northOf(MINERVA_DIR, "Ewell Grove Primary and Nursery School", 0.292),
]);
fileNearby(MINERVA_DIR, "schools-secondary", [northOf(MINERVA_DIR, "Glyn School", 0.385)]);
fileNearby(
  MINERVA_DIR,
  "nurseries",
  series(MINERVA_DIR, "Nestots Day Nursery", 0.174, 39, 0.04, "Nursery"),
);
fileNearby(MINERVA_DIR, "station", [northOf(MINERVA_DIR, "Ewell East Rail Station", 0.246)]);
fileNearby(MINERVA_DIR, "gp", [northOf(MINERVA_DIR, "Ewell Village Surgery", 0.402)]);
fileNearby(MINERVA_DIR, "supermarket", [northOf(MINERVA_DIR, "Sainsbury's Local", 0.358)]);

class FakeNearbySource implements NearbyDataSource {
  async pointsWithin(category: string, latitude: number, longitude: number) {
    return NEARBY_POINTS.get(`${latitude},${longitude}:${category}`) ?? [];
  }
  async nearestPoint() {
    return null;
  }
  // The fixture world is a filed world (M6.9/D30 guard).
  async filedCount() {
    return 1000;
  }
}

const nearbySource = new FakeNearbySource();

// --- area: the fake source ------------------------------------

const CENSUS_BY_MSOA = new Map<string, CensusFacts>();
{
  const parsed = new Map<string, Map<string, { name: string; fragment: never }>>();
  for (const dataset of DATASETS) {
    const text = readFileSync(
      join(__dirname, "fixtures", "census", `census2021-${dataset.code}-msoa.csv`),
      "utf8",
    );
    parsed.set(dataset.code, parseDatasetCsv(text, dataset) as never);
  }
  for (const row of buildRows(parsed as never)) {
    CENSUS_BY_MSOA.set(row.msoaCode, {
      msoaCode: row.msoaCode,
      msoaName: row.msoaName,
      stats: row.stats as Record<string, unknown>,
      sourceName: "ONS Census 2021 via Nomis (bulk download)",
      sourceDate: "2021-03-21",
    });
  }
}

const PLANNING_SOURCE = "Digital Land — planning.data.gov.uk";
const PLANNING_DATE = "2026-11-10";

function layerFacts(partial: Partial<PlanningLayerFacts>): PlanningLayerFacts {
  return {
    filedCount: 1000,
    covering: [],
    nearestWithin: [],
    nearestBeyond: null,
    sourceName: PLANNING_SOURCE,
    sourceDate: PLANNING_DATE,
    ...partial,
  };
}

function emptyDesignations(): DesignationFacts {
  const empty = () => layerFacts({});
  return { byType: { sssi: empty(), sac: empty(), spa: empty(), ramsar: empty() }, overlaps: [] };
}

function listedWithin(
  nearest: { listEntryId: string; name: string; grade: string; miles: number },
  count: number,
): ListedFacts {
  const within = [nearest];
  for (let i = 1; i < count; i += 1) {
    within.push({
      listEntryId: `900000${i}`,
      name: `Listed building ${i}`,
      grade: "II",
      miles: nearest.miles + i * 0.005,
    });
  }
  return {
    filedCount: 379169,
    within,
    nearestBeyond: null,
    sourceName: "Historic England — National Heritage List for England",
    sourceDate: PLANNING_DATE,
  };
}

function solarCell(cellRef: string, yieldKwhPerKwp: number, irradiationKwhM2: number) {
  return {
    cellRef,
    yieldKwhPerKwp,
    irradiationKwhM2,
    peakPowerKwp: 1,
    systemLossPct: 14,
    slopeDeg: 35,
    azimuthDeg: 0,
    mounting: "building",
    pvTechnology: "crystSi",
    radiationDb: "PVGIS-SARAH3",
    yearMin: 2005,
    yearMax: 2023,
    sourceName: "PVGIS (European Commission Joint Research Centre) — PVGIS-SARAH3",
    sourceDate: "2023-12-31",
  };
}

interface HomeFacts {
  layers?: Partial<Record<PlanningLayerKind, PlanningLayerFacts>>;
  designations?: DesignationFacts;
  listed?: ListedFacts;
  phi?: {
    filedCount: number;
    nearest: { habitat: string; miles: number } | null;
    typesWithin: string[];
  };
  air?: { year: number; no2: number; pm25: number; pm10: number } | null;
  solar?: { gridFiledCount: number; cell: Record<string, unknown> | null };
}

const FACTS = new Map<string, HomeFacts>();
const keyOf = (lat: number, lng: number) => `${lat},${lng}`;

FACTS.set(keyOf(BIRKDALE_DIR.latitude, BIRKDALE_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      nearestWithin: [
        { id: 1, name: "Chelmer and Blackwater Navigation", detail: null, miles: 1.473 },
      ],
    }),
    article_4_area: layerFacts({
      filedCount: 7521,
      nearestWithin: [
        { id: 55, name: "West Bowers Farm, Woodham Walter", detail: null, miles: 1.584 },
      ],
    }),
    green_belt: layerFacts({
      filedCount: 181,
      nearestBeyond: { id: 56, name: "London", detail: null, miles: 5.831 },
    }),
    scheduled_monument: layerFacts({
      filedCount: 20007,
      nearestWithin: [{ id: 2, name: "Hatfield Priory", detail: null, miles: 0.495 }],
    }),
    ancient_woodland: layerFacts({
      filedCount: 80358,
      nearestWithin: [{ id: 3, name: null, detail: "revised", miles: 0.387 }],
    }),
    built_up_area: layerFacts({
      filedCount: 7775,
      covering: [{ id: 61, name: "Hatfield Peverel", detail: null }],
    }),
  },
  designations: {
    byType: {
      sssi: layerFacts({
        nearestBeyond: { id: 11, name: "Woodham Walter Common SSSI", detail: null, miles: 2.887 },
      }),
      sac: layerFacts({
        nearestBeyond: { id: 12, name: "Essex Estuaries", detail: null, miles: 4.36 },
      }),
      spa: layerFacts({
        nearestBeyond: { id: 13, name: "Blackwater Estuary", detail: null, miles: 4.36 },
      }),
      ramsar: layerFacts({
        nearestBeyond: { id: 14, name: "Blackwater Estuary", detail: null, miles: 4.36 },
      }),
    },
    overlaps: [
      [12, 13],
      [12, 14],
      [13, 14],
    ],
  },
  listed: listedWithin(
    { listEntryId: "1123430", name: "White Hart Cottage", grade: "II", miles: 0.187 },
    102,
  ),
  phi: { filedCount: 0, nearest: null, typesWithin: [] },
  air: { year: 2024, no2: 8.150298, pm25: 7.124671, pm10: 12.54823 },
  solar: { gridFiledCount: 3, cell: solarCell("51.75,0.65", 1057.65, 1336.65) },
});

FACTS.set(keyOf(EXETER_DIR.latitude, EXETER_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      nearestWithin: [{ id: 21, name: "Naval Row", detail: null, miles: 1.132 }],
    }),
    article_4_area: layerFacts({
      filedCount: 7521,
      nearestWithin: [{ id: 22, name: "London City Island", detail: null, miles: 0.617 }],
    }),
    green_belt: layerFacts({
      filedCount: 181,
      nearestBeyond: { id: 57, name: "London", detail: null, miles: 2.69 },
    }),
    scheduled_monument: layerFacts({
      filedCount: 20007,
      nearestWithin: [
        {
          id: 23,
          name: "Second World War anti-aircraft gun emplacements, Beckton",
          detail: null,
          miles: 0.924,
        },
      ],
    }),
    ancient_woodland: layerFacts({
      filedCount: 80358,
      nearestBeyond: { id: 24, name: "Greenwich Park", detail: "revised", miles: 2.51 },
    }),
  },
  designations: {
    byType: {
      sssi: layerFacts({
        nearestWithin: [
          { id: 25, name: "Gilbert's Pit (Charlton) SSSI", detail: null, miles: 1.902 },
        ],
      }),
      sac: layerFacts({
        nearestBeyond: { id: 26, name: "Epping Forest", detail: null, miles: 4.07 },
      }),
      spa: layerFacts({ nearestBeyond: { id: 27, name: "Lee Valley", detail: null, miles: 5.19 } }),
      ramsar: layerFacts({
        nearestBeyond: { id: 28, name: "Lee Valley", detail: null, miles: 5.19 },
      }),
    },
    overlaps: [[27, 28]],
  },
  listed: listedWithin(
    {
      listEntryId: "1406622",
      name: "Chapel of St George and St Helena at former Dockland Settlement No. 1",
      grade: "II",
      miles: 0.322,
    },
    213,
  ),
  phi: { filedCount: 0, nearest: null, typesWithin: [] },
  air: { year: 2024, no2: 21.71409, pm25: 9.939679, pm10: 16.97423 },
  solar: { gridFiledCount: 3, cell: solarCell("51.55,0.05", 1009.96, 1289.44) },
});

FACTS.set(keyOf(MINERVA_DIR.latitude, MINERVA_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      nearestWithin: [{ id: 31, name: "Ewell Village", detail: null, miles: 0.099 }],
    }),
    article_4_area: layerFacts({
      filedCount: 7521,
      nearestWithin: [{ id: 32, name: "Ewell Village", detail: "1A;1C;1D;1F;2A;2B", miles: 0.099 }],
    }),
    green_belt: layerFacts({
      filedCount: 181,
      nearestWithin: [{ id: 33, name: "London", detail: null, miles: 0.101 }],
    }),
    scheduled_monument: layerFacts({
      filedCount: 20007,
      nearestWithin: [{ id: 34, name: "Tower of old church, Ewell", detail: null, miles: 0.436 }],
    }),
    ancient_woodland: layerFacts({
      filedCount: 80358,
      nearestWithin: [{ id: 35, name: null, detail: "original", miles: 1.41 }],
    }),
  },
  designations: {
    byType: {
      sssi: layerFacts({
        nearestWithin: [{ id: 36, name: "Stones Road Pond SSSI", detail: null, miles: 0.673 }],
      }),
      sac: layerFacts({
        nearestBeyond: { id: 37, name: "Mole Gap to Reigate Escarpment", detail: null, miles: 5.0 },
      }),
      spa: layerFacts({
        nearestBeyond: { id: 38, name: "South West London Waterbodies", detail: null, miles: 7.05 },
      }),
      ramsar: layerFacts({
        nearestBeyond: { id: 39, name: "South West London Waterbodies", detail: null, miles: 7.05 },
      }),
    },
    overlaps: [[38, 39]],
  },
  listed: listedWithin(
    { listEntryId: "1214537", name: "PIT HOUSE", grade: "II", miles: 0.169 },
    315,
  ),
  phi: { filedCount: 0, nearest: null, typesWithin: [] },
  air: { year: 2024, no2: 12.49256, pm25: 7.868347, pm10: 12.10357 },
  solar: { gridFiledCount: 3, cell: solarCell("51.35,-0.25", 991.49, 1264.87) },
});

// Ewell Village (C1): the point falls INSIDE both the
// conservation area and the Article 4 direction — the
// headline inside line, with the direction's codes filed
// in the full bundle, is the D28/Q4 witness.
FACTS.set(keyOf(EWELL_DIR.latitude, EWELL_DIR.longitude), {
  layers: {
    conservation_area: layerFacts({
      filedCount: 9798,
      covering: [{ id: 41, name: "Ewell Village", detail: null }],
    }),
    article_4_area: layerFacts({
      filedCount: 7521,
      covering: [{ id: 42, name: "Ewell Village", detail: "1A;1C;1D;1F;2A;2B" }],
    }),
    green_belt: layerFacts({
      filedCount: 181,
      nearestWithin: [{ id: 43, name: "London", detail: null, miles: 0.101 }],
    }),
    scheduled_monument: layerFacts({
      filedCount: 20007,
      nearestWithin: [{ id: 44, name: "Tower of old church, Ewell", detail: null, miles: 0.3 }],
    }),
    ancient_woodland: layerFacts({
      filedCount: 80358,
      nearestWithin: [{ id: 45, name: null, detail: "original", miles: 1.41 }],
    }),
  },
  phi: { filedCount: 0, nearest: null, typesWithin: [] },
  air: null,
});

const GATE_PUBLISHERS = new Set([
  "Epsom and Ewell",
  "Tower Hamlets",
  "Oxford",
  "Kingston upon Thames",
]);

const COUNCIL_TAX = new Map<string, CouncilTaxFacts>([
  [
    "Braintree",
    {
      authorityName: "Braintree",
      nation: "england",
      taxYear: "2026-27",
      bandDAreaAveragePence: 228034,
      parishAveraged: true,
      components: [
        { role: "billing_authority", label: "Braintree", pence: 20601 },
        { role: "county", label: "county council", pence: 164196 },
        { role: "police", label: "police", pence: 27531 },
        { role: "fire", label: "fire and rescue", pence: 9252 },
      ],
      sourceName: "MHCLG — Council Tax levels set by local authorities in England 2026 to 2027",
      sourceDate: "2026-03-25",
    },
  ],
  [
    "Newham",
    {
      authorityName: "Newham",
      nation: "england",
      taxYear: "2026-27",
      bandDAreaAveragePence: 194423,
      parishAveraged: false,
      components: [
        { role: "billing_authority", label: "Newham", pence: 143372 },
        { role: "gla", label: "Greater London Authority", pence: 51051 },
      ],
      sourceName: "MHCLG — Council Tax levels set by local authorities in England 2026 to 2027",
      sourceDate: "2026-03-25",
    },
  ],
  [
    "Epsom and Ewell",
    {
      authorityName: "Epsom and Ewell",
      nation: "england",
      taxYear: "2026-27",
      bandDAreaAveragePence: 253084,
      parishAveraged: false,
      components: [
        { role: "billing_authority", label: "Epsom and Ewell", pence: 23985 },
        { role: "county", label: "county council", pence: 193842 },
        { role: "police", label: "police", pence: 35257 },
      ],
      sourceName: "MHCLG — Council Tax levels set by local authorities in England 2026 to 2027",
      sourceDate: "2026-03-25",
    },
  ],
]);

const IMD = new Map<string, ImdFacts>([
  [
    "E01021395",
    {
      lsoaCode: "E01021395",
      lsoaName: "Braintree 018C",
      decile: 8,
      summary: imdSummaryFor(8),
      domains: {
        income: 7,
        employment: 8,
        education: 7,
        health: 7,
        crime: 8,
        barriers: 4,
        livingEnvironment: 9,
      },
      sourceName: "English Indices of Deprivation 2025 — File 7 (MHCLG)",
      sourceDate: "2025-10-30",
    },
  ],
  [
    "E01003511",
    {
      lsoaCode: "E01003511",
      lsoaName: "Newham 036A",
      decile: 3,
      summary: imdSummaryFor(3),
      domains: {
        income: 2,
        employment: 4,
        education: 4,
        health: 5,
        crime: 5,
        barriers: 1,
        livingEnvironment: 6,
      },
      sourceName: "English Indices of Deprivation 2025 — File 7 (MHCLG)",
      sourceDate: "2025-10-30",
    },
  ],
  [
    "E01030396",
    {
      lsoaCode: "E01030396",
      lsoaName: "Epsom and Ewell 010D",
      decile: 10,
      summary: imdSummaryFor(10),
      domains: {
        income: 9,
        employment: 10,
        education: 10,
        health: 10,
        crime: 8,
        barriers: 10,
        livingEnvironment: 7,
      },
      sourceName: "English Indices of Deprivation 2025 — File 7 (MHCLG)",
      sourceDate: "2025-10-30",
    },
  ],
]);

const BENEFITS = new Map<
  string,
  {
    claimantCount: { month: string; count: number; pct: number | null } | null;
    ucPeople: { month: string; count: number } | null;
    ucHouseholds: { month: string; count: number } | null;
    bases: { residents: number; households: number } | null;
  }
>([
  [
    "E01021395",
    {
      claimantCount: { month: "2026-09-01", count: 15, pct: 1.6 },
      ucPeople: { month: "2026-05-01", count: 117 },
      ucHouseholds: { month: "2026-04-01", count: 105 },
      bases: { residents: 1489, households: 625 },
    },
  ],
  [
    "E01003511",
    {
      claimantCount: { month: "2026-09-01", count: 120, pct: 8.6 },
      ucPeople: { month: "2026-05-01", count: 383 },
      ucHouseholds: null,
      bases: { residents: 1923, households: 671 },
    },
  ],
  [
    "E01030396",
    {
      claimantCount: { month: "2026-09-01", count: 20, pct: 1.2 },
      ucPeople: { month: "2026-05-01", count: 93 },
      ucHouseholds: { month: "2026-04-01", count: 83 },
      bases: { residents: 2487, households: 852 },
    },
  ],
]);

function cert(partial: Partial<EpcCertificate> & { certificateNumber: string }): EpcCertificate {
  return {
    addressLine1: null,
    addressLine2: null,
    addressLine3: null,
    postTown: null,
    postcode: "",
    uprn: null,
    band: null,
    ratingCurrent: null,
    potentialBand: null,
    totalFloorArea: null,
    dwellingType: null,
    assessmentType: null,
    registrationDate: null,
    ...partial,
  };
}

function epcArtefactOf(certificates: EpcCertificate[]): EpcArtefact {
  return {
    certificates,
    certificateCount: certificates.length,
    sourceName: "Get energy performance of buildings data (MHCLG)",
    sourceDate: "2026-11-12",
    loadedAt: "2026-11-12T00:00:00.000Z",
  };
}

const EPC_BY_POSTCODE = new Map<string, EpcArtefact | null>([
  [
    "CM3 2JT",
    epcArtefactOf([
      cert({
        certificateNumber: "2490-1633-0432-1002-3023",
        addressLine1: "19 Birkdale Rise",
        postTown: "CHELMSFORD",
        postcode: "CM3 2JT",
        band: "B",
        ratingCurrent: 85,
        potentialBand: "B",
        totalFloorArea: 141,
        dwellingType: "Detached house",
        assessmentType: "SAP",
        registrationDate: "2022-10-07",
      }),
    ]),
  ],
  [
    "E16 1GN",
    epcArtefactOf([
      cert({
        certificateNumber: "9248-9925-7330-1627-9930",
        addressLine1: "6 Exeter Road",
        postTown: "LONDON",
        postcode: "E16 1GN",
        band: "B",
        ratingCurrent: 84,
        potentialBand: "B",
        totalFloorArea: 91,
        dwellingType: "Flat",
        assessmentType: "RdSAP",
        registrationDate: "2023-03-08",
      }),
      cert({
        certificateNumber: "0111-2222-3333-4444-5555",
        addressLine1: "6 Exeter Road",
        postTown: "LONDON",
        postcode: "E16 1GN",
        band: "B",
        ratingCurrent: 81,
        potentialBand: "B",
        totalFloorArea: 71,
        dwellingType: "Flat",
        assessmentType: "SAP",
        registrationDate: "2013-06-14",
      }),
    ]),
  ],
  // E16 1EG: the register was loaded and holds none — the
  // filed-zero witness.
  ["E16 1EG", epcArtefactOf([])],
]);

{
  // KT17 1FH: 25 certificates at the postcode; exactly one
  // belongs to Flat 4, Minerva House (the M6.6 trap).
  const certs: EpcCertificate[] = [
    cert({
      certificateNumber: "8401-7039-6529-6723-9906",
      addressLine1: "Flat 4 Minerva House",
      addressLine2: "12 Ceres Crescent",
      postTown: "EPSOM",
      postcode: "KT17 1FH",
      band: "B",
      ratingCurrent: 85,
      potentialBand: "B",
      totalFloorArea: 70,
      dwellingType: "Flat",
      assessmentType: "SAP",
      registrationDate: "2019-11-07",
    }),
  ];
  for (let flat = 1; flat <= 12; flat += 1) {
    if (flat === 4) continue;
    certs.push(
      cert({
        certificateNumber: `7000-0000-0000-0000-${1000 + flat}`,
        addressLine1: `Flat ${flat} Minerva House`,
        addressLine2: "12 Ceres Crescent",
        postTown: "EPSOM",
        postcode: "KT17 1FH",
        band: "B",
        ratingCurrent: 83,
        totalFloorArea: 68,
        dwellingType: "Flat",
        assessmentType: "SAP",
        registrationDate: "2019-11-07",
      }),
    );
  }
  for (let flat = 1; flat <= 8; flat += 1) {
    certs.push(
      cert({
        certificateNumber: `7000-0000-0000-0000-${2000 + flat}`,
        addressLine1: `Flat ${flat} Jupiter House`,
        addressLine2: "10 Ceres Crescent",
        postTown: "EPSOM",
        postcode: "KT17 1FH",
        band: "B",
        ratingCurrent: 82,
        totalFloorArea: 66,
        dwellingType: "Flat",
        assessmentType: "SAP",
        registrationDate: "2019-11-07",
      }),
    );
  }
  for (let flat = 1; flat <= 5; flat += 1) {
    certs.push(
      cert({
        certificateNumber: `7000-0000-0000-0000-${3000 + flat}`,
        addressLine1: `Flat ${flat} Juno House`,
        addressLine2: "16 Ceres Crescent",
        postTown: "EPSOM",
        postcode: "KT17 1FH",
        band: "B",
        ratingCurrent: 82,
        totalFloorArea: 66,
        dwellingType: "Flat",
        assessmentType: "SAP",
        registrationDate: "2019-11-07",
      }),
    );
  }
  EPC_BY_POSTCODE.set("KT17 1FH", epcArtefactOf(certs));
}

const NOISE_BY_POSTCODE = new Map<
  string,
  {
    filedCount: number;
    rows: { sourceKind: string; dayBand: string | null; nightBand: string | null }[];
  }
>([
  [
    "CM3 2JT",
    {
      filedCount: 12,
      rows: [
        { sourceKind: "road", dayBand: "Below 55 dB", nightBand: "Below 50 dB" },
        {
          sourceKind: "rail",
          dayBand: "No modelled rail noise",
          nightBand: "No modelled rail noise",
        },
        {
          sourceKind: "airport",
          dayBand: "No modelled airport noise",
          nightBand: "No modelled airport noise",
        },
      ],
    },
  ],
  [
    "E16 1GN",
    {
      filedCount: 12,
      rows: [
        { sourceKind: "road", dayBand: "55–59 dB", nightBand: "Below 50 dB" },
        {
          sourceKind: "rail",
          dayBand: "No modelled rail noise",
          nightBand: "No modelled rail noise",
        },
        { sourceKind: "airport", dayBand: "Below 55 dB", nightBand: "No modelled airport noise" },
      ],
    },
  ],
  [
    "KT17 1FH",
    {
      filedCount: 12,
      rows: [
        { sourceKind: "road", dayBand: "55–59 dB", nightBand: "Below 50 dB" },
        {
          sourceKind: "rail",
          dayBand: "No modelled rail noise",
          nightBand: "No modelled rail noise",
        },
        {
          sourceKind: "airport",
          dayBand: "No modelled airport noise",
          nightBand: "No modelled airport noise",
        },
      ],
    },
  ],
  [
    "KT17 1DR",
    {
      filedCount: 12,
      rows: [
        { sourceKind: "road", dayBand: "Below 55 dB", nightBand: "Below 50 dB" },
        { sourceKind: "rail", dayBand: "Below 55 dB", nightBand: "Below 50 dB" },
        {
          sourceKind: "airport",
          dayBand: "No modelled airport noise",
          nightBand: "No modelled airport noise",
        },
      ],
    },
  ],
  // Scotland: filing exists, so the section serves its
  // not-covered state (never not-filed) — the order matters.
  ["EH1 1AA", { filedCount: 3, rows: [] }],
]);

class FakeAreaSource implements AreaDataSource {
  private facts(lat: number, lng: number): HomeFacts {
    return FACTS.get(keyOf(lat, lng)) ?? {};
  }

  async planningLayerFacts(layer: PlanningLayerKind, latitude: number, longitude: number) {
    return this.facts(latitude, longitude).layers?.[layer] ?? layerFacts({});
  }

  async designationFacts(latitude: number, longitude: number) {
    return this.facts(latitude, longitude).designations ?? emptyDesignations();
  }

  async listedFacts(latitude: number, longitude: number) {
    return (
      this.facts(latitude, longitude).listed ?? {
        filedCount: 379169,
        within: [],
        nearestBeyond: null,
        sourceName: "Historic England — National Heritage List for England",
        sourceDate: PLANNING_DATE,
      }
    );
  }

  async phiFacts(latitude: number, longitude: number) {
    const phi = this.facts(latitude, longitude).phi;
    if (!phi || phi.filedCount <= 0)
      return { filedCount: 0, nearest: null, typesWithin: [], sourceName: null, sourceDate: null };
    return {
      filedCount: phi.filedCount,
      nearest: phi.nearest,
      typesWithin: phi.typesWithin,
      sourceName: "Natural England — Priority Habitat Inventory",
      sourceDate: PLANNING_DATE,
    };
  }

  async article4Gate(council: string | null) {
    return council !== null && GATE_PUBLISHERS.has(council);
  }

  async brownfieldFacts() {
    return {
      filedCount: 30355,
      within: [],
      nearestBeyond: null,
      sourceName: "planning.data.gov.uk — brownfield land (Open Government Licence v3.0)",
      sourceDate: "2026-11-16",
    };
  }

  async brownfieldGate() {
    return false;
  }

  async epcArtefact(postcode: string) {
    return EPC_BY_POSTCODE.get(postcode) ?? null;
  }

  async loadEpc() {
    throw new Error("the EPC load failed");
  }

  async councilTaxRow(council: string | null) {
    return (council && COUNCIL_TAX.get(council)) || null;
  }

  async censusRow(msoaCode: string) {
    return CENSUS_BY_MSOA.get(msoaCode) ?? null;
  }

  async imdRow(lsoaCode: string) {
    return IMD.get(lsoaCode) ?? null;
  }

  async airSquare(latitude: number, longitude: number) {
    const air = this.facts(latitude, longitude).air;
    if (!air) return null;
    return {
      ...air,
      sourceName: "Defra — Pollution Climate Mapping (PCM)",
      sourceDate: "2025-06-30",
    };
  }

  async noiseRows(postcode: string) {
    const noise = NOISE_BY_POSTCODE.get(postcode);
    if (!noise || noise.filedCount <= 0)
      return { filedCount: 0, rows: [], sourceName: null, sourceDate: null };
    return {
      filedCount: noise.filedCount,
      rows: noise.rows,
      sourceName: "Defra strategic noise mapping — England Round 4 (2022 reference year)",
      sourceDate: "2024-10-01",
    };
  }

  async benefits(lsoaCode: string) {
    const filed = BENEFITS.get(lsoaCode);
    if (!filed) return { claimantCount: null, ucPeople: null, ucHouseholds: null, bases: null };
    const stamp = { sourceName: "DWP via Stat-Xplore / ONS Nomis", sourceDate: "2026-10-13" };
    return {
      claimantCount: filed.claimantCount ? { ...filed.claimantCount, ...stamp } : null,
      ucPeople: filed.ucPeople ? { ...filed.ucPeople, pct: null, ...stamp } : null,
      ucHouseholds: filed.ucHouseholds ? { ...filed.ucHouseholds, pct: null, ...stamp } : null,
      bases: filed.bases,
    };
  }

  async solarCell(cellRef: string) {
    for (const facts of FACTS.values()) {
      const solar = facts.solar;
      if (solar && solar.cell && solar.cell.cellRef === cellRef)
        return { gridFiledCount: solar.gridFiledCount, cell: solar.cell as never };
    }
    const anySolar = [...FACTS.values()].find((f) => f.solar);
    return { gridFiledCount: anySolar?.solar?.gridFiledCount ?? 0, cell: null };
  }

  // Building safety (M6.16) never headlines; the builder
  // does read the port, so the stub serves the empty form.
  async tribunalFacts() {
    return {
      filedCount: 28,
      lastFiledAt: "2026-11-14T05:15:00.000Z",
      sourceName:
        "GOV.UK — Residential property tribunal decisions (First-tier Tribunal, Property Chamber)",
      rows: [],
    };
  }

  // Broadband & mobile (M6.17): broadband headlines with
  // the gigabit line, so the stub serves the verified
  // gigabit-100 answer for the golden postcodes (the only
  // live-verified broadband figure — the M5.9 harness).
  // Mobile never headlines; the stub serves a filed answer
  // so the tests can prove it still never reaches the
  // short shape.
  broadbandOverride: BroadbandAnswerFacts | null | undefined = undefined;

  async broadbandAnswer(postcode: string): Promise<BroadbandAnswerFacts | null> {
    if (this.broadbandOverride !== undefined) return this.broadbandOverride;
    if (!["CM3 2JT", "E16 1GN", "KT17 1FH"].includes(postcode)) return null;
    return {
      basis: "All premises",
      snapshot: "2026-01",
      gigabitCapablePct: 100,
      superfast30Pct: 100,
      ultrafast100Pct: 100,
      ultrafast300Pct: 100,
      ngaPct: 12.34,
      unable2Pct: 0.11,
      unable5Pct: 0.22,
      unable10Pct: 0.33,
      unable30Pct: 3.21,
      unableDecentFixedOrFwaPct: 0.44,
      decentViaFwaPct: 0.55,
      speedBandPct: {
        under_2: 0,
        "2_to_5": 0,
        "5_to_10": 0,
        "10_to_30": 0,
        "30_to_300": 0,
        "300_plus": 100,
      },
    };
  }

  async mobileAnswer() {
    return {
      basis:
        "Local authority area — Ofcom publishes mobile coverage at local-authority level, not by postcode",
      snapshot: "2026-01",
      laua: "E07000067",
      lauaName: "Braintree",
      services: {
        voice: {
          outdoor: { noOperatorPct: 0, allOperatorsPct: 99.29, atLeastOneOperatorPct: 100 },
        },
      },
    };
  }

  // Company ownership (M6.13) is flag-gated and the short
  // bundle never carries it; these tests build with the
  // shipped (off) position, so the builder never calls
  // this — the stub exists for the port's shape only.
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
    };
  }
}

const areaSource = new FakeAreaSource();

// --- assembly: full bundles in, short bundle out --------------

async function fullBundles(resolution: AddressResolution, now: Date = NOW) {
  const [nearby, soldPrices, crime, flood, area] = await Promise.all([
    buildNearbyBundle(resolution, nearbySource),
    buildSoldPricesBundle(resolution, soldPricesSource),
    buildCrimeBundle(resolution, crimeSource, { now }),
    buildFloodBundle(resolution, floodSource),
    buildAreaBundle(resolution, areaSource),
  ]);
  return { nearby, soldPrices, crime, flood, area };
}

async function shortFor(resolution: AddressResolution, now: Date = NOW): Promise<ShortBundle> {
  return buildShortBundle(await fullBundles(resolution, now));
}

type ServedShort = Extract<ShortBundle, { kind: "short-bundle" }>;

function servedShort(short: ShortBundle): ServedShort {
  if (short.kind !== "short-bundle")
    throw new Error(`expected a served short bundle, got ${short.kind}`);
  return short;
}

function servedSold(short: ServedShort) {
  const s = short.sections.soldPrices;
  if (s.state !== "served") throw new Error(`sold prices state is ${s.state}`);
  return s;
}

function servedCrime(short: ServedShort) {
  const s = short.sections.crime;
  if (s.state !== "served") throw new Error(`crime state is ${s.state}`);
  return s;
}

function servedFlood(short: ServedShort) {
  const s = short.sections.flood;
  if (s.state !== "served") throw new Error(`flood state is ${s.state}`);
  return s;
}

function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) allStrings(v, out);
  return out;
}

function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) allKeys(v, out);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allKeys(v, out);
    }
  return out;
}

function allNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allNumbers(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) allNumbers(v, out);
  return out;
}

const SECTION_ORDER = [
  "soldPrices",
  "flood",
  "crime",
  "epc",
  "councilTax",
  "constraints",
  "heritage",
  "nature",
  "air",
  "noise",
  "broadband",
  "nearby",
];

// --- the golden homes at headline depth ------------------------

describe("short bundle — 19 Birkdale Rise, CM3 2JT (rung 1)", () => {
  it("orders its sections as D28 rules", async () => {
    const short = servedShort(await shortFor(BIRKDALE));
    expect(short.rung).toBe(1);
    expect(short.postcode).toBe("CM3 2JT");
    expect(Object.keys(short.sections)).toEqual(SECTION_ORDER);
  });

  it("sold prices: own last sale AND the postcode median, as separate facts", async () => {
    const sold = servedSold(servedShort(await shortFor(BIRKDALE)));
    expect(sold.ownLastSale).toEqual({ price: 588995, date: "2023-06-15" });
    expect(sold.ownLine).toBeNull();
    expect(sold.median).toEqual({
      state: "served",
      value: 588995,
      counted: 29,
      spanFrom: "1996-12-20",
      spanTo: "2026-07-20",
      line: "counted over 29 recorded sales, 1996-12-20 to 2026-07-20",
    });
    expect(sold.buildingMedian).toBeNull();
    expect(sold.explainer).toContain("It is not a valuation of this home.");
    expect(sold.sourceLine).toBe("HM Land Registry Price Paid — file edition 2026-10-28");
  });

  it("crime: the total line plus anti-social behaviour as its own line", async () => {
    const crime = servedCrime(servedShort(await shortFor(BIRKDALE)));
    expect(crime.total).toBe(330);
    expect(crime.totalLine).toBe(
      "330 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
    );
    expect(crime.windowLine).toBe("October 2025 to September 2026");
    expect(crime.asb).toEqual({ count: 65 });
    expect(crime.staleLine).toBeNull();
    expect(crime.sourceLine).toBe("Police.uk street-level crime — data to September 2026");
    // The M6.20 calibration lines (decision D39) ride the
    // derivation from the full bundle — the per-head line,
    // and the England line carrying both figures.
    expect(crime.perHeadLine).toBe("51.7 recorded crimes per 1,000 residents");
    expect(crime.englandLine).toBe(
      "the England figure for the same 12 months is 100.0 recorded crimes per 1,000 residents — this circle's figure is about 0.5 times the England figure",
    );
  });

  it("crime: a pre-M6.20 artefact derives null calibration lines — never estimated", async () => {
    const crime = servedCrime(servedShort(await shortFor(EXETER)));
    expect(crime.perHeadLine).toBeNull();
    expect(crime.englandLine).toBeNull();
  });

  it("flood: three layer lines, three absences, never merged", async () => {
    const flood = servedFlood(servedShort(await shortFor(BIRKDALE)));
    expect(flood.layers.map((l) => l.layer)).toEqual(["flood_zone", "rofrs", "rofsw"]);
    const [zones, rofrs, rofsw] = flood.layers;
    expect(zones.pointState).toBe("zone-1");
    expect(zones.line).toBe(
      "the postcode point is not in Flood Zone 2 or Flood Zone 3 on the Environment Agency's planning map",
    );
    expect(zones.coveringLabel).toBeNull();
    expect(zones.basisLine).toContain("drawn as if flood defences were not there");
    expect(zones.sourceLine).toBe(
      "Environment Agency — Flood Map for Planning (Flood Zones 2 and 3) — data to 21 October 2026",
    );
    expect(rofrs.pointState).toBe("no-band-published");
    expect(rofrs.line).toBe(
      "no likelihood band is published for this point on the Environment Agency's map of flooding from rivers and the sea",
    );
    expect(rofrs.sourceLine).toContain("data to 3 November 2026");
    expect(rofsw.pointState).toBe("below-lowest-band");
    expect(rofsw.line).toBe(
      "no surface-water band reaches this point — below the lowest band this product publishes",
    );
    expect(rofsw.sourceLine).toContain("data to 10 November 2026");
    // The three absences are three distinct lines, and the EA
    // definitions stay at report depth.
    expect(new Set(flood.layers.map((l) => l.line)).size).toBe(3);
    for (const layer of flood.layers) expect(layer).not.toHaveProperty("definition");
    expect(JSON.stringify(flood)).not.toContain("1 in 100");
  });

  it("nearby: the six headline categories, nearest one plus the count", async () => {
    const short = servedShort(await shortFor(BIRKDALE));
    const nearby = short.sections.nearby;
    expect(nearby.basisLabel).toBe("straight-line distance from the postcode point");
    expect(nearby.categories.map((c) => c.category)).toEqual([
      "schools-primary",
      "schools-secondary",
      "nurseries",
      "station",
      "gp",
      "supermarket",
    ]);
    const byCategory = new Map(nearby.categories.map((c) => [c.category, c]));
    expect(byCategory.get("station")?.nearest).toEqual({ name: "Hatfield Peverel", miles: 0.563 });
    expect(byCategory.get("schools-primary")?.nearest).toEqual({
      name: "Hatfield Peverel Infant and Nursery School",
      miles: 0.289,
    });
    expect(byCategory.get("nurseries")?.nearest).toEqual({ name: "Shining Stars", miles: 0.11 });
    expect(byCategory.get("nurseries")?.countWithin).toBe(5);
    expect(byCategory.get("gp")?.nearest).toEqual({ name: "Sydney House Surgery", miles: 0.369 });
    expect(byCategory.get("supermarket")?.nearest).toEqual({
      name: "The Co-operative Food",
      miles: 0.258,
    });
  });

  it("nearby: the M6.24 maternity category leaves the short bundle shape-identical", async () => {
    // Maternity is a full-check category only (D28's six are
    // unchanged). The proof is identity, not inspection: the
    // short bundle derived from the full twenty-one-category
    // nearby bundle equals, field for field, the short bundle
    // derived from the same bundle with the maternity answer
    // removed — as if the category did not exist.
    const inputs = await fullBundles(BIRKDALE);
    if (inputs.nearby.kind !== "distances") throw new Error("expected distances");
    expect(inputs.nearby.categories.map((c) => c.category)).toContain("maternity");
    const withMaternity = buildShortBundle(inputs);
    const withoutMaternity = buildShortBundle({
      ...inputs,
      nearby: {
        ...inputs.nearby,
        categories: inputs.nearby.categories.filter((c) => c.category !== "maternity"),
      },
    });
    expect(withMaternity).toEqual(withoutMaternity);
    const short = servedShort(withMaternity);
    expect(short.sections.nearby.categories.map((c) => c.category)).not.toContain("maternity");
  });

  it("nearby: the M6.25 CQC ratings leave the short bundle shape-identical", async () => {
    // Ratings are full-check depth (D28's headlines carry
    // names and miles only). The proof is identity: the
    // short bundle derived from a nearby bundle whose
    // health places carry ratings equals, field for field,
    // the short bundle derived from the same bundle
    // without them — the derivation never reads the field.
    // (The filed ratings themselves are pinned in
    // tests/nearby.test.ts; here a rating is placed on the
    // Exeter GP place so a value is present to be ignored.)
    const inputs = await fullBundles(EXETER);
    if (inputs.nearby.kind !== "distances") throw new Error("expected distances");
    const rated = {
      ...inputs.nearby,
      categories: inputs.nearby.categories.map((c) =>
        c.category === "gp"
          ? {
              ...c,
              places: c.places.map((place, i) =>
                i === 0 ? { ...place, cqcRating: { rating: "Good", date: "2026-06-01" } } : place,
              ),
            }
          : c,
      ),
    };
    const withRatings = buildShortBundle({ ...inputs, nearby: rated });
    const withoutRatings = buildShortBundle(inputs);
    expect(withRatings).toEqual(withoutRatings);
    expect(JSON.stringify(servedShort(withRatings))).not.toContain("cqcRating");
  });

  it("area: the M6.26 EPC construction block leaves the short bundle shape-identical", async () => {
    // Construction descriptions are report depth (D48);
    // the headline EPC projection carries band, assessment
    // label and line only. The proof is identity, not
    // inspection: the short bundle derived from an area
    // bundle whose certificates carry construction blocks
    // equals, field for field, the one derived without
    // them — the derivation never reads the field.
    const inputs = await fullBundles(BIRKDALE);
    if (inputs.area.kind !== "area-bundle") throw new Error("expected an area bundle");
    // The block must actually be present on the input for
    // the identity to prove anything.
    expect(inputs.area.sections.epc.certificates.length).toBeGreaterThan(0);
    const withConstruction = {
      ...inputs,
      area: {
        ...inputs.area,
        sections: {
          ...inputs.area.sections,
          epc: {
            ...inputs.area.sections.epc,
            certificates: inputs.area.sections.epc.certificates.map((cert) => ({
              ...cert,
              construction: {
                line: "the certificate's own description of this home's construction, recorded at the assessment; on an existing-home (RdSAP) certificate '(assumed)' means the assessor could not inspect that part and recorded the standard assumption for a home of its kind.",
                uValueLine:
                  "the U-value in a description is the register's measure of how fast heat passes through that part of the home, in watts per square metre for each degree of temperature difference — lower lets less heat escape.",
                groups: [
                  {
                    key: "walls" as const,
                    label: "Walls",
                    descriptions: ["Average thermal transmittance 0.27 W/m²K"],
                    line: "Walls: Average thermal transmittance 0.27 W/m²K",
                  },
                ],
              },
            })),
          },
        },
      },
    };
    const withBlock = buildShortBundle(withConstruction);
    const withoutBlock = buildShortBundle(inputs);
    expect(withBlock).toEqual(withoutBlock);
    const serialised = JSON.stringify(servedShort(withBlock));
    expect(serialised).not.toContain("construction");
    expect(serialised).not.toContain("thermal transmittance");
  });

  it("flood: the M6.27 defences block leaves the short bundle shape-identical", async () => {
    // Recorded defences are report depth (D49); the headline
    // flood projection picks the live-warnings subset and the
    // layers only. The proof is identity, not inspection: the
    // short bundle derived from a flood bundle carrying a
    // served defences block equals, field for field, the one
    // derived from the same bundle with the block in its
    // not-filed form — the derivation never reads it.
    floodSource.defencesFacts = {
      filedCount: 141458,
      totalWithin: 1,
      sourceName: "Environment Agency — AIMS Spatial Flood Defences",
      sourceDate: "2026-11-13",
      defences: [
        {
          assetId: "73925",
          assetName: "Not Available",
          assetSubType: "Natural High Ground",
          protectionType: "Fluvial",
          assetMaintainer: "Environment Agency",
          currentCondition: "3",
          designSop: 10,
          designSopDqf: null,
          currentSop: null,
          waterCourseName: "River Ter",
          miles: 0.851,
        },
      ],
    };
    try {
      const inputs = await fullBundles(BIRKDALE);
      if (inputs.flood.kind !== "flood" || inputs.flood.flood.state !== "served")
        throw new Error("expected a served flood bundle");
      // The block must actually be present, and served, for
      // the identity to prove anything.
      expect(inputs.flood.flood.defences.state).toBe("served");
      expect(inputs.flood.flood.defences.defences[0].assetId).toBe("73925");
      const withBlock = buildShortBundle(inputs);
      const withoutBlock = buildShortBundle({
        ...inputs,
        flood: {
          ...inputs.flood,
          flood: {
            ...inputs.flood.flood,
            defences: {
              state: "not-filed",
              title: "Recorded flood defences near this postcode point",
              caveat: null,
              bridgeLine: null,
              defences: [],
              totalWithin: null,
              overflowLine: null,
              line: "recorded flood defences are not filed yet, so no answer can be given from them",
              sourceName: null,
              sourceDate: null,
              sourceLine: null,
            },
          },
        },
      });
      expect(withBlock).toEqual(withoutBlock);
      const serialised = JSON.stringify(servedShort(withBlock));
      // The block's own markers only — the layers' basis
      // lines legitimately speak of defences in their own
      // words, and are not the block.
      expect(serialised).not.toContain("Recorded flood defences");
      expect(serialised).not.toContain("AIMS");
      expect(serialised).not.toContain("73925");
      expect(serialised).not.toContain("design standard");
    } finally {
      floodSource.defencesFacts = {
        filedCount: 0,
        totalWithin: 0,
        sourceName: null,
        sourceDate: null,
        defences: [],
      };
    }
  });

  it("flood: the M6.28 climate block leaves the short bundle shape-identical", async () => {
    // The climate outlook is report depth (D49); the
    // headline flood projection picks the live-warnings
    // subset and the layers only. The proof is identity,
    // not inspection: the short bundle derived from a flood
    // bundle carrying a served climate block equals, field
    // for field, the one derived from the same bundle with
    // the block in its not-filed form — the derivation
    // never reads it.
    floodSource.climateFactsByLayer = {
      rofrs_cc: {
        filedCount: 252932,
        coveringLabel: "Low",
        sourceName: "Environment Agency",
        sourceDate: "2026-11-03",
      },
      rofsw_cc: {
        filedCount: 406734,
        coveringLabel: "Low",
        sourceName: "Environment Agency",
        sourceDate: "2026-11-10",
      },
    };
    try {
      const inputs = await fullBundles(BIRKDALE);
      if (inputs.flood.kind !== "flood" || inputs.flood.flood.state !== "served")
        throw new Error("expected a served flood bundle");
      // The block must actually be present, with a band
      // served, for the identity to prove anything.
      expect(inputs.flood.flood.climate.sources[0].pointState).toBe("inside");
      expect(inputs.flood.flood.climate.sources[0].band?.label).toBe("Low");
      const withBlock = buildShortBundle(inputs);
      const withoutBlock = buildShortBundle({
        ...inputs,
        flood: {
          ...inputs.flood,
          flood: {
            ...inputs.flood.flood,
            climate: {
              heading: "Climate outlook",
              basisLine: inputs.flood.flood.climate.basisLine,
              caveatLine: inputs.flood.flood.climate.caveatLine,
              sources: inputs.flood.flood.climate.sources.map((s) => ({
                ...s,
                pointState: "not-filed" as const,
                band: null,
                sourceName: null,
                sourceDate: null,
                sourceLine: null,
              })),
            },
          },
        },
      });
      expect(withBlock).toEqual(withoutBlock);
      const serialised = JSON.stringify(servedShort(withBlock));
      // The block's own markers only.
      expect(serialised).not.toContain("Climate outlook");
      expect(serialised).not.toContain("climate scenario");
      expect(serialised).not.toContain("UKCP18");
      expect(serialised).not.toContain("RCP 8.5");
    } finally {
      floodSource.climateFactsByLayer = {};
    }
  });

  it("area sections: EPC band, the council-tax line with its correction, NO2, road noise", async () => {
    const short = servedShort(await shortFor(BIRKDALE));
    expect(short.sections.epc).toEqual({
      state: "served",
      headlineBand: "B",
      headlineAssessmentLabel:
        "predicted — a SAP assessment, the assessor's model made for a new-build home",
      line: null,
    });
    expect(short.sections.councilTax.state).toBe("served");
    expect(short.sections.councilTax.authority).toBe("Braintree");
    expect(short.sections.councilTax.bandDAverageLabel).toBe("£2,280.34");
    expect(short.sections.councilTax.line).toBe(
      "Band D averages £2,280.34 a year in Braintree (the council's scale — not this home's bill)",
    );
    expect(short.sections.air.headlineFigure).toEqual({
      pollutant: "NO2",
      value: 8.150298,
      line: "modelled NO2 8.150298 µg/m³ (annual mean, 2024)",
    });
    expect(short.sections.noise.headlineBand).toEqual({
      sourceKind: "road",
      dayBand: "Below 55 dB",
    });
  });

  it("constraints: Article 4 not-published verbatim; the conservation-area absence carries its check date", async () => {
    const short = servedShort(await shortFor(BIRKDALE));
    const { constraints } = short.sections;
    expect(constraints.article4.state).toBe("not-published");
    expect(constraints.article4.line).toBe(
      "Article 4 directions are not published by this council to the national dataset, so no finding can be made from the data — the answer lives on the council's own planning register",
    );
    expect(constraints.article4).not.toHaveProperty("codes");
    expect(constraints.article4).not.toHaveProperty("rights");
    expect(constraints.conservationArea.state).toBe("none-found");
    expect(constraints.conservationArea.line).toBe(
      "no conservation area found in the national data, checked 10 November 2026",
    );
    expect(constraints.conservationArea.nearest).toEqual({
      name: "Chelmer and Blackwater Navigation",
      miles: 1.473,
    });
    expect(constraints.greenBelt.beyondLine).toBe(
      "none within 2 miles — the nearest is London, 5.831 miles away (straight-line distance from the postcode point)",
    );
  });

  it("constraints M6.21: the built-up area slims through the polygon pick; brownfield skims in the listed form; no new headline opens", async () => {
    const short = servedShort(await shortFor(BIRKDALE));
    const { constraints, heritage } = short.sections;
    expect(constraints.builtUpArea.state).toBe("inside");
    expect(constraints.builtUpArea.line).toBe(
      "the postcode point falls inside the Hatfield Peverel built-up area",
    );
    // This fake's council does not supply the register and
    // no sites are filed within: the skim carries the
    // gated state and NO count — the absence is not a
    // finding at headline depth either.
    expect(constraints.brownfield.state).toBe("not-published");
    expect(constraints.brownfield.countWithin).toBeNull();
    expect(constraints.brownfield.nearest).toBeNull();
    expect(constraints.brownfield.line).toBe(
      "this council does not supply the national brownfield register, so no finding can be made from the data — the council's own brownfield register is the record",
    );
    // The heritage section's four new layers take the
    // monuments' place: in the full bundle, absent here.
    expect(heritage).not.toHaveProperty("worldHeritageSites");
    expect(heritage).not.toHaveProperty("battlefields");
    expect(heritage).not.toHaveProperty("protectedWrecks");
    expect(heritage).not.toHaveProperty("worldHeritageBufferZones");
  });

  it("heritage and nature, slimmed: count line and nearest listed; nearest place and the woodland line", async () => {
    const short = servedShort(await shortFor(BIRKDALE));
    const { heritage, nature } = short.sections;
    expect(heritage.listed.state).toBe("served");
    expect(heritage.listed.countWithin).toBe(102);
    expect(heritage.listed.line).toBe("102 listed buildings within 2 miles of the postcode point");
    expect(heritage.listed.nearest).toEqual({
      listEntryId: "1123430",
      name: "White Hart Cottage",
      grade: "II",
      miles: 0.187,
    });
    expect(heritage.atPoint.state).toBe("none");
    // The full nearest-3 list and the monuments layer stay in
    // the full bundle.
    expect(heritage).not.toHaveProperty("monuments");
    expect(nature.placesWithinCount).toBe(0);
    expect(nature.placesLine).toBe("no designated site at or within 2 miles of the postcode point");
    expect(nature.nearestPlace?.name).toBe("Woodham Walter Common SSSI");
    expect(nature.nearestPlace?.miles).toBe(2.887);
    expect(nature.nearestPlace?.inside).toBe(false);
    expect(nature.beyondLine).toContain("the nearest is Woodham Walter Common SSSI");
    expect(nature.ancientWoodland.line).toBe(
      "no ancient woodland recorded in the inventory near this postcode point",
    );
    expect(nature.priorityHabitat.state).toBe("not-filed");
  });
});

describe("short bundle — 6 Exeter Road, E16 1GN (rung 1)", () => {
  it("sold prices and crime goldens", async () => {
    const short = servedShort(await shortFor(EXETER));
    const sold = servedSold(short);
    expect(sold.ownLastSale).toEqual({ price: 270000, date: "2014-01-17" });
    expect(sold.median).toMatchObject({
      state: "served",
      value: 310000,
      counted: 9,
      spanFrom: "2013-09-20",
      spanTo: "2024-01-31",
    });
    const crime = servedCrime(short);
    expect(crime.total).toBe(10722);
    expect(crime.totalLine).toBe(
      "10,722 recorded crimes within 1 mile of this postcode, October 2025 to September 2026",
    );
    expect(crime.asb).toEqual({ count: 1852 });
  });

  it("flood: the disagreement case — Zone 3 covers, rivers & sea say Very low, both lines stand", async () => {
    const flood = servedFlood(servedShort(await shortFor(EXETER)));
    const [zones, rofrs, rofsw] = flood.layers;
    expect(zones.pointState).toBe("inside");
    expect(zones.coveringLabel).toBe("Flood Zone 3");
    expect(zones.coveringDetail).toBe("river and sea · modelled");
    expect(zones.line).toBe(
      "the postcode point falls inside Flood Zone 3 on the Environment Agency's planning map",
    );
    expect(rofrs.pointState).toBe("inside");
    expect(rofrs.coveringLabel).toBe("Very low");
    expect(rofsw.pointState).toBe("below-lowest-band");
  });

  it("nearby and area goldens", async () => {
    const short = servedShort(await shortFor(EXETER));
    const byCategory = new Map(short.sections.nearby.categories.map((c) => [c.category, c]));
    expect(byCategory.get("station")?.nearest).toEqual({
      name: "Royal Victoria Station",
      miles: 0.414,
    });
    expect(byCategory.get("nurseries")?.nearest).toEqual({
      name: "Cribs Day Nursery",
      miles: 0.088,
    });
    expect(byCategory.get("nurseries")?.countWithin).toBe(96);
    expect(byCategory.get("gp")?.nearest).toEqual({ name: "Custom House Surgery", miles: 0.24 });
    expect(short.sections.epc).toEqual({
      state: "served",
      headlineBand: "B",
      headlineAssessmentLabel: "an assessment of the existing home",
      line: "the register holds 2 certificates for this home — all are shown, and where they disagree both figures stand",
    });
    expect(short.sections.councilTax.line).toBe(
      "Band D averages £1,944.23 a year in Newham (the council's scale — not this home's bill)",
    );
    expect(short.sections.air.headlineFigure?.value).toBe(21.71409);
    expect(short.sections.noise.headlineBand).toEqual({ sourceKind: "road", dayBand: "55–59 dB" });
    expect(short.sections.constraints.article4.state).toBe("not-published");
    expect(short.sections.heritage.listed.countWithin).toBe(213);
    expect(short.sections.heritage.listed.nearest).toEqual({
      listEntryId: "1406622",
      name: "Chapel of St George and St Helena at former Dockland Settlement No. 1",
      grade: "II",
      miles: 0.322,
    });
    expect(short.sections.nature.placesWithinCount).toBe(1);
    expect(short.sections.nature.nearestPlace?.name).toContain("Gilbert's Pit");
    expect(short.sections.nature.nearestPlace?.miles).toBe(1.902);
  });
});

describe("short bundle — Flat 4, Minerva House, KT17 1FH (rung 1)", () => {
  it("sold prices: own sale, postcode median AND the building median — and the Flat 4 trap holds", async () => {
    const short = servedShort(await shortFor(MINERVA));
    const sold = servedSold(short);
    expect(sold.ownLastSale).toEqual({ price: 420000, date: "2019-12-03" });
    expect(sold.median).toMatchObject({
      state: "served",
      value: 399999,
      counted: 27,
      spanFrom: "2019-08-30",
      spanTo: "2026-07-06",
    });
    expect(sold.buildingMedian).toMatchObject({
      building: "Minerva House",
      state: "served",
      value: 392499.5,
      counted: 12,
      spanFrom: "2019-11-29",
      spanTo: "2024-09-18",
    });
    // Jupiter House's Flat 4 sale (£341,000) is a different
    // home's fact: it appears nowhere in the short bundle.
    expect(JSON.stringify(short)).not.toContain("341000");
  });

  it("crime, flood, nearby and area goldens", async () => {
    const short = servedShort(await shortFor(MINERVA));
    const crime = servedCrime(short);
    expect(crime.total).toBe(1956);
    expect(crime.asb).toEqual({ count: 332 });
    const flood = servedFlood(short);
    expect(flood.layers[0].pointState).toBe("zone-1");
    expect(flood.layers[1].pointState).toBe("no-band-published");
    expect(flood.layers[2].pointState).toBe("inside");
    expect(flood.layers[2].coveringLabel).toBe("Low");
    const byCategory = new Map(short.sections.nearby.categories.map((c) => [c.category, c]));
    expect(byCategory.get("station")?.nearest).toEqual({
      name: "Ewell East Rail Station",
      miles: 0.246,
    });
    expect(byCategory.get("nurseries")?.nearest).toEqual({
      name: "Nestots Day Nursery",
      miles: 0.174,
    });
    expect(byCategory.get("nurseries")?.countWithin).toBe(39);
    expect(byCategory.get("schools-primary")?.nearest).toEqual({
      name: "Ewell Grove Primary and Nursery School",
      miles: 0.292,
    });
    expect(byCategory.get("schools-secondary")?.nearest).toEqual({
      name: "Glyn School",
      miles: 0.385,
    });
    // The three-Flat-4s separation survives derivation: the
    // one matched certificate is Minerva's own, band B.
    expect(short.sections.epc).toEqual({
      state: "served",
      headlineBand: "B",
      headlineAssessmentLabel:
        "predicted — a SAP assessment, the assessor's model made for a new-build home",
      line: null,
    });
    expect(short.sections.councilTax.line).toBe(
      "Band D averages £2,530.84 a year in Epsom and Ewell (the council's scale — not this home's bill)",
    );
    expect(short.sections.air.headlineFigure?.value).toBe(12.49256);
    expect(short.sections.heritage.listed.countWithin).toBe(315);
    expect(short.sections.heritage.listed.nearest).toEqual({
      listEntryId: "1214537",
      name: "PIT HOUSE",
      grade: "II",
      miles: 0.169,
    });
    const { constraints } = short.sections;
    expect(constraints.conservationArea.state).toBe("none-found");
    expect(constraints.conservationArea.nearest).toEqual({ name: "Ewell Village", miles: 0.099 });
    expect(constraints.article4.state).toBe("none-found");
    expect(constraints.article4.line).toBe(
      "no Article 4 direction area covers this postcode point in the national data",
    );
  });
});

describe("short bundle — Ewell Village, KT17 1DR: inside the Article 4 direction", () => {
  it("headlines the plain inside line only — no codes, no translations", async () => {
    const short = servedShort(await shortFor(EWELL));
    const { constraints } = short.sections;
    expect(constraints.conservationArea.state).toBe("inside");
    expect(constraints.conservationArea.line).toBe(
      "the postcode point falls inside the Ewell Village conservation area",
    );
    expect(constraints.article4.state).toBe("inside");
    expect(constraints.article4.line).toBe(
      "the postcode point falls inside the Ewell Village Article 4 direction area — a direction that removes some permitted development rights",
    );
    expect(constraints.article4).not.toHaveProperty("codes");
    expect(constraints.article4).not.toHaveProperty("rights");
    const serialised = JSON.stringify(constraints);
    expect(serialised).not.toContain("1A;1C");
    expect(serialised).not.toContain("extensions and other alterations");
  });

  it("sold prices: the too-few median line and the home's no-sale line headline as words", async () => {
    const sold = servedSold(servedShort(await shortFor(EWELL)));
    expect(sold.ownLastSale).toBeNull();
    expect(sold.ownLine).toBe("No sale recorded for this home since 1995");
    expect(sold.median.state).toBe("too-few");
    expect(sold.median.line).toBe("only 3 recorded sales in this postcode — too few for a median");
    expect(sold.median.value).toBeNull();
  });
});

// --- rung behaviour --------------------------------------------

describe("short bundle — rung 2 honesty (Birkdale Rise, street + postcode)", () => {
  it("carries no own-sale fact, while the point and area sections match rung 1 exactly", async () => {
    const rung1 = servedShort(await shortFor(BIRKDALE));
    const rung2 = servedShort(await shortFor(addressList(BIRKDALE_DIR, "BIRKDALE RISE")));
    expect(rung2.rung).toBe(2);
    const sold = servedSold(rung2);
    // The rung-2 short shape has no own-sale keys at all —
    // the absence is structural, not a null.
    expect(sold).not.toHaveProperty("ownLastSale");
    expect(sold).not.toHaveProperty("ownLine");
    expect(JSON.stringify(sold)).not.toContain("2023-06-15");
    expect(sold.median).toEqual(servedSold(rung1).median);
    expect(sold.median.value).toBe(588995);
    expect(sold.median.counted).toBe(29);
    // Home facts serve their named states; everything
    // measured from the postcode point is identical.
    expect(rung2.sections.epc).toEqual({
      state: "needs-exact-home",
      headlineBand: null,
      headlineAssessmentLabel: null,
      line: "choose the exact home to see its energy certificates",
    });
    expect(rung2.sections.heritage.atPoint.state).toBe("needs-exact-home");
    expect(rung2.sections.crime).toEqual(rung1.sections.crime);
    expect(rung2.sections.flood).toEqual(rung1.sections.flood);
    expect(rung2.sections.nearby).toEqual(rung1.sections.nearby);
    expect(rung2.sections.constraints).toEqual(rung1.sections.constraints);
    expect(rung2.sections.nature).toEqual(rung1.sections.nature);
    expect(rung2.sections.councilTax).toEqual(rung1.sections.councilTax);
    expect(rung2.sections.air).toEqual(rung1.sections.air);
    expect(rung2.sections.noise).toEqual(rung1.sections.noise);
  });

  it("Exeter at rung 2: the home's £270,000 sale of 17 Jan 2014 appears nowhere", async () => {
    const rung2 = servedShort(await shortFor(addressList(EXETER_DIR, "EXETER ROAD")));
    const serialised = JSON.stringify(rung2.sections.soldPrices);
    expect(serialised).not.toContain("270000");
    expect(serialised).not.toContain("2014-01-17");
    expect(servedSold(rung2).median.value).toBe(310000);
  });
});

describe("short bundle — rungs 3 and 4 are named states only", () => {
  const WIDER: AddressResolution = {
    rung: 3,
    kind: "wider-area",
    outward: "CM3",
    label: "Wider area — CM3, not this exact home",
    postcodeCount: 541,
  };
  const NO_LOCATION: AddressResolution = { rung: 4, kind: "no-location" };

  it("rung 3: every section is its brain's named state, and no figure exists anywhere", async () => {
    const short = await shortFor(WIDER);
    expect(short.kind).toBe("wider-area");
    if (short.kind !== "wider-area") throw new Error("unreachable");
    expect(Object.keys(short.sections)).toEqual(SECTION_ORDER);
    expect(short.sections.soldPrices).toEqual({
      state: "unavailable",
      reason: "sold prices need an exact postcode",
    });
    expect(short.sections.flood).toEqual({
      state: "unavailable",
      reason: "flood answers need an exact postcode",
    });
    expect(short.sections.crime).toEqual({
      state: "unavailable",
      reason: "crime counts need an exact postcode",
    });
    expect(short.sections.nearby).toEqual({
      state: "unavailable",
      reason: "distances need an exact postcode",
    });
    expect(short.sections.epc).toEqual({
      state: "unavailable",
      reason: "energy certificates need an exact postcode",
    });
    expect(short.sections.councilTax).toEqual({
      state: "unavailable",
      reason: "council tax needs an exact postcode",
    });
    expect(short.sections.constraints).toEqual({
      state: "unavailable",
      reason: "planning constraints need an exact postcode",
    });
    expect(short.sections.heritage).toEqual({
      state: "unavailable",
      reason: "heritage answers need an exact postcode",
    });
    expect(short.sections.nature).toEqual({
      state: "unavailable",
      reason: "nature answers need an exact postcode",
    });
    expect(short.sections.air).toEqual({
      state: "unavailable",
      reason: "air quality needs an exact postcode",
    });
    expect(short.sections.noise).toEqual({
      state: "unavailable",
      reason: "noise bands need an exact postcode",
    });
    // Figure-freedom, deep: every leaf under sections is a
    // string, and no key below the section level names a
    // figure. (The section names themselves are the
    // product's fixed vocabulary — "soldPrices" is a
    // heading, not a payload.)
    for (const leaf of allStrings(short.sections)) expect(typeof leaf).toBe("string");
    expect(allNumbers(short.sections)).toEqual([]);
    for (const section of Object.values(short.sections))
      for (const key of allKeys(section))
        expect(key).not.toMatch(/price|miles|total|count|median|band/i);
  });

  it("rung 4: the no-location state, in the same section shape", async () => {
    const short = await shortFor(NO_LOCATION);
    expect(short.kind).toBe("no-location");
    if (short.kind !== "no-location") throw new Error("unreachable");
    expect(Object.keys(short.sections)).toEqual(SECTION_ORDER);
    expect(allNumbers(short.sections)).toEqual([]);
    for (const section of Object.values(short.sections)) expect(section.state).toBe("unavailable");
    expect(short.sections.soldPrices.reason).toBe("sold prices need an exact postcode");
    expect(short.sections.epc.reason).toBe("area answers need an exact postcode");
  });
});

describe("short bundle — one resolution or none", () => {
  it("refuses bundles of differing rungs", async () => {
    const bundles = await fullBundles(BIRKDALE);
    const rung3Crime = await buildCrimeBundle(
      { rung: 3, kind: "wider-area", outward: "CM3", label: "Wider area", postcodeCount: 1 },
      crimeSource,
      { now: NOW },
    );
    expect(() => buildShortBundle({ ...bundles, crime: rung3Crime })).toThrow(/one resolution/);
  });

  it("refuses bundles from different postcodes", async () => {
    const bundles = await fullBundles(BIRKDALE);
    const exeterSold = await buildSoldPricesBundle(EXETER, soldPricesSource);
    expect(() => buildShortBundle({ ...bundles, soldPrices: exeterSold })).toThrow(/one postcode/);
  });

  it("is pure: it reads the bundles, never the sources behind them", async () => {
    const artefacts = new Map([["CM3 2JT", crimeArtefact(330, 65)]]);
    const mutableCrime = new FakeCrimeSource(artefacts);
    const bundles = await fullBundles(BIRKDALE);
    const crime = await buildCrimeBundle(BIRKDALE, mutableCrime, { now: NOW });
    const input = { ...bundles, crime };
    const first = buildShortBundle(input);
    // The return is a value, not a Promise — there is no
    // await in the derivation because there is nothing to
    // read.
    expect(first).not.toBeInstanceOf(Promise);
    // Mutating the source changes nothing: the derivation
    // holds only the bundles it was given.
    artefacts.set("CM3 2JT", crimeArtefact(999, 111));
    expect(buildShortBundle(input)).toEqual(first);
    // And the mutation was real — a rebuilt bundle differs.
    const rebuilt = await buildCrimeBundle(BIRKDALE, mutableCrime, { now: NOW });
    expect(buildShortBundle({ ...input, crime: rebuilt })).not.toEqual(first);
  });
});

// --- named states at headline depth -----------------------------

describe("short bundle — named states project as their own words", () => {
  it("Flat 24, Crawford Point (E16 1EG): EPC filed-zero, crime not-filed, the too-few median", async () => {
    const short = servedShort(await shortFor(CRAWFORD));
    expect(short.sections.epc).toEqual({
      state: "filed-zero",
      headlineBand: null,
      headlineAssessmentLabel: null,
      line: "no energy certificate is recorded for this postcode",
    });
    expect(short.sections.crime).toEqual({
      state: "not-filed",
      reason: "crime counts could not be loaded for this postcode, so no crime answer can be given",
    });
    // The noise table is unfiled for this postcode: its
    // named state, with no band.
    expect(short.sections.noise).toEqual({
      state: "not-filed",
      headlineBand: null,
      line: "modelled noise bands are not filed yet, so no noise answer can be given yet",
    });
    const sold = servedSold(short);
    expect(sold.ownLastSale).toEqual({ price: 148000, date: "2009-06-05" });
    expect(sold.median.state).toBe("too-few");
    expect(sold.median.line).toBe("only 1 recorded sale in this postcode — too few for a median");
  });

  it("Beaulieu (CM1 6ER): the loaded-none postcode and the unfiled flood layer", async () => {
    const short = servedShort(await shortFor(BEAULIEU));
    const sold = servedSold(short);
    expect(sold.stateLine).toBe("No sale recorded for this postcode since 1995");
    expect(sold.median.state).toBe("none-recorded");
    expect(sold.sourceLine).toBe("HM Land Registry Price Paid — file edition 2026-10-28");
    const flood = servedFlood(short);
    expect(flood.layers[2].pointState).toBe("not-filed");
    expect(flood.layers[2].line).toBe(
      "this flood map is not filed yet, so no answer can be given from it",
    );
    expect(flood.layers[0].pointState).toBe("zone-1");
  });

  it("Scotland (EH1 1AA): not-covered across crime, sold prices, flood and the area sections", async () => {
    const short = servedShort(await shortFor(SCOTLAND));
    expect(short.sections.soldPrices.state).toBe("not-covered");
    expect(short.sections.crime.state).toBe("not-covered");
    expect(short.sections.flood.state).toBe("not-covered");
    expect(short.sections.councilTax.state).toBe("not-covered");
    expect(short.sections.councilTax.line).toBe(
      "council tax figures are not covered for Scotland — it runs a different system, and no comparable charge is filed",
    );
    expect(short.sections.noise.state).toBe("not-covered");
    // No count is served for a non-English point — never 0.
    expect(short.sections.heritage.listed.state).toBe("sparse-coverage");
    expect(short.sections.heritage.listed.countWithin).toBeNull();
  });

  it("the stale line travels verbatim when the filed crime window is old", async () => {
    const stale = servedShort(await shortFor(BIRKDALE, new Date("2027-01-15T00:00:00.000Z")));
    const crime = servedCrime(stale);
    expect(crime.total).toBe(330);
    expect(crime.staleLine).toBe(
      "the latest month we hold is September 2026 — Police.uk has not published newer data we can file",
    );
  });
});

// --- the depth lock ----------------------------------------------

describe("short bundle — the depth lock (D26/D28)", () => {
  it("no IMD, Census, benefits or solar payload exists anywhere in the short shape", async () => {
    const bundles = await fullBundles(BIRKDALE);
    // Sanity: the full bundles DO hold the payloads — the
    // lock below is proven against a real presence.
    const fullSerialised = JSON.stringify(bundles.area);
    expect(fullSerialised).toContain("7772");
    expect(fullSerialised).toContain("1057.65");
    expect(allNumbers(bundles.area)).toContain(117);

    const short = buildShortBundle(bundles);
    for (const key of allKeys(short))
      expect(key.toLowerCase()).not.toMatch(/census|imd|benefit|solar/);
    const serialised = JSON.stringify(short);
    for (const marker of ["among the", "claimant", "decile", "7772"])
      expect(serialised.toLowerCase()).not.toContain(marker);
    const numbers = allNumbers(short);
    for (const payload of [117, 383, 93, 1057.65, 1009.96, 991.49])
      expect(numbers).not.toContain(payload);
  });

  it("no asking price exists in the short shape — the key is absent by construction", async () => {
    const short = servedShort(await shortFor(BIRKDALE));
    for (const key of allKeys(short)) expect(key.toLowerCase()).not.toContain("asking");
  });
});

// --- broadband headlines, mobile never does (M6.17, D36) --------------

describe("short bundle — broadband & mobile (M6.17, D36)", () => {
  it("broadband is the twelfth section, carrying the gigabit line only", async () => {
    const short = servedShort(await shortFor(BIRKDALE));
    expect(Object.keys(short.sections)).toHaveLength(12);
    expect(short.sections.broadband).toEqual({
      state: "served",
      gigabitCapablePct: 100,
      line: "gigabit-capable broadband (at least 1 Gbit/s) is available to 100% of premises in this postcode",
    });
    // Nothing else of the section travels: no category
    // lines, no bands, no unclassified share.
    const json = JSON.stringify(short.sections.broadband);
    expect(json).not.toContain("superfast");
    expect(json).not.toContain("speed band");
  });

  it("mobile never headlines — no key, no payload, in any form", async () => {
    const short = servedShort(await shortFor(BIRKDALE));
    expect("mobile" in short.sections).toBe(false);
    for (const key of allKeys(short)) expect(key.toLowerCase()).not.toContain("mobile");
    // The full bundle DOES hold a mobile answer (the fake
    // files one) — the absence above is the derivation's
    // lock, not missing data.
    const bundles = await fullBundles(BIRKDALE);
    if (bundles.area.kind !== "area-bundle") throw new Error("expected an area bundle");
    expect(bundles.area.sections.mobile.state).toBe("served");
  });

  it("an unfiled postcode's broadband headline is the section's own not-filed line, verbatim", async () => {
    areaSource.broadbandOverride = null;
    try {
      const short = servedShort(await shortFor(BIRKDALE));
      expect(short.sections.broadband).toEqual({
        state: "not-filed",
        gigabitCapablePct: null,
        line: "broadband coverage is not filed for this postcode yet",
      });
    } finally {
      areaSource.broadbandOverride = undefined;
    }
  });

  it("rungs 3 and 4 name broadband among the sections, and never mobile", async () => {
    const WIDER: AddressResolution = {
      rung: 3,
      kind: "wider-area",
      outward: "CM3",
      label: "Wider area — CM3, not this exact home",
      postcodeCount: 541,
    };
    const rung3 = await shortFor(WIDER);
    if (rung3.kind !== "wider-area") throw new Error("expected wider-area");
    expect(rung3.sections.broadband).toEqual({
      state: "unavailable",
      reason: "broadband answers need an exact postcode",
    });
    expect("mobile" in rung3.sections).toBe(false);
    expect(Object.keys(rung3.sections)).toHaveLength(12);

    const rung4 = await shortFor({ rung: 4, kind: "no-location" });
    if (rung4.kind !== "no-location") throw new Error("expected no-location");
    expect(rung4.sections.broadband).toEqual({
      state: "unavailable",
      reason: "area answers need an exact postcode",
    });
    expect("mobile" in rung4.sections).toBe(false);
  });
});

// --- banned wording, inherited ------------------------------------

describe("short bundle — wording (the union of the brains' banned lists)", () => {
  // The union lives in ONE shared place (tests/banned-wording.ts,
  // M6.10/D38) — this scan and the SEO wording scan both import
  // it, so the lists can never diverge.
  const BANNED = BANNED_WORDING;
  // The one ruled disclaimer: the median explainers state the
  // figure "is not a valuation of this home" (D23). The scan
  // strips that exact sentence, then requires "valuation" to
  // appear nowhere else.
  const DISCLAIMER = VALUATION_DISCLAIMER;
  // The one ruled percentage (GIGABIT_FIGURE, shared with the
  // list): D36's broadband headline IS a percentage — the
  // gigabit figure — and the pick carries the section's line
  // verbatim. The scan strips a percentage figure in that
  // line's exact shape, then requires "%" to appear in no
  // other served string.

  it("no served string carries a banned term, and no key computes a comparison", async () => {
    const shorts: ShortBundle[] = [];
    shorts.push(await shortFor(BIRKDALE));
    shorts.push(await shortFor(EXETER));
    shorts.push(await shortFor(MINERVA));
    shorts.push(await shortFor(EWELL));
    shorts.push(await shortFor(CRAWFORD));
    shorts.push(await shortFor(BEAULIEU));
    shorts.push(await shortFor(SCOTLAND));
    shorts.push(await shortFor(addressList(BIRKDALE_DIR, "BIRKDALE RISE")));
    shorts.push(await shortFor(BIRKDALE, new Date("2027-01-15T00:00:00.000Z")));
    shorts.push(
      await shortFor({
        rung: 3,
        kind: "wider-area",
        outward: "CM3",
        label: "Wider area",
        postcodeCount: 1,
      }),
    );
    for (const short of shorts) {
      for (const text of allStrings(short)) {
        const stripped = text.split(DISCLAIMER).join("");
        expect(stripped.toLowerCase()).not.toContain("valuation");
        for (const term of BANNED) expect(text.toLowerCase()).not.toContain(term);
        expect(text.replace(GIGABIT_FIGURE, "available to premises")).not.toContain("%");
      }
      for (const key of allKeys(short)) {
        expect(key).not.toMatch(
          /gap|percent|difference|trend|direction|score|rate|rank|verdict|compar/i,
        );
      }
    }
  });

  it("the postcode's EPC spread never reaches the short bundle (M6.15, D34)", async () => {
    const full = await fullBundles(MINERVA);
    if (full.area.kind !== "area-bundle") throw new Error("expected an area bundle");
    // The full bundle's EPC section carries the spread —
    // the fake files 25 certificates at KT17 1FH, all
    // predicted, all band B.
    expect(full.area.sections.epc.spread?.certificateCount).toBe(25);
    expect(full.area.sections.epc.spread?.rows).toHaveLength(1);
    // The short bundle's EPC is the headline projection
    // only: no spread key, no spread wording.
    const short = servedShort(buildShortBundle(full));
    expect(Object.keys(short.sections.epc).sort()).toEqual(
      ["headlineAssessmentLabel", "headlineBand", "line", "state"].sort(),
    );
    expect(JSON.stringify(short)).not.toContain("certificates recorded for this postcode");
  });
});

// --- live flood warnings at headline depth (M6.22, D42) --------

describe("short bundle — live flood warnings (M6.22, decision D42)", () => {
  async function shortWithWarnings(warnings: FakeFloodWarningSource): Promise<ServedShort> {
    const full = await fullBundles(BIRKDALE);
    const flood = await buildFloodBundle(BIRKDALE, floodSource, {
      warningSource: warnings,
      now: WARNING_NOW,
    });
    return servedShort(buildShortBundle({ ...full, flood }));
  }

  it("the warning block precedes the layer lines, carrying severity, area and link — never the EA's message", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.items = [LEADON_ITEM, BURE_ITEM];
    const short = await shortWithWarnings(warnings);
    const flood = servedFlood(short);
    // First in the section, structurally.
    expect(Object.keys(flood)).toEqual(["state", "liveWarnings", "layers"]);
    const block = flood.liveWarnings;
    if (!block) throw new Error("expected a composed headline block");
    expect(block.state).toBe("warnings");
    expect(block.warnings.map((w) => w.line)).toEqual([
      "Flood alert — The tidal Rivers Bure, Ant and Thurne",
      "Flood alert — River Leadon catchment",
    ]);
    expect(block.warnings[0].raisedLine).toBe("raised at 09:00 on 15 November 2026");
    expect(block.link.url).toBe("https://www.gov.uk/check-flooding");
    expect(block.attributionLine).toContain("Environment Agency flood and river level data");
    // The EA's message text is report depth only: no message
    // field, and no fragment of either message, anywhere in
    // the short bundle.
    for (const warning of block.warnings) expect(warning).not.toHaveProperty("message");
    const serialised = JSON.stringify(short);
    expect(serialised).not.toContain("impassable");
    expect(serialised).not.toContain("Potter Heigham");
    // The layers still follow, unchanged.
    expect(flood.layers).toHaveLength(3);
  });

  it("the no-warning line stays at report depth: the headline block names the state, not the line", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.items = [];
    const short = await shortWithWarnings(warnings);
    const block = servedFlood(short).liveWarnings;
    if (!block) throw new Error("expected a composed headline block");
    expect(block.state).toBe("none");
    expect(block.line).toBeNull();
    expect(block.checkedAt).toBe("06:54 on 16 November 2026");
    expect(JSON.stringify(short)).not.toContain("No flood warning in force");
  });

  it("the failure line DOES travel to headline depth — silence would read as 'no warning'", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.error = new Error("the feed is down");
    const short = await shortWithWarnings(warnings);
    const block = servedFlood(short).liveWarnings;
    if (!block) throw new Error("expected a composed headline block");
    expect(block.state).toBe("unavailable");
    expect(block.line).toBe("Live flood warnings could not be checked just now");
  });

  it("an uncomposed full bundle projects to a null headline block", async () => {
    const short = servedShort(await shortFor(BIRKDALE));
    expect(servedFlood(short).liveWarnings).toBeNull();
  });

  it("the composed headline passes the banned-wording union scan (the EA's headline words are its labels, not our prose)", async () => {
    const warnings = new FakeFloodWarningSource();
    warnings.items = [LEADON_ITEM, BURE_ITEM];
    const short = await shortWithWarnings(warnings);
    for (const text of allStrings(short))
      for (const term of BANNED_WORDING) expect(text.toLowerCase()).not.toContain(term);
    for (const key of allKeys(short))
      expect(key).not.toMatch(
        /gap|percent|difference|trend|direction|score|rate|rank|verdict|compar/i,
      );
  });
});
