import {
  BUY_BAR_MYSTERY_EYEBROW,
  type PlaceGroupView,
  type ResultsSectionView,
  type ResultsView,
  type SectionBlock,
} from "../lib/results";
import type { ShortlistCard } from "../lib/shortlist";
import {
  DISCLAIMER_CLOSING_BLOCK,
  DISCLAIMER_CLOSING_LINK_LABEL,
  DISCLAIMER_SHORT_FORM,
  HOW_WE_CHECK_PATH,
  REPORT_PRICE_LABEL,
} from "../lib/site";
import Calculators from "./Calculators";
import { Notice, SummaryPill } from "./kit";
import ShortlistButton from "./ShortlistButton";
import Tabs from "./Tabs";

// The free results page (plan step M7.4): a mechanical
// renderer of lib/results.ts's view model — every decision
// (pills, placement, display counts, truncations, warnings
// forms) is made and pinned there, not here.
//
// Structure, per the step text: the summary strip (four
// logic-driven pills in their band; colour only on a
// pill's miles figure, D70 R5), the live-warnings
// slim line directly under it (only when a warning is
// active; the D42 failure line travels with it), the D9
// short form verbatim beside the results (D66), the three
// tabs in their fixed order, and the Final Design's closing
// disclaimer block at the very bottom. Below the tabs sit
// the buy bar, the calculators (absent on the wider-area
// view, M7.10 G2) and the collapsed "About these checks"
// expander (M7.12) — the only home for the per-check links,
// derived in lib/results.ts from the sections carried. The page opens
// expanded; the website has no collapsed form, and tab
// state stays out of the URL — the Tabs block always opens
// on the first tab, Family Checks.

function PlaceGroup({ group }: { group: PlaceGroupView }) {
  return (
    <div className="place-group">
      {group.line && <p className="results-line">{group.line}</p>}
      {group.rows.length > 0 && (
        <ul className="place-list">
          {group.rows.map((row) => (
            // D4 (parity fix stack, 18 Nov 2026): the
            // sample's .row form — the name and its one
            // composed detail line stacked in a left block,
            // the distance chip at the right.
            <li className="place-row" key={row.name}>
              <span className="place-row__main">
                <span className="place-row__name">{row.name}</span>
                {row.detail && <span className="place-row__detail">{row.detail}</span>}
              </span>
              <span className={`place-row__miles place-row__miles--${row.band}`}>
                {row.milesText}
              </span>
            </li>
          ))}
        </ul>
      )}
      {group.grammar && (
        // The grammar row (parity fix batch, item 12): the
        // sample's row--grammar — the star name form, the
        // SELECTIVE — TEST ENTRY badge, the distance chip.
        <ul className="place-list">
          <li className="place-row place-row--grammar">
            <span className="place-row__main">
              <span className="place-row__name">★ Grammar schools — {group.grammar.name}</span>
            </span>
            <span className="badge badge--grammar">SELECTIVE — TEST ENTRY</span>
            <span className={`place-row__miles place-row__miles--${group.grammar.band}`}>
              {group.grammar.milesText}
            </span>
          </li>
        </ul>
      )}
      {group.truncation &&
        // The truncRow (parity fix batch, item 14): lead,
        // optional detail, the £4.99 chip and the arrow —
        // the sample's one-row form, merged when a detail
        // rides, plain when not.
        (group.truncation.href ? (
          <a
            className={`trunc-row${group.truncation.detail ? " trunc-row--merged" : ""}`}
            href={group.truncation.href}
          >
            <span className="trunc-row__main">
              <span className="trunc-row__lead">{group.truncation.lead}</span>
              {group.truncation.detail && (
                <span className="trunc-row__detail">{group.truncation.detail}</span>
              )}
            </span>
            <span className="trunc-row__cta">
              <span className="trunc-row__price">{REPORT_PRICE_LABEL}</span>{" "}
              <span className="trunc-row__arrow">Get the full report →</span>
            </span>
          </a>
        ) : (
          <p className={`trunc-row${group.truncation.detail ? " trunc-row--merged" : ""}`}>
            <span className="trunc-row__main">
              <span className="trunc-row__lead">{group.truncation.lead}</span>
              {group.truncation.detail && (
                <span className="trunc-row__detail">{group.truncation.detail}</span>
              )}
            </span>
            <span className="trunc-row__cta">
              <span className="trunc-row__price">{REPORT_PRICE_LABEL}</span>{" "}
              <span className="trunc-row__arrow">Get the full report →</span>
            </span>
          </p>
        ))}
    </div>
  );
}

// A section-level upsell renders as the same truncRow
// (parity fix batch, item 14): the pre-batch .upsell panel
// was the duplicate form the audit counted beside the
// group rows.
function UpsellRow({
  lead,
  detail,
  reportHref,
}: {
  lead: string;
  detail: string | null;
  reportHref: string | null;
}) {
  const inner = (
    <>
      <span className="trunc-row__main">
        <span className="trunc-row__lead">{lead}</span>
        {detail && <span className="trunc-row__detail">{detail}</span>}
      </span>
      <span className="trunc-row__cta">
        <span className="trunc-row__price">{REPORT_PRICE_LABEL}</span>{" "}
        <span className="trunc-row__arrow">Get the full report →</span>
      </span>
    </>
  );
  const className = `trunc-row${detail ? " trunc-row--merged" : ""}`;
  return reportHref ? (
    <a className={className} href={reportHref}>
      {inner}
    </a>
  ) : (
    <p className={className}>{inner}</p>
  );
}

function Block({ block, reportHref }: { block: SectionBlock; reportHref: string | null }) {
  switch (block.type) {
    case "line":
      return <p className="results-line">{block.text}</p>;
    case "subheading":
      return <h4 className="results-subheading">{block.text}</h4>;
    case "upsell":
      return <UpsellRow lead={block.lead} detail={block.detail} reportHref={reportHref} />;
    case "notice":
      return <Notice variant={block.variant}>{block.text}</Notice>;
    case "link":
      return (
        <p className="results-line">
          <a href={block.url}>{block.label}</a>
        </p>
      );
    case "tiles":
      return (
        <ul className="results-tiles">
          {block.tiles.map((tile) => (
            <li className="results-tile" key={tile.label}>
              <span className="results-tile__label">{tile.label}</span>
              <span className="results-tile__value">{tile.value}</span>
              {tile.sub && <span className="results-tile__sub">{tile.sub}</span>}
            </li>
          ))}
        </ul>
      );
    case "tagged-line":
      // The Master's .row form: bold lead, small texts,
      // fineprint, badge at the right.
      return (
        <div className="results-row">
          <div className="results-row__main">
            {block.lead && <span className="results-row__lead">{block.lead}</span>}
            {block.texts.map((text) => (
              <span className="results-row__text" key={text}>
                {text}
              </span>
            ))}
            {block.fineprint && <span className="results-row__fineprint">{block.fineprint}</span>}
          </div>
          {block.tag && (
            <span className={`badge badge--${block.tagTone ?? "grey"}`}>{block.tag}</span>
          )}
        </div>
      );
    case "verdict":
      // The flood verdict row: bold check name, verdict
      // text, the optional second line, CHECK badge.
      return (
        <div className="results-row">
          <div className="results-row__main">
            <span className="results-row__lead">{block.name}</span>
            <span className="results-row__text">{block.text}</span>
            {block.note && <span className="results-row__text">{block.note}</span>}
          </div>
          <span className="badge badge--a">{block.tag}</span>
        </div>
      );
    case "places":
      return <PlaceGroup group={block.group} />;
    case "flood-warnings":
      return (
        <div className="flood-warnings">
          {block.warnings.map((warning) => (
            <div className="flood-warning" key={`${warning.severity}-${warning.areaDescription}`}>
              <p className="flood-warning__severity">
                {warning.severity} — {warning.areaDescription}
              </p>
              <p className="flood-warning__message">{warning.message}</p>
              <p className="flood-warning__raised">{warning.raisedLine}</p>
            </div>
          ))}
          {block.overflowLine && <p className="results-line">{block.overflowLine}</p>}
          <p className="results-line">
            <a href={block.link.url}>{block.link.label}</a>
          </p>
        </div>
      );
  }
}

function Section({
  section,
  warningsState,
  reportHref,
}: {
  section: ResultsSectionView;
  warningsState?: string | null;
  reportHref: string | null;
}) {
  return (
    <section
      className="results-section"
      data-section={section.key}
      data-warnings-state={section.key === "flood" ? (warningsState ?? undefined) : undefined}
    >
      <h3 className="results-section__heading">{section.heading}</h3>
      {section.blocks.map((block, index) => (
        <Block key={index} block={block} reportHref={reportHref} />
      ))}
      {/* Item 15 (parity fix batch): the per-section source
          lines no longer render on the results page — the
          Master carries none; sources live on the check
          pages and in the report. The view still carries
          section.sourceLine for those surfaces. */}
    </section>
  );
}

export default function ResultsPage({
  view,
  shortlistCard,
}: {
  view: ResultsView;
  // The rung-1 shortlist card, when the route assembled
  // one: its add control renders inside the buy bar
  // beside the report button (plan step M7.6 — the move
  // M7.5 recorded as owed; one control, never duplicated).
  // Rung 2 and the not-covered branch pass none.
  shortlistCard?: ShortlistCard | null;
}) {
  return (
    <div className="results">
      {view.pills && (
        <div className="results-strip" aria-label="The short version">
          {view.pills.map((pill) => (
            <SummaryPill
              key={pill.label}
              label={pill.label}
              figure={pill.figure}
              band={pill.band}
              mark={pill.mark}
            />
          ))}
        </div>
      )}
      {view.warningsStrip.kind === "warnings" && (
        <p className="results-warnings-strip" data-state="warnings">
          {view.warningsStrip.items.map((item) => (
            <span key={`${item.severity}-${item.areaDescription}`}>
              {item.severity} — {item.areaDescription}{" "}
            </span>
          ))}
          <a href={view.warningsStrip.link.url}>{view.warningsStrip.link.label}</a>
        </p>
      )}
      {view.warningsStrip.kind === "unavailable" && (
        <p className="results-warnings-strip" data-state="unavailable">
          {view.warningsStrip.line}
        </p>
      )}
      {/* The D9 short form verbatim beside the results
          (D66; M7.4's Disclaimer (D9) line) — under the
          strip, above the tabs. The parity batch's item
          16 removed it against the Master's HTML; CI #222
          restored it: where the Final Design and a
          decision differ, the decision governs (M7.4's
          check line), and the Master's stylesheet still
          carries this class's dress. The closing block
          at the foot is a separate instance, untouched. */}
      <p className="results-disclaimer-short">{DISCLAIMER_SHORT_FORM}</p>
      <Tabs
        ariaLabel="Your check, in four parts"
        tabs={view.tabs.map((tab) => ({
          id: tab.id,
          label: tab.label,
          panel: (
            <div className="results-tab" data-tab={tab.id}>
              {tab.sections.map((section) => (
                <Section
                  key={section.key}
                  section={section}
                  warningsState={view.floodWarningsState}
                  reportHref={view.reportHref}
                />
              ))}
            </div>
          ),
        }))}
      />
      {view.buyBar && (
        <div className="buy-bar">
          <h2 className="buy-bar__heading">{view.buyBar.heading}</h2>
          <p className="buy-bar__line">{view.buyBar.line}</p>
          <p className="buy-bar__mystery">
            <span className="buy-bar__mystery-eyebrow">{BUY_BAR_MYSTERY_EYEBROW}</span>{" "}
            {view.buyBar.mysteryLine}
          </p>
          <p className="buy-bar__actions">
            {/* Item 19 (parity fix batch): the buy-bar
                button carries no price — the priced form
                is only the results-head button. */}
            <a className="report-btn" href={view.buyBar.href}>
              Get the full report
            </a>
            {shortlistCard && <ShortlistButton card={shortlistCard} />}
          </p>
        </div>
      )}
      {view.calculators && (
        <Calculators
          lastSalePrice={view.calculators.lastSalePrice}
          nation={view.calculators.nation}
        />
      )}
      {view.checkLinks.length > 0 && (
        <details className="about-checks">
          <summary>About these checks</summary>
          <ul className="about-checks__list">
            {view.checkLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="results-disclaimer-closing">
        {DISCLAIMER_CLOSING_BLOCK} <a href={HOW_WE_CHECK_PATH}>{DISCLAIMER_CLOSING_LINK_LABEL}</a>.
      </p>
    </div>
  );
}
