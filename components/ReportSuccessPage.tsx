import type { ReportSuccessView } from "../lib/report-success";
import PostcodeBox from "./PostcodeBox";
import SuccessPreparingIndicator from "./SuccessPreparingIndicator";
import SuccessRefresher from "./SuccessRefresher";
import SuccessResend from "./SuccessResend";

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

      {/* BUG-260 (24 Nov 2026): the preparing state's
          visible progress — the ring spins while the
          refresher polls, so the ~minute wait never reads
          as a stuck page. Ready state carries none. */}
      {view.state === "preparing" && <SuccessPreparingIndicator />}

      {view.sectionsLine && view.viewHref && (
        <section className="report-door__card">
          {/* PF-15 (payment-flow parity stack, 22 Nov
              2026): Sample 10's report preview — the mock
              cover beside the sections line and the View
              button. The cover is a drawing, not a
              document: brand, title, ruled lines and the
              brass bar, as the sample draws them. */}
          <div className="report-success__preview">
            <div className="report-success__thumb" aria-hidden="true">
              <div className="rt-brand">Check My Next Home</div>
              <div className="rt-title">
                Detailed report
                <br />
                {view.homeSubject}
              </div>
              <div className="rt-line" />
              <div className="rt-line" />
              <div className="rt-line short" />
              <div className="rt-bar" />
              <div className="rt-line" />
              <div className="rt-line short" />
            </div>
            <div className="report-success__preview-text">
              <p className="report-success__sections">{view.sectionsLine}</p>
              <p className="journey-actions">
                <a className="btn btn--forest" href={view.viewHref}>
                  {view.viewLabel}
                </a>
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="report-door__card">
        <h2>Check another home</h2>
        <p className="report-door__card-line">
          The headlines are always free — check the next home you&apos;re considering.
        </p>
        {/* BUG-135 (founder-found live, 22 Nov 2026):
            the one postcode box, wired as the landing
            page wires it — the hand-rolled /search form
            that stood here offered no suggestions as
            you type and no pick flow, where every other
            entry surface (landing, gift claim, error
            page, shortlist) carries this box. The card,
            its heading and its line are unchanged; the
            old form's PF-18 dress is mapped onto the
            box's markup in app/globals.css. */}
        <PostcodeBox bare />
      </section>

      {(view.refundLine || view.failedGiftLine || view.failedRetryLine) && (
        <section className="report-door__card">
          {view.refundLine && <p className="report-success__failed-line">{view.refundLine}</p>}
          {view.failedGiftLine && (
            <p className="report-success__failed-line">{view.failedGiftLine}</p>
          )}
          {view.failedRetryLine && (
            <p className="report-success__failed-line">{view.failedRetryLine}</p>
          )}
        </section>
      )}

      {view.emailHeading && (
        <section className="report-door__card">
          <h2>{view.emailHeading}</h2>
          <p className="report-door__card-line">
            {view.emailLead}
            <strong>{view.email}</strong>
            {view.emailTail}
          </p>
          {view.resendRef && view.resendLabel && view.resendSentLine && view.resendFailedLine && (
            <SuccessResend
              orderRef={view.resendRef}
              label={view.resendLabel}
              sentLine={view.resendSentLine}
              failedLine={view.resendFailedLine}
            />
          )}
        </section>
      )}

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
