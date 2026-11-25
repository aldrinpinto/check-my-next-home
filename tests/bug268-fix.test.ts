import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomeLoading from "../app/search/home/loading";

// BUG-268 (25 Nov 2026): the /search/home route's
// loading boundary rendered null while the address
// resolution ran, so the first painted frame was the
// layout shell alone — header and the tall dark-green
// footer, nothing between — a flash on every
// search-to-checking navigation. The boundary now
// renders the home checking screen's frame at rest.
// These pins hold that frame to the live screen's
// at-rest state (components/CheckingScreen.tsx,
// Sample 7, Final Sample Master view 2) — except its
// data hooks. BUG-358 (25 Nov 2026): the frame
// carries NO data-row / data-state hooks, so while
// the resolution streams the fallback can never
// collide with the live screen's locators (CI #356's
// strict-mode violation on data-row="costs").

const HTML = renderToStaticMarkup(createElement(HomeLoading));

describe("BUG-268 — the home loading boundary renders the checking frame at rest", () => {
  it("carries the heading, intro and starting ticker, dot inside the text span", () => {
    expect(HTML).toContain('<section class="checking" aria-label="Your check is under way">');
    expect(HTML).toContain('<h1 class="page-title">Your check is under way</h1>');
    expect(HTML).toContain(
      '<p class="checking__intro">We present the facts — the decision is yours.</p>',
    );
    expect(HTML).toContain("Starting your check…");
    expect(HTML).toContain('<span class="checking__ticker-dot" aria-hidden="true"></span>');
  });

  it("carries the seal unshaded, five segments in the live screen's geometry", () => {
    expect(HTML).toContain('<svg class="checking__seal" viewBox="0 0 160 160"');
    expect(HTML).toContain("Five checks · one seal");
    for (const rotation of [-90, -18, 54, 126, 198]) {
      expect(HTML).toContain(`transform="rotate(${rotation} 80 80)"`);
    }
    expect(HTML.match(/stroke-dasharray="77\.94 336\.75"/g)).toHaveLength(5);
    expect(HTML).not.toContain('data-on="true"');
    expect(HTML).toContain("M52 84 L80 58 L108 84 M60 78 V106 H100 V78 M73 106 V92 H87 V106");
  });

  it("carries the progress bar empty and the step line at the start", () => {
    expect(HTML).toContain('aria-label="Checks complete"');
    expect(HTML).toContain('aria-valuenow="0"');
    expect(HTML).toContain('style="width:0%"');
    expect(HTML).toContain('<p class="checking__stepline"><span>Starting your check…</span>');
  });

  it("carries the five groups waiting, each with its label, Waiting state and source", () => {
    const rows: Array<[string, string]> = [
      ["schools", "Schools &amp; nurseries"],
      ["health", "Health &amp; the everyday"],
      ["costs", "Costs &amp; connections"],
      ["history", "Past sales &amp; prices"],
      ["safety", "Safety &amp; surroundings"],
    ];
    const sources = [
      "Ofsted",
      "NHS &amp; local data",
      "Council &amp; providers",
      "HM Land Registry",
      "Police.uk · Environment Agency",
    ];
    for (const [, label] of rows) {
      expect(HTML).toContain(label);
    }
    for (const source of sources) {
      expect(HTML).toContain(source);
    }
    expect(HTML.match(/>Waiting</g)).toHaveLength(5);
  });

  it("carries no data hooks on its rows (BUG-358) — the live screen owns them", () => {
    expect(HTML).not.toContain("data-row=");
    expect(HTML).not.toContain("data-state=");
  });

  it("holds the closing line invisible until the seal stamps", () => {
    expect(HTML).toContain("Your check is ready — five areas, every figure sourced, seal stamped.");
    expect(HTML).not.toContain('data-visible="true"');
  });

  it("carries no address eyebrow and no live region — the boundary has no parameters", () => {
    expect(HTML).not.toContain("addr-line");
    expect(HTML).not.toContain('role="status"');
  });
});
