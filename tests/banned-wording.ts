// The banned-wording union — ONE shared list (M6.10, decision D38).
//
// Until M6.10 this list lived as a local constant inside
// tests/short-bundle.test.ts, and every other scan kept its own
// copy or subset. A copied list is a future divergence, so the
// union now lives here and every scan imports it: the short
// bundle's inherited scan, and the SEO wording scan over the
// locked titles, metas and identity constants (tests/seo.test.ts).
//
// The list is the union of the per-brain banned lists:
//   crime (D24), flood (D25), sold prices (D23), area (D26).
// Terms are matched as lowercase substrings of served string
// VALUES — field names are data shapes, not wording.
//
// Two ruled exceptions travel with the list, because the scans
// that use it share them:
//   - VALUATION_DISCLAIMER: the median explainers state the
//     figure "is not a valuation of this home" (D23) — a ruled
//     negation. Scans strip that exact sentence, then require
//     "valuation" to appear nowhere else.
//   - GIGABIT_FIGURE: D36's broadband headline IS a percentage
//     — the gigabit figure — carried verbatim in the section's
//     line. Scans strip a percentage figure in that line's
//     exact shape, then require "%" to appear in no other
//     served string.
export const BANNED_WORDING: readonly string[] = [
  // crime (D24)
  "score",
  "rating",
  "rated",
  "safe",
  "unsafe",
  "dangerous",
  "high-crime",
  "low-crime",
  "crime rate",
  "rising",
  "falling",
  "trend",
  // flood (D25)
  "flood-proof",
  "floodproof",
  "will flood",
  "won't flood",
  "no flood risk",
  "at risk",
  "insurable",
  "uninsurable",
  "you may struggle",
  "lenders require",
  // sold prices (D23)
  "worth",
  "estimate",
  "bargain",
  "overpriced",
  "underpriced",
  "good price",
  "below the median",
  "above the median",
  "cheaper",
  "dearer",
  // area (D26)
  "quiet",
  "peaceful",
  "noisy",
  "clean air",
  "polluted",
  "healthy air",
  "affluent",
  "poor area",
  "good area",
  "family-friendly",
  "desirable",
  "good schools",
  "your home is listed",
  "no constraints",
  "no nature",
  "protected",
  "deprived",
];

export const VALUATION_DISCLAIMER = "It is not a valuation of this home.";

export const GIGABIT_FIGURE = /available to [\d.]+% of premises/g;
