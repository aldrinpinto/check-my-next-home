import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isProductionEnv } from "../../lib/site";
import {
  Button,
  Card,
  DataTable,
  Notice,
  SourceLine,
  SuggestionShell,
  SummaryPill,
  TextField,
} from "../../components/kit";
import Tabs from "../../components/Tabs";

// M7.1 — the kitchen-sink page: every block in the look & feel
// kit on one page, in light mode only (there is no dark mode
// in V1, D44). It is the kit's gallery and the founder's one
// surface for judging this step, and it is the target of the
// step's Regression-tagged E2E render spec (D68).
//
// Hidden, by construction: the page is unlinked from the
// navigation, kept out of the search metadata, and rendered
// ONLY when the environment is not production — the same
// isProductionEnv gate as the TEST strip (lib/site.ts). A
// production build answers this route with the not-found
// page, so the gallery can never reach the real site.

export const metadata: Metadata = {
  title: "Kitchen sink | Check My Next Home",
  robots: { index: false, follow: false },
};

const SWATCHES = [
  { name: "Forest", hex: "#2F5D3E" },
  { name: "Deep forest", hex: "#1E402C" },
  { name: "Brass", hex: "#C29A3B" },
  { name: "Brass pale", hex: "#E4CF9A" },
  { name: "Cream", hex: "#FDF8E8" },
  { name: "Ink", hex: "#17201E" },
] as const;

export default function KitchenSinkPage() {
  if (isProductionEnv()) notFound();

  return (
    <main className="main--wide">
      <h1>Kitchen sink</h1>
      <p className="type-lead">
        Every block in the look &amp; feel kit on one page, in light mode only. This page is hidden:
        it is not linked from the navigation and it is never built into the real site.
      </p>

      <section className="kit-section" aria-labelledby="ks-colours">
        <h2 id="ks-colours">Colours</h2>
        <ul className="swatch-grid">
          {SWATCHES.map((swatch) => (
            <li className="swatch" key={swatch.hex}>
              <span className="swatch__chip" style={{ background: swatch.hex }} />
              <span className="swatch__label">
                {swatch.name} · {swatch.hex}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="kit-section" aria-labelledby="ks-type">
        <h2 id="ks-type">Type sizes</h2>
        <h1>Heading 1 — Newsreader, fluid 2.4–3.2rem</h1>
        <h2>Heading 2 — Newsreader, fluid 1.9–2.2rem</h2>
        <h3>Heading 3 — 1.25rem</h3>
        <p className="type-lead">Lead — 1.125rem. The size the page introductions use.</p>
        <p>
          Body — 1rem. The size the answers are read at, in DM Sans (the system stack is the
          fallback only).
        </p>
        <p className="type-small">Small — 0.875rem. Hints, messages and source lines.</p>
        <p className="type-caption">Caption — 0.8125rem. The smallest size in the kit.</p>
      </section>

      <section className="kit-section" aria-labelledby="ks-buttons">
        <h2 id="ks-buttons">Buttons and links</h2>
        <p>
          <Button type="button">Primary button</Button>{" "}
          <Button type="button" variant="quiet">
            Quiet button
          </Button>{" "}
          <Button type="button" disabled>
            Disabled button
          </Button>
        </p>
        <p>
          A <Link href="/kitchen-sink">link inside a sentence</Link> takes the Forest colour and
          thickens its underline on hover.
        </p>
      </section>

      <section className="kit-section" aria-labelledby="ks-fields">
        <h2 id="ks-fields">Form fields</h2>
        <TextField
          id="ks-postcode"
          label="Postcode"
          hint="For example, CM3 2JT."
          placeholder="CM3 2JT"
        />
        <TextField
          id="ks-error"
          label="Postcode, with an error"
          defaultValue="CM3"
          error="Enter the full postcode — for example, CM3 2JT."
        />
        <TextField
          id="ks-success"
          label="Email address, confirmed"
          defaultValue="reader@example.co.uk"
          success="That address works — the claim link is on its way."
        />
        <TextField id="ks-disabled" label="A disabled field" defaultValue="—" disabled />
      </section>

      <section className="kit-section" aria-labelledby="ks-cards">
        <h2 id="ks-cards">Cards and pills</h2>
        <Card title="A card">
          <p>
            Cards sit on Cream with a Brass pale edge. Beside the text, the pill family — a label
            with its figure as the tinted distance chip, and the figure-less fact form:{" "}
            <SummaryPill label="Nearest primary" figure="0.4 mi" band="green" />{" "}
            <SummaryPill label="Crime: 330 recorded in 12 months" />
          </p>
          <SourceLine>
            Source line — the small line that names where the facts came from and when.
          </SourceLine>
        </Card>
      </section>

      <section className="kit-section" aria-labelledby="ks-buy-bar">
        <h2 id="ks-buy-bar">
          Pill buttons and the buy bar (D70 — the buy bar itself is M7.6&rsquo;s)
        </h2>
        <div className="buy-bar">
          <div>
            <b>Get the full detailed report — £4.99</b>
            <div className="type-small">
              The buy bar&rsquo;s panel form and its two pill buttons, pinned as kit blocks.
            </div>
          </div>
          <div className="buy-bar__actions">
            <a className="report-btn" href="/kitchen-sink">
              Get the full report
            </a>
            <button type="button" className="shortlist-btn">
              ♡ Shortlist this home
            </button>
            <button type="button" className="shortlist-btn shortlist-btn--saved">
              ✓ Shortlisted — saved in your browser
            </button>
          </div>
        </div>
      </section>

      <section className="kit-section" aria-labelledby="ks-suggest">
        <h2 id="ks-suggest">Search suggestions shell (D70 — no data source wired yet)</h2>
        <p>
          The autocomplete dropdown&rsquo;s visual shell, shown here with specimen entries: grouped
          AREAS, then PROPERTIES, under the search field. The box renders it only when a future
          address-data source hands it suggestions.
        </p>
        {/* The shell is absolutely positioned below its box
            (top: 100%), so the frozen-open specimen reserves
            the space it paints over with a bottom margin. */}
        <div className="postcode-box" style={{ marginBottom: "15rem" }}>
          <SuggestionShell
            groups={[
              { label: "Areas", items: ["CM3 2JT — Hatfield Peverel", "CM3 — Chelmsford"] },
              {
                label: "Properties",
                items: [
                  "1 Birkdale Rise, Hatfield Peverel CM3 2JT",
                  "19 Birkdale Rise, Hatfield Peverel CM3 2JT",
                ],
              },
            ]}
          />
        </div>
      </section>

      <section className="kit-section" aria-labelledby="ks-tabs">
        <h2 id="ks-tabs">Tabs</h2>
        <Tabs
          ariaLabel="Kitchen sink example"
          tabs={[
            {
              id: "first",
              label: "First tab",
              panel: <p>The first panel. Arrow keys move between the tabs.</p>,
            },
            {
              id: "second",
              label: "Second tab",
              panel: <p>The second panel. Home and End jump to the ends.</p>,
            },
            {
              id: "third",
              label: "Third tab",
              panel: <p>The third panel. Activation is automatic — the panel follows.</p>,
            },
          ]}
        />
      </section>

      <section className="kit-section" aria-labelledby="ks-table">
        <h2 id="ks-table">Table</h2>
        <DataTable
          caption="Example table — on a phone each row stacks into labelled lines"
          columns={["Place", "Distance", "Source"]}
          rows={[
            ["Northgate Primary School", "0.4 miles", "Department for Education"],
            ["Northgate Surgery", "0.9 miles", "NHS"],
            ["Northgate Station", "1.2 miles", "National Rail"],
          ]}
        />
      </section>

      <section className="kit-section" aria-labelledby="ks-notices">
        <h2 id="ks-notices">Notices</h2>
        <Notice variant="warning">
          <p>A warning line — the flood warning renders in this block, first.</p>
        </Notice>
        <Notice variant="stale">
          <p>A stale line — the facts below were last loaded on the date named.</p>
        </Notice>
        <Notice variant="gap">
          <p>A named-gap line — what the check could not cover is named, never hidden.</p>
        </Notice>
      </section>
    </main>
  );
}
