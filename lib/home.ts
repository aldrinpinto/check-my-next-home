// M7.2 — the home page's copy, in one place. The hero lines,
// the audience cards and the "what it checks" list are pinned
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
export const POSTCODE_BOX_LABEL = "Postcode or address";
export const POSTCODE_BOX_HINT = "For example, CM3 2JT — or the full address, with its postcode.";
export const POSTCODE_BOX_BUTTON = "Check a home";

// The hero's imagery strip (D70 R2): three captioned panels
// between the sub-line and the box — families moving in,
// drawn in the one-line illustration language (the same
// three scenes as the original card art). Captions are the
// Final Design's, verbatim.
export const HOME_HERO_PANELS = [
  {
    title: "Moving-in day",
    line: "Boxes in the hall, kettle on",
    art: "/illustrations/card-boxes.svg",
    artAlt: "Line drawing of moving boxes under a roof",
  },
  {
    title: "Keys in hand",
    line: "The first morning in the new home",
    art: "/illustrations/card-key.svg",
    artAlt: "Line drawing of a key in a new front door",
  },
  {
    title: "A dog at the door",
    line: "Pets are family too",
    art: "/illustrations/card-dog.svg",
    artAlt: "Line drawing of a dog waiting by the door",
  },
] as const;

// The example-check action beside the box (D70 R2/D14): the
// design's second hero action, pointing at the sample
// report (SAMPLE_REPORT_PATH below).
export const EXAMPLE_CHECK_LABEL = "See an example check";

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

// The family-names panel (D70 R4): the homepage's checks in
// family language, the Final Design's panel verbatim.
// Homepage only — the panel and the report keep their plain
// names (the note says so, as the design's panel does).
export const HOME_FAMILY_NAMES_LEAD = "On the homepage, checks speak family language:";
export const HOME_FAMILY_NAMES = [
  "Schools & nurseries near the door",
  "Safety in plain numbers",
  "Flood risk at this address",
  "The real cost of living there",
  "Health near the door",
  "Room to walk the dog",
] as const;
export const HOME_FAMILY_NAMES_NOTE =
  "Homepage only — the panel and report keep their plain names.";

// "What it checks" — one item per row of the checking screen's
// nine rows (M7.3's step text). At M7.2 the names were family
// language; D70 R4 re-bases the list on the plain check names
// as a contents list (the family language now lives in the
// family-names panel above it), so the names below are the
// checking screen's own row labels, pinned against them in
// the tests. The gloss lines are unchanged. The items carry
// no links at this step; M7.11 wires them to the /check pages.
export const HOME_WHAT_IT_CHECKS_HEADING = "What it checks";
export const HOME_WHAT_IT_CHECKS = [
  {
    name: "Schools — nearest primary & secondary, with Ofsted",
    line: "The primary and secondary schools closest to the front door, with the distance to each.",
  },
  {
    name: "Nurseries & pre-schools",
    line: "Places for the youngest children, nearest first.",
  },
  {
    name: "GP, NHS dentist & pharmacy",
    line: "The nearest GP surgery, NHS dentist and pharmacy.",
  },
  {
    name: "Hospitals, A&E & maternity",
    line: "The nearest hospital, emergency department and maternity unit.",
  },
  {
    name: "Parks, vets & dog-walking areas",
    line: "Green spaces to play in and walk the dog, and the nearest vet.",
  },
  {
    name: "Shops & transport — supermarkets, bus stops, stations",
    line: "The nearest shops, bus stops and stations.",
  },
  {
    name: "Food & drink, leisure & gyms, places to visit, worship & libraries",
    line: "Food and drink, gyms and leisure, places to visit, places of worship and libraries.",
  },
  {
    name: "Flood — rivers & sea, and surface water",
    line: "The published flood maps for the area, shown exactly as they are published.",
  },
  {
    name: "Sold history, council tax, EPC, planning applications & constraints, ownership",
    line: "Sold prices nearby, the council tax scale, energy certificates, planning constraints and ownership.",
  },
] as const;

// The manifesto block, once, mid-page (M7.2's text): the block
// headline, then the manifesto line itself (SITE_MANIFESTO in
// lib/site.ts — the one source), then one short line on why
// every check exists.
export const HOME_MANIFESTO_HEADLINE = "A house is bricks. A home is family.";
// D70 R3: the chosen homepage's why line, verbatim (the
// Final Design's "Final — chosen homepage" frame).
export const HOME_MANIFESTO_WHY =
  "Every check on this page exists because a family will live with the answer — the school run, the dog walk, the monthly bills, the street after dark — long after the listing is forgotten.";

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
