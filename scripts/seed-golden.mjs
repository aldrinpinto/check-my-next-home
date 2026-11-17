// Seed the golden corpus into a database (plan step M7.3).
//
// The served app answers from filed data only, so the E2E
// and play environments need the golden homes filed. This
// script files exactly what CI's database job files, plus
// exactly what the golden replay's setup files on top
// (tests/golden-replay.test.ts) — the same corpus the
// frozen brains are pinned against, no more and no less:
//
//   1. migrations + the practice seed (M3.6);
//   2. the CI fixture steps (postcodes, sold prices, crime,
//      EPC, schools, health), the runner's fixture pass over
//      all loaders, and the direct fixture steps;
//   3. the replay's extras: the directory rows for every
//      golden postcode, sold prices and crime through the
//      real loaders over the assembled fixture dirs, EPC for
//      the two postcodes the CI steps do not file, the
//      sold-prices load stamps for no-sale postcodes, the
//      filed crime artefacts (the two zero-crimes witnesses
//      and the Cardiff capture), and the national crime
//      loader in fixture mode.
//
// After it runs, the six journey postcodes (Birkdale
// CM3 2JT, Exeter E16 1GN, Minerva KT17 1FH, Cardiff
// CF11 8AA, Edinburgh EH1 1AD, Beaulieu CM1 6ER) serve from
// filed data. Two honest exceptions, both mirroring the
// replay corpus: Cardiff's EPC section serves its named
// not-filed state (no EPC token in the fixture
// environment), and Beaulieu's crime is a first-check load
// exactly as in production (D30) — no E2E spec depends on
// it completing.
//
// Usage: DATABASE_URL=… node scripts/seed-golden.mjs
// Re-running is safe: the loaders file idempotently and
// the direct inserts below are conflict-guarded.

import { execFile } from "node:child_process";
import { copyFile, cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import pg from "pg";

const run = promisify(execFile);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = new Date();

if (!process.env.DATABASE_URL) {
  console.error("seed-golden: DATABASE_URL is not set — nothing filed.");
  process.exit(1);
}

async function step(label, command, args, options = {}) {
  console.log(`\n=== seed: ${label}`);
  await run(command, args, {
    cwd: REPO,
    env: { ...process.env, ...options.env },
    maxBuffer: 64 * 1024 * 1024,
    ...(options.nodeOptions
      ? { env: { ...process.env, ...options.env, NODE_OPTIONS: "--experimental-sqlite" } }
      : {}),
  });
}

const npm = (label, args, options) => step(label, "npm", ["run", ...args], options);
const loader = (label, file, args, options) =>
  step(label, "node", [join(REPO, "loaders", file), ...args], options);

// 1–2. The CI database job's filings, in its order.
await npm("migrations", ["db:migrate"]);
await npm("practice seed", ["db:seed"]);
await npm("postcode directory fixture", ["load:postcodes", "--", "--file", "tests/fixtures/onspd"]);
await npm("sold prices fixture", [
  "load:sold-prices",
  "--",
  "--file",
  "tests/fixtures/land-registry",
  "CM3 2JT",
  "E16 1GN",
]);
await npm("crime fixture", [
  "load:crime",
  "--",
  "--file",
  "tests/fixtures/police-uk",
  "CM3 2JT",
  "E16 1GN",
]);
await npm("EPC fixture", ["load:epc", "--", "--file", "tests/fixtures/epc", "CM3 2JT", "E16 1GN"]);
await npm("schools fixture", ["load:schools", "--", "--file", "tests/fixtures/schools"]);
await npm("health fixture", ["load:health", "--", "--file", "tests/fixtures/health"]);
await step(
  "runner fixture pass over all loaders",
  "node",
  [
    join(REPO, "loaders/run-loaders.mjs"),
    "--file",
    "tests/fixtures",
    "--kind",
    "practice",
    "--env",
    "ci",
    "--no-canary",
    "--no-email",
  ],
  { nodeOptions: true },
);
for (const [label, file, fixture] of [
  ["planning areas", "load-planning-areas.mjs", "planning-areas"],
  ["green belt", "load-green-belt.mjs", "green-belt"],
  ["heritage", "load-heritage.mjs", "heritage"],
  ["nature designations", "load-nature-designations.mjs", "nature-designations"],
  ["priority habitats", "load-priority-habitats.mjs", "priority-habitats"],
  ["flood zones", "load-flood-zones.mjs", "flood-zones"],
  ["flood rivers and sea", "load-flood-rivers-sea.mjs", "flood-rivers-sea"],
  ["flood surface water", "load-flood-surface-water.mjs", "flood-surface-water"],
  ["transport", "load-transport.mjs", "transport"],
  ["nearby places", "load-osm-places.mjs", "osm-places"],
]) {
  await loader(label, file, ["--file", join(REPO, "tests/fixtures", fixture)]);
}
await loader(
  "greenspace",
  "load-os-greenspace.mjs",
  ["--file", join(REPO, "tests/fixtures/os-greenspace")],
  {
    nodeOptions: true,
  },
);

// 3. The replay's extras (tests/golden-replay.test.ts,
// beforeAll — mirrored, not paraphrased).
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const rows = JSON.parse(
    await readFile(join(REPO, "tests/fixtures/replay/directory-rows.json"), "utf8"),
  );
  const postcodes = rows.map((r) => r.postcode);

  const stamp = await pool.query(
    "SELECT source_name, source_date FROM postcode_cache WHERE postcode = 'CM3 2JT'",
  );
  if (stamp.rowCount !== 1) throw new Error("the CI corpus is not filed (CM3 2JT missing)");
  const { source_name, source_date } = stamp.rows[0];
  for (const r of rows) {
    await pool.query(
      `INSERT INTO postcode_cache (postcode, latitude, longitude, council, ward, region, lsoa_code, msoa_code, source_name, source_date, answers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'{}'::jsonb)
       ON CONFLICT (postcode) DO NOTHING`,
      [
        r.postcode,
        r.latitude,
        r.longitude,
        r.council,
        r.ward,
        r.region,
        r.lsoaCode,
        r.msoaCode,
        source_name,
        source_date,
      ],
    );
  }

  const soldDir = await mkdtemp(join(tmpdir(), "seed-sold-"));
  await copyFile(
    join(REPO, "tests/fixtures/land-registry/pp-complete.csv"),
    join(soldDir, "pp-complete.csv"),
  );
  const fixtureUpdate = await readFile(
    join(REPO, "tests/fixtures/land-registry/pp-monthly-update.csv"),
    "utf8",
  );
  const kt17Rows = await readFile(join(REPO, "tests/fixtures/address/kt17-1fh.csv"), "utf8");
  await writeFile(
    join(soldDir, "pp-monthly-update.csv"),
    fixtureUpdate.replace(/\n?$/, "\n") + kt17Rows.replace(/\n?$/, "\n"),
  );
  await step("sold prices over the assembled dir (all golden postcodes)", "node", [
    join(REPO, "loaders/load-sold-prices.mjs"),
    "--file",
    soldDir,
    "--",
    ...postcodes,
  ]);

  const crimeDir = await mkdtemp(join(tmpdir(), "seed-crime-"));
  await cp(join(REPO, "tests/fixtures/police-uk"), crimeDir, { recursive: true });
  const fixture = JSON.parse(await readFile(join(crimeDir, "fixture.json"), "utf8"));
  fixture.points["KT17 1FH"] = { lat: 51.344571, lng: -0.247104, prefix: "epsom" };
  fixture.basisResidents["KT17 1FH"] = 39926;
  fixture.points["KT17 1DR"] = { lat: 51.350243, lng: -0.256581, prefix: "ewell" };
  fixture.points["CB6 1EH"] = { lat: 52.507481, lng: 0.33491, prefix: "hilgay" };
  await writeFile(join(crimeDir, "fixture.json"), JSON.stringify(fixture, null, 2));
  await step("crime over the assembled dir", "node", [
    join(REPO, "loaders/load-crime.mjs"),
    "--file",
    crimeDir,
    "--",
    "CM3 2JT",
    "E16 1GN",
    "KT17 1FH",
    "KT17 1DR",
    "CB6 1EH",
  ]);

  await step("EPC for the postcodes the CI steps do not file", "node", [
    join(REPO, "loaders/load-epc.mjs"),
    "--file",
    join(REPO, "tests/fixtures/epc"),
    "--",
    "KT17 1FH",
    "CM1 6ER",
  ]);

  const editionRow = await pool.query(
    "SELECT source_date FROM price_paid WHERE postcode = 'CM3 2JT' LIMIT 1",
  );
  const rawEdition = editionRow.rows[0]?.source_date;
  const edition =
    rawEdition instanceof Date ? rawEdition.toISOString().slice(0, 10) : String(rawEdition);
  const loadStamp = JSON.stringify({ edition, loadedAt: NOW.toISOString() });
  for (const r of rows) {
    if (r.region === "S99999999" || r.region === "N99999999") continue;
    await pool.query(
      `UPDATE postcode_cache
          SET answers = jsonb_set(answers, '{soldPricesLoad}', $2::jsonb, true)
        WHERE postcode = $1
          AND NOT EXISTS (SELECT 1 FROM price_paid WHERE postcode = $1)
          AND NOT (answers ? 'soldPricesLoad')`,
      [r.postcode, loadStamp],
    );
  }

  for (const [pc, file] of [
    ["CA20 1EX", "zero-witness-ca20-1ex.json"],
    ["LD5 4AD", "zero-witness-ld5-4ad.json"],
    ["CF11 8AA", "live-capture-cf11-8aa.json"],
  ]) {
    const artefact = JSON.parse(
      await readFile(join(REPO, "tests/fixtures/police-uk", file), "utf8"),
    );
    await pool.query(
      "UPDATE postcode_cache SET answers = answers || $1::jsonb WHERE postcode = $2",
      [JSON.stringify({ crime: artefact }), pc],
    );
  }

  await step("national crime loader (fixture mode)", "node", [
    join(REPO, "loaders/load-crime-national.mjs"),
    "--file",
    join(REPO, "tests/fixtures/police-uk-national"),
  ]);
} finally {
  await pool.end();
}

console.log(
  "\nseed-golden: done — CM3 2JT, E16 1GN, KT17 1FH, CF11 8AA, EH1 1AD and CM1 6ER serve from filed data.",
);
