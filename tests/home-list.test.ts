import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomeList from "../components/HomeList";

// The home picker on the whole-postcode check (founder
// ruling, 20 Nov 2026): the full address list dump and
// its count line are gone; ONE dropdown under the intro
// line carries the postcode's homes in the order the
// read model served them (house-number order), each
// option keyed by its home key so a choice goes straight
// to that home's check.
describe("the home picker on the whole-postcode check", () => {
  const addresses = [
    { key: "1|RODBER CLOSE", label: "1 Rodber Close" },
    { key: "2|RODBER CLOSE", label: "2 Rodber Close" },
    { key: "10|RODBER CLOSE", label: "10 Rodber Close" },
  ];

  it("renders the heading, the founder's intro line and one dropdown — no list, no count line", () => {
    const html = renderToStaticMarkup(
      createElement(HomeList, {
        postcode: "BA9 9BR",
        heading: "Rodber Close",
        addresses,
      }),
    );
    expect(html).toContain("<h2>Rodber Close</h2>");
    expect(html).toContain(
      "Flood risk and school places can differ from one house to the next — pick your exact house for its own check.",
    );
    // One select in the kit's field dress, prompted, with
    // one option per home keyed by its home key.
    expect(html).toContain('<select class="field__input picker__select"');
    expect(html).toContain(
      '<option value="" disabled="" selected="">Choose your exact house</option>',
    );
    expect(html).toContain('<option value="1|RODBER CLOSE">1 Rodber Close</option>');
    expect(html).toContain('<option value="2|RODBER CLOSE">2 Rodber Close</option>');
    expect(html).toContain('<option value="10|RODBER CLOSE">10 Rodber Close</option>');
    // The dump and its count line are gone.
    expect(html).not.toContain("picker__list");
    expect(html).not.toContain("picker__row");
    expect(html).not.toContain("picker__count");
    expect(html).not.toContain("3 addresses");
  });

  it("keeps the homes in the served order — house-number order, never re-sorted", () => {
    const html = renderToStaticMarkup(
      createElement(HomeList, {
        postcode: "BA9 9BR",
        heading: "Rodber Close",
        addresses,
      }),
    );
    const one = html.indexOf("1 Rodber Close");
    const two = html.indexOf("2 Rodber Close");
    const ten = html.indexOf("10 Rodber Close");
    expect(one).toBeGreaterThan(-1);
    expect(one).toBeLessThan(two);
    expect(two).toBeLessThan(ten);
  });

  it("the empty postcode keeps its named empty line and offers no dropdown", () => {
    const html = renderToStaticMarkup(
      createElement(HomeList, {
        postcode: "CM0 7AA",
        heading: "CM0 7AA",
        addresses: [],
      }),
    );
    expect(html).toContain("No addresses we can list for this postcode yet.");
    expect(html).not.toContain("<select");
  });
});
