import type { ReportSuccessView } from "../lib/report-success";
import SuccessRefresher from "./SuccessRefresher";

// The success surface (plan step M9.6; Final Sample
// Master, Sample 10): a mechanical renderer of
// lib/report-success.ts's view, in the sample's frame —
// the badge, the home, the report card with its viewing
// button, the check-another card, the email card, the
// paid-only mystery strip, the shortlist link.
//
// VIEWING ONLY, in the render as in the view (named
// test (k)): the one report action is the "View your
// report" link to the on-screen report. There is no
// download button or link and no share control of any
// kind — the PDF is obtainable only via the delivery
// email's signed link, and the only sharing route is
// the gift link inside a paid delivery email.

export default function ReportSuccessPage({ view }: { view: ReportSuccessView }) {
  return (
    <main className="journey-page report-door report-success">
      {view.state === "preparing" && <SuccessRefresher />}
      {view.badge && (
        <p className="report-success__badge">
          <span aria-hidden="true">✓</span> {view.badge}
        </p>
      )}
      {view.giftBannerLine && (
        <p className="report-success__gift-banner" role="status">
          {view.giftBannerLine}
        </p>
      )}
      <h1>{view.heading}</h1>
      <p className="report-success__home">
        <strong>{view.homeSubject}</strong>
        {view.homeSubline ? `, ${view.homeSubline}` : ""}
      </p>
      <p className="type-lead report-payment__lede">{view.lede}</p>

      {view.sectionsLine && view.viewHref && (
        <section className="report-door__card">
          <p className="report-success__sections">{view.sectionsLine}</p>
          <p className="journey-actions">
            <a className="btn btn--forest" href={view.viewHref}>
              {view.viewLabel}
            </a>
          </p>
        </section>
      )}

      <section className="report-door__card">
        <h2>Check another home</h2>
        <p>The headlines are always free — check the next home you&apos;re considering.</p>
        <form action="/search" method="get" className="report-success__search">
          <label className="report-success__sr" htmlFor="success-postcode">
            Postcode
          </label>
          <input
            className="field__input"
            id="success-postcode"
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

      <section className="report-door__card">
        <h2>{view.emailHeading}</h2>
        <p>
          {view.emailLead}
          <strong>{view.email}</strong>
          {view.emailTail}
        </p>
      </section>

      {view.mysteryLine && (
        <div className="report-payment__tease">
          <span className="buy-bar__mystery-eyebrow">{view.mysteryEyebrow}</span>
          <p className="report-payment__tease-line">{view.mysteryLine}</p>
        </div>
      )}

      <p className="journey-actions">
        <a href={view.shortlistHref}>{view.shortlistLabel}</a>
      </p>
    </main>
  );
}
