import type { DeliveryKind } from "./download";
import { reportViewRoute } from "./report";
import type { ReportDoorIdentity } from "./report-door";

// The success surface (plan step M9.6; Final Sample
// Master, Sample 10 — the Success view, carried in
// 17 Nov 2026), built beside the fulfilment call as
// the step's prep pins it. One surface for all three
// completions — paid, free-window and gifted — in the
// sample's frame, with the differences the prep rules:
//
//   - VIEWING ONLY (the D21 amendment; named test
//     (k)): the report is read on screen through the
//     view route; the PDF is obtainable ONLY via the
//     delivery email's signed link. No download button
//     or link, no share buttons, anywhere on the
//     surface — the only sharing route is the gift
//     link in the paid email.
//   - TIMING: the buyer's screen can arrive before the
//     worker has finished (a cold home composes for
//     seconds-to-minutes), so the surface is built from
//     the fulfilment claim's state: "preparing" until
//     the claim stands fulfilled, then the full
//     surface. The delivery email remains the durable
//     copy either way.
//   - KIND: the "One more thing" mystery-extra block
//     is PAID-only, mirroring the email rule — a free
//     or gifted delivery's email carries no gift block,
//     so its success screen promises no extra. The
//     gifted completion carries the gift-applied banner
//     instead (the claim samples' promise, kept: "we'll
//     apply your free report for you, so there's
//     nothing to pay").
//
// The sample's report card counts "nine sections" —
// stale since the ten-section regrouping (21 Nov
// 2026); the line below is composed from the ten-
// section set, as the delivery email already composes
// it, and the Master is conformed in this step's stack
// (prep deviation 1).

export type ReportSuccessState = "preparing" | "ready";

export interface ReportSuccessView {
  state: ReportSuccessState;
  kind: DeliveryKind;
  // The sample's badge, paid completions only: the
  // tick is the component's mark; this is its words.
  badge: string | null;
  heading: string;
  homeSubject: string;
  homeSubline: string | null;
  lede: string;
  // The report card (ready only): the ten-section line
  // and the viewing route's button.
  sectionsLine: string | null;
  viewHref: string | null;
  viewLabel: string;
  // The email block: the sample's card, with the
  // buyer's own address echoed where the sample echoes
  // it (Sample 11's convention).
  emailHeading: string;
  emailLead: string;
  email: string;
  emailTail: string;
  // Paid-only (see the header): the mystery extra.
  mysteryEyebrow: string | null;
  mysteryLine: string | null;
  // Gifted-only: the gift-applied banner's line.
  giftBannerLine: string | null;
  shortlistHref: string;
  shortlistLabel: string;
}

export const SUCCESS_BADGE_PAID = "Payment received — thank you";
export const SUCCESS_HEADING_READY = "Your report is ready";
export const SUCCESS_HEADING_PREPARING = "Your report is being prepared";
export const SUCCESS_LEDE_READY =
  "Your detailed report for this home is finished. You can read it on screen right now, and the PDF is on its way to your inbox for keeping.";
export const SUCCESS_LEDE_PREPARING =
  "We're putting your detailed report together now. This page will show it as soon as it's ready — and the PDF is coming to your inbox for keeping.";
// Sample 10's card line, composed from the ten-section
// set (see the header): the sections in their order,
// in the sample's compressed style.
export const SUCCESS_SECTIONS_LINE =
  "All ten sections are ready — price and this home, sold prices, schools and nurseries, health, air and crime, what's nearby, the neighbourhood, home, costs and risks, flood risk, and the questions to ask the seller, with the sources and notes at the end.";
export const SUCCESS_VIEW_LABEL = "View your report";
export const SUCCESS_EMAIL_HEADING = "Your PDF is coming by email";
export const SUCCESS_EMAIL_LEAD_READY = "We've sent an email with your download link to ";
export const SUCCESS_EMAIL_LEAD_PREPARING = "We'll send an email with your download link to ";
export const SUCCESS_EMAIL_TAIL =
  ". It should arrive within a few minutes — if it isn't there, have a quick look in your spam or junk folder, as first emails from us sometimes land there.";
// Sample 10's tease strip, verbatim — its eyebrow and
// line are this surface's own (the buy bar carries its
// own form of the same tease).
export const SUCCESS_MYSTERY_EYEBROW = "One more thing";
export const SUCCESS_MYSTERY_LINE = "There's a little extra waiting in that email, on us.";
// The gift-applied banner (the claim samples' approved
// promise, in banner form): the gift was applied, and
// there is nothing to pay.
export const GIFT_APPLIED_BANNER_LINE =
  "Your free report gift has been applied — there's nothing to pay for this report.";
export const SUCCESS_SHORTLIST_LABEL = "See your shortlist";

export function buildReportSuccessView(input: {
  state: ReportSuccessState;
  kind: DeliveryKind;
  identity: ReportDoorIdentity;
  email: string;
}): ReportSuccessView {
  const ready = input.state === "ready";
  const identity = input.identity;
  return {
    state: input.state,
    kind: input.kind,
    badge: input.kind === "paid" ? SUCCESS_BADGE_PAID : null,
    heading: ready ? SUCCESS_HEADING_READY : SUCCESS_HEADING_PREPARING,
    homeSubject:
      identity.kind === "home"
        ? identity.subject
        : identity.kind === "postcode"
          ? identity.postcode
          : "Your home",
    homeSubline: identity.kind === "generic" ? null : identity.subline,
    lede: ready ? SUCCESS_LEDE_READY : SUCCESS_LEDE_PREPARING,
    sectionsLine: ready ? SUCCESS_SECTIONS_LINE : null,
    viewHref: ready
      ? reportViewRoute(
          identity.kind === "generic" ? "" : identity.postcode,
          identity.kind === "home" ? identity.homeKey : null,
        )
      : null,
    viewLabel: SUCCESS_VIEW_LABEL,
    emailHeading: SUCCESS_EMAIL_HEADING,
    emailLead: ready ? SUCCESS_EMAIL_LEAD_READY : SUCCESS_EMAIL_LEAD_PREPARING,
    email: input.email,
    emailTail: SUCCESS_EMAIL_TAIL,
    mysteryEyebrow: input.kind === "paid" ? SUCCESS_MYSTERY_EYEBROW : null,
    mysteryLine: input.kind === "paid" ? SUCCESS_MYSTERY_LINE : null,
    giftBannerLine: input.kind === "gifted" ? GIFT_APPLIED_BANNER_LINE : null,
    shortlistHref: "/shortlist",
    shortlistLabel: SUCCESS_SHORTLIST_LABEL,
  };
}
