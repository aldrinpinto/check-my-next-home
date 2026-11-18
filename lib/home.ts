// M7.2 — the home page's copy, in one place. The hero lines,
// the audience cards and the section copy are pinned
// verbatim by tests/home-page.test.ts; the page renders these
// constants and never retypes them, so the wording the wording
// review passed is the wording that ships.
//
// Family language lives on this page only (M7.2's text): the
// checks are introduced here in the words a family uses, while
// the results panel and the report keep their plain, existing
// check names unchanged.

// The hero sub-line, pinned verbatim by M7.2's step text.
export const HOME_HERO_SUBLINE =
  "We check what the listing doesn't tell you — schools and nurseries, safety in plain numbers, flood risk, and the real cost of living there.";

// The postcode box's furniture. At M7.2 the label was exactly
// "Postcode" with the hint "For example, CM3 2JT.", and the
// box itself was inert. M7.3 wires the journey into the box
// (components/PostcodeBox.tsx) and re-pins the label and hint
// verbatim for the wider input (fold-in 7): a full or partial
// postcode, or an address or street/building name carrying a
// postcode. The button is unchanged.
//
// Fidelity pass 2 (founder, 17 Nov 2026): two rulings land
// here. (a) The founder's own postcode never appears in
// visitor-facing copy — the hint's example is the neutral
// SW1A 1AA, here and everywhere the example ran (the box's
// placeholder, the unplaced notice line, the kitchen-sink
// specimens). (b) The hero's box takes the decided sample
// page's bare form: no visible label or hint, the field
// itself carrying the placeholder below, and the Brass
// button in the sample's words. The labelled form survives
// on the journey's own pages (the wider-area banner, the
// whole-check failure), where the box is a retry, not the
// page's main action.
export const POSTCODE_BOX_LABEL = "Postcode or address";
export const POSTCODE_BOX_HINT = "For example, SW1A 1AA — or the full address, with its postcode.";
export const POSTCODE_BOX_BUTTON = "Check a home";
export const POSTCODE_BOX_PLACEHOLDER_BARE = "Enter a postcode — e.g. SW1A 1AA";
export const POSTCODE_BOX_BUTTON_BARE = "Check this home";

// The small line under the hero's search row (the decided
// sample page's, verbatim — fidelity pass 2). The hero's
// imagery panels and the example-check action that D70 R2
// placed beside the box are retired by the same pass: the
// sample goes from the sub-line straight to the search row,
// and the sample report's doors are the band's action and
// the closing section. The panels' illustrations stay in
// public/illustrations — the dog still serves the shortlist's
// empty state.
export const HOME_HERO_SMALL_LINE =
  "Free headlines for every home, from named official sources. Detailed report £4.99 — one home, no account, no subscription.";

// The source strip directly under the hero (founder's
// ruling, 18 Nov 2026 — the samples' Version B, chosen over
// the text strip and over the bodies' real logos): the
// heading and the eight sources' short-form names, in the
// strip's order. Multi-word names stack on two lines in
// their lockups, so the lines are the pinned copy; the
// glyphs beside them are drawn in components/SourceStrip.tsx
// — drawn lockups in the sample's form, never the bodies'
// real logos and never image files.
export const HOME_SOURCE_STRIP_HEADING = "Powered by official UK data";
export const HOME_SOURCE_STRIP_SOURCES = [
  { id: "hmlr", lines: ["HM Land", "Registry"] },
  { id: "ea", lines: ["Environment", "Agency"] },
  { id: "police", lines: ["Police.uk"] },
  { id: "ofcom", lines: ["Ofcom"] },
  { id: "defra", lines: ["Defra"] },
  { id: "ons", lines: ["ONS"] },
  { id: "dfe", lines: ["DfE"] },
  { id: "epc", lines: ["EPC", "Register"] },
] as const;
export type HomeSourceStripSourceId = (typeof HOME_SOURCE_STRIP_SOURCES)[number]["id"];

// The three audience cards, directly under the hero (D70
// R3): a title, a one-line intro and the family-language
// check list. The copy is the decided landing page's
// (13 Nov 2026) verbatim — where that page and the Final
// Design's homepage mock differ, the decided page governs
// the landing. There is no audience mode and no different
// check set behind a card: the results are the same for
// everyone.
export const HOME_CARDS_HEADING = "Moving looks different for every family";
export const HOME_CARDS_SUB =
  "Whoever is moving with you, we lead with the checks that matter to your family's life there.";
export const HOME_AUDIENCE_CARDS = [
  {
    title: "Moving as a couple",
    intro: "A first home together, or the next chapter — it's about the life you'll live there.",
    checks: [
      "Places to eat and drink out nearby",
      "Gyms, parks and places to go nearby, for evenings and weekends",
      "Trains and buses for the commute",
      "The real crime numbers for the streets around the home",
    ],
  },
  {
    title: "Moving with kids",
    intro: "School runs and childcare shape family life — so these are the first things we check.",
    checks: [
      "Nurseries, pre-schools and childminders nearby",
      "Primary, secondary, grammar and independent schools",
      "Parks and places to visit at weekends",
      "Doctors and dentists nearby",
    ],
  },
  {
    title: "Moving with pets",
    intro: "A home has to work for your pets too — the dog, the cat, or whoever else shares it.",
    checks: [
      "Vets nearby when your pet needs one",
      "Parks and green spaces nearby, for the daily walk and play",
      "Pet boarding nearby, for holidays",
      "Groomers to keep them looking pretty, pet shops for food and everything else",
    ],
  },
] as const;

// Retired at fidelity pass 2 (founder, 17 Nov 2026): the
// family-names panel (D70 R4) — a dashed annotation box the
// founder's section-by-section comparison caught rendering
// an internal design note as page content; the sample has
// nothing there, so the panel and its constants are gone.
// Also retired: the "What it checks" ruled list (D70 R4's
// plain-names contents list) — the sample carries ONE tour
// of the checks, the tile grid below; two tours on one page
// was the fault. The checking screen's own rows keep their
// plain names in lib/journey.ts, untouched.

// "What we check for you" — the decided landing page's
// nine-tile grid (founder follow-on to D70, 17 Nov 2026: the
// landing matches the decided sample page exactly). Titles
// and lines are the sample's verbatim (the sample carries
// copy-decisions changes 1–8 as applied 13 Nov 2026). The
// grid is the homepage's family-language tour of the checks
// — after fidelity pass 2, its only one.
export const HOME_CHECK_TILES_HEADING = "What we check for you";
export const HOME_CHECK_TILES_SUB =
  "The checks that matter for family life — schools, health, safety, home risks and the cost of living — all from named official sources.";
export const HOME_CHECK_TILES = [
  {
    title: "Schools, nurseries & childminders",
    line: "Find the nearest primaries, secondaries and nurseries — the ones that matter for the school run.",
    href: "/check/schools",
  },
  {
    title: "Doctors, dentists & vets",
    line: "GPs, hospitals, dentists, maternity care and vets — there for the moments you really need them.",
    href: "/check/family-essentials",
  },
  {
    title: "Food, leisure & everyday life",
    line: "Shops, food and drink, gyms, libraries, places of worship and places to visit.",
  },
  {
    title: "Safety around the home",
    line: "What crimes were recorded in the area over the past year, and what kind they were — the counts, month by month.",
    href: "/check/crime",
  },
  {
    title: "Your neighbours & the area",
    line: "The make-up of your new neighbourhood — ages, households and ethnicities.",
  },
  {
    title: "Plans that could change the street",
    line: "Planning applications and major schemes nearby.",
    href: "/check/planning-constraints",
  },
  {
    title: "Flood risk",
    line: "Rivers, sea and surface water — plus any live flood warnings today.",
    href: "/check/flood-risk",
  },
  {
    title: "The cost of living",
    line: "Council tax, energy rating, broadband and the monthly cost of owning the home.",
    href: "/check/council-tax-band",
  },
  {
    title: "What homes here actually sold for",
    line: "Recorded sale prices for this home and its street — never a made-up valuation.",
    href: "/check/sold-prices",
  },
] as const;

// "How it works" — the decided landing page's four steps
// (founder follow-on to D70, 17 Nov 2026), verbatim from the
// sample (step 4 carries copy-decisions change 9).
export const HOME_HOW_IT_WORKS_HEADING = "How it works";
export const HOME_HOW_IT_WORKS_SUB = "From postcode to peace of mind in a few minutes.";
export const HOME_HOW_IT_WORKS_STEPS = [
  {
    title: "Enter the postcode",
    line: "Type the postcode of a home you're looking at — on Rightmove, Zoopla, or anywhere.",
  },
  {
    title: "Pick your home",
    line: "Choose the exact address. If we only have part of the postcode, we say so honestly.",
  },
  {
    title: "Read the free headlines",
    line: "Every check's headline fact is free, on every home. No account, no blurred results.",
  },
  {
    title: "Go deeper for £4.99",
    line: "One detailed report for one home — full lists, charts, maps and questions to ask the seller.",
  },
] as const;

// The detailed-report band — the decided landing page's dark
// Deep Forest band (founder follow-on to D70, 17 Nov 2026),
// verbatim from the sample. The CTA points at the sample
// report (SAMPLE_REPORT_PATH below), as the sample's does.
export const HOME_REPORT_BAND_HEADING = "The detailed report";
export const HOME_REPORT_BAND_LINE =
  "Everything the listing doesn't tell you, in one document: full school lists, month-by-month crime, genuine flood maps, sold prices nearby, the cost-of-ownership breakdown, planning applications by name, and questions to ask the seller — all sourced, all dated.";
export const HOME_REPORT_BAND_CTA = "See a sample report";
export const HOME_REPORT_BAND_PRICE = "£4.99";
export const HOME_REPORT_BAND_PRICE_LINES = ["per home · one-off", "no subscription"] as const;

// The manifesto block, once, mid-page (M7.2's text): the block
// headline, then the manifesto line itself (SITE_MANIFESTO in
// lib/site.ts — the one source), then one short line on why
// every check exists.
export const HOME_MANIFESTO_HEADLINE = "A house is bricks. A home is family.";
// Founder follow-on to D70 (17 Nov 2026): the decided sample
// page's why line, verbatim — it supersedes the chosen
// homepage's line D70 R3 carried (the D70 note's judgement
// call 2, reversed by the founder: the sample governs the
// landing, manifesto included).
export const HOME_MANIFESTO_WHY =
  "Behind every check is a family's daily life — the school run, the walk to the park, the monthly bills. That's why we check what the listing doesn't tell you.";

// The SAMPLE report link. The route is the one the header
// already names (components/SiteHeader.tsx, PRIMARY_NAV) and
// M8.9 builds the page behind it; until then the link is a
// known dead end, like the header's own item. The link is
// labelled SAMPLE in its own text, and the line beside it says
// plainly what the sample is — a worked example. M8.9 owns the
// sample itself and its watermarking; this step's watermark
// check is carried there (recorded in docs/frontend-m7.2.md).
export const SAMPLE_REPORT_PATH = "/sample-report";
export const SAMPLE_REPORT_HEADING = "See a full example";
export const SAMPLE_REPORT_LINE =
  "A full worked example of the detailed report, marked SAMPLE — so you can see everything a check finds before you run one.";
export const SAMPLE_REPORT_LINK_TEXT = "See a SAMPLE report";
