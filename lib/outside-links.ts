// M8.7 — the outside-link registry: every fixed outside
// destination the site serves, DERIVED from the code that
// serves it.
//
// The weekly link robot (scripts/outside-link-check.mjs)
// must never work from a hand-kept list — a hand-kept list
// is exactly how the hand-made sample report's GOV.UK
// links rotted unnoticed (the step's origin lesson). So
// this module collects the destinations from the very
// constants and content the site builds its links from:
//
//   - the check pages' and guides' own link lists
//     (lib/check-pages.ts — the three vehicle checkers are
//     the only outside links that content carries; the
//     charging-zone hand-offs in the report and results
//     resolve to these same three destinations, filed by
//     loaders/load-charging-zones.mjs);
//   - the calculators' official links (lib/calculators.ts);
//   - the flood-warning link (lib/flood.ts), the catchment
//     link (lib/results.ts), the planning hand-offs and
//     the building-safety register (lib/area-bundle.ts);
//   - the report Sources destinations (lib/report.ts): the
//     long-term flood risk service, the five Nomis dataset
//     pages the Sources list links, and the energy
//     certificate pattern;
//   - the sample report (BUG-159): the generated,
//     anonymised report — it serves exactly the report's
//     own anchors and no literals of its own, so it adds
//     no entries; the certificate pattern records the
//     surface because the sample serves it (with its
//     fiction certificate number).
//
// The robot consumes this collection through a generated
// JSON copy (scripts/outside-links.json); the gate test
// (tests/outside-links.test.ts) proves the copy equals
// this derivation on every push, and regenerating is one
// command (see docs/outside-link-robot-howto.md). Nothing
// in the app imports this module at runtime — it is the
// robot's source, type-checked against the brains so a
// changed link shape breaks the build, not the robot.

import { BSR_REGISTER_SEARCH, PLANNING_REGISTER_NI, PLANNING_SEARCH_GOVUK } from "./area-bundle";
import { SCOTLAND_TAX_LINK, STAMP_DUTY_RATES_URL, WALES_TAX_LINK } from "./calculators";
import { CHECK_PAGES, GUIDES, type CheckPageContent, type GuideContent } from "./check-pages";
import { FLOOD_WARNING_LINK } from "./flood";
import {
  CENSUS_GRID_ORDER,
  EPC_CERTIFICATE_URL_BASE,
  LONG_TERM_FLOOD_RISK_URL,
  NOMIS_DATASET_URL_BASE,
} from "./report";
import { CATCHMENT_LINK } from "./results";

export type OutsideLink = {
  // The URL the robot visits.
  url: string;
  // The link's label as served (the first surface that
  // named it); the note prints the URL beside it always.
  label: string;
  // Every surface that serves this destination.
  shownOn: string[];
  // For a per-record pattern (the energy certificate):
  // the served URL template. The robot checks the service
  // landing in `url`; the pattern is what the site emits.
  pattern?: string;
};

type RawLink = { url: string; label: string; shownOn: string; pattern?: string };

function merge(raw: RawLink[]): OutsideLink[] {
  const byUrl = new Map<string, OutsideLink>();
  for (const link of raw) {
    const existing = byUrl.get(link.url);
    if (existing) {
      if (!existing.shownOn.includes(link.shownOn)) existing.shownOn.push(link.shownOn);
      if (!existing.label && link.label) existing.label = link.label;
      continue;
    }
    byUrl.set(link.url, {
      url: link.url,
      label: link.label,
      shownOn: [link.shownOn],
      ...(link.pattern ? { pattern: link.pattern } : {}),
    });
  }
  return [...byUrl.values()];
}

// The check pages' and guides' outside links, from the
// content's own link lists. Internal links ("/check/…")
// are the site's own pages — the robot checks only what
// leaves the site.
export function checkPageOutsideLinks(
  pages: Record<string, CheckPageContent> = CHECK_PAGES,
  guides: Record<string, GuideContent> = GUIDES,
): RawLink[] {
  const raw: RawLink[] = [];
  const walk = (sections: { links?: { label: string; href: string }[] }[], shownOn: string) => {
    for (const section of sections) {
      for (const link of section.links ?? []) {
        if (/^https?:\/\//.test(link.href)) {
          raw.push({ url: link.href, label: link.label, shownOn });
        }
      }
    }
  };
  for (const page of Object.values(pages)) walk(page.sections, `check page ${page.path}`);
  for (const guide of Object.values(guides)) walk(guide.sections, `guide ${guide.path}`);
  return raw;
}

// The calculators' three official destinations (the
// results page's stamp-duty card in its three nations).
export function calculatorOutsideLinks(): RawLink[] {
  const shownOn = "the results page calculators";
  return [
    { url: STAMP_DUTY_RATES_URL, label: "Stamp Duty Land Tax — GOV.UK", shownOn },
    { url: SCOTLAND_TAX_LINK.url, label: SCOTLAND_TAX_LINK.label, shownOn },
    { url: WALES_TAX_LINK.url, label: WALES_TAX_LINK.label, shownOn },
  ];
}

// The hand-off and warning links the brains serve into
// the results page, the district page and the report.
export function brainOutsideLinks(): RawLink[] {
  return [
    {
      url: FLOOD_WARNING_LINK.url,
      label: FLOOD_WARNING_LINK.label,
      shownOn: "flood warnings on the results page, the district page and the report",
    },
    {
      url: CATCHMENT_LINK.url,
      label: CATCHMENT_LINK.label,
      shownOn: "the results page and the report",
    },
    {
      url: PLANNING_SEARCH_GOVUK.url,
      label: PLANNING_SEARCH_GOVUK.label,
      shownOn: "the report and the results page",
    },
    {
      url: PLANNING_REGISTER_NI.url,
      label: PLANNING_REGISTER_NI.label,
      shownOn: "the report (Northern Ireland homes)",
    },
    {
      url: BSR_REGISTER_SEARCH.url,
      label: BSR_REGISTER_SEARCH.label,
      shownOn: "the report's building-safety hand-off",
    },
  ];
}

// The report Sources list's own destinations: the flood
// risk service, the Nomis dataset page for each table the
// Sources list links, and the energy-certificate pattern.
export function reportOutsideLinks(): RawLink[] {
  const shownOn = "the report's Sources list";
  const raw: RawLink[] = [
    { url: LONG_TERM_FLOOD_RISK_URL, label: "GOV.UK long-term flood risk service", shownOn },
    ...CENSUS_GRID_ORDER.map((code) => ({
      url: `${NOMIS_DATASET_URL_BASE}${code}`,
      label: `Nomis dataset C2021${code.toUpperCase()}`,
      shownOn,
    })),
    {
      // The served link carries the home's own certificate
      // number; the fixed destination is the service. The
      // robot checks the service's landing page.
      url: "https://find-energy-certificate.service.gov.uk/",
      label: "Find an Energy Certificate — the certificate for this home",
      shownOn,
      pattern: `${EPC_CERTIFICATE_URL_BASE}{certificate number}`,
    },
  ];
  return raw;
}

// BUG-159: the sample report is the generated report,
// anonymised — it carries no literal anchors of its own;
// every anchor it serves is the report builder's, already
// collected by reportOutsideLinks above.
export function sampleReportOutsideLinks(): RawLink[] {
  return [];
}

// The whole set, in source order, duplicates folded with
// every surface that serves them.
export function collectOutsideLinks(): OutsideLink[] {
  const links = merge([
    ...checkPageOutsideLinks(),
    ...calculatorOutsideLinks(),
    ...brainOutsideLinks(),
    ...reportOutsideLinks(),
    ...sampleReportOutsideLinks(),
  ]);
  // The sample serves the certificate pattern (with its
  // fiction number): record the surface on the pattern
  // entry.
  const pattern = links.find((link) => link.pattern);
  if (pattern && !pattern.shownOn.includes("the sample report")) {
    pattern.shownOn.push("the sample report");
  }
  return links;
}
