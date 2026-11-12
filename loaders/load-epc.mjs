// Energy certificates loader (plan step M4.5). Option A, decided
// 12 Nov 2026: per-postcode lookups against the Get energy
// performance of buildings data API — no bulk full-load ingest.
// The monthly refresh of filed postcodes uses the API's deltas
// feed, which is wired up with the loader runner (step M4.8).
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
//      square metres, both band B.
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
// mode and live mode alike.
const GOLDEN = {
  "E16 1GN": { address: "6 Exeter Road", floorAreas: [71, 91], band: "B" },
  "CM3 2JT": { address: "19 Birkdale Rise", floorAreas: [141], band: "B" },
};

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

function checkGolden(postcode, certificates) {
  const golden = GOLDEN[postcode];
  if (!golden) return;
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
