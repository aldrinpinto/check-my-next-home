import type { ReportDoorView } from "../lib/report-door";

// The report door's holding page (plan step M7.6): a
// mechanical renderer of lib/report-door.ts's view, in
// the merged payment page's structure (Final Sample
// Master, Payment view) minus the payment form — the
// home's heading, what the report adds, the one-payment
// line, the holding state line, then the sample-report
// route and the route back. No form of any kind renders
// here: no checkout (payments are M9) and no email
// capture (no step has authorised one).

export default function ReportDoorPage({ view }: { view: ReportDoorView }) {
  return (
    <main className="journey-page">
      <h1>{view.heading}</h1>
      {view.subline && <p className="type-lead">{view.subline}</p>}
      <section className="report-door__card">
        <h2>{view.contentsHeading}</h2>
        <ul className="report-door__list">
          {view.contents.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="report-door__price">{view.priceLine}</p>
        <p className="report-door__state">{view.stateLine}</p>
      </section>
      <p className="journey-actions">
        <a href={view.sampleHref}>{view.sampleLabel}</a>{" "}
        <a href={view.backHref}>{view.backLabel}</a>
      </p>
    </main>
  );
}
