// Crime fixture loader shim (plan step M6.19) — the loader
// path the golden replay's crime source is configured with.
//
// The crime brain loads a covered postcode on first check by
// running its configured loader path with the postcode after
// a "--" separator (lib/crime.ts). In production that path is
// the real loader in live mode. The replay must never fetch
// live Police.uk data, so this shim stands in the path: it
// runs the REAL loader in fixture mode over the fixture dir
// the replay's setup assembled (named by the
// REPLAY_CRIME_FIXTURE_DIR environment variable, set by
// tests/golden-replay.test.ts). A postcode the fixture's
// points map does not cover fails the load — which is exactly
// the outcome the brain turns into its not-filed state — and
// a covered postcode files its artefact from the captured
// monthly files, never from the network.

import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const fixtureDir = process.env.REPLAY_CRIME_FIXTURE_DIR;
const postcode = process.argv[process.argv.length - 1];

if (!fixtureDir || !postcode || postcode.startsWith("--")) {
  console.error(
    "crime-fixture-loader: REPLAY_CRIME_FIXTURE_DIR and a postcode are required",
  );
  process.exit(1);
}

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
await run(
  process.execPath,
  [join(repo, "loaders", "load-crime.mjs"), "--file", fixtureDir, "--", postcode],
  { env: process.env, maxBuffer: 64 * 1024 * 1024 },
);
