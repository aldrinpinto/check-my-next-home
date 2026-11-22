import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import StreetChoice from "../components/StreetChoice";

// The street choice page (M7.15C, 18 Nov 2026): a
// street spanning postcodes renders its short postcode
// list — the rows in the order the read model served
// them (home count descending, the street's centre of
// gravity first), each row opening that postcode's
// check narrowed to the street. WA-10 re-pin: the page
// wears Sample 29's district dress now — the postcode
// in the row's code tile, the street as its label.
describe("the street choice page", () => {
  it("renders the heading, the pinned line, the count and one row per postcode", () => {
    const html = renderToStaticMarkup(
      createElement(StreetChoice, {
        street: "Birkdale Rise",
        town: "Chelmsford",
        rows: [
          { postcode: "CM3 2JT", town: "CHELMSFORD", street: "BIRKDALE RISE", homes: 30 },
          { postcode: "CM3 2JU", town: "CHELMSFORD", street: "BIRKDALE RISE", homes: 3 },
        ],
      }),
    );
    expect(html).toContain('<h1 class="page-title">Birkdale Rise, Chelmsford</h1>');
    expect(html).toContain(
      "This street covers more than one postcode — pick yours to see its homes.",
    );
    expect(html).toContain("2 postcodes");
    expect(html).toContain('href="/search?postcode=CM3+2JT&amp;street=BIRKDALE+RISE"');
    expect(html).toContain('href="/search?postcode=CM3+2JU&amp;street=BIRKDALE+RISE"');
    expect(html).toContain("Birkdale Rise, Chelmsford");
    // The Sample 29 row anatomy: the code tile carries
    // the postcode, the label the street.
    expect(html).toContain('class="district-place__list"');
    expect(html).toContain('class="district-place__row"');
    expect(html).toContain('<span class="district-place__code">CM3 2JT</span>');
    expect(html).toContain('<span class="district-place__code">CM3 2JU</span>');
    // A street pick never lands on a home.
    expect(html).not.toContain("home=");
  });

  it("a town-less street heads with the street alone", () => {
    const html = renderToStaticMarkup(
      createElement(StreetChoice, {
        street: "Mill Lane",
        town: null,
        rows: [
          { postcode: "AB1 2CD", town: null, street: "MILL LANE", homes: 5 },
          { postcode: "AB1 2CE", town: null, street: "MILL LANE", homes: 2 },
        ],
      }),
    );
    expect(html).toContain('<h1 class="page-title">Mill Lane</h1>');
    expect(html).toContain('<span class="district-place__code">AB1 2CD</span>');
    expect(html).toContain("Mill Lane");
  });
});
