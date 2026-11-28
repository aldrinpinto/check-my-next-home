import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AREA_UNAVAILABLE_REASON } from "../lib/area-bundle";
import { FLOOD_UNAVAILABLE_REASON } from "../lib/flood";
import {
  DEFENCE_NO_CONDITION_LINE,
  DEFENCE_NO_CURRENT_SOP_LINE,
  DEFENCE_NO_DESIGN_SOP_LINE,
  DEFENCE_NO_MAINTAINER_LINE,
} from "../lib/flood";
import { DESTINATIONS_NOT_FILED_LINE, emptyAnswerForm } from "../lib/nearby";
import { ALL_CATEGORIES } from "./fixtures/report-inputs";

// BUG-395 (27 Nov 2026): not-found / not-filed / not-covered
// lines start with a capital letter — everywhere (BUG-088).
// The brains' lines are served raw on the shortlist and the
// short bundle, which never run the free page's / report's
// sentenceLine capitalisation — so the capital lives at the
// source, and the renderers' capitalisation stays idempotent.
//
// Two guards, so the sweep cannot silently rot:
//   A. RUNTIME: every nearby empty-answer form and every
//      exported absence constant starts with a capital.
//   B. STATIC PIN: none of the old lowercase forms survives
//      anywhere in lib/ — a reintroduced lowercase absence
//      line fails this test outright.
// Deliberately NOT covered here: mid-sentence continuations
// (checking-screen segments after a prefix, Section 9
// question texts after their title, "not filed yet"
// fragments under a label), basis/explainer lines that are
// not absence lines, grain lines and link labels.

const CAPITAL_START = /^[A-Z]/;

describe("BUG-395: absence lines start with a capital letter", () => {
  it("every nearby empty-answer form starts with a capital", () => {
    for (const key of ALL_CATEGORIES) {
      for (const countWithin of [0, 1]) {
        const { line } = emptyAnswerForm(key, countWithin);
        expect(line, `${key} (countWithin ${countWithin})`).toMatch(CAPITAL_START);
      }
    }
  });

  it("every exported absence constant starts with a capital", () => {
    for (const line of [
      AREA_UNAVAILABLE_REASON,
      FLOOD_UNAVAILABLE_REASON,
      DEFENCE_NO_CONDITION_LINE,
      DEFENCE_NO_MAINTAINER_LINE,
      DEFENCE_NO_DESIGN_SOP_LINE,
      DEFENCE_NO_CURRENT_SOP_LINE,
      DESTINATIONS_NOT_FILED_LINE,
    ]) {
      expect(line).toMatch(CAPITAL_START);
    }
  });

  it("no old lowercase absence form survives in lib/", () => {
    const lib = path.join(__dirname, "..", "lib");
    const sources = [
      "area-bundle.ts",
      "crime.ts",
      "flood.ts",
      "nearby.ts",
      "sold-prices.ts",
      "results.ts",
      "journey.ts",
    ]
      .map((file) => readFileSync(path.join(lib, file), "utf-8"))
      .join("\n");
    const oldForms = [
      "area answers need an exact postcode",
      "the brownfield land data is not filed yet",
      "this council does not supply the national brownfield register",
      "no conservation area is filed near this point",
      "no conservation area found in the national data",
      "the green belt data filed covers England and Wales",
      "the built-up area data filed covers England and Wales",
      "no built-up area covers this postcode point",
      "the scheduled monuments filed cover England",
      "the world heritage sites filed cover England",
      "the registered battlefields filed cover England",
      "the protected wreck sites filed cover England",
      "the world heritage site buffer zones filed cover England",
      "the registered parks and gardens filed cover England",
      "none within ${RADIUS_MILES} miles — the nearest is ",
      "none within ${RADIUS_MILES} miles — the nearest mapped edge is ",
      "none within ${BROWNFIELD_RADIUS_MILES} miles — the nearest recorded site is ",
      "none within ${CHECKING_NEARBY_RADIUS_MILES} miles — nearest is ",
      "none within ${radius} miles — nearest is ",
      "the listed buildings data is not filed yet",
      "buildings on councils' local lists are not included",
      "the ancient woodland inventory filed covers England",
      "no ancient woodland recorded in the inventory",
      "priority habitat records are not filed yet",
      "no priority habitat is recorded near this postcode point",
      "nature designations are not filed yet",
      "the certificate publishes no suggested improvements",
      "energy certificates could not be loaded for this postcode",
      "no energy certificate is recorded for this postcode",
      "certificates are recorded for this postcode; none is for this exact home",
      "this council's council tax charges are not filed yet",
      "planning applications for this area are published by Mid Ulster",
      "planning applications for this area are published on the Northern Ireland Public Register",
      "planning applications are published by the local council",
      "the company-ownership datasets cover England and Wales only",
      "the company-ownership datasets cover England and Wales only — title information for ",
      "the company-ownership data is not filed yet",
      "this home's title is not in HM Land Registry's company-ownership data",
      "this home's title is not in HM Land Registry's company-ownership data as at ",
      "no brownfield sites are recorded within ",
      "the building-safety tribunal decisions filed here are for England",
      "the building-safety decisions data is not filed yet",
      "the Building Safety Regulator's register covers England, and this postcode's filed area code",
      "the Building Safety Regulator's register covers high-rise residential buildings",
      "whether this building is on the Building Safety Regulator's register",
      "no deprivation index figure is filed for this area",
      "no modelled air quality square is filed for this point",
      "modelled noise bands are not filed yet",
      "the modelled noise mapping filed covers England only",
      "no noise bands are filed for this postcode",
      "no ${label} band is filed for this postcode",
      "benefit counts are not filed for this area",
      "solar modelling is not filed yet",
      "solar modelling is not filed for this area yet",
      "broadband coverage is not filed for this postcode yet",
      "mobile coverage is not filed for this postcode's council area yet",
      "crime counts need an exact postcode",
      "crime counts could not be loaded for this postcode",
      "crime counts are not covered for Scotland",
      "crime counts are not covered for Northern Ireland",
      "flood answers need an exact postcode",
      "no EA-recorded flood defence is mapped within 2 miles",
      "recorded flood defences are not filed yet",
      "no condition is recorded for this defence",
      "no maintainer is recorded for this defence",
      "no design standard is recorded for this defence",
      "no current standard is recorded for this defence",
      "flood answers are not covered for Wales",
      "flood answers are not covered for Scotland",
      "flood answers are not covered for Northern Ireland",
      "the Environment Agency's flood maps cover England only, and this postcode's filed area code",
      "the postcode point is not in Flood Zone 2 or Flood Zone 3",
      "this flood map is not filed yet",
      "the climate scenario map of ",
      "no likelihood band is published for this point under this scenario on the Environment Agency's climate scenario map of ",
      "no ${spec.label} recorded within ${radius} miles on the map data we hold",
      "no nursery within ${radius} miles of the postcode point",
      "no named greenspace site within ${radius} miles",
      "no greenspace site within ${radius} miles",
      "no ${spec.label} within ${radius} miles of the postcode point",
      "sold prices need an exact postcode",
      "sold prices are not covered for Scotland",
      "sold prices are not covered for Northern Ireland",
      "no published building-safety orders naming this postcode",
      "no listed buildings within ${RADIUS_MILES} miles of the postcode point",
      "no designated site within ${RADIUS_MILES} miles — the nearest is ",
      "no designated site at or within ${RADIUS_MILES} miles of the postcode point",
      "the listed buildings filed are England's National Heritage List — listed buildings in ",
      "no Article 4 direction area covers this postcode point in the national data",
      "no green belt covers this postcode point in the national data",
      "no scheduled monument covers this postcode point in the national data",
      "no world heritage site covers this postcode point in the national data",
      "no registered battlefield covers this postcode point in the national data",
      "no protected wreck site covers this postcode point in the national data",
      "no world heritage site buffer zone covers this postcode point in the national data",
      "no registered park and garden covers this postcode point in the national data",
      "the share of premises in ${council} where at least one mobile network has ${placeWord} coverage is not published for this service",
      "the share of premises in ${council} where all four mobile networks have ${placeWord} coverage is not published for this service",
      "no surface-water band reaches this point — below the lowest band this product publishes",
      "no ${category.label} recorded within 2 miles on the map data we hold — a gap in the map is not proof that none exists",
      "no ${category.label} within 2 miles of the postcode point",
      "the brownfield register filed covers England — brownfield registers in ",
      "the English Indices of Deprivation do not cover ",
      "the ${spec.label} data filed covers England and Wales only, so no ${spec.label} answer can be given for this home in ",
      "the ${spec.label} data is not filed yet, so no ${spec.label} answer can be given yet",
      "the ${spec.label.toLowerCase()} data is not filed yet, so no ${spec.label.toLowerCase()} answer can be given yet",
      "planning applications need an exact postcode",
      "planning constraints need an exact postcode",
      "heritage answers need an exact postcode",
      "nature answers need an exact postcode",
      "energy certificates need an exact postcode",
      "council tax needs an exact postcode",
      "building safety answers need an exact postcode",
      "area statistics need an exact postcode",
      "air quality needs an exact postcode",
      "noise bands need an exact postcode",
      "benefit counts need an exact postcode",
      "solar modelling needs an exact postcode",
      "broadband answers need an exact postcode",
      "mobile answers need an exact postcode",
      "charging zones need an exact postcode",
    ];
    for (const form of oldForms) {
      expect(sources, `old lowercase form still in lib/: ${form}`).not.toContain(form);
    }
  });
});
