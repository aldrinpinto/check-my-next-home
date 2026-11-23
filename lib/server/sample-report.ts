// BUG-159: the sample report's server seam. Resolves the
// candidate golden homes through the real pipeline
// (resolutionForRoute + checkReport, exactly as the
// validation proofs did), merges their bundles per section
// (lib/sample-report.ts), composes through the normal
// report builder and anonymises the view. The generated
// view is cached per process (the D29 pattern: the sample
// is not recomputed per hit); a failed generation is NOT
// cached, so the next hit retries.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { displayText } from "../address";
import {
  anonymiseSampleView,
  mergeSampleBundles,
  sampleReportInput,
  sampleReportNowFromEnv,
  suppressSampleNames,
  type SampleCandidate,
  type SampleHomeIdentity,
} from "../sample-report";
import type { ReportView } from "../report";
import { buildReportView } from "../report";
import { checkReport, resolutionForRoute } from "./serve";

// The candidate homes, primary first. Birkdale is the
// anchor: its resolution, its sold prices, and every tie.
// The others fill the sections they serve fullest —
// Capital East its Zone 3 flood and dense nearby,
// Exeter and Minerva wherever both leads run thin.
const SAMPLE_CANDIDATES: { id: string; postcode: string; homeKey: string | null }[] = [
  { id: "birkdale", postcode: "CM3 2JT", homeKey: "19||BIRKDALE RISE" },
  {
    id: "capital-east",
    postcode: "E16 1AS",
    homeKey: "CAPITAL EAST APARTMENTS 21|FLAT 12|WESTERN GATEWAY",
  },
  { id: "exeter", postcode: "E16 1GN", homeKey: "6||EXETER ROAD" },
  { id: "minerva", postcode: "KT17 1FH", homeKey: null },
];

async function resolveCandidate(
  spec: (typeof SAMPLE_CANDIDATES)[number],
): Promise<SampleCandidate | null> {
  // A durable key that no longer resolves falls back to
  // the postcode-level resolution: the candidate then
  // contributes its area facts only, and the merge's
  // scoring keeps its home-specific parts out of the
  // sections they cannot fill.
  let resolution = spec.homeKey ? await resolutionForRoute(spec.postcode, spec.homeKey) : null;
  if (!resolution) resolution = await resolutionForRoute(spec.postcode, null);
  if (!resolution) return null;
  const bundles = await checkReport(resolution);
  return { id: spec.id, resolution, bundles };
}

function identityOf(candidate: SampleCandidate, postcode: string): SampleHomeIdentity {
  const { resolution, bundles } = candidate;
  const certificateNumbers =
    bundles.area.kind === "area-bundle"
      ? bundles.area.sections.epc.certificates.map((cert) => cert.certificateNumber)
      : [];
  const ownSales =
    bundles.sold.kind === "sold-prices" && "ownHistory" in bundles.sold
      ? bundles.sold.ownHistory.map((sale) => ({ price: sale.price, dateIso: sale.date }))
      : [];
  return {
    label: resolution.rung === 1 ? resolution.address.label : null,
    street:
      resolution.rung === 1 && resolution.address.street
        ? displayText(resolution.address.street)
        : null,
    postcode,
    certificateNumbers,
    ownSales,
  };
}

// The baked view's home (BUG-170): the container's
// start command runs scripts/bake-sample-report.ts
// once per deploy, which generates the view through
// this same seam and writes it here; serves then read
// the file instead of regenerating the merged bundles
// on the first hit. The directory is gitignored — the
// bake is a deploy artefact, never a committed one.
export const BAKED_SAMPLE_REPORT_PATH = join(process.cwd(), "baked", "sample-report-view.json");

export async function generateSampleReportView(): Promise<ReportView> {
  const resolved = await Promise.all(SAMPLE_CANDIDATES.map(resolveCandidate));
  const candidates = resolved.filter((c): c is SampleCandidate => c !== null);
  const primary = candidates.find((c) => c.id === "birkdale");
  if (!primary) throw new Error("sample report: the primary sample home did not resolve");
  const ordered = [primary, ...candidates.filter((c) => c !== primary)];
  const postcodeOf = (candidate: SampleCandidate) =>
    SAMPLE_CANDIDATES.find((spec) => spec.id === candidate.id)?.postcode ?? "";
  const identities = ordered.map((candidate) => identityOf(candidate, postcodeOf(candidate)));
  const merged = mergeSampleBundles(ordered);
  // The founder's suppression ruling (22 Nov 2026):
  // banned-named entries are dropped from the merged
  // bundles before composition, so no contributing home's
  // street name survives anywhere in the sample — not
  // even inside a genuine place name.
  const suppressed = suppressSampleNames(merged.bundles, identities);
  const view = buildReportView(
    sampleReportInput(
      primary,
      { bundles: suppressed, sources: merged.sources },
      // The sample's composed moment: the real one, unless
      // the harness's SAMPLE_REPORT_NOW seam pins it (the
      // visual guard's day-independence — see
      // lib/sample-report.ts).
      sampleReportNowFromEnv(process.env),
    ),
  );
  return anonymiseSampleView(view, identities);
}

// The baked view, when one stands (BUG-170). Two
// cases never read it: the harness's SAMPLE_REPORT_NOW
// seam is set (the pinned moment must be composed
// live, exactly as the seam has always worked — the
// e2e harness never bakes, and even a stray bake file
// must not shadow the pin), and any read or parse
// failure (a half-written or stale-shaped file falls
// back to live generation rather than failing the
// page; the next deploy's bake replaces it).
async function readBakedSampleReportView(): Promise<ReportView | null> {
  if (process.env.SAMPLE_REPORT_NOW) return null;
  try {
    const raw = await readFile(BAKED_SAMPLE_REPORT_PATH, "utf8");
    return JSON.parse(raw) as ReportView;
  } catch {
    return null;
  }
}

let generating: Promise<ReportView> | null = null;

export function getSampleReportView(): Promise<ReportView> {
  if (!generating) {
    generating = (async () => {
      const baked = await readBakedSampleReportView();
      return baked ?? (await generateSampleReportView());
    })().catch((error: unknown) => {
      generating = null;
      throw error;
    });
  }
  return generating;
}
