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

// The postcode box's furniture. The label and hint follow the
// kit's own precedent (the kitchen sink's field); the button is
// the page's main action. The box itself is inert at M7.2 —
// M7.3 wires the journey into it (components/PostcodeBox.tsx).
export const POSTCODE_BOX_LABEL = "Postcode";
export const POSTCODE_BOX_HINT = "For example, CM3 2JT.";
export const POSTCODE_BOX_BUTTON = "Check a home";

// The three audience cards, directly under the hero. Each names
// the checks that matter to that move, in family language, and
// links to the one postcode box — there is no audience mode and
// no different check set behind a card: the results are the
// same for everyone. The art is the one-line illustration set
// (public/illustrations/, drawn for this step in the Roof-Tick's
// own line language).
export const AUDIENCE_CARD_BUTTON = "Start with a postcode";
export const HOME_AUDIENCE_CARDS = [
  {
    title: "Moving as a couple",
    line: "Shops and stations for the everyday, broadband for working from home, and the real cost of living there — council tax, energy, and what homes nearby have sold for.",
    art: "/illustrations/card-key.svg",
    artAlt: "Line drawing of a key in a new front door",
  },
  {
    title: "Moving with kids",
    line: "Schools and nurseries, doctors and hospitals, parks to play in — and safety in plain numbers: the recorded crime counts for the area.",
    art: "/illustrations/card-boxes.svg",
    artAlt: "Line drawing of moving boxes under a roof",
  },
  {
    title: "Moving with pets",
    line: "Parks and dog-walking areas on the doorstep, the nearest vet, and green space for muddy paws.",
    art: "/illustrations/card-dog.svg",
    artAlt: "Line drawing of a dog waiting by the door",
  },
] as const;

// The hero's scene: families moving in, drawn in the same
// one-line language (public/illustrations/hero-moving-in.svg).
export const HOME_HERO_ART = "/illustrations/hero-moving-in.svg";
export const HOME_HERO_ART_ALT = "Line drawing of a home with moving boxes being carried in";

// "What it checks" — one item per row of the checking screen's
// nine rows (M7.3's step text), each translated into family
// language. The items carry no links at this step; M7.11 wires
// them to the /check pages.
export const HOME_WHAT_IT_CHECKS_HEADING = "What it checks";
export const HOME_WHAT_IT_CHECKS = [
  {
    name: "Schools near the home",
    line: "The primary and secondary schools closest to the front door, with the distance to each.",
  },
  {
    name: "Nurseries and pre-schools",
    line: "Places for the youngest children, nearest first.",
  },
  {
    name: "Doctors, dentists and pharmacies",
    line: "The nearest GP surgery, NHS dentist and pharmacy.",
  },
  {
    name: "Hospitals, A&E and maternity care",
    line: "The nearest hospital, emergency department and maternity unit.",
  },
  {
    name: "Parks, vets and dog walks",
    line: "Green spaces to play in and walk the dog, and the nearest vet.",
  },
  {
    name: "Shops and getting about",
    line: "The nearest shops, bus stops and stations.",
  },
  {
    name: "Eating out, keeping fit and days out",
    line: "Food and drink, gyms and leisure, places to visit, places of worship and libraries.",
  },
  {
    name: "Flood risk",
    line: "The published flood maps for the area, shown exactly as they are published.",
  },
  {
    name: "What homes sell for, and the running costs",
    line: "Sold prices nearby, the council tax scale, energy certificates, planning constraints and ownership.",
  },
] as const;

// The manifesto block, once, mid-page (M7.2's text): the block
// headline, then the manifesto line itself (SITE_MANIFESTO in
// lib/site.ts — the one source), then one short line on why
// every check exists.
export const HOME_MANIFESTO_HEADLINE = "A house is bricks. A home is family.";
export const HOME_MANIFESTO_WHY =
  "Every check exists because a listing shows a house — and your family will live in the home.";

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
