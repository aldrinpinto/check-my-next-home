import type { ReportPaymentFailedView } from "../lib/report-payment-failed";

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
        <p>{view.stillLine}</p>
      </section>

      <section className="report-door__card">
        <h2>{view.checkAnotherHeading}</h2>
        <p>{view.checkAnotherLine}</p>
        <form action="/search" method="get" className="report-success__search">
          <label className="report-success__sr" htmlFor="failed-postcode">
            Postcode
          </label>
          <input
            className="field__input"
            id="failed-postcode"
            name="postcode"
            type="text"
            autoComplete="postal-code"
            placeholder="Enter a postcode, street or town — e.g. SW1A 1AA"
          />
          <button type="submit" className="btn btn--brass">
            Check this home
          </button>
        </form>
      </section>

      <p className="journey-actions report-failed__links">
        <a href={view.backHref}>← {view.backLabel}</a>
        <a href={view.shortlistHref}>{view.shortlistLabel}</a>
      </p>
    </main>
  );
}
