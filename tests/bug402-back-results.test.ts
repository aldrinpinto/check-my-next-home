import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MouseEventHandler, ReactNode } from "react";

import CheckingScreen from "../components/CheckingScreen";
import PlaceChoice from "../components/PlaceChoice";
import ReportDoorPage from "../components/ReportDoorPage";
import ReportLink from "../components/ReportLink";
import ReportPaymentFailedPage from "../components/ReportPaymentFailedPage";
import ReportWindowPage from "../components/ReportWindowPage";
import ResultsPage from "../components/ResultsPage";
import { CHECKING_HEADING_HOME } from "../lib/journey";
import { buildReportDoorView, buildReportWindowView } from "../lib/report-door";
import { buildReportPaymentFailedView } from "../lib/report-payment-failed";
import { buildWiderAreaView } from "../lib/results";
import type { ShortBundle } from "../lib/short-bundle";
import { judgeColdProbeResponse } from "../scripts/cold-probe.mjs";

// BUG-402 (28 Nov 2026): back-navigation from the
// payment page showed a near-blank "Opening your
// results…" page for ~1s before the free headline
// report landed (founder video: /report for 12 Exeter
// Road, Back to /search/home, the fallback alone, then
// the results).
//
// The cause: the buy link was a plain <a>, so results
// → payment was a full document navigation — the JS
// context, and with it Next's in-memory segment cache
// holding the results route's fulfilled payload, was
// destroyed. The results route is force-dynamic, served
// no-store, so the browser's own back/forward cache
// could not restore the document either. Back therefore
// forced a full server re-render; the async Results
// suspended again while its payload streamed, and React
// showed the Suspense fallback (the CheckingScreen
// itself restores instantly via the BUG-320 session flag
// — which is why the video shows the fallback alone,
// with no checking screen).
//
// The fix: the links that leave a results page navigate
// client-side (next/link), so the results entry stays in
// the router's segment cache and Back restores the
// fulfilled payload with no dynamic request, no
// suspension and no fallback. The genuine fresh-search
// flow — checking screen, then results reveal — is
// untouched.
//
// next/link is mocked with a marker here: the mock
// renders an anchor carrying data-next-link="true" and
// the prefetch it was given, so the tests can tell a
// client-side Link from the plain anchor the bug
// shipped. The mock keeps the anchor's href, class and
// children exactly — the same contract the real Link
// keeps.

vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    className,
    children,
    onClick,
  }: {
    href: string;
    prefetch?: boolean | null;
    className?: string;
    children?: ReactNode;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
  }) =>
    createElement(
      "a",
      {
        href,
        "data-next-link": "true",
        "data-prefetch": prefetch === undefined ? "auto" : String(prefetch),
        className,
        onClick,
      },
      children,
    ),
}));

describe("BUG-402 — the buy link navigates client-side", () => {
  it("renders a next/link to the payment page, not a plain anchor", () => {
    const html = renderToStaticMarkup(
      // eslint-disable-next-line react/no-children-prop -- createElement's props must carry children for typecheck (React 19 types require it in the props object); the rule's separate-arguments form fails tsc here.
      createElement(ReportLink, {
        href: "/report?postcode=CM3+2JT",
        className: "report-btn",
        children: "Get the full report",
      }),
    );
    // The anchor it replaces, exactly: same href, same
    // class, same children.
    expect(html).toContain('href="/report?postcode=CM3+2JT"');
    expect(html).toContain('class="report-btn"');
    expect(html).toContain("Get the full report");
    // But the navigation is client-side now: a Link, with
    // no speculative prefetch of the payment page (its
    // render reads the gift and fulfilment stores — work
    // for a click, never for a viewport sighting).
    expect(html).toContain('data-next-link="true"');
    expect(html).toContain('data-prefetch="false"');
  });
});

describe("BUG-402 — the district twin's outbound links navigate client-side", () => {
  // The compact wider-area fixture (tests/results.test.ts's
  // rung-3 shape): twelve unavailable sections, no buy bar,
  // no bridge — but the check-pills strip and the closing
  // disclaimer both render, which is what this pins.
  const widerShort: Extract<ShortBundle, { kind: "wider-area" }> = {
    rung: 3,
    kind: "wider-area",
    sections: Object.fromEntries(
      [
        "soldPrices",
        "flood",
        "crime",
        "epc",
        "councilTax",
        "constraints",
        "heritage",
        "nature",
        "air",
        "noise",
        "broadband",
        "nearby",
      ].map((key) => [key, { state: "unavailable", reason: `${key} needs an exact postcode` }]),
    ) as never,
  };

  it("every check pill and the How-we-check link is a Link — no plain internal anchor remains", () => {
    const html = renderToStaticMarkup(
      createElement(ResultsPage, { view: buildWiderAreaView(widerShort) }),
    );
    const anchors = html.match(/<a /g) ?? [];
    const links = html.match(/data-next-link="true"/g) ?? [];
    const noPrefetch = html.match(/data-prefetch="false"/g) ?? [];
    // Sixteen anchors on this page — fifteen check pills
    // and the closing How-we-check link — all internal, so
    // every one navigates client-side.
    expect(anchors.length).toBe(16);
    expect(links.length).toBe(anchors.length);
    expect(noPrefetch.length).toBe(anchors.length);
    // And the pills still point where they pointed.
    expect(html).toContain('href="/check/flood-risk"');
    expect(html).toContain('href="/check/schools"');
    expect(html).toContain('href="/how-we-check"');
  });

  it("a place row links to its district client-side", () => {
    const html = renderToStaticMarkup(
      createElement(PlaceChoice, {
        place: "Hatfield Peverel",
        districts: [
          {
            outward: "CM3",
            settlements: ["Hatfield Peverel"],
            examplePostcode: "CM3 2JT",
            postTown: "Chelmsford",
          },
        ],
      }),
    );
    expect(html).toContain('class="district-place__row"');
    expect(html).toContain('href="/search?outward=CM3"');
    expect(html).toContain("CM3 — Chelmsford");
    expect(html).toContain('data-next-link="true"');
    expect(html).toContain('data-prefetch="false"');
  });
});

describe("BUG-402 — the payment side's way back is client-side too", () => {
  // The return visit the founder's video shows is
  // browser-Back — but the payment side also links back
  // to the free check in its own words ("Back to your
  // free check"), on the failed landing, the door and the
  // window. A plain anchor there is the same cause in
  // the other direction: a full load of the results page
  // behind the fallback. These pins hold the return
  // links to the same client-side navigation.
  const exeter = {
    kind: "home",
    postcode: "E16 1GN",
    homeKey: "12||EXETER ROAD",
    subject: "12 Exeter Road",
    subline: "London, E16 1GN",
  } as const;

  // The anchors that return to a completed check — the
  // results route and the shortlist — out of a page's
  // rendered tags.
  function returnLinks(html: string): string[] {
    return (html.match(/<a [^>]*>/g) ?? []).filter(
      (tag) => tag.includes("/search/home") || tag.includes('href="/shortlist"'),
    );
  }

  it("the failed landing's back-to-check and shortlist links are Links", () => {
    const html = renderToStaticMarkup(
      createElement(ReportPaymentFailedPage, {
        view: buildReportPaymentFailedView({ identity: exeter }),
      }),
    );
    const links = returnLinks(html);
    expect(links).toHaveLength(2);
    for (const tag of links) {
      expect(tag).toContain('data-next-link="true"');
      expect(tag).toContain('data-prefetch="false"');
    }
    expect(html).toContain("home=12%7C%7CEXETER+ROAD");
    expect(html).toContain("Back to your free check");
  });

  it("the report door's back-to-check link is a Link", () => {
    const html = renderToStaticMarkup(
      createElement(ReportDoorPage, { view: buildReportDoorView(exeter) }),
    );
    const links = returnLinks(html);
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('data-next-link="true"');
    expect(links[0]).toContain('data-prefetch="false"');
    expect(links[0]).toContain("home=12%7C%7CEXETER+ROAD");
  });

  it("the window's back-to-check link is a Link", () => {
    const html = renderToStaticMarkup(
      createElement(ReportWindowPage, {
        view: buildReportWindowView(exeter),
        postcode: "E16 1GN",
        homeKey: "12||EXETER ROAD",
      }),
    );
    const links = returnLinks(html);
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('data-next-link="true"');
    expect(links[0]).toContain('data-prefetch="false"');
    expect(links[0]).toContain("home=12%7C%7CEXETER+ROAD");
  });
});

describe("BUG-402 — the genuine fresh search still shows the checking screen", () => {
  it("a fresh render shows the checking frame, not the results behind it", () => {
    const html = renderToStaticMarkup(
      // eslint-disable-next-line react/no-children-prop -- createElement's props must carry children for typecheck (React 19 types require it in the props object); the rule's separate-arguments form fails tsc here.
      createElement(CheckingScreen, {
        postcode: "CM3 2JT",
        homeKey: "19||BIRKDALE RISE",
        heading: CHECKING_HEADING_HOME,
        eyebrow: { lead: "19 Birkdale Rise", town: "Hatfield Peverel" },
        children: createElement("p", null, "RESULTS MARKER"),
      }),
    );
    expect(html).toContain("Your check is under way");
    expect(html).toContain("Starting your check…");
    // The first row is already active on the first render
    // (its doing line), the other four wait — the live
    // screen's at-rest state, not the loading boundary's
    // all-waiting frame (BUG-268).
    expect(html).toContain("Checking Ofsted ratings near this home…");
    expect(html.match(/>Waiting</g)).toHaveLength(4);
    for (const label of [
      "Schools &amp; nurseries",
      "Health &amp; the everyday",
      "Costs &amp; connections",
      "Past sales &amp; prices",
      "Safety &amp; surroundings",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("RESULTS MARKER");
  });
});

describe("BUG-402 — the cold-probe contract still holds", () => {
  it("a 200 carrying only the fallback still fails the probe", () => {
    expect(
      judgeColdProbeResponse({ status: 200, body: "<main><p>Opening your results…</p></main>" }),
    ).toEqual({ kind: "fail", detail: "no results markers in the served page" });
  });

  it("a 200 carrying the results markers still passes", () => {
    expect(
      judgeColdProbeResponse({
        status: 200,
        body: [
          '<section class="checking" aria-label="Checking your home">',
          'self.__next_f.push([1,"{\\"className\\":\\"results-head\\"}"])',
          'self.__next_f.push([1,"{\\"className\\":\\"results-section\\",\\"data-section\\":\\"sold-prices\\"}"])',
          'self.__next_f.push([1,"{\\"className\\":\\"results-section\\",\\"data-section\\":\\"crime\\"}"])',
        ].join("\n"),
      }),
    ).toEqual({ kind: "pass", detail: "results rendered" });
  });
});
