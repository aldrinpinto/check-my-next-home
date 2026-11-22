import { describe, expect, it } from "vitest";
import type { BuildingSafetySection, ServedConstruction } from "../lib/area-bundle";
import { buildReportView, type ReportView } from "../lib/report";
import type { SoldPricesBundle } from "../lib/sold-prices";
import { areaWith, birkdale, input, soldServed } from "./fixtures/report-inputs";

// Plan step M8.10 — report Section 7 additions: the
// building-safety block (D17), the EPC construction block
// (D48), broadband & mobile at report depth (D36),
// brownfield and the built-up area in full (D41), the
// static mortgage & stamp duty figures (item (f), D44),
// the improvements introduction (item (h)), and the
// registered parks & gardens layer's report line. The
// pins here run on the fixture view (the Birkdale base
// case) and on served shapes in the exact forms the
// brains build — tests/area-bundle.test.ts proves the
// brains build these shapes; what is pinned here is that
// the report renders them in full, in Section 7 only,
// and that the prohibitions hold: no combined monthly
// total anywhere, no registered verdict, no "no tribunal
// decisions found", no full-fibre claim, savings never
// summed. The same view built from the real golden
// bundles is asserted in the golden replay
// (tests/golden-replay.test.ts).

function sectionText(view: ReportView, number: number): string {
  return JSON.stringify(view.sections[number - 1]);
}

function section7(view: ReportView) {
  return view.sections[6];
}

// --- building safety --------------------------------------

describe("report — Section 7 additions (M8.10): building safety", () => {
  const view = buildReportView(input());
  const s7 = sectionText(view, 7);

  it("stands after Listed buildings & heritage and before Nature & protected areas", () => {
    const heritageAt = s7.indexOf("Listed buildings & heritage");
    const safetyAt = s7.indexOf("Building safety");
    const natureAt = s7.indexOf("Nature & protected areas");
    expect(heritageAt).toBeGreaterThanOrEqual(0);
    expect(safetyAt).toBeGreaterThan(heritageAt);
    expect(natureAt).toBeGreaterThan(safetyAt);
  });

  it("a clear single house takes the register scope line — and no link stands under it", () => {
    expect(s7).toContain(
      "The Building Safety Regulator's register covers high-rise residential buildings — buildings of 7 or more storeys or 18 metres or more, with 2 or more residential units; a house is outside what the register is for.",
    );
    const blocks = section7(view).blocks;
    const subAt = blocks.findIndex((b) => b.type === "sub" && b.text === "Building safety");
    expect(subAt).toBeGreaterThanOrEqual(0);
    // The block's blocks: the scope line, the tribunal
    // line, the explainer note — no lineLink anywhere.
    const blockSlice = blocks.slice(subAt + 1, subAt + 4);
    expect(blockSlice.some((b) => b.type === "lineLink")).toBe(false);
  });

  it("the tribunal line stands in the bundle's locked as-at wording", () => {
    expect(s7).toContain(
      "No published building-safety orders naming this postcode, as at 14 November 2026.",
    );
  });

  it("no registered verdict and no banned absence wording anywhere in the view", () => {
    const whole = JSON.stringify(view).toLowerCase();
    expect(whole).not.toContain("no tribunal decisions found");
    expect(whole).not.toContain("is not on the register");
    expect(whole).not.toContain("is on the register");
    expect(whole).not.toContain("not registered");
  });

  it("the hand-off and the grouped decisions render in full where served", () => {
    const served: BuildingSafetySection = {
      depth: "report",
      grain: "postcode point",
      grainLine:
        "published tribunal decisions naming this postcode, and the national register for this building",
      explainer: "EXPLAINER-BS: what an empty tribunal answer does and does not mean",
      sourceName: "Source",
      sourceDate: "2026-11-14",
      sourceLine: null,
      register: {
        state: "handed-off",
        grain: "home",
        grainLine: "this building, in the Building Safety Regulator's register",
        line: "whether this building is on the Building Safety Regulator's register of high-rise residential buildings can only be checked on the register's own search service — we do not hold a copy of the register, so no register answer is given here; the link below takes you to the official search, where you enter the postcode",
        link: {
          label: "Search the register of high-rise residential buildings (GOV.UK)",
          url: "https://www.register-high-rise-building.service.gov.uk/public-register/search",
        },
        sourceName: null,
        sourceDate: null,
        sourceLine: null,
      },
      tribunal: {
        state: "served",
        grain: "postcode point",
        grainLine: "published decisions naming this postcode",
        line: "2 published building-safety orders naming this postcode, as at 14 November 2026",
        decisionCount: 2,
        groups: [
          {
            buildingKey: "oyster bay apartments sterte poole",
            buildingName: "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN",
            isHomeBuilding: true,
            decisions: [
              {
                caseRef: "HAV/00HQ/BSA/2025/0002",
                kind: "remediation-order",
                kindLine: "remediation order (section 123 of the Building Safety Act 2022)",
                propertyText: "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN",
                decisionDate: "2026-04-10",
                decisionDateLabel: "10 April 2026",
                sourceUrl:
                  "https://www.gov.uk/residential-property-tribunal-decisions/1-31-oyster-bay-apartments-sterte-poole-dorset-bh15-2fn-hav-slash-00hq-slash-bsa-slash-2025-slash-0002",
                isSingleFlat: false,
                line: "remediation order (section 123 of the Building Safety Act 2022) for 1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN — HAV/00HQ/BSA/2025/0002, 10 April 2026",
              },
            ],
          },
          {
            buildingKey: "thanet lodge mapesbury road london",
            buildingName: "Thanet Lodge, 10 Mapesbury Road, London NW2 4JA",
            isHomeBuilding: false,
            decisions: [
              {
                caseRef: "LON/00AE/BSA/2024/0007",
                kind: "remediation-order",
                kindLine: "remediation order (section 123 of the Building Safety Act 2022)",
                propertyText: "Thanet Lodge, 10 Mapesbury Road, London NW2 4JA",
                decisionDate: "2025-03-03",
                decisionDateLabel: "3 March 2025",
                sourceUrl:
                  "https://www.gov.uk/residential-property-tribunal-decisions/flats-5-15-and-29-thanet-lodge-10-mapesbury-road-nw2-4ja-lon-slash-00ae-slash-bsa-slash-2024-slash-0007-0500-and-0502",
                isSingleFlat: false,
                line: "remediation order (section 123 of the Building Safety Act 2022) for Thanet Lodge, 10 Mapesbury Road, London NW2 4JA — LON/00AE/BSA/2024/0007, 3 March 2025",
              },
            ],
          },
        ],
        sourceName: "Source",
        sourceDate: "2026-11-14",
        sourceLine: null,
      },
    };
    const servedView = buildReportView(input({ area: areaWith({ buildingSafety: served }) }));
    const text = sectionText(servedView, 7);
    // The hand-off line, sentence-cased, with the
    // official search link beneath it.
    expect(text).toContain(
      "Whether this building is on the Building Safety Regulator's register of high-rise residential buildings can only be checked on the register's own search service",
    );
    const blocks = section7(servedView).blocks;
    // The finder names the high-rise register's label in
    // full: since BUG-125 the planning hand-off's link
    // ("Search the register of planning decisions…")
    // stands earlier in the same section and also opens
    // with "Search the register".
    const link = blocks.find(
      (b) => b.type === "lineLink" && b.label.startsWith("Search the register of high-rise"),
    );
    if (!link || link.type !== "lineLink") throw new Error("expected the register search link");
    expect(link.label).toBe("Search the register of high-rise residential buildings (GOV.UK)");
    expect(link.href).toBe(
      "https://www.register-high-rise-building.service.gov.uk/public-register/search",
    );
    // The count line in its locked wording.
    expect(text).toContain(
      "2 published building-safety orders naming this postcode, as at 14 November 2026.",
    );
    // The groups in served order: the home's building
    // labelled as such, the other under its own name.
    const homeAt = text.indexOf(
      "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN — this home's building",
    );
    const otherAt = text.indexOf("Thanet Lodge, 10 Mapesbury Road, London NW2 4JA");
    expect(homeAt).toBeGreaterThanOrEqual(0);
    expect(otherAt).toBeGreaterThan(homeAt);
    expect(text).toContain(
      "Remediation order (section 123 of the Building Safety Act 2022) for 1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN — HAV/00HQ/BSA/2025/0002, 10 April 2026.",
    );
    expect(text).toContain("LON/00AE/BSA/2024/0007, 3 March 2025.");
    // The short small-print line closes the block
    // (BUG-128): the long explainer no longer prints in
    // the report — its full text stands on the
    // building-safety How-we-check page.
    expect(text).toContain(
      "The two records answer different questions, and each has limits — what they can and cannot show stands on the building-safety How-we-check page, linked at the end of this section.",
    );
    expect(text).not.toContain("EXPLAINER-BS");
  });
});

// --- EPC: improvements introduction + construction --------

describe("report — Section 7 additions (M8.10): EPC depth", () => {
  const view = buildReportView(input());
  const s7 = sectionText(view, 7);

  it("the improvements block opens with its served introduction, before the steps", () => {
    const introAt = s7.indexOf("IMPROVEMENTS-LINE.");
    const stepAt = s7.indexOf("Loft insulation");
    expect(introAt).toBeGreaterThanOrEqual(0);
    expect(stepAt).toBeGreaterThan(introAt);
  });

  it("the construction block prints the seven groups verbatim under the basis line", () => {
    const construction: ServedConstruction = {
      line: "the certificate's own description of this home's construction, recorded at the assessment; on an existing-home (RdSAP) certificate '(assumed)' means the assessor could not inspect that part and recorded the standard assumption for a home of its kind.",
      uValueLine:
        "the U-value in a description is the register's measure of how fast heat passes through that part of the home, in watts per square metre for each degree of temperature difference — lower lets less heat escape.",
      groups: [
        {
          key: "walls",
          label: "Walls",
          descriptions: ["Average thermal transmittance 0.27 W/m²K"],
          line: "Walls: Average thermal transmittance 0.27 W/m²K",
        },
        {
          key: "roofs",
          label: "Roofs",
          descriptions: ["Pitched, insulated (assumed)"],
          line: "Roofs: Pitched, insulated (assumed)",
        },
        {
          key: "floors",
          label: "Floors",
          descriptions: [],
          line: "Floors: not recorded on this certificate",
        },
        {
          key: "windows",
          label: "Windows",
          descriptions: ["High performance glazing"],
          line: "Windows: High performance glazing",
        },
        {
          key: "lighting",
          label: "Lighting",
          descriptions: ["Low energy lighting in all fixed outlets"],
          line: "Lighting: Low energy lighting in all fixed outlets",
        },
        {
          key: "mainHeating",
          label: "Main heating",
          descriptions: ["Boiler and radiators, mains gas"],
          line: "Main heating: Boiler and radiators, mains gas",
        },
        {
          key: "hotWater",
          label: "Hot water",
          descriptions: ["From main system"],
          line: "Hot water: From main system",
        },
      ],
    };
    const area = areaWith();
    if (area.kind !== "area-bundle") throw new Error("expected an area bundle");
    area.sections.epc.certificates[0].construction = construction;
    const built = buildReportView(input({ area }));
    const blocks = section7(built).blocks;
    const subAt = blocks.findIndex((b) => b.type === "sub" && b.text === "Construction");
    expect(subAt).toBeGreaterThanOrEqual(0);
    const basis = blocks[subAt + 1];
    if (!basis || basis.type !== "line") throw new Error("expected the basis line");
    expect(basis.text).toBe(
      "The certificate's own description of this home's construction, recorded at the assessment; on an existing-home (RdSAP) certificate '(assumed)' means the assessor could not inspect that part and recorded the standard assumption for a home of its kind.",
    );
    const list = blocks[subAt + 2];
    if (!list || list.type !== "list") throw new Error("expected the group list");
    // Exactly the seven composed lines — verbatim,
    // "(assumed)" untidied, the absent group in its
    // named not-recorded state, nothing else (no
    // per-element rating stands anywhere in the list).
    expect(list.items).toEqual([
      "Walls: Average thermal transmittance 0.27 W/m²K.",
      "Roofs: Pitched, insulated (assumed).",
      "Floors: not recorded on this certificate.",
      "Windows: High performance glazing.",
      "Lighting: Low energy lighting in all fixed outlets.",
      "Main heating: Boiler and radiators, mains gas.",
      "Hot water: From main system.",
    ]);
    const uValue = blocks[subAt + 3];
    if (!uValue || uValue.type !== "line") throw new Error("expected the U-value line");
    expect(uValue.text).toBe(
      "The U-value in a description is the register's measure of how fast heat passes through that part of the home, in watts per square metre for each degree of temperature difference — lower lets less heat escape.",
    );
    // The U-value figure lives only inside the walls
    // description, as text — it is never extracted into
    // a number of the report's own.
    expect(sectionText(built, 7)).not.toContain("U-value of 0.27");
  });

  it("a certificate with no construction block stands exactly as before", () => {
    // The base fixture's certificate carries
    // construction: null (a pre-widening artefact).
    expect(s7).not.toContain("Construction");
  });
});

// --- broadband & mobile at report depth -------------------

describe("report — Section 7 additions (M8.10): broadband & mobile depth", () => {
  function depthView(): ReportView {
    const area = areaWith();
    if (area.kind !== "area-bundle") throw new Error("expected an area bundle");
    const broadband = area.sections.broadband;
    broadband.superfastLine =
      "superfast broadband (at least 30 Mbit/s) is available to 97.9% of premises in this postcode";
    broadband.ultrafast100Line =
      "ultrafast broadband (at least 100 Mbit/s) is available to 91.5% of premises in this postcode";
    broadband.ultrafast300Line =
      "broadband at 300 Mbit/s or more is available to 88.9% of premises in this postcode";
    broadband.bands = [
      { key: "under_2", label: "under 2 Mbit/s", pct: 0.5 },
      { key: "2_to_5", label: "2 to 5 Mbit/s", pct: 1.2 },
      { key: "5_to_10", label: "5 to 10 Mbit/s", pct: 3.1 },
      { key: "10_to_30", label: "10 to 30 Mbit/s", pct: 8.4 },
      { key: "30_to_300", label: "30 to 300 Mbit/s", pct: 40.2 },
      { key: "300_plus", label: "300 Mbit/s or more", pct: 44.9 },
    ];
    broadband.unclassifiedPct = 1.7;
    broadband.unclassifiedLine =
      "1.7% of premises in this postcode could not be matched to a provider record with a predicted speed, so they appear in no speed band";
    const set = (placeWord: "outdoor" | "indoor", atLeastOne: number, all: number | null) => ({
      atLeastOneOperatorPct: atLeastOne,
      allOperatorsPct: all,
      allOperatorsPublished: all !== null,
      noOperatorPct: 100 - atLeastOne,
      line: `at least one mobile network is modelled to have ${placeWord} coverage at ${atLeastOne}% of premises in Braintree`,
      allOperatorsLine:
        all !== null
          ? `all four mobile networks are modelled to have ${placeWord} coverage at ${all}% of premises in Braintree`
          : `the share of premises in Braintree where all four mobile networks have ${placeWord} coverage is not published for this service`,
    });
    area.sections.mobile.services = [
      {
        service: "voice",
        label: "Voice",
        state: "served",
        line: "at least one mobile network is modelled to have outdoor coverage at 99% of premises in Braintree",
        outdoor: set("outdoor", 99, 88),
        indoor: null,
      },
      {
        service: "4g",
        label: "4G",
        state: "served",
        line: "at least one mobile network is modelled to have outdoor coverage at 98% of premises in Braintree",
        outdoor: set("outdoor", 98, 76),
        indoor: set("indoor", 92, 61),
      },
      {
        service: "5g_sa_high_confidence",
        label: "5G standalone (high confidence)",
        state: "not-published",
        line: "5G standalone (high confidence) coverage is not published by Ofcom in this release",
        outdoor: null,
        indoor: null,
      },
    ];
    return buildReportView(input({ area }));
  }

  it("broadband: the threshold bullets, the tie line, the six-band table and the unclassified share, in order", () => {
    const built = depthView();
    const text = sectionText(built, 7);
    const gigabitAt = text.indexOf("BROADBAND-LINE");
    const superfastAt = text.indexOf(
      "Superfast broadband (at least 30 Mbit/s) is available to 97.9% of premises in this postcode.",
    );
    const ultra100At = text.indexOf(
      "Ultrafast broadband (at least 100 Mbit/s) is available to 91.5% of premises in this postcode.",
    );
    // BUG-122: the "300 Mbit/s or more" category line is
    // dropped — it duplicated the band table's fastest
    // row. The sentence must not stand anywhere (the
    // table's own row label, "300 Mbit/s or more", is a
    // different string and stays).
    expect(text).not.toContain(
      "Broadband at 300 Mbit/s or more is available to 88.9% of premises in this postcode.",
    );
    // The tie line stands above the band table, after
    // the threshold bullets.
    const tieAt = text.indexOf(
      "The bands in the table below split the same premises in this postcode between them and add up to 100%: superfast is the two fastest bands added together. The gigabit figure above is counted by network technology, not taken from the table.",
    );
    const unclassifiedAt = text.indexOf(
      "1.7% of premises in this postcode could not be matched to a provider record with a predicted speed, so they appear in no speed band.",
    );
    expect(gigabitAt).toBeGreaterThanOrEqual(0);
    expect(superfastAt).toBeGreaterThan(gigabitAt);
    // BUG-138: the gigabit line heads the threshold
    // list as its first item — all three threshold
    // lines, one list — and no longer stands as a
    // plain line above it.
    const thresholdList = section7(built).blocks.find(
      (b) => b.type === "list" && b.items.some((item) => item.includes("Superfast broadband")),
    );
    if (!thresholdList || thresholdList.type !== "list")
      throw new Error("expected the threshold list");
    expect(thresholdList.items).toEqual([
      "BROADBAND-LINE: gigabit-capable broadband is available at this postcode.",
      "Superfast broadband (at least 30 Mbit/s) is available to 97.9% of premises in this postcode.",
      "Ultrafast broadband (at least 100 Mbit/s) is available to 91.5% of premises in this postcode.",
    ]);
    const plainLines = section7(built).blocks.flatMap((b) => (b.type === "line" ? [b.text] : []));
    expect(plainLines.some((t) => t.includes("BROADBAND-LINE"))).toBe(false);
    expect(ultra100At).toBeGreaterThan(superfastAt);
    expect(tieAt).toBeGreaterThan(ultra100At);
    expect(unclassifiedAt).toBeGreaterThan(tieAt);
    // The bands table stands between the category lines
    // and the unclassified line, with the bandsLine note
    // still in the block.
    const table = section7(built).blocks.find(
      (b) => b.type === "table" && b.head[0] === "Maximum predicted download speed",
    );
    if (!table || table.type !== "table") throw new Error("expected the broadband bands table");
    expect(table.head).toEqual(["Maximum predicted download speed", "Share of premises"]);
    expect(table.rows).toEqual([
      ["under 2 Mbit/s", "0.5%"],
      ["2 to 5 Mbit/s", "1.2%"],
      ["5 to 10 Mbit/s", "3.1%"],
      ["10 to 30 Mbit/s", "8.4%"],
      ["30 to 300 Mbit/s", "40.2%"],
      ["300 Mbit/s or more", "44.9%"],
    ]);
    expect(text).toContain("BANDS-LINE-BB");
    // No full-fibre claim anywhere in the section: the
    // data does not separate full fibre, so the report
    // never claims it for this home.
    expect(text).not.toContain("Full fibre");
    expect(text.toLowerCase()).not.toContain("full fibre is available");
  });

  it("mobile: each service as a short bullet, then the one basis line after them (BUG-095, repositioned by BUG-124)", () => {
    const built = depthView();
    const text = sectionText(built, 7);
    // The second-pass form: each service is a bullet
    // carrying its lead figure alone, the indoor figure
    // in the same form where published — and the shared
    // basis note stands AFTER the bullets (BUG-124:
    // small print follows its data), modelled, at least
    // one network, the named council area. The
    // all-operators shares no longer print.
    expect(text).toContain(
      "Modelled by Ofcom for the whole Braintree council area: each figure is the share of premises where at least one mobile network is modelled to have coverage. It is not a measurement at this home.",
    );
    const expected = [
      "Voice calls: 99%.",
      "4G data: 98%.",
      "4G data indoors: 92%.",
      "5G standalone data (high confidence): not published by Ofcom in this release.",
    ];
    let at = -1;
    for (const line of expected) {
      const found = text.indexOf(line);
      expect(found, line).toBeGreaterThan(at);
      at = found;
    }
    // The basis note stands after the last bullet
    // (BUG-124).
    expect(text.indexOf("Modelled by Ofcom for the whole Braintree council area")).toBeGreaterThan(
      at,
    );
    expect(text).not.toContain("All four mobile networks");
  });

  it("broadband & mobile close with the provider caveat, once (M8.11)", () => {
    const built = depthView();
    const text = sectionText(built, 7);
    const caveat = "Broadband and mobile: the exact package at this home varies by provider.";
    expect(text.split(caveat).length - 1).toBe(1);
    // The caveat closes the two blocks — it stands after
    // the mobile bullets, before Planning constraints.
    expect(text.indexOf(caveat)).toBeGreaterThan(text.indexOf("Voice calls: 99%."));
    expect(text.indexOf(caveat)).toBeLessThan(text.indexOf("Planning constraints"));
  });

  it("an unpublished all-operators share serves in words, never as 0", () => {
    const area = areaWith();
    if (area.kind !== "area-bundle") throw new Error("expected an area bundle");
    area.sections.mobile.services = [
      {
        service: "5g_high_confidence",
        label: "5G (high confidence)",
        state: "served",
        line: "at least one mobile network is modelled to have outdoor coverage at 84% of premises in Braintree",
        outdoor: {
          atLeastOneOperatorPct: 84,
          allOperatorsPct: null,
          allOperatorsPublished: false,
          noOperatorPct: 16,
          line: "at least one mobile network is modelled to have outdoor coverage at 84% of premises in Braintree",
          allOperatorsLine:
            "the share of premises in Braintree where all four mobile networks have outdoor coverage is not published for this service",
        },
        indoor: null,
      },
    ];
    const built = buildReportView(input({ area }));
    const text = sectionText(built, 7);
    // The lead figure stands as its bullet; an
    // unpublished all-operators share prints nothing —
    // never a 0, and no share line of any kind.
    expect(text).toContain("5G data (high confidence): 84%.");
    expect(text).not.toContain("at 0% of premises");
    expect(text).not.toContain("all four mobile networks have outdoor coverage");
  });
});

// --- brownfield & the built-up area in full ---------------

describe("report — Section 7 additions (M8.10): brownfield & built-up area in full", () => {
  it("the base view: brownfield stands as its own block with its served line and no rows", () => {
    const view = buildReportView(input());
    const blocks = section7(view).blocks;
    const subAt = blocks.findIndex((b) => b.type === "sub" && b.text === "Brownfield land");
    expect(subAt).toBeGreaterThanOrEqual(0);
    const line = blocks[subAt + 1];
    if (!line || line.type !== "line") throw new Error("expected the brownfield line");
    expect(line.text).toBe("No brownfield site filed within 2 miles.");
    expect(blocks[subAt + 2]?.type).not.toBe("rows");
    // The summary bullet has left the constraints list.
    const constraintsAt = blocks.findIndex(
      (b) => b.type === "sub" && b.text === "Planning constraints & land",
    );
    const list = blocks[constraintsAt + 1];
    if (!list || list.type !== "list") throw new Error("expected the constraints list");
    expect(list.items.join(" ")).not.toContain("brownfield");
  });

  it("served sites render as rows with the register's own facts, and the built-up beyond line joins the list", () => {
    const area = areaWith();
    if (area.kind !== "area-bundle") throw new Error("expected an area bundle");
    area.sections.constraints.builtUpArea.beyondLine =
      "none within 2 miles — the nearest is an unnamed built-up area, 3.1 miles away (straight-line distance from the postcode point)";
    area.sections.constraints.brownfield = {
      label: "Brownfield land",
      state: "served",
      within: [
        {
          reference: "BRA-1",
          label: "Universal Garage, The Street, Hatfield Peverel",
          miles: 0.252,
          hectares: 1.24,
          hectaresLine: "the register records the site at 1.24 hectares",
          planningPermissionStatus: "permissioned",
          statusLine: "the register records its planning permission status as permissioned",
          dwellingsLine: "the register publishes 9 net dwellings for the site",
          line: "Universal Garage, The Street, Hatfield Peverel — 0.252 miles away (straight-line distance from the postcode point)",
        },
        {
          reference: null,
          label: "Former depot, Sample Street",
          miles: 1.05,
          hectares: null,
          hectaresLine: null,
          planningPermissionStatus: null,
          statusLine: null,
          dwellingsLine: "the register publishes 10 to 25 net dwellings for the site",
          line: "Former depot, Sample Street — 1.05 miles away (straight-line distance from the postcode point)",
        },
      ],
      countWithin: 2,
      beyondNearest: null,
      beyondLine: null,
      line: "2 recorded brownfield sites within 2 miles of the postcode point",
      councilPublishes: true,
      sourceName: "Source",
      sourceDate: "2026-01-01",
      sourceLine: null,
    };
    const built = buildReportView(input({ area }));
    const blocks = section7(built).blocks;
    const constraintsAt = blocks.findIndex(
      (b) => b.type === "sub" && b.text === "Planning constraints & land",
    );
    const list = blocks[constraintsAt + 1];
    if (!list || list.type !== "list") throw new Error("expected the constraints list");
    expect(list.items[list.items.length - 1]).toBe(
      "None within 2 miles — the nearest is an unnamed built-up area, 3.1 miles away (straight-line distance from the postcode point).",
    );
    const text = sectionText(built, 7);
    expect(text).toContain("2 recorded brownfield sites within 2 miles of the postcode point.");
    const brownfieldAt = blocks.findIndex((b) => b.type === "sub" && b.text === "Brownfield land");
    const rows = blocks[brownfieldAt + 2];
    if (!rows || rows.type !== "rows") throw new Error("expected the brownfield rows");
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0].name).toBe("Universal Garage, The Street, Hatfield Peverel");
    expect(rows.rows[0].detail).toBe("The register records the site at 1.24 hectares");
    expect(rows.rows[0].dist).toBe("0.3 mi");
    expect(rows.rows[0].extra).toEqual([
      "The register records its planning permission status as permissioned.",
      "The register publishes 9 net dwellings for the site.",
    ]);
    expect(rows.rows[1].name).toBe("Former depot, Sample Street");
    expect(rows.rows[1].detail).toBeNull();
    expect(rows.rows[1].dist).toBe("1.1 mi");
    expect(rows.rows[1].extra).toEqual([
      "The register publishes 10 to 25 net dwellings for the site.",
    ]);
  });

  it("the gated absence serves as served — the council that does not supply the register", () => {
    const area = areaWith();
    if (area.kind !== "area-bundle") throw new Error("expected an area bundle");
    area.sections.constraints.brownfield = {
      ...area.sections.constraints.brownfield,
      state: "not-published",
      line: "this council does not supply the national brownfield register, so no finding can be made from the data — the council's own brownfield register is the record",
    };
    const built = buildReportView(input({ area }));
    const text = sectionText(built, 7);
    expect(text).toContain(
      "This council does not supply the national brownfield register, so no finding can be made from the data — the council's own brownfield register is the record.",
    );
    expect(text).not.toContain("no brownfield sites are recorded");
  });
});

// --- mortgage & stamp duty --------------------------------

describe("report — Section 7 additions (M8.10): mortgage & stamp duty", () => {
  const view = buildReportView(input());
  const s7 = sectionText(view, 7);

  it("stands after Council tax and before Energy certificates, on the last recorded sale", () => {
    const taxAt = s7.indexOf("Council tax");
    const blockAt = s7.indexOf("Mortgage & stamp duty");
    const epcAt = s7.indexOf("Energy certificates");
    expect(taxAt).toBeGreaterThanOrEqual(0);
    expect(blockAt).toBeGreaterThan(taxAt);
    expect(epcAt).toBeGreaterThan(blockAt);
  });

  it("the figures are the calculators' own, on the labelled D44 assumptions", () => {
    expect(s7).toContain(
      "Worked on this home's last recorded sale price — £588,995 on 15 June 2023 — on the standard assumptions: a 25% deposit, a 25-year term and a 4.5% interest rate.",
    );
    expect(s7).toContain(
      "On a loan of £441,746 (£588,995 price less £147,249 deposit) at 4.5% over 25 years: £2,455 a month, repayment.",
    );
    expect(s7).toContain(
      "Stamp duty on that price would be £19,450 at the standard rates for a buyer moving from their own home.",
    );
    // BUG-137 re-pin: the rates link stood as a
    // body-size lineLink until 22 Nov 2026; the
    // founder ruled it small print, so it is now the
    // block's noteLink — label and destination
    // unchanged.
    const link = section7(view).blocks.find((b) => b.type === "noteLink");
    if (!link || link.type !== "noteLink") throw new Error("expected the GOV.UK rates link");
    expect(link.label).toBe("England & Northern Ireland rates from 1 April 2025 — GOV.UK");
    expect(link.href).toBe("https://www.gov.uk/stamp-duty-land-tax");
    expect(s7).toContain(
      "Illustration only — rates change, and this is not advice and not a verdict on what you can afford.",
    );
  });

  it("the two worked findings print as one bulleted list under the prose basis line (BUG-137)", () => {
    const blocks = section7(view).blocks;
    const subAt = blocks.findIndex((b) => b.type === "sub" && b.text === "Mortgage & stamp duty");
    expect(subAt).toBeGreaterThanOrEqual(0);
    // The basis line stays a prose line, directly
    // under the heading.
    const basis = blocks[subAt + 1];
    if (!basis || basis.type !== "line") throw new Error("expected the basis prose line");
    expect(basis.text).toContain("Worked on this home's last recorded sale price");
    // The findings stand as one list of two, in
    // standing order.
    const list = blocks[subAt + 2];
    if (!list || list.type !== "list") throw new Error("expected the findings list");
    expect(list.items).toEqual([
      "On a loan of £441,746 (£588,995 price less £147,249 deposit) at 4.5% over 25 years: £2,455 a month, repayment.",
      "Stamp duty on that price would be £19,450 at the standard rates for a buyer moving from their own home.",
    ]);
    // The small-print rates link follows the list.
    const link = blocks[subAt + 3];
    if (!link || link.type !== "noteLink") throw new Error("expected the rates noteLink");
    // Neither finding stands as a plain line anywhere
    // in the section.
    const lineTexts = blocks.flatMap((b) => (b.type === "line" ? [b.text] : []));
    expect(lineTexts.some((t) => t.includes("a month, repayment"))).toBe(false);
    expect(lineTexts.some((t) => t.includes("Stamp duty on that price"))).toBe(false);
  });

  it("the section's monthly figures are never summed into a combined total", () => {
    // Council tax £178.75 + mortgage £2,455 = £2,633.75;
    // with the modelled energy £40.75, £2,674.50. No
    // combined figure or total-cost wording stands
    // anywhere in the view.
    const whole = JSON.stringify(view);
    expect(whole).not.toContain("2,633");
    expect(whole).not.toContain("2,674");
    expect(whole.toLowerCase()).not.toContain("total monthly");
    expect(whole.toLowerCase()).not.toContain("cost of ownership");
  });

  it("a home with no recorded sale carries no figure and no block", () => {
    const noSale = buildReportView(
      input({
        sold: {
          ...soldServed,
          ownHistory: [],
          ownLine: "OWN-LINE: no recorded sale found for this address",
          ownExplainer: "OWN-EXPLAINER",
        },
      }),
    );
    expect(sectionText(noSale, 7)).not.toContain("Mortgage & stamp duty");
    expect(sectionText(noSale, 7)).not.toContain("a month, repayment");
  });

  it("a postcode (rung 2) report carries no block — it has no single home's sale", () => {
    const rung2 = buildReportView(
      input({
        resolution: {
          rung: 2,
          kind: "address-list",
          directory: {
            postcode: "CM3 2JT",
            latitude: 51.778,
            longitude: 0.606,
            council: "Braintree",
            ward: "Hatfield Peverel",
            region: "East of England",
            lsoaCode: "E01021395",
            msoaCode: "E02004463",
          },
          street: null,
          building: null,
          addresses: [],
        },
        sold: { ...soldServed, rung: 2 } as unknown as SoldPricesBundle,
      }),
    );
    expect(sectionText(rung2, 7)).not.toContain("Mortgage & stamp duty");
  });

  it("a Welsh home gets the mortgage figure and the Land Transaction Tax line — never an SDLT figure", () => {
    const welsh = buildReportView(
      input({
        resolution: {
          ...birkdale,
          directory: { ...birkdale.directory, lsoaCode: "W01001329" },
        },
      }),
    );
    const text = sectionText(welsh, 7);
    expect(text).toContain("£2,455 a month, repayment.");
    expect(text).toContain(
      "Wales charges Land Transaction Tax instead — this calculator covers England & Northern Ireland.",
    );
    expect(text).toContain("https://www.gov.wales/land-transaction-tax-guide");
    expect(text).not.toContain("Stamp duty on that price");
  });
});

// --- registered parks & gardens ---------------------------

describe("report — Section 7 additions (M8.10): registered parks & gardens", () => {
  it("the layer's line stands in the heritage list, in layer order after the buffer zones", () => {
    const view = buildReportView(input());
    const text = sectionText(view, 7);
    const bufferAt = text.indexOf("No buffer zone at this point.");
    const parksAt = text.indexOf("No registered park and garden at this point.");
    expect(bufferAt).toBeGreaterThanOrEqual(0);
    expect(parksAt).toBeGreaterThan(bufferAt);
  });

  it("inside a registered park or garden, the line names the site; the nearest is named only within the 2-mile frame (BUG-127)", () => {
    const area = areaWith();
    if (area.kind !== "area-bundle") throw new Error("expected an area bundle");
    area.sections.heritage.parksAndGardens = {
      ...area.sections.heritage.parksAndGardens,
      state: "inside",
      line: "the postcode point falls inside the Nonsuch Park registered park and garden",
      insideName: "Nonsuch Park",
    };
    const inside = buildReportView(input({ area }));
    expect(sectionText(inside, 7)).toContain(
      "The postcode point falls inside the Nonsuch Park registered park and garden.",
    );

    // A nearest within the frame is named in the same
    // bullet as the absence, at one decimal.
    const area2 = areaWith();
    if (area2.kind !== "area-bundle") throw new Error("expected an area bundle");
    area2.sections.heritage.parksAndGardens = {
      ...area2.sections.heritage.parksAndGardens,
      state: "none-found",
      line: "no registered park and garden covers this postcode point in the national data",
      nearest: { name: "Nonsuch Park", miles: 1.234 },
      beyondLine: null,
    };
    const within = buildReportView(input({ area: area2 }));
    expect(sectionText(within, 7)).toContain(
      "No registered park and garden covers this postcode point in the national data. The nearest is Nonsuch Park, 1.2 miles away.",
    );

    // A nearest beyond the frame is NOT named (BUG-127
    // reverses the BUG-097 tail for the designation
    // layers): the absence bullet stands alone, and the
    // brain's beyond line — raw three-decimal miles and
    // all — never reaches the page.
    const area3 = areaWith();
    if (area3.kind !== "area-bundle") throw new Error("expected an area bundle");
    area3.sections.heritage.parksAndGardens = {
      ...area3.sections.heritage.parksAndGardens,
      state: "none-found",
      line: "no registered park and garden covers this postcode point in the national data",
      nearest: null,
      beyondNearest: { name: "Nonsuch Park", miles: 2.412 },
      beyondLine:
        "none within 2 miles — the nearest is Nonsuch Park, 2.412 miles away (straight-line distance from the postcode point)",
    };
    const beyond = buildReportView(input({ area: area3 }));
    const beyondText = sectionText(beyond, 7);
    expect(beyondText).toContain(
      "No registered park and garden covers this postcode point in the national data.",
    );
    expect(beyondText).not.toContain("Nonsuch Park");
    expect(beyondText).not.toContain("2.412");
  });
});
