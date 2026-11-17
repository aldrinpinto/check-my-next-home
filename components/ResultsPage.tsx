import type { PlaceGroupView, ResultsSectionView, ResultsView, SectionBlock } from "../lib/results";
import {
  DISCLAIMER_CLOSING_BLOCK,
  DISCLAIMER_CLOSING_LINK_LABEL,
  DISCLAIMER_SHORT_FORM,
  HOW_WE_CHECK_PATH,
} from "../lib/site";
import { Notice, SourceLine, SummaryPill } from "./kit";
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
// disclaimer block at the very bottom. The page opens
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
            <li className="place-row" key={row.name}>
              <span className="place-row__name">{row.name}</span>{" "}
              <span className={`place-row__miles place-row__miles--${row.band}`}>
                {row.milesText}
              </span>
              {row.detail && <span className="place-row__detail">{row.detail}</span>}
              {row.ratingLine && <span className="place-row__rating">{row.ratingLine}</span>}
              {row.sixthFormLine && <span className="place-row__sixth">{row.sixthFormLine}</span>}
            </li>
          ))}
        </ul>
      )}
      {group.selectiveLine && <p className="results-line">{group.selectiveLine}</p>}
      {group.truncation &&
        (group.truncation.href ? (
          <p className="truncation-line">
            <a href={group.truncation.href}>{group.truncation.text}</a>
          </p>
        ) : (
          <p className="truncation-line">{group.truncation.text}</p>
        ))}
    </div>
  );
}

function Block({ block }: { block: SectionBlock }) {
  switch (block.type) {
    case "line":
      return <p className="results-line">{block.text}</p>;
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
            </li>
          ))}
        </ul>
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
          <p className="flood-warnings__attribution">{block.attributionLine}</p>
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
}: {
  section: ResultsSectionView;
  warningsState?: string | null;
}) {
  return (
    <section
      className="results-section"
      data-section={section.key}
      data-warnings-state={section.key === "flood" ? (warningsState ?? undefined) : undefined}
    >
      <h3 className="results-section__heading">{section.heading}</h3>
      {section.blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
      {section.sourceLine && <SourceLine>{section.sourceLine}</SourceLine>}
    </section>
  );
}

export default function ResultsPage({ view }: { view: ResultsView }) {
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
      <p className="results-disclaimer-short">{DISCLAIMER_SHORT_FORM}</p>
      <Tabs
        ariaLabel="Your check, in three parts"
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
                />
              ))}
            </div>
          ),
        }))}
      />
      <p className="results-disclaimer-closing">
        {DISCLAIMER_CLOSING_BLOCK} <a href={HOW_WE_CHECK_PATH}>{DISCLAIMER_CLOSING_LINK_LABEL}</a>.
      </p>
    </div>
  );
}
