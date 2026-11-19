// The district navigation's interim state (founder fix
// batch, 19 Nov 2026 — audit Part 3): a click into a
// district page never sits on a dead page while the
// server builds the district bundle. The state is in the
// D73 checking dress — the same column, title form and
// row rhythm as the home check's checking screen — with
// the district page's own four tabs as its rows: they are
// what is being assembled. It carries no figures and no
// invented progress; when the page lands, it replaces
// this state whole.
//
// Scope: this boundary wraps the /search segment. The
// home and failed routes carry their own null boundaries
// (app/search/home/loading.tsx, app/search/failed/
// loading.tsx) so their behaviour is untouched — the
// home route's checking screen is its own state, and the
// failure page is instant.

const DISTRICT_LOADING_ROWS = [
  "Family Checks",
  "The Neighbourhood",
  "Home, Costs & Risks",
  "What's Nearby",
] as const;

export default function SearchLoading() {
  return (
    <main className="journey-page main--wide">
      <section className="checking" aria-label="Checking the wider area">
        <p className="addr-line">
          Wider area · <b>Postcode district</b>
        </p>
        <h1 className="page-title">Checking the wider area…</h1>
        <ul className="checking__rows">
          {DISTRICT_LOADING_ROWS.map((label) => (
            <li key={label} className="checking__row" data-state="checking">
              <span className="checking__row-label">{label}</span>
              <span className="checking__row-state">
                <span className="checking__spinner" aria-hidden="true" /> Checking…
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
