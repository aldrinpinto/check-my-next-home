import { SAMPLE_REPORT_LINK_TEXT, SAMPLE_REPORT_PATH } from "./home";
import { homeRoute, isNotCoveredNation, type Nation } from "./journey";
import { FLOOD_UPSELL_LEAD } from "./results";
import { REPORT_DOOR_STATE, REPORT_PRICE_LABEL, type ReportDoorState } from "./site";

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

// The nation hold (founder ruling, 22 Nov 2026 — Road B,
// superseding this step's original R1): the door is
// nation-aware. England and Wales follow the door's
// checked-in state exactly; Scotland and Northern
// Ireland stay on the HOLDING form — no payment taken,
// no free-window fulfilment — until their own later
// milestone lands their data and lifts the hold. The
// nation is the brains' own detection (lib/journey.ts:
// the directory's filed area code for the postcode,
// never the outward postcode letters, whose areas
// straddle borders). An unknown nation follows the
// state: the hold names the two nations it holds, and
// nothing else.
export function effectiveReportDoorState(
  nation: Nation,
  state: ReportDoorState = REPORT_DOOR_STATE,
): ReportDoorState {
  // BUG-106 stack (interim-free door): Scotland and
  // Northern Ireland are served the detailed report
  // FREE until Scotland flips to paid at M14 — the
  // nation hold is replaced by the free (window)
  // fulfilment path: no payment page, no charge, the
  // delivery email captured mandatorily, fulfilment
  // riding the existing window/claim machinery. A free
  // nation delivery is kind "free", never "paid", so no
  // gift issues from it (D21 unchanged).
  return isNotCoveredNation(nation) ? "window" : state;
}

// The free-nation window wording: a Scotland/NI home is
// not in a launch window — its report is free because
// of where it is, until Scotland's paid opening at M14.
export const REPORT_FREE_NATION_STATE_LINE =
  "The detailed report is free for homes in Scotland and Northern Ireland. The free check stays free in full.";
export const REPORT_FREE_NATION_LEDE =
  "You've seen the headlines for this home, free. The detailed report for homes in Scotland and Northern Ireland is free too — give us the email to send it to, and it's on its way.";

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
  // The state seam (REPORT_DOOR_STATE): this builder is
  // the HOLDING form. M9.6 filled the other two states
  // on their own surfaces — "paid" is the payment page
  // (lib/report-payment.ts) and "window" is the window
  // view below — and the route renders by the constant,
  // so the flip and the lines always land together.
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

// ----------------------------------------------------------------
// The window state (plan step M9.6; the free launch
// window, D44) — the lines M7.6's gap check deferred to
// this build, and the surface the deferred free-window
// Regression test pins: the door offers the report FREE
// with the £4.99 still shown as the normal price, and
// gift tokens inactive — which here means what it means
// everywhere before a paid report exists: the gift is
// never named (D21's surprise rule holds in the window
// exactly as in holding). The fulfilment is an email
// capture and nothing else: the address the report is
// delivered to, claimed as a free fulfilment and
// delivered by the same worker that delivers a bought
// report.

export interface ReportWindowView {
  heading: string;
  subline: string | null;
  lede: string;
  contentsHeading: string;
  contents: string[];
  stateLine: string;
  emailLabel: string;
  emailHelp: string;
  emailPlaceholder: string;
  emailError: string;
  buttonLabel: string;
  sampleHref: string;
  sampleLabel: string;
  backHref: string;
  backLabel: string;
}

// The window state's one plain state line, in the
// holding line's own shape: the report is free during
// the window, the £4.99 stands as its normal price, and
// the free check stays free in full.
export const REPORT_DOOR_WINDOW_STATE_LINE = `The detailed report is free during the launch window. Its normal price is ${REPORT_PRICE_LABEL} — one payment — and the free check stays free in full.`;

export const REPORT_WINDOW_LEDE =
  "You've seen the headlines for this home, free. During the launch window the detailed report is free too — give us the email to send it to, and it's on its way.";

// The window form's email block: Sample 9's own words,
// shared with the payment page's block by pin (a test
// holds the two copies equal, the refund-line pattern)
// — the delivery email means the same thing in both
// states, so it is worded the same way.
export const REPORT_WINDOW_EMAIL_LABEL = "Email address for delivery";
export const REPORT_WINDOW_EMAIL_HELP =
  "Your report is delivered by email — there are no accounts and no passwords to remember.";
export const REPORT_WINDOW_EMAIL_PLACEHOLDER = "you@example.co.uk";
export const REPORT_WINDOW_EMAIL_ERROR =
  "That email address doesn't look quite right — check it and try again, so your report reaches you.";
export const REPORT_WINDOW_BUTTON_LABEL = "Send my free report";

export function buildReportWindowView(
  identity: ReportDoorIdentity,
  options: { freeNation?: boolean } = {},
): ReportWindowView {
  const base = {
    subline: null as string | null,
    lede: options.freeNation ? REPORT_FREE_NATION_LEDE : REPORT_WINDOW_LEDE,
    contentsHeading: REPORT_DOOR_CONTENTS_HEADING,
    contents: REPORT_DOOR_CONTENTS,
    stateLine: options.freeNation ? REPORT_FREE_NATION_STATE_LINE : REPORT_DOOR_WINDOW_STATE_LINE,
    emailLabel: REPORT_WINDOW_EMAIL_LABEL,
    emailHelp: REPORT_WINDOW_EMAIL_HELP,
    emailPlaceholder: REPORT_WINDOW_EMAIL_PLACEHOLDER,
    emailError: REPORT_WINDOW_EMAIL_ERROR,
    buttonLabel: REPORT_WINDOW_BUTTON_LABEL,
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
