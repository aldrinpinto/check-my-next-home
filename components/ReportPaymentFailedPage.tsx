import Link from "next/link";

import type { ReportPaymentFailedView } from "../lib/report-payment-failed";
import PostcodeBox from "./PostcodeBox";

// The payment-failed page (plan step M9.7; Final
// Sample Master, Sample 12): a mechanical renderer of
// lib/report-payment-failed.ts's view, in the success
// surface's frame — the home, the lede with its
// emphasis, the reasons card, the check-another card,
// and the sample's link row: back to the free check,
// and the shortlist. Nothing here takes a payment or
// starts one: the road back runs through the free
// check, exactly as the sample draws it.
export default function ReportPaymentFailedPage({ view }: { view: ReportPaymentFailedView }) {
  return (
    <main className="journey-page report-door report-failed">
      <h1>{view.heading}</h1>
      <p className="report-success__home">
        <strong>{view.homeSubject}</strong>
        {view.homeSubline ? `, ${view.homeSubline}` : ""}
      </p>
      <p className="type-lead report-payment__lede">
        {view.ledeLead}
        <strong>{view.ledeStrong}</strong>
        {view.ledeTail}
      </p>

      <section className="report-door__card">
        <h2>{view.reasonsHeading}</h2>
        <ul className="report-failed__reasons">
          {view.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>

      {/* PF-22 (payment-flow parity stack, 22 Nov 2026):
          the still line stands below the reasons card as
          its own paragraph, as Sample 12 sets it — not
          as the card's last line. */}
      <p className="report-failed__still">{view.stillLine}</p>

      <section className="report-door__card">
        <h2>{view.checkAnotherHeading}</h2>
        <p className="report-door__card-line">{view.checkAnotherLine}</p>
        {/* BUG-139 (22 Nov 2026): the one postcode box,
            wired as the landing page wires it — the
            hand-rolled /search form that stood here was
            the success surface's BUG-135 fault on its
            twin: no suggestions as you type and no pick
            flow for a visitor whose payment just failed.
            The card, its heading and its line are
            unchanged; the old form's PF-18 dress is
            mapped onto the box's markup in
            app/globals.css. */}
        <PostcodeBox bare />
      </section>

      <p className="journey-actions report-failed__links">
        {/* BUG-402: client-side, so the return to the
            free check restores the rendered results from
            the router cache instead of re-rendering them
            behind the fallback. */}
        <Link href={view.backHref} prefetch={false}>
          ← {view.backLabel}
        </Link>
        <Link href={view.shortlistHref} prefetch={false}>
          {view.shortlistLabel}
        </Link>
      </p>
    </main>
  );
}
