// Energy certificates loader (plan step M4.5). Option A, decided
// 12 Nov 2026: per-postcode lookups against the Get energy
// performance of buildings data API — no bulk full-load ingest.
// The monthly refresh of filed postcodes re-runs this search
// for each filed postcode (the runner, step M4.8). The API's
// deltas feed is probed by the canary in warning-only mode
// until its behaviour is characterised; it files nothing.
//
//   npm run load:epc -- "CM3 2JT" "E16 1GN"
//   npm run load:epc -- --verify-only "E16 1GN"
//   npm run load:epc -- --file tests/fixtures/epc "CM3 2JT" "E16 1GN"
//
// How it works:
//   1. Search the postcode (paged stubs), then fetch every
//      certificate in full — the stub has no floor area.
//   2. Minimise each certificate to the fields the product shows
//      (data protection: address-level EPC data is personal data,
//      so we hold only what the site uses). ALL certificates are
//      filed, disagreements included — the plan's check is that
//      6 Exeter Road keeps both of its certificates, 71 and 91
//      square metres, both band B. The minimisation was widened
//      at M6.14 (decision D33) by the register's six modelled
//      energy-cost fields — the principle is unchanged (hold
//      what the site uses); the site now uses these, served per
//      certificate with the assessment date, disagreements
//      whole. Widened again at M6.21 (decision D41) by the
//      certificate's suggested improvements: the register's
//      modelled steps, filed as published (see
//      improvementsOf below). Widened again at M6.26
//      (decision D48) by the certificate's recorded
//      construction descriptions — the seven element
//      groups' description text only (see constructionOf
//      below): the groups' per-element 0–5 efficiency
//      ratings are dropped at filing and never held, by
//      the recorded judgment that the site serves the
//      descriptions and nothing else from those groups.
//   3. File into the postcode's saved answers (postcode_cache
//      .answers, key "epc") inside one transaction, merging that
//      key only, then read back and re-check before commit.
//
// Licensing: certificate facts are Crown copyright under the Open
// Government Licence v3.0; the address fields are Ordnance Survey
// and Royal Mail copyright, used under the service's permitted
// energy-performance purposes (see the fixture README).
//
// Live mode reads the API token from EPC_API_TOKEN (Key K9). The
// token is used as a bearer header and is never logged.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const API_BASE = "https://api.get-energy-performance-data.communities.gov.uk";
const SOURCE_NAME = "Get energy performance of buildings data (MHCLG)";

// Golden expectations. 6 Exeter Road's two certificates disagree
// on floor area (71 vs 91 sq m, both band B) and both must be
// filed; 19 Birkdale Rise's certificate is band B, 141 sq m,
// registered 2022-10-07. Historical facts — they hold in fixture
// mode and live mode alike. The cost totals (M6.14, D33) are the
// register's modelled annual energy costs summed over heating,
// hot water and lighting, current and potential, per certificate
// at the address: Exeter's pair model £351 and £1,104 a year —
// the disagreement the brain serves whole — and Flat 4, Minerva
// House's certificate models £278 on both sides.
const GOLDEN = {
  "E16 1GN": {
    address: "6 Exeter Road",
    floorAreas: [71, 91],
    band: "B",
    costCurrent: [351, 1104],
    costPotential: [351, 1104],
  },
  "CM3 2JT": {
    address: "19 Birkdale Rise",
    floorAreas: [141],
    band: "B",
    costCurrent: [489],
    costPotential: [455],
  },
  "KT17 1FH": {
    address: "Flat 4 Minerva House",
    floorAreas: [70],
    band: "B",
    costCurrent: [278],
    costPotential: [278],
  },
};

// The register publishes each cost as { value, currency } —
// annual pounds on its own modelled basis (standard occupancy
// and heating pattern, fuel prices at the assessment date).
// File the value only when the currency is GBP; anything else
// is not a figure the product can serve, and files as null.
function costOf(doc, key) {
  const cost = doc[key];
  if (cost === null || typeof cost !== "object") return null;
  if (cost.currency !== "GBP") return null;
  return typeof cost.value === "number" && Number.isFinite(cost.value) ? cost.value : null;
}

// The certificate's suggested improvements (M6.21, decision
// D41): the register's modelled steps, in register sequence.
// Filed per measure: its sequence, its type code, its
// improvement number, its category, its typical saving (the
// same GBP guard as the costs — a non-GBP saving files null,
// never converted), its indicative cost string exactly as
// published, and both cumulative ratings after the step
// (each assumes every preceding step done). The improvement
// NUMBER files as published; its name resolves at serve time
// from the register schema's published list (lib/epc-
// improvements.ts) — the API returns no text for a measure.
// The category files but never serves: the group labels the
// category codes carry differ across schema vintages.
// A certificate with no published steps files null — the
// named no-measures state the brain serves.
function improvementsOf(doc) {
  const steps = doc.suggested_improvements;
  if (!Array.isArray(steps)) return null;
  const filed = steps
    .filter((step) => step !== null && typeof step === "object")
    .map((step) => ({
      sequence: typeof step.sequence === "number" ? step.sequence : null,
      improvementType: typeof step.improvement_type === "string" ? step.improvement_type : null,
      improvementNumber:
        typeof step.improvement_details?.improvement_number === "number"
          ? step.improvement_details.improvement_number
          : null,
      improvementCategory:
        typeof step.improvement_category === "number" ? step.improvement_category : null,
      typicalSaving:
        step.typical_saving !== null &&
        typeof step.typical_saving === "object" &&
        step.typical_saving.currency === "GBP" &&
        typeof step.typical_saving.value === "number" &&
        Number.isFinite(step.typical_saving.value)
          ? step.typical_saving.value
          : null,
      indicativeCost: typeof step.indicative_cost === "string" ? step.indicative_cost : null,
      energyRatingAfter:
        typeof step.energy_performance_rating === "number" ? step.energy_performance_rating : null,
      environmentalRatingAfter:
        typeof step.environmental_impact_rating === "number"
          ? step.environmental_impact_rating
          : null,
    }))
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  return filed.length > 0 ? filed : null;
}

// The certificate's recorded construction descriptions
// (M6.26, decision D48): the register's own words for how
// the home is built, in the seven element groups — walls,
// roofs and floors and main heating as lists of entries,
// windows, lighting and hot water as single entries. Each
// entry carries a description (a plain string on some
// vintages, a { value, language } object on others —
// unwrapped exactly as dwelling_type is below) and the
// group's per-element 0–5 efficiency ratings. ONLY the
// description files: the ratings are dropped here and
// never held (0 means not applicable on the register's
// own scale, and the numbers are verdict-shaped — the
// site serves the words, D48). A group the register does
// not publish for the certificate files null — the named
// absence the brain serves, never a value borrowed from
// another certificate. A U-value exists only as text
// inside a new-build SAP description ("Average thermal
// transmittance 0.27 W/m²K"); it files as part of that
// text, never extracted into a number.
function descriptionOf(entry) {
  if (entry === null || typeof entry !== "object") return null;
  const description = entry.description;
  if (typeof description === "string") return description;
  if (description !== null && typeof description === "object")
    return typeof description.value === "string" ? description.value : null;
  return null;
}

function descriptionsOf(group) {
  if (!Array.isArray(group)) return null;
  const descriptions = group
    .map((entry) => descriptionOf(entry))
    .filter((description) => typeof description === "string");
  return descriptions.length > 0 ? descriptions : null;
}

function constructionOf(doc) {
  return {
    walls: descriptionsOf(doc.walls),
    roofs: descriptionsOf(doc.roofs),
    floors: descriptionsOf(doc.floors),
    windows: descriptionOf(doc.windows),
    lighting: descriptionOf(doc.lighting),
    mainHeating: descriptionsOf(doc.main_heating),
    hotWater: descriptionOf(doc.hot_water),
  };
}

function minimise(stub, doc) {
  // dwelling_type arrives as a plain string on newer certificates
  // and as a { value, language } object on older ones — file the
  // words either way.
  const dwelling = doc.dwelling_type;
  return {
    certificateNumber: stub.certificateNumber,
    addressLine1: doc.address_line_1 ?? stub.addressLine1 ?? null,
    addressLine2: doc.address_line_2 ?? stub.addressLine2 ?? null,
    addressLine3: doc.address_line_3 ?? stub.addressLine3 ?? null,
    postTown: doc.post_town ?? stub.postTown ?? null,
    postcode: doc.postcode ?? stub.postcode,
    uprn: doc.uprn ?? stub.uprn ?? null,
    band: doc.current_energy_efficiency_band ?? stub.currentEnergyEfficiencyBand ?? null,
    ratingCurrent: doc.energy_rating_current ?? null,
    potentialBand: doc.potential_energy_efficiency_band ?? null,
    totalFloorArea: doc.total_floor_area ?? null,
    dwellingType:
      typeof dwelling === "object" && dwelling !== null
        ? (dwelling.value ?? null)
        : (dwelling ?? null),
    // Kept so the site can label a predicted (SAP) rating as
    // predicted, per decision D7 — never shown as a bare fact.
    assessmentType: doc.assessment_type ?? null,
    registrationDate: doc.registration_date ?? stub.registrationDate ?? null,
    // The register's modelled annual energy costs, widened in
    // at M6.14 (decision D33): heating, hot water and lighting,
    // current and potential, in pounds as published.
    heatingCostCurrent: costOf(doc, "heating_cost_current"),
    hotWaterCostCurrent: costOf(doc, "hot_water_cost_current"),
    lightingCostCurrent: costOf(doc, "lighting_cost_current"),
    heatingCostPotential: costOf(doc, "heating_cost_potential"),
    hotWaterCostPotential: costOf(doc, "hot_water_cost_potential"),
    lightingCostPotential: costOf(doc, "lighting_cost_potential"),
    // The certificate's suggested improvements, widened in
    // at M6.21 (decision D41) — the register's modelled
    // steps, filed as published (see improvementsOf).
    suggestedImprovements: improvementsOf(doc),
    // The certificate's recorded construction descriptions,
    // widened in at M6.26 (decision D48) — the register's
    // own words per element group, descriptions only (see
    // constructionOf).
    construction: constructionOf(doc),
  };
}

async function apiGet(path, token) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (response.status === 404) return null;
    if (response.ok) return response.json();
    if (response.status === 429 && attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }
    throw new Error(`EPC API request failed: HTTP ${response.status} (${path})`);
  }
  throw new Error("unreachable");
}

async function liveCertificates(postcode, token) {
  const stubs = [];
  let page = 1;
  for (;;) {
    const result = await apiGet(
      `/api/domestic/search?postcode=${encodeURIComponent(postcode)}&current_page=${page}&page_size=5000`,
      token,
    );
    if (result === null) return [];
    stubs.push(...(result.data ?? []));
    if (page >= (result.pagination?.totalPages ?? 1)) break;
    page += 1;
  }
  const certificates = [];
  for (const stub of stubs) {
    const doc = await apiGet(
      `/api/certificate?certificate_number=${encodeURIComponent(stub.certificateNumber)}`,
      token,
    );
    if (doc === null)
      throw new Error(`certificate ${stub.certificateNumber} vanished between search and fetch`);
    certificates.push(minimise(stub, doc.data ?? doc));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return certificates;
}

async function fixtureCertificates(postcode, fileDir, fixture) {
  const entry = fixture.postcodes[postcode];
  if (!entry)
    throw new Error(
      `${postcode}: not covered by the fixture (${Object.keys(fixture.postcodes).join(", ")})`,
    );
  const search = JSON.parse(await readFile(join(fileDir, entry.searchFile), "utf8"));
  const certificates = [];
  for (const stub of search.data ?? []) {
    const raw = await readFile(join(fileDir, "certs", `${stub.certificateNumber}.json`), "utf8");
    const doc = JSON.parse(raw);
    certificates.push(minimise(stub, doc.data ?? doc));
  }
  return certificates;
}

function annualCost(cert, side) {
  const parts = [
    cert[`heatingCost${side}`],
    cert[`hotWaterCost${side}`],
    cert[`lightingCost${side}`],
  ];
  if (parts.some((p) => typeof p !== "number")) return null;
  return parts.reduce((a, b) => a + b, 0);
}

// The suggested-improvements goldens (M6.21, D41), per
// certificate number. Birkdale's certificate carries exactly
// two steps — solar water heating then solar photovoltaic
// panels — and the pair is the standing warning against the
// half-figure: the first step's £34 saving alone is NOT the
// certificate's story (the steps together lift the rating to
// 93, band A), and the sample report's "save about £34 a
// year" line is barred from ever becoming a golden. Exeter's
// two certificates and Minerva Flat 4's publish no steps:
// each files null, the named no-measures state.
const MEASURES_GOLDEN = {
  "2490-1633-0432-1002-3023": [
    {
      sequence: 1,
      improvementType: "N",
      improvementNumber: 19,
      typicalSaving: 34,
      indicativeCost: "£4,000 - £6,000",
      energyRatingAfter: 86,
      environmentalRatingAfter: 87,
    },
    {
      sequence: 2,
      improvementType: "U",
      improvementNumber: 34,
      typicalSaving: 383,
      indicativeCost: "£3,500 - £5,500",
      energyRatingAfter: 93,
      environmentalRatingAfter: 94,
    },
  ],
  "2041-1785-8070-7006-5925": null,
  "9248-9925-7330-1627-9930": null,
  "8401-7039-6529-6723-9906": null,
};

function checkMeasuresGolden(postcode, certificates) {
  for (const cert of certificates) {
    if (!(cert.certificateNumber in MEASURES_GOLDEN)) continue;
    const expected = MEASURES_GOLDEN[cert.certificateNumber];
    const filed = cert.suggestedImprovements ?? null;
    if (expected === null) {
      if (filed !== null)
        throw new Error(
          `${postcode}: certificate ${cert.certificateNumber} publishes no suggested improvements but filed ${filed.length} — the no-measures state must file null`,
        );
      continue;
    }
    const comparable = (filed ?? []).map((step) => ({
      sequence: step.sequence,
      improvementType: step.improvementType,
      improvementNumber: step.improvementNumber,
      typicalSaving: step.typicalSaving,
      indicativeCost: step.indicativeCost,
      energyRatingAfter: step.energyRatingAfter,
      environmentalRatingAfter: step.environmentalRatingAfter,
    }));
    if (JSON.stringify(comparable) !== JSON.stringify(expected))
      throw new Error(
        `${postcode}: golden check failed for certificate ${cert.certificateNumber} — expected suggested improvements ${JSON.stringify(expected)}, found ${JSON.stringify(comparable)}`,
      );
  }
}

// The construction goldens (M6.26, D48), per certificate
// number: the filed descriptions exactly as the register
// records them — Birkdale's new-build SAP set with its
// U-values as text, Exeter's pair disagreeing (the 2013
// SAP transmittance set against the 2023 RdSAP words,
// windows not recorded on the 2023 certificate), and
// Minerva Flat 4's "(other premises above/below)" pair
// with the register's own ampersand in "Boiler& underfloor,
// mains gas". No rating files beside any description: the
// filed shape is descriptions only, so a filed rating
// number anywhere in a construction group fails the shape
// these goldens pin by deep equality.
const CONSTRUCTION_GOLDEN = {
  "2490-1633-0432-1002-3023": {
    walls: ["Average thermal transmittance 0.27 W/m²K"],
    roofs: ["Average thermal transmittance 0.11 W/m²K"],
    floors: ["Average thermal transmittance 0.15 W/m²K"],
    windows: "High performance glazing",
    lighting: "Low energy lighting in all fixed outlets",
    mainHeating: ["Boiler and radiators, mains gas"],
    hotWater: "From main system, waste water heat recovery",
  },
  "2041-1785-8070-7006-5925": {
    walls: ["Cavity wall, as built, insulated (assumed)"],
    roofs: ["(another dwelling above)"],
    floors: ["Solid, insulated (assumed)"],
    windows: null,
    lighting: "Low energy lighting in all fixed outlets",
    mainHeating: ["Community scheme"],
    hotWater: "Community scheme",
  },
  "9248-9925-7330-1627-9930": {
    walls: ["Average thermal transmittance 0.28 W/m²K"],
    roofs: ["Average thermal transmittance 0.2 W/m²K"],
    floors: ["Average thermal transmittance 0.21 W/m²K"],
    windows: "Fully double glazed",
    lighting: "Low energy lighting in all fixed outlets",
    mainHeating: ["Community scheme"],
    hotWater: "Community scheme with CHP",
  },
  "8401-7039-6529-6723-9906": {
    walls: ["Average thermal transmittance 0.18 W/m²K"],
    roofs: ["(other premises above)"],
    floors: ["(other premises below)"],
    windows: "High performance glazing",
    lighting: "Low energy lighting in all fixed outlets",
    mainHeating: ["Boiler& underfloor, mains gas"],
    hotWater: "From main system",
  },
};

function checkConstructionGolden(postcode, certificates) {
  for (const cert of certificates) {
    if (!(cert.certificateNumber in CONSTRUCTION_GOLDEN)) continue;
    const expected = CONSTRUCTION_GOLDEN[cert.certificateNumber];
    if (JSON.stringify(cert.construction ?? null) !== JSON.stringify(expected))
      throw new Error(
        `${postcode}: golden check failed for certificate ${cert.certificateNumber} — expected construction ${JSON.stringify(expected)}, found ${JSON.stringify(cert.construction ?? null)}`,
      );
  }
}

function checkGolden(postcode, certificates) {
  const golden = GOLDEN[postcode];
  if (!golden) return;
  checkMeasuresGolden(postcode, certificates);
  checkConstructionGolden(postcode, certificates);
  const atAddress = certificates.filter((c) => c.addressLine1 === golden.address);
  const areas = atAddress.map((c) => c.totalFloorArea).sort((a, b) => a - b);
  const expected = [...golden.floorAreas].sort((a, b) => a - b);
  if (
    JSON.stringify(areas) !== JSON.stringify(expected) ||
    atAddress.some((c) => c.band !== golden.band)
  )
    throw new Error(
      `${postcode}: golden check failed for ${golden.address} — expected floor areas ${expected} at band ${golden.band}, found ${JSON.stringify(atAddress.map((c) => [c.totalFloorArea, c.band]))}`,
    );
  // The modelled cost totals are golden too (M6.14): a
  // certificate at a golden address that files no costs, or
  // different totals, fails the load loudly rather than
  // quietly serving a section with its cost line missing.
  for (const side of ["Current", "Potential"]) {
    const totals = atAddress.map((c) => annualCost(c, side)).sort((a, b) => (a ?? -1) - (b ?? -1));
    const expectedTotals = [...golden[`cost${side}`]].sort((a, b) => a - b);
    if (JSON.stringify(totals) !== JSON.stringify(expectedTotals))
      throw new Error(
        `${postcode}: golden check failed for ${golden.address} — expected annual ${side.toLowerCase()} energy costs ${JSON.stringify(expectedTotals)}, found ${JSON.stringify(totals)}`,
      );
  }
}

async function main() {
  const startedAt = Date.now();
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify-only");
  const fileIdx = args.indexOf("--file");
  const fileDir = fileIdx >= 0 ? args[fileIdx + 1] : null;
  const postcodes = args
    .filter((a, i) => !a.startsWith("--") && i !== fileIdx + 1)
    .map((pc) => pc.trim().toUpperCase());
  if (postcodes.length === 0)
    throw new Error('name at least one postcode, e.g. load-epc -- "CM3 2JT"');

  const token = process.env.EPC_API_TOKEN;
  if (!fileDir && !token) throw new Error("EPC_API_TOKEN is not set (see .env.example, Key K9)");
  const fixture = fileDir
    ? JSON.parse(await readFile(join(fileDir, "fixture.json"), "utf8"))
    : null;

  const answers = new Map();
  for (const pc of postcodes) {
    const certificates = fixture
      ? await fixtureCertificates(pc, fileDir, fixture)
      : await liveCertificates(pc, token);
    checkGolden(pc, certificates);
    answers.set(pc, {
      certificates,
      certificateCount: certificates.length,
      sourceName: SOURCE_NAME,
      sourceDate: new Date().toISOString().slice(0, 10),
      loadedAt: new Date().toISOString(),
    });
  }

  const summary = () =>
    `load-epc · ${postcodes.map((pc) => `${pc} ${answers.get(pc).certificateCount} certificates`).join(" · ")}`;
  if (verifyOnly) {
    console.log(
      `${summary()} · golden homes OK (verify only, nothing filed) · ${Math.round((Date.now() - startedAt) / 1000)}s`,
    );
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (see .env.example, Key K6)");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    try {
      for (const pc of postcodes) {
        const res = await client.query(
          "UPDATE postcode_cache SET answers = answers || $1::jsonb WHERE postcode = $2",
          [JSON.stringify({ epc: answers.get(pc) }), pc],
        );
        if (res.rowCount === 0)
          throw new Error(
            `${pc}: not in the postcode directory — run the postcode loader (step M4.1) first`,
          );
      }
      for (const pc of postcodes) {
        const res = await client.query(
          "SELECT answers->'epc' AS epc FROM postcode_cache WHERE postcode = $1",
          [pc],
        );
        const filed = res.rows[0]?.epc;
        if (!filed || filed.certificateCount !== answers.get(pc).certificateCount)
          throw new Error(
            `${pc}: the filed EPC answer does not match the fetched certificates — rolling back`,
          );
        checkGolden(pc, filed.certificates);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    console.log(`${summary()} · golden homes OK · ${Math.round((Date.now() - startedAt) / 1000)}s`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`load-epc FAILED: ${error.message}`);
  process.exitCode = 1;
});
