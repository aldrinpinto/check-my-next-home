import { describe, expect, it } from "vitest";
import type { AddressResolution, DirectoryPostcode } from "../lib/address";
import {
  DESTINATIONS_NOT_FILED_LINE,
  DESTINATIONS_SUSTAINED_LINE,
  buildNearbyBundle,
  haversineMiles,
  type DestinationRowFact,
  type DestinationsReleaseFacts,
  type NearbyDataSource,
  type NearbyPoint,
} from "../lib/nearby";
import { BANNED_WORDING } from "./banned-wording";

// Guards the destinations serving (plan step M6.34,
// decisions D51 and D65): the block on the nearby brain's
// secondary places — KS4 on every served secondary, KS5
// only where the sixth-form marker is exactly true, the
// D65 field set verbatim with its cohort and sustained
// lines, the suppressed and no-row states in the prep's
// adopted wordings, and the not-filed state in the house
// form. 16-plus providers never serve destinations, and
// nothing of the block reaches any other category's
// places, whatever the source hands over. The
// fixture-corpus outcomes are pinned in
// tests/nearby.test.ts and the golden replay; the cache
// behaviour in tests/bundle-cache.test.ts.

const HOME_LAT = 51.5;
const HOME_LNG = 0.02;
const north = (miles: number) => HOME_LAT + miles / 69.0;

const RELEASE: DestinationsReleaseFacts = {
  filedCount: 7291,
  ks4: { cohortYear: "2023/24", sourceDate: "2026-10-15" },
  ks5: { cohortYear: "2023/24", sourceDate: "2026-10-15" },
};

function fact(partial: Partial<DestinationRowFact> = {}): DestinationRowFact {
  return {
    cohortYear: "2023/24",
    version: "Provisional",
    cohortCount: 251,
    state: "served",
    overall: { value: 96.4, low: false },
    education: { value: 88.0, low: false },
    higherEducation: { value: null, low: false },
    apprenticeships: { value: 7.2, low: false },
    employment: { value: 1.2, low: false },
    ...partial,
  };
}
const KS5_FACT: DestinationRowFact = fact({
  cohortCount: 253,
  overall: { value: 87.4, low: false },
  education: { value: 63.2, low: false },
  higherEducation: { value: 61.7, low: false },
  apprenticeships: { value: 4.0, low: false },
  employment: { value: 20.2, low: false },
});

type Row = {
  name: string;
  category: "schools-secondary" | "schools-primary" | "sixth-forms";
  urn: string;
  sixthForm: boolean | null;
  ks4: DestinationRowFact | null;
  ks5: DestinationRowFact | null;
  miles: number;
};

class FakeSource implements NearbyDataSource {
  rows: Row[] = [];
  release: DestinationsReleaseFacts = RELEASE;
  async pointsWithin(
    category: string,
    latitude: number,
    longitude: number,
    radiusMiles: number,
  ): Promise<NearbyPoint[]> {
    return this.rows
      .filter((r) => r.category === category)
      .filter((r) => haversineMiles(latitude, longitude, north(r.miles), HOME_LNG) <= radiusMiles)
      .map((r) => ({
        name: r.name,
        latitude: north(r.miles),
        longitude: HOME_LNG,
        selective: false,
        sixthForm: r.sixthForm,
        // Every category's points carry the facts, so the
        // tests prove the brain sets the block only where
        // the step rules it — the M6.25 pattern.
        urn: r.urn,
        destinations: { ks4: r.ks4, ks5: r.ks5 },
      }));
  }
  async nearestPoint(): Promise<NearbyPoint | null> {
    return null;
  }
  async filedCount(): Promise<number> {
    return 1000;
  }
  async industrialSiteFacts() {
    return { filedCount: 0, dataYear: null, sourceName: null, sourceDate: null, sites: [] };
  }
  async destinationsRelease(): Promise<DestinationsReleaseFacts> {
    return this.release;
  }
}

function home(): AddressResolution {
  const directory: DirectoryPostcode = {
    postcode: "CM3 2JT",
    latitude: HOME_LAT,
    longitude: HOME_LNG,
    council: null,
    ward: null,
    region: null,
    lsoaCode: "E01021395",
    msoaCode: "E02004463",
  };
  return {
    rung: 1,
    kind: "home",
    directory,
    address: {
      postcode: "CM3 2JT",
      paon: "19",
      saon: null,
      street: "BIRKDALE RISE",
      town: "HATFIELD PEVEREL",
      label: "19 Birkdale Rise",
    } as never,
  };
}

async function secondaryPlaces(source: FakeSource) {
  const bundle = await buildNearbyBundle(home(), source);
  if (bundle.kind !== "distances") throw new Error("expected distances");
  const answer = bundle.categories.find((c) => c.category === "schools-secondary");
  if (!answer) throw new Error("no secondary answer");
  return { bundle, answer };
}

const sixthFormSchool: Row = {
  name: "Glyn School",
  category: "schools-secondary",
  urn: "136534",
  sixthForm: true,
  ks4: fact(),
  ks5: KS5_FACT,
  miles: 0.4,
};

describe("school destinations serving (M6.34, D51/D65)", () => {
  it("serves both stages on a sixth-form secondary: the D65 field set verbatim, with the cohort and sustained lines", async () => {
    const source = new FakeSource();
    source.rows = [sixthFormSchool];
    const { answer } = await secondaryPlaces(source);
    const place = answer.places[0];
    expect(place.urn).toBe("136534");
    expect(place.destinations?.ks4).toEqual({
      state: "served",
      cohortYear: "2023/24",
      cohortCount: 251,
      cohortLine:
        "The 251 students who finished key stage 4 in 2024 are the most recent cohort the Department for Education has published (published October 2026).",
      sustainedLine: DESTINATIONS_SUSTAINED_LINE,
      overall: { value: 96.4, low: false },
      education: { value: 88.0, low: false },
      higherEducation: null,
      apprenticeships: { value: 7.2, low: false },
      employment: { value: 1.2, low: false },
    });
    expect(place.destinations?.ks5).toEqual({
      state: "served",
      cohortYear: "2023/24",
      cohortCount: 253,
      cohortLine:
        "The 253 students who finished 16 to 19 study in 2024 are the most recent cohort the Department for Education has published (published October 2026).",
      sustainedLine: DESTINATIONS_SUSTAINED_LINE,
      overall: { value: 87.4, low: false },
      education: { value: 63.2, low: false },
      higherEducation: { value: 61.7, low: false },
      apprenticeships: { value: 4.0, low: false },
      employment: { value: 20.2, low: false },
    });
    expect(DESTINATIONS_SUSTAINED_LINE).toBe(
      "Sustained means the student stayed in the destination for at least six months of the following school year.",
    );
  });

  it("the KS5 stage serves only where the marker is exactly true — false and null carry no block, even with a KS5 row filed", async () => {
    const source = new FakeSource();
    source.rows = [
      {
        ...sixthFormSchool,
        name: "No Sixth Form School",
        urn: "148901",
        sixthForm: false,
        miles: 0.3,
      },
      {
        ...sixthFormSchool,
        name: "Unfiled Flag School",
        urn: "145410",
        sixthForm: null,
        miles: 0.5,
      },
    ];
    const { answer } = await secondaryPlaces(source);
    expect(answer.places).toHaveLength(2);
    for (const place of answer.places) {
      expect(place.destinations?.ks4.state).toBe("served");
      expect(place.destinations?.ks5).toBeNull();
    }
  });

  it("a suppressed cohort serves the prep's adopted wording, verbatim, per stage", async () => {
    const suppressedFact = fact({
      state: "suppressed",
      cohortCount: 4,
      overall: { value: null, low: false },
      education: { value: null, low: false },
      apprenticeships: { value: null, low: false },
      employment: { value: null, low: false },
    });
    const source = new FakeSource();
    source.rows = [{ ...sixthFormSchool, ks4: suppressedFact, ks5: suppressedFact }];
    const { answer } = await secondaryPlaces(source);
    const place = answer.places[0];
    expect(place.destinations?.ks4).toEqual({
      state: "suppressed",
      cohortYear: "2023/24",
      line: "DfE does not publish destination shares for this school's 2024 leavers — the cohort was too small to publish (fewer than six leavers)",
    });
    expect(place.destinations?.ks5).toEqual({
      state: "suppressed",
      cohortYear: "2023/24",
      line: "DfE does not publish destination shares for this school's 2024 leavers — the cohort was too small to publish (fewer than six leavers)",
    });
  });

  it("a school with no row in the release serves the prep's adopted no-row wording, verbatim", async () => {
    const source = new FakeSource();
    source.rows = [{ ...sixthFormSchool, ks4: null, ks5: null }];
    const { answer } = await secondaryPlaces(source);
    const place = answer.places[0];
    expect(place.destinations?.ks4).toEqual({
      state: "no-row",
      cohortYear: "2023/24",
      line: "DfE publishes no destinations row for this school for the 2023/24 leavers",
    });
    expect(place.destinations?.ks5).toEqual({
      state: "no-row",
      cohortYear: "2023/24",
      line: "DfE publishes no destinations row for this school for the 2023/24 leavers",
    });
  });

  it("an unfiled destinations table serves the not-filed state on every place — never an absence read from an empty table", async () => {
    const source = new FakeSource();
    source.release = { filedCount: 0, ks4: null, ks5: null };
    source.rows = [
      sixthFormSchool,
      { ...sixthFormSchool, name: "Other", urn: "1", sixthForm: false, miles: 0.6 },
    ];
    const { answer } = await secondaryPlaces(source);
    expect(answer.places[0].destinations).toEqual({
      ks4: { state: "not-filed", line: DESTINATIONS_NOT_FILED_LINE },
      ks5: { state: "not-filed", line: DESTINATIONS_NOT_FILED_LINE },
    });
    expect(answer.places[1].destinations).toEqual({
      ks4: { state: "not-filed", line: DESTINATIONS_NOT_FILED_LINE },
      ks5: null,
    });
    expect(DESTINATIONS_NOT_FILED_LINE).toBe(
      "The destinations data is not filed yet, so leavers' destinations cannot be shown for this check.",
    );
  });

  it("a 'low' share serves as the flagged value — value null, low true, never a zero", async () => {
    const source = new FakeSource();
    source.rows = [
      { ...sixthFormSchool, ks4: fact({ apprenticeships: { value: null, low: true } }), ks5: null },
    ];
    const { answer } = await secondaryPlaces(source);
    const ks4 = answer.places[0].destinations?.ks4;
    expect(ks4?.state).toBe("served");
    if (ks4?.state === "served") {
      expect(ks4.apprenticeships).toEqual({ value: null, low: true });
      expect(ks4.overall).toEqual({ value: 96.4, low: false });
    }
  });

  it("16-plus providers and primaries never serve destinations or a URN, whatever the source hands over", async () => {
    const source = new FakeSource();
    source.rows = [
      sixthFormSchool,
      {
        name: "North East Surrey College of Technology",
        category: "sixth-forms",
        urn: "130822",
        sixthForm: null,
        ks4: null,
        ks5: KS5_FACT,
        miles: 0.2,
      },
      {
        name: "Village Primary School",
        category: "schools-primary",
        urn: "100000",
        sixthForm: null,
        ks4: null,
        ks5: null,
        miles: 0.3,
      },
    ];
    const { bundle } = await secondaryPlaces(source);
    const sixthForms = bundle.categories.find((c) => c.category === "sixth-forms");
    const primary = bundle.categories.find((c) => c.category === "schools-primary");
    expect(sixthForms?.places[0].name).toBe("North East Surrey College of Technology");
    for (const place of [...(sixthForms?.places ?? []), ...(primary?.places ?? [])]) {
      expect(place).not.toHaveProperty("destinations");
      expect(place).not.toHaveProperty("urn");
    }
  });

  it("no remainder, national or Russell Group figure exists anywhere in the served block", async () => {
    const source = new FakeSource();
    source.rows = [sixthFormSchool];
    const { answer } = await secondaryPlaces(source);
    const json = JSON.stringify(answer.places[0].destinations).toLowerCase();
    for (const banned of ["notsust", "not_sustained", "unknown", "national", "russell", "england"])
      expect(json).not.toContain(banned);
  });

  it("no served destinations line carries banned wording", async () => {
    const source = new FakeSource();
    source.rows = [
      sixthFormSchool,
      {
        ...sixthFormSchool,
        name: "Suppressed School",
        urn: "2",
        ks4: fact({ state: "suppressed", cohortCount: 2 }),
        ks5: null,
        miles: 0.5,
      },
      { ...sixthFormSchool, name: "No Row School", urn: "3", ks4: null, ks5: null, miles: 0.6 },
    ];
    const { answer } = await secondaryPlaces(source);
    const lines: string[] = [];
    for (const place of answer.places) {
      for (const stage of [place.destinations?.ks4, place.destinations?.ks5]) {
        if (!stage) continue;
        if (stage.state === "served") lines.push(stage.cohortLine, stage.sustainedLine);
        else if (stage.state !== "not-filed") lines.push(stage.line);
      }
    }
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines)
      for (const term of BANNED_WORDING) expect(line.toLowerCase()).not.toContain(term);
  });
});
