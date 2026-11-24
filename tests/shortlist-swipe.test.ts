import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CompareSwipeTable } from "../components/ShortlistPage";
import {
  COMPARISON_ROWS,
  buildComparison,
  type ShortlistCard,
  type ShortlistCell,
} from "../lib/shortlist";

// The phone swipe table (founder-picked option 1, 24 Nov
// 2026): below 40rem the shortlist comparison is the
// desktop table's own form in a horizontal scroller, the
// fact labels pinned in a fixed first column. Pinned
// here: the table renders one column per home with the
// rows aligned by construction (one <tr> per fact), the
// foot buttons in card order, and the desktop parity
// pins (blank first header cell, "Reports" row header,
// no sale line) — and the whole form is phone-only, the
// desktop table and its rules untouched.

// ------------------------------------------------------------------
// Fabrications (the same factory discipline as
// tests/shortlist.test.ts)
// ------------------------------------------------------------------

function cell(text: string): ShortlistCell {
  return { kind: "line", text };
}

function makeCard(id: string): ShortlistCard {
  const comparison = Object.fromEntries(
    COMPARISON_ROWS.map((row) => [row.key, cell(`${id} ${row.key}`)]),
  ) as ShortlistCard["comparison"];
  return {
    id,
    postcode: "CM3 2JT",
    homeKey: "key",
    rung: 1,
    scopeLabel: `${id} address`,
    addressLine: `${id} address`,
    lastSale: null,
    factsLine: null,
    comparison,
    savedAt: "2026-11-17T08:00:00.000Z",
  };
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

// The @media blocks for one query, brace-matched out of the
// stylesheet, in order.
function mediaBlocks(css: string, query: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(query, from);
    if (at === -1) break;
    const open = css.indexOf("{", at);
    if (open === -1) break;
    let depth = 0;
    let i = open;
    for (; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    blocks.push(css.slice(open + 1, i));
    from = i + 1;
  }
  return blocks;
}

function stripMediaBlocks(css: string, query: string): string {
  let out = css;
  for (;;) {
    const at = out.indexOf(query);
    if (at === -1) break;
    const open = out.indexOf("{", at);
    if (open === -1) break;
    let depth = 0;
    let i = open;
    for (; i < out.length; i++) {
      if (out[i] === "{") depth++;
      else if (out[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    out = out.slice(0, at) + out.slice(i + 1);
  }
  return out;
}

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the phone swipe table (option 1)", () => {
  const island = read("components/ShortlistPage.tsx");
  const css = read("app/globals.css");
  const comparison = buildComparison([makeCard("home-a"), makeCard("home-b")]);
  const markup = renderToStaticMarkup(createElement(CompareSwipeTable, { comparison }));

  it("renders one table in a scroller, one column per saved home", () => {
    expect(markup).toContain('class="compare-table__scroller"');
    expect(markup).toContain('class="compare-table compare-table--swipe"');
    expect(markup).toContain('data-card-count="2"');
    // Head: the blank label cell plus one address per home.
    expect(markup).toContain("home-a address");
    expect(markup).toContain("home-b address");
    // One body row per fact in the pinned order.
    for (const row of COMPARISON_ROWS) {
      expect(markup).toContain(`data-compare-row="${row.key}"`);
      // The label as rendered (React escapes the "&" in
      // "Hospital with A&E").
      expect(markup).toContain(`>${row.label.replace(/&/g, "&amp;")}</th>`);
    }
    // One report button per home, in card order, at the foot.
    const buttons = [...markup.matchAll(/Get the full report — £4\.99/g)];
    expect(buttons).toHaveLength(2);
  });

  it("keeps the rows aligned: one row per fact, cells in card order", () => {
    for (const row of COMPARISON_ROWS) {
      const rowHtml = markup.match(
        new RegExp(`<tr data-compare-row="${row.key}">([\\s\\S]*?)</tr>`),
      )?.[1];
      expect(rowHtml, `row ${row.key} renders`).toBeDefined();
      const aAt = rowHtml!.indexOf(`home-a ${row.key}`);
      const bAt = rowHtml!.indexOf(`home-b ${row.key}`);
      expect(aAt).toBeGreaterThan(-1);
      expect(bAt).toBeGreaterThan(aAt);
    }
  });

  it("keeps the desktop table's parity pins", () => {
    // The first header cell is blank for sighted readers —
    // "Check" survives for screen readers only.
    expect(markup).toContain('<span class="visually-hidden">Check</span>');
    // The foot row opens with a row header carrying the
    // screen-reader-only "Reports" label, as the sample's
    // table does.
    expect(markup).toContain('<span class="visually-hidden">Reports</span>');
    // No sale line anywhere in the comparison — the sale
    // line lives on the card above, not repeated here.
    expect(island).not.toContain("compare-table__sale");
    expect(markup).not.toContain("£425,000");
    const head = markup.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "";
    expect(head).not.toContain("£");
  });

  it("is phone-only: the form switches below 40rem, the rules live in that media block", () => {
    expect(island).toContain('matchMedia("(max-width: 40rem)")');
    expect(island).toContain("<CompareSwipeTable comparison={comparison} />");
    const blocks = mediaBlocks(css, "@media (max-width: 40rem)");
    const swipe = blocks.filter((block) => block.includes(".compare-table__scroller"));
    expect(swipe).toHaveLength(1);
    const rules = swipe[0];
    expect(rules).toContain("overflow-x: auto");
    expect(rules).toContain("scroll-snap-type: x proximity");
    expect(rules).toContain("scroll-padding-left: 6.5rem");
    expect(rules).toContain("position: sticky");
    expect(rules).toContain("left: 0");
    expect(rules).toContain("width: 11rem");
    expect(rules).toContain("table-layout: fixed");
    expect(rules).toContain("border-collapse: separate");
    // And the swipe selectors appear nowhere outside a
    // max-width: 40rem block.
    const outside = stripMediaBlocks(css, "@media (max-width: 40rem)");
    expect(outside).not.toContain(".compare-table--swipe");
    expect(outside).not.toContain(".compare-table__scroller");
  });

  it("leaves the desktop table and its rules untouched", () => {
    // The desktop branch still renders the plain table.
    expect(island).toContain(
      '<table className="compare-table" data-card-count={comparison.columns.length}>',
    );
    // The 40–48rem band keeps the stacked blocks.
    expect(island).toContain('className="shortlist-compare__grid"');
    // The desktop table's own rules stand: fixed layout,
    // full width, the paper frame.
    const table = css.match(/\.compare-table \{[^}]*\}/)?.[0] ?? "";
    expect(table).toContain("width: 100%");
    expect(table).toContain("table-layout: fixed");
    expect(table).toContain("border: 1px solid var(--colour-line-warm)");
    expect(table).toContain("border-radius: 16px");
  });
});
