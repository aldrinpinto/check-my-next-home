import {
  BUY_BAR_MYSTERY_EYEBROW,
  GIFT_FREE_LABEL,
  GIFT_REPORT_BUTTON_LABEL,
  GIFT_STRIP_LINE,
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
import PostcodeBox from "./PostcodeBox";
import ReportLink from "./ReportLink";
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
// tabs in their fixed order, and — directly under the
// tabs since BUG-143 — the Final Design's closing
// disclaimer block. Below it sit the buy bar, the
// calculators (absent on the wider-area view, M7.10 G2)
// and, last on the page, the "About these checks" pill
// strip (M7.12; a pull-down until BUG-143) — the only
// home for the per-check links, derived in lib/results.ts
// from the sections carried. The page opens
// expanded; the website has no collapsed form, and tab
// state stays out of the URL — the Tabs block always opens
// on the first tab, Family Checks.

function PlaceGroup({ group, giftHeld = false }: { group: PlaceGroupView; giftHeld?: boolean }) {
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
      {group.truncation &&
        // The truncRow (parity fix batch, item 14): lead,
        // optional detail, the £4.99 chip and the arrow —
        // the sample's one-row form, merged when a detail
        // rides, plain when not.
        (group.truncation.href ? (
          <ReportLink
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
              <span className="trunc-row__price">
                {giftHeld ? GIFT_FREE_LABEL : REPORT_PRICE_LABEL}
              </span>{" "}
              <span className="trunc-row__arrow">Get the full report →</span>
            </span>
          </ReportLink>
        ) : (
          <p className={`trunc-row${group.truncation.detail ? " trunc-row--merged" : ""}`}>
            <span className="trunc-row__main">
              <span className="trunc-row__lead">{group.truncation.lead}</span>
              {group.truncation.detail && (
                <span className="trunc-row__detail">{group.truncation.detail}</span>
              )}
            </span>
            <span className="trunc-row__cta">
              <span className="trunc-row__price">
                {giftHeld ? GIFT_FREE_LABEL : REPORT_PRICE_LABEL}
              </span>{" "}
              <span className="trunc-row__arrow">Get the full report →</span>
            </span>
          </p>
        ))}
      {group.grammarSchools.length > 0 && (
        // BUG-108: the grammar block names EVERY selective
        // secondary within the grammar search, nearest
        // first, each with its distance. FC-04 (BUG-154):
        // the row wears the sample's exact form — the
        // school's name alone (the star glyph and the
        // "Grammar schools — " prefix are out), the small
        // "Entry by test." line restored under the name,
        // and the badge in the sample's grey.
        <div className="place-group__grammar">
          <ul className="place-list">
            {group.grammarSchools.map((school) => (
              <li className="place-row place-row--grammar" key={school.name}>
                <span className="place-row__main">
                  <span className="place-row__name">{school.name}</span>
                  <span className="place-row__detail">Entry by test.</span>
                </span>
                {/* BUG-250 (24 Nov 2026): the badge and the
                    miles chip travel as one right-hand
                    cluster (.place-row__end) — spread by
                    the row's space-between, the badge
                    landed in the wide empty middle. */}
                <span className="place-row__end">
                  <span className="badge badge--grey">SELECTIVE — TEST ENTRY</span>
                  <span className={`place-row__miles place-row__miles--${school.band}`}>
                    {school.milesText}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {group.grammarCountLine && (
            // BUG-140: where the cap cuts the grammar
            // list, the count line states the true total
            // under the rows shown.
            <p className="results-line">{group.grammarCountLine}</p>
          )}
        </div>
      )}
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
  giftHeld = false,
}: {
  lead: string;
  detail: string | null;
  reportHref: string | null;
  giftHeld?: boolean;
}) {
  const inner = (
    <>
      <span className="trunc-row__main">
        <span className="trunc-row__lead">{lead}</span>
        {detail && <span className="trunc-row__detail">{detail}</span>}
      </span>
      <span className="trunc-row__cta">
        <span className="trunc-row__price">{giftHeld ? GIFT_FREE_LABEL : REPORT_PRICE_LABEL}</span>{" "}
        <span className="trunc-row__arrow">Get the full report →</span>
      </span>
    </>
  );
  const className = `trunc-row${detail ? " trunc-row--merged" : ""}`;
  return reportHref ? (
    <ReportLink className={className} href={reportHref}>
      {inner}
    </ReportLink>
  ) : (
    <p className={className}>{inner}</p>
  );
}

function Block({
  block,
  reportHref,
  district = false,
  giftHeld = false,
}: {
  block: SectionBlock;
  reportHref: string | null;
  district?: boolean;
  giftHeld?: boolean;
}) {
  switch (block.type) {
    case "line":
      return <p className="results-line">{block.text}</p>;
    case "small-line":
      // The small-print dress (NB-01 / HCR-19): small,
      // muted, no line of its own.
      return <p className="results-small-line">{block.text}</p>;
    case "list":
      // The bullet treatment (BUG-156): one fact per
      // item, an optional bold lead-in, the site's tick
      // bullet — no line of its own. BUG-206: a detail
      // item (`sub`) sits one level in under its group
      // bullet.
      return (
        <ul className="results-list">
          {block.items.map((item) => (
            <li
              className={
                item.sub ? "results-list__item results-list__item--sub" : "results-list__item"
              }
              key={item.text}
            >
              {item.lead && (
                <strong className="results-list__lead">
                  {item.lead.endsWith(":") ? `${item.lead} ` : `${item.lead} — `}
                </strong>
              )}
              {item.text}
            </li>
          ))}
        </ul>
      );
    case "subheading":
      return <h4 className="results-subheading">{block.text}</h4>;
    case "upsell":
      return (
        <UpsellRow
          lead={block.lead}
          detail={block.detail}
          reportHref={reportHref}
          giftHeld={giftHeld}
        />
      );
    case "notice":
      return <Notice variant={block.variant}>{block.text}</Notice>;
    case "link":
      // The new-tab promise (M8.7): a link block whose URL
      // leaves the site opens in a new tab with the safe
      // rel; an in-page action (the empty "Try again" URL)
      // stays a plain anchor.
      return (
        <p className="results-line">
          {/^https?:\/\//.test(block.url) ? (
            <a href={block.url} target="_blank" rel="noopener">
              {block.label}
            </a>
          ) : (
            <a href={block.url}>{block.label}</a>
          )}
        </p>
      );
    case "tiles":
      // WA-07: on the district page the tiles wear
      // Sample 28's form — the heavy sans value over a
      // sentence-case descriptive sublabel, no uppercase
      // label. The description is the tile's sub where
      // one rides, else its label (district compositions
      // carry the description in the label).
      if (district) {
        return (
          <ul className="district-tiles">
            {block.tiles.map((tile) => (
              <li className="district-tile" key={tile.label}>
                <span className="district-tile__value">{tile.value}</span>
                <span className="district-tile__sub">{tile.sub ?? tile.label}</span>
              </li>
            ))}
          </ul>
        );
      }
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
      // fineprint, badge at the right. BUG-156: a row
      // whose facts take the bullet treatment renders
      // them as a list under the lead (HCR-18), and a
      // row carrying a distance chip (the brownfield
      // row, HCR-05) renders it beside the badge in the
      // place rows' chip dress.
      return (
        <div className="results-row">
          <div className="results-row__main">
            {block.lead && <span className="results-row__lead">{block.lead}</span>}
            {block.texts.map((text) => (
              <span className="results-row__text" key={text}>
                {text}
              </span>
            ))}
            {block.bullets && block.bullets.length > 0 && (
              <ul className="results-list results-list--row">
                {block.bullets.map((bullet) => (
                  <li className="results-list__item" key={bullet}>
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
            {block.fineprint && <span className="results-row__fineprint">{block.fineprint}</span>}
          </div>
          {block.miles && (
            <span className={`place-row__miles place-row__miles--${block.miles.band}`}>
              {block.miles.text}
            </span>
          )}
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
      return <PlaceGroup group={block.group} giftHeld={giftHeld} />;
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
            <a href={block.link.url} target="_blank" rel="noopener">
              {block.link.label}
            </a>
          </p>
        </div>
      );
    // District-page forms (18 Nov 2026): only district
    // views carry these blocks.
    case "table":
      return (
        <div className="results-table">
          {block.rows.map((row) => (
            <div className="results-table__row" key={row.label}>
              <span className="results-table__label">
                {row.label}
                {row.detail && <span className="results-table__detail">{row.detail}</span>}
              </span>
              <span className="results-table__value">{row.value}</span>
            </div>
          ))}
        </div>
      );
    case "deciles":
      // WA-09: Sample 28's reading order — the colour
      // block, the decile number bold beneath it (the
      // figure), the area count small beneath that (the
      // detail). Under partial filing a zero reads "·":
      // none filed in that decile SO FAR is not none.
      return (
        <div
          className="deciles"
          role="img"
          aria-label="Small areas counted in each deprivation decile, 1 to 10"
        >
          {block.counts.map((count, index) => (
            <div className="decile" key={index}>
              <span className="decile__block" />
              <span className="decile__num">{index + 1}</span>
              <span className="decile__count">
                {block.partial && count === 0
                  ? "·"
                  : index === 0
                    ? `${count} area${count === 1 ? "" : "s"}`
                    : count}
              </span>
            </div>
          ))}
        </div>
      );
    case "row":
      // Sample 28's .row (WA-03): bold lead, small
      // detail beneath, the count at the right, a dashed
      // rule under — between entries only (the CSS drops
      // it under a section's last row).
      return (
        <div className="district-row">
          <span className="district-row__main">
            <span className="district-row__lead">{block.lead}</span>
            {block.detail && <span className="district-row__detail">{block.detail}</span>}
          </span>
          {block.value && <span className="district-row__value">{block.value}</span>}
        </div>
      );
    case "bar-compare":
      // WA-08: the crime comparison panel — cream
      // ground, the heading bold in Deep Forest, the
      // label above each track, England in brass, the
      // calibration note inside the panel.
      return (
        <div className="bar-compare">
          <p className="bar-compare__heading">{block.heading}</p>
          {block.rows.map((row) => (
            <div key={row.label}>
              <p className="bar-compare__label">{row.text}</p>
              <div className="bar-compare__track">
                <span
                  className={`bar-compare__fill${row.england ? " bar-compare__fill--england" : ""}`}
                  style={{ width: `${Math.max(0, Math.min(100, row.pctOfMax))}%` }}
                />
              </div>
            </div>
          ))}
          {block.note && <p className="bar-compare__note">{block.note}</p>}
        </div>
      );
    case "flood-grid":
      // WA-05/WA-06: the two flood layers as cards —
      // serif title, share sub-line, the stackbar, and
      // the legend carrying every share.
      return (
        <div className="flood-grid">
          {block.cards.map((card) => (
            <div className="flood-card" key={card.title}>
              <h4 className="flood-card__title">{card.title}</h4>
              <p className="flood-card__sub">{card.sub}</p>
              <div
                className="stackbar"
                role="img"
                aria-label={card.segments
                  .map((segment) => `${segment.label} ${segment.pct}%`)
                  .join(", ")}
              >
                {card.segments
                  .filter((segment) => segment.pct > 0)
                  .map((segment) => (
                    <span
                      className={`stackbar__seg stackbar__seg--${segment.tone}`}
                      key={segment.label}
                      style={{ width: `${segment.pct}%` }}
                    />
                  ))}
              </div>
              <ul className="flood-legend">
                {card.segments.map((segment) => (
                  <li key={segment.label}>
                    <span className={`flood-legend__dot flood-legend__dot--${segment.tone}`} />
                    {segment.label} {segment.pct}%
                  </li>
                ))}
              </ul>
              {card.narrative && (
                <p className="flood-card__narrative">
                  <strong>{card.narrative.lead}</strong> {card.narrative.text}
                </p>
              )}
              {card.definitions && <p className="results-small-line">{card.definitions}</p>}
            </div>
          ))}
        </div>
      );
    case "warn-strip":
      // WA-12: the live-warnings strip — green ground,
      // the status dot, the served line bold.
      return (
        <div className="warn-strip">
          <span className="warn-strip__dot" aria-hidden="true">
            ●
          </span>
          <div className="warn-strip__main">
            <p className="warn-strip__line">{block.line}</p>
            {block.areas.map((area) => (
              <p className="warn-strip__area" key={area}>
                {area}
              </p>
            ))}
          </div>
        </div>
      );
    case "bandbox":
      // WA-14: the honesty line's amber box, under its
      // standing lead.
      return (
        <div className="bandbox">
          <p>
            <strong>{block.lead}</strong> {block.text}
          </p>
        </div>
      );
    case "stackbar":
      return (
        <div
          className="stackbar"
          role="img"
          aria-label={block.segments
            .map((segment) => `${segment.label} ${segment.pct}%`)
            .join(", ")}
        >
          {block.segments
            .filter((segment) => segment.pct > 0)
            .map((segment) => (
              <span
                className={`stackbar__seg stackbar__seg--${segment.tone}`}
                key={segment.label}
                style={{ width: `${segment.pct}%` }}
              />
            ))}
        </div>
      );
    case "bars":
      return (
        <div className="district-bars">
          {block.rows.map((row) => (
            <div className="district-bar" key={row.label}>
              <span className="district-bar__label">{row.label}</span>
              <span className="district-bar__track">
                <span
                  className="district-bar__fill"
                  style={{ width: `${Math.max(0, Math.min(100, row.pctOfMax))}%` }}
                />
              </span>
              <span className="district-bar__text">{row.text}</span>
            </div>
          ))}
        </div>
      );
    case "pills":
      // The sample's settlement pills (founder fix batch).
      return (
        <ul className="results-pills">
          {block.items.map((item) => (
            <li className="results-pill" key={item}>
              {item}
            </li>
          ))}
        </ul>
      );
    case "infobox":
      // The sample's .infobox dress: the flood roll-up's
      // method box. WA-14: its lead stands bold.
      return (
        <div className="infobox">
          <p>
            {block.lead && <strong>{block.lead} </strong>}
            {block.text}
          </p>
        </div>
      );
  }
}

function Section({
  section,
  warningsState,
  reportHref,
  district = false,
  giftHeld = false,
}: {
  section: ResultsSectionView;
  warningsState?: string | null;
  reportHref: string | null;
  district?: boolean;
  giftHeld?: boolean;
}) {
  return (
    <section
      className="results-section"
      data-section={section.key}
      data-warnings-state={section.key === "flood" ? (warningsState ?? undefined) : undefined}
    >
      {district ? (
        // BUG-218 (founder, 24 Nov 2026): the district
        // page carries no section kicker and no section
        // title — Sample 28's two-tier head (the
        // numbered label, the serif title, the grain
        // pill) is removed entirely; a district section
        // opens straight on its content. The grain pill
        // goes with the head: its scope note is already
        // carried in each section's own content lines.
        // The one-tier heading below is the HOME
        // surface's and is untouched.
        <></>
      ) : (
        <h3 className="results-section__heading">{section.heading}</h3>
      )}
      {section.blocks.map((block, index) => (
        <Block
          key={index}
          block={block}
          reportHref={reportHref}
          district={district}
          giftHeld={giftHeld}
        />
      ))}
      {district && section.sourceLine ? (
        // WA-04: the district page restores its per-section
        // source lines in Sample 28's .source form (the
        // home pages' item-15 retirement stands — the
        // Master carries none there).
        <p className="district-source">Source: {section.sourceLine}</p>
      ) : (
        // Item 15 (parity fix batch): the per-section source
        // lines no longer render on the HOME results page —
        // the Master carries none; sources live on the check
        // pages and in the report. The view still carries
        // section.sourceLine for those surfaces.
        <></>
      )}
    </section>
  );
}

export default function ResultsPage({
  view,
  shortlistCard,
  // BUG-223: the visit holds a claimed, unspent gift —
  // the free page's buy prompts speak of the free
  // report, never of £4.99 (approved Screen B). Rung 2
  // and the district/not-covered views pass none: they
  // carry no buy prompts, so the gift state cannot
  // show there.
  giftHeld = false,
}: {
  view: ResultsView;
  // The rung-1 shortlist card, when the route assembled
  // one: its add control renders inside the buy bar
  // beside the report button (plan step M7.6 — the move
  // M7.5 recorded as owed; one control, never duplicated).
  // Rung 2 and the not-covered branch pass none.
  shortlistCard?: ShortlistCard | null;
  giftHeld?: boolean;
}) {
  // The district (wider-area) view is the one carrying a
  // bridge; it wears Sample 28's own dress (BUG-160 as
  // corrected by the wider-area audit): no section heads
  // at all (BUG-218), the .source lines, the boxed
  // disclaimers panel at the foot, and no D9 short form
  // (Sample 28 does not draw one).
  const district = view.bridge != null;
  return (
    <div className={district ? "results results--district" : "results"}>
      {/* BUG-223: the gift strip (approved Screen B,
          DRAFT line 3) stands above the pills, so a
          gift holder reads, before any fact or price,
          that the gift is ready to use on this home. */}
      {giftHeld && !district && (
        <p className="results-gift-strip" role="status">
          {GIFT_STRIP_LINE}
        </p>
      )}
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
          <a href={view.warningsStrip.link.url} target="_blank" rel="noopener">
            {view.warningsStrip.link.label}
          </a>
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
      {!district && <p className="results-disclaimer-short">{DISCLAIMER_SHORT_FORM}</p>}
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
                  district={district}
                  giftHeld={giftHeld}
                />
              ))}
            </div>
          ),
        }))}
      />
      {/* BUG-143 (founder ruling, 22 Nov 2026): the
          closing disclaimer strip stands directly under
          the results it qualifies — it stood at the very
          foot of the page until this stack, below the
          calculators and the About block, where it read
          as out of place. The district page instead
          closes in Sample 28's order — bridge, About
          strip, then the boxed disclaimers panel (WA-11)
          rendered after the check pills below. */}
      {!district && (
        <p className="results-disclaimer-closing">
          {DISCLAIMER_CLOSING_BLOCK} <a href={HOW_WE_CHECK_PATH}>{DISCLAIMER_CLOSING_LINK_LABEL}</a>
          .
        </p>
      )}
      {view.bridge && (
        <div className="district-bridge">
          <h2 className="district-bridge__heading">{view.bridge.heading}</h2>
          <p className="district-bridge__line">{view.bridge.line}</p>
          {/* The bridge's search (founder fix batch,
              19 Nov 2026 — audit item 5 — then BUG-147,
              founder finding 22 Nov 2026): the plain
              postcode-only form that stood here dead-ended
              on anything it could not resolve (a district
              typed into it went nowhere). The bridge now
              carries the standard PostcodeBox (D72
              hybrid) — suggestions, the pick flow and
              the routing every other surface has — and
              the district's named-area postcode links
              below it. */}
          <PostcodeBox bare />
          {view.bridge.links.length > 0 && (
            <div className="district-bridge__links">
              {view.bridge.links.map((link) => (
                <a className="district-bridge__chip" key={link.href} href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      {view.buyBar && (
        <div className="buy-bar">
          <h2 className="buy-bar__heading">{view.buyBar.heading}</h2>
          <p className="buy-bar__line">{view.buyBar.line}</p>
          <p className="buy-bar__mystery">
            <span className="buy-bar__mystery-eyebrow">{BUY_BAR_MYSTERY_EYEBROW}</span>{" "}
            {view.buyBar.mysteryLine}
          </p>
          <p className="buy-bar__actions">
            {/* BUG-336 (25 Nov 2026): the buy-bar button
                carries the price — the view's priced
                label, in the header button's form — with
                the one-payment line beneath it, so the
                buy decision is priced where it is made.
                A gift holder keeps the gift's own words
                and no payment line: nothing is paid.
                (The unpriced form stood here under the
                parity batch's item 19; that item's
                "priced form is only the results-head
                button" is superseded for this bar by
                the audit fix.) */}
            <ReportLink className="report-btn" href={view.buyBar.href}>
              {giftHeld ? GIFT_REPORT_BUTTON_LABEL : view.buyBar.buttonLabel}
            </ReportLink>
            {shortlistCard && <ShortlistButton card={shortlistCard} />}
          </p>
          {!giftHeld && <p className="buy-bar__one-payment">{view.buyBar.onePaymentLine}</p>}
        </div>
      )}
      {view.calculators && (
        <Calculators
          lastSalePrice={view.calculators.lastSalePrice}
          nation={view.calculators.nation}
        />
      )}
      {view.checkLinks.length > 0 && (
        // BUG-143 (founder ruling, 22 Nov 2026): the
        // pull-down is gone — it read as a static card,
        // or an empty box closed. The check links stand
        // as little clickable pills in one closing strip,
        // the page's last furniture. The links themselves
        // stay: they are the doorway to the check pages
        // and carry the site's internal linking.
        <nav className="check-pills" aria-label="About these checks">
          <h2 className="check-pills__heading">About these checks</h2>
          <ul className="check-pills__list">
            {view.checkLinks.map((link) => (
              // Keyed by href AND label (founder fix batch):
              // the district view's eleven legitimately
              // repeat an href (three sections share the
              // How-we-check page) under different labels.
              <li key={`${link.href}|${link.label}`}>
                <a className="check-pills__pill" href={link.href}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {/* Check another home (founder addition, 25 Nov
          2026): the free page's closing box — the
          founder's line and the one postcode box, wired
          as the landing page wires it. Home views only:
          the line names "this home", and the district
          view already carries the bridge's search. */}
      {!district && (
        <section className="report-door__card report-check-again" aria-label="Check another home">
          <h2>Done with this home? Check another one</h2>
          <PostcodeBox bare />
        </section>
      )}
      {district && (
        // WA-11: the district page closes with Sample
        // 28's boxed disclaimers panel — the same closing
        // words, wearing the panel's dress under its
        // "Disclaimers" head.
        <div className="district-disclaimers">
          <h4>Disclaimers</h4>
          <p>
            {DISCLAIMER_CLOSING_BLOCK}{" "}
            <a href={HOW_WE_CHECK_PATH}>{DISCLAIMER_CLOSING_LINK_LABEL}</a>.
          </p>
        </div>
      )}
    </div>
  );
}
