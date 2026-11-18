import { SAMPLE_REPORT_LINK_TEXT, SAMPLE_REPORT_PATH } from "./home";
import { homeRoute } from "./journey";
import { FLOOD_UPSELL_LEAD } from "./results";
import { REPORT_DOOR_STATE, REPORT_PRICE_LABEL } from "./site";

// The report door (plan step M7.6): what /report renders
// while the door is in its holding state (REPORT_DOOR_STATE
// in lib/site.ts). The page is a shell in the /shortlist
// pattern — it derives nothing from the check bundles, so
// it renders from a cold deep link, a refreshed tab or a
// shared URL; identity resolution (the serve layer's
// directory read) only names the home, and any failure
// falls back to the generic form, never an error.
//
// The holding page's contents are pinned by ruling R5 of
// the step's gap check, reconciled with the founder's
// later rulings: the page takes the merged payment page's
// structure (Final Sample Master, Payment view — heading
// "The detailed report for …", the compact "What the
// detailed report adds" list, the one-payment line) minus
// the payment form itself, which M9 builds on this same
// page. NO email capture, no notify-me form, no waiting
// list: the step bars fake checkout, and an email capture
// is a personal-data collection no step has authorised.
// No gift or Check Together mention either (D21's surprise
// rule) — the mystery tease lives in the buy bar only; it
// is not one of this page's permitted places.

export type ReportDoorIdentity =
  | {
      kind: "home";
      // The home's address line as the results page heads
      // it ("19 Birkdale Rise"), and the line beneath
      // ("Hatfield Peverel, CM3 2JT") — the payment page's
      // de-duplicated form: the street name appears once.
      subject: string;
      subline: string | null;
      postcode: string;
      homeKey: string;
    }
  | { kind: "postcode"; postcode: string; subline: string | null }
  | { kind: "generic" };

export interface ReportDoorView {
  heading: string;
  subline: string | null;
  contentsHeading: string;
  contents: string[];
  priceLine: string;
  stateLine: string;
  sampleHref: string;
  sampleLabel: string;
  backHref: string;
  backLabel: string;
}

export const REPORT_DOOR_CONTENTS_HEADING = "What the detailed report adds";

// What the report adds, in the report's own real contents
// terms (the Sample report's nine sections): the depth
// behind every headline. The flood item is the F4-softened
// pinned lead (lib/results.ts) — location maps, never a
// promise of flood map pictures; M8.3 is that promise's
// acceptance test when the genuine maps are built.
export const REPORT_DOOR_CONTENTS: string[] = [
  "Crime month by month for the last 12 months, with every recorded type — not just the total.",
  "Fuller school detail — the schools near this home, with their Ofsted ratings and inspection dates.",
  "The fuller sold history — this home's own recorded sales and the street's, in full.",
  FLOOD_UPSELL_LEAD,
  "The questions to ask the seller, with every figure's source and date — in one dated, print-ready document.",
];

// The payment page's price line, carried verbatim: the
// price itself rides on the state line below (and on
// every button that led here), never as a "was" price.
export const REPORT_DOOR_PRICE_LINE = "One payment. No subscription, nothing further to pay.";

// The holding state's one plain state line (R5(4)):
// reports are coming in the next stage, the £4.99 is the
// normal price, and the free check stays free in full.
export const REPORT_DOOR_HOLDING_STATE_LINE = `The detailed report is coming in the next stage. It will cost ${REPORT_PRICE_LABEL} — one payment — and the free check stays free in full.`;

export function buildReportDoorView(identity: ReportDoorIdentity): ReportDoorView {
  // The state seam (REPORT_DOOR_STATE): "window" and
  // "paid" are M9.6's to fill when it pins their lines;
  // until that step lands the door renders the holding
  // form in every state — the constant is a reviewed code
  // change, so the flip and the lines land in the same
  // commit at M9.6, never apart.
  const stateLine = REPORT_DOOR_HOLDING_STATE_LINE;
  void REPORT_DOOR_STATE;

  const base = {
    subline: null as string | null,
    contentsHeading: REPORT_DOOR_CONTENTS_HEADING,
    contents: REPORT_DOOR_CONTENTS,
    priceLine: REPORT_DOOR_PRICE_LINE,
    stateLine,
    sampleHref: SAMPLE_REPORT_PATH,
    sampleLabel: SAMPLE_REPORT_LINK_TEXT,
  };

  switch (identity.kind) {
    case "home":
      return {
        ...base,
        heading: `The detailed report for ${identity.subject}`,
        subline: identity.subline,
        backHref: homeRoute(identity.postcode, identity.homeKey),
        backLabel: "Back to your free check",
      };
    case "postcode":
      return {
        ...base,
        heading: `The detailed report for ${identity.postcode}`,
        subline: identity.subline,
        backHref: homeRoute(identity.postcode),
        backLabel: "Back to your free check",
      };
    case "generic":
      return {
        ...base,
        heading: "The detailed report",
        backHref: "/",
        backLabel: "Back to the home page",
      };
  }
}
