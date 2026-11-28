import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CompareSwipeTable } from "../components/ShortlistPage";
import { homeRoute } from "../lib/journey";
import {
  COMPARISON_ROWS,
  buildComparison,
  type ShortlistCard,
  type ShortlistCell,
} from "../lib/shortlist";

// BUG-400 (founder screenshot + message, 28 Nov 2026): on
// the shortlist page the three Remove buttons do not line
// up — 2 Cedars (CM23 4QS) has no recorded sale, so its
// header cell has no sale line and its Remove button sits
// higher than the other two. The header cell becomes a
// flex column with the actions pushed to the bottom, so
// every column's Remove sits at the same height whether
// or not the sale line (or the rung-3 facts line) is
// there. The buy button at each column's foot is
// untouched (founder's ruling, 17 Nov 2026).
//
// BUG-401 (founder message, 28 Nov 2026): the home's
// address in the shortlist header is plain text — make it
// clickable, and the click re-runs the search for that
// address: to the checking screen, then the headline
// report. The address links through the SAME flow the
// search box performs for a picked home — homeRoute,
// postcode + home key, same tab — so it lands on
// /search/home, whose checking screen advances to the
// headline report. A rung-3 card holds an area, not a
// home, so its address has no home key and stays plain.
// The address keeps the Final Sample Master's dress
// (samples 14–16): the link inherits the address's
// colour with no underline, and underlines on hover and
// keyboard focus only.

// ------------------------------------------------------------------
// Fabrications (the same factory discipline as
// tests/shortlist.test.ts and tests/shortlist-swipe.test.ts)
// ------------------------------------------------------------------

function cell(text: string): ShortlistCell {
  return { kind: "line", text };
}

function makeCard(id: string, overrides: Partial<ShortlistCard> = {}): ShortlistCard {
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
    ...overrides,
  };
}

// The founder's three homes from the BUG-400 screenshot:
// two with a recorded sale, 2 Cedars with none.
const exeter = makeCard("exeter", {
  postcode: "E16 1GN",
  homeKey: "5||EXETER ROAD",
  addressLine: "5 Exeter Road, E16 1GN",
  scopeLabel: "5 Exeter Road, E16 1GN",
  lastSale: { price: 571000, date: "2024-01-15", typeLabel: "Terraced", tenureLabel: "Freehold" },
});
const birkdale = makeCard("birkdale", {
  postcode: "CM3 2JT",
  homeKey: "12||BIRKDALE RISE",
  addressLine: "12 Birkdale Rise, CM3 2JT",
  scopeLabel: "12 Birkdale Rise, CM3 2JT",
  lastSale: { price: 452995, date: "2022-08-20", typeLabel: "Detached", tenureLabel: "Freehold" },
});
const cedars = makeCard("cedars", {
  postcode: "CM23 4QS",
  homeKey: "2||CEDARS",
  addressLine: "2 Cedars, CM23 4QS",
  scopeLabel: "2 Cedars, CM23 4QS",
  lastSale: null,
});

// A rung-3 card: an area, not a home — no home key, and
// its facts line stands in the header.
const areaCard = makeCard("area", {
  postcode: "CM3",
  homeKey: null,
  rung: 3,
  addressLine: "CM3",
  scopeLabel: "CM3",
  lastSale: null,
  factsLine: "Nearest primary 0.4 mi",
});

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// The header cells of one rendered table, in column
// order — each <th scope="col" data-rung="…">…</th>.
function headerCells(markup: string): string[] {
  const head = markup.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "";
  return [...head.matchAll(/<th scope="col" data-rung="(\d)">([\s\S]*?)<\/th>/g)].map(
    ([, , body]) => body,
  );
}

describe("BUG-400 — the Remove buttons line up", () => {
  const island = read("components/ShortlistPage.tsx");
  const css = read("app/globals.css");
  const comparison = buildComparison([exeter, birkdale, cedars]);
  const markup = renderToStaticMarkup(
    createElement(CompareSwipeTable, { comparison, onRemove: () => {} }),
  );

  it("the header cell is a flex column with the actions pushed to the bottom", () => {
    // The head wrapper's own rule: a column that fills
    // the cell, so the actions' auto top margin has a
    // cell-height column to push against.
    const head = css.match(/\.compare-table__head \{[^}]*\}/)?.[0] ?? "";
    expect(head).toContain("display: flex");
    expect(head).toContain("flex-direction: column");
    expect(head).toContain("height: 100%");
    // The cell carries a 1px height so the head's 100%
    // resolves against the row's height — without it a
    // percentage height inside a table cell resolves to
    // content height, and the auto margin has no free
    // space to take (proven in the browser: the no-sale
    // column's Remove sat 50px high before this line).
    const cellHeights = [...css.matchAll(/\.compare-table thead th \{[^}]*\}/g)].map(
      ([rule]) => rule,
    );
    expect(cellHeights.some((rule) => rule.includes("height: 1px"))).toBe(true);
    // The actions keep their 0.7rem gap to the content
    // above (as padding, so the gap stands even where
    // the auto margin has no free space to absorb) and
    // take the free space above them.
    const actions = css.match(/\.compare-table__actions \{[^}]*\}/)?.[0] ?? "";
    expect(actions).toContain("margin-top: auto");
    expect(actions).toContain("padding-top: 0.7rem");
  });

  it("every column's Remove is the last thing in its header — sale line or not", () => {
    const heads = headerCells(markup);
    expect(heads).toHaveLength(3);
    for (const head of heads) {
      // The head wrapper holds the whole card, and the
      // actions paragraph closes it.
      expect(head).toContain('class="compare-table__head"');
      expect(head.trimEnd()).toMatch(
        /<p class="compare-table__actions">[\s\S]*Remove[\s\S]*<\/p>\s*<\/div>\s*$/,
      );
    }
    // The two sale columns carry their sale lines; the
    // no-sale column carries none — and no invented
    // "No sale" line.
    expect(heads[0]).toContain("£571,000");
    expect(heads[1]).toContain("£452,995");
    expect(heads[2]).not.toContain("compare-table__sale");
    expect(heads[2]).not.toContain("No sale");
  });

  it("the rung-3 facts line stands in the header and Remove is still last", () => {
    const rung3Comparison = buildComparison([exeter, areaCard]);
    const rung3Markup = renderToStaticMarkup(
      createElement(CompareSwipeTable, { comparison: rung3Comparison, onRemove: () => {} }),
    );
    const heads = headerCells(rung3Markup);
    expect(heads).toHaveLength(2);
    expect(heads[1]).toContain("compare-table__facts");
    expect(heads[1]).toContain("Nearest primary 0.4 mi");
    expect(heads[1].trimEnd()).toMatch(
      /<p class="compare-table__actions">[\s\S]*Remove[\s\S]*<\/p>\s*<\/div>\s*$/,
    );
  });

  it("the buy button at each column's foot is untouched", () => {
    const buttons = [...markup.matchAll(/Get the full report — £4\.99/g)];
    expect(buttons).toHaveLength(3);
    // The foot still opens with the screen-reader-only
    // "Reports" row header.
    expect(markup).toContain('<span class="visually-hidden">Reports</span>');
  });

  it("the stacked blocks keep the head in kind — checked, no change needed", () => {
    // The 40–48rem band keeps the proven block stacking
    // (tests/shortlist-swipe.test.ts pins the grid), and
    // the grid is a single column — one block per home,
    // stacked vertically — so there is no side-by-side
    // Remove to align across blocks. The stacked head
    // keeps its address, sale line, facts line and
    // Remove in the same order as the table head.
    const grid = css.match(/\.shortlist-compare__grid \{[^}]*\}/)?.[0] ?? "";
    expect(grid).toContain("grid-template-columns: 1fr");
    expect(island).toContain('className="shortlist-compare__address"');
    expect(island).toContain('className="shortlist-compare__remove"');
  });
});

describe("BUG-401 — the address re-runs the search", () => {
  const island = read("components/ShortlistPage.tsx");
  const css = read("app/globals.css");
  const comparison = buildComparison([exeter, birkdale, cedars]);
  const markup = renderToStaticMarkup(
    createElement(CompareSwipeTable, { comparison, onRemove: () => {} }),
  );

  it("a rung-1 address is the search-flow control, postcode + home key", () => {
    // The SAME route the search box navigates for a
    // picked home (lib/journey.ts homeRoute) — the
    // checking screen, then the headline report. Same
    // tab: a plain anchor, no target.
    const expected = homeRoute("E16 1GN", "5||EXETER ROAD").replace(/&/g, "&amp;");
    expect(markup).toContain(
      `<a class="compare-table__address" href="${expected}">5 Exeter Road, E16 1GN</a>`,
    );
    const birkdaleHref = homeRoute("CM3 2JT", "12||BIRKDALE RISE").replace(/&/g, "&amp;");
    expect(markup).toContain(
      `<a class="compare-table__address" href="${birkdaleHref}">12 Birkdale Rise, CM3 2JT</a>`,
    );
    const cedarsHref = homeRoute("CM23 4QS", "2||CEDARS").replace(/&/g, "&amp;");
    expect(markup).toContain(
      `<a class="compare-table__address" href="${cedarsHref}">2 Cedars, CM23 4QS</a>`,
    );
    // No new-tab behaviour anywhere in the header.
    const head = markup.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "";
    expect(head).not.toContain('target="_blank"');
  });

  it("a rung-3 address is plain — an area has no home key to search", () => {
    const rung3Comparison = buildComparison([exeter, areaCard]);
    const rung3Markup = renderToStaticMarkup(
      createElement(CompareSwipeTable, { comparison: rung3Comparison, onRemove: () => {} }),
    );
    const heads = headerCells(rung3Markup);
    expect(heads).toHaveLength(2);
    expect(heads[1]).toContain("CM3");
    expect(heads[1]).not.toContain("<a");
    expect(heads[1]).not.toContain("/search/home");
  });

  it("the stacked block carries the same address control in kind", () => {
    // The default page cannot be server-rendered (its
    // pending state returns null), so — as the existing
    // shortlist tests do — the stacked head is pinned
    // at source level: its address renders through the
    // same control as the table head.
    expect(island).toContain("ShortlistAddress");
    expect(island).toContain('className="shortlist-compare__address"');
    const stacked = island.match(/<h3 className="shortlist-compare__address">([\s\S]*?)<\/h3>/g);
    expect(stacked).toHaveLength(1);
    expect(stacked![0]).toContain("ShortlistAddress");
  });

  it("the link keeps the Master's dress — inherited colour, underline on hover/focus only", () => {
    // Static dress is the sample's own: no restyle, no
    // permanent underline, no link blue. The affordance
    // is the underline on hover and keyboard focus.
    const dress = css.match(/\.compare-table__address[^{]*\{[^}]*\}/g)?.join("\n") ?? "";
    expect(dress).toContain("color: inherit");
    expect(dress).toContain("text-decoration: none");
    expect(css).toContain(".compare-table__address:hover");
    expect(css).toContain(".compare-table__address:focus-visible");
    expect(css).toMatch(/\.compare-table__address:hover[\s\S]*?text-decoration: underline/);
    // The stacked form's link keeps the same dress.
    expect(css).toContain(".shortlist-compare__address-link");
    expect(css).toMatch(
      /\.shortlist-compare__address-link:hover[\s\S]*?text-decoration: underline/,
    );
  });
});
