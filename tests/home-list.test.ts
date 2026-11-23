import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomeList from "../components/HomeList";

// The home picker on the whole-postcode check (founder
// ruling, 20 Nov 2026): the full address list dump and
// its count line are gone; ONE dropdown under the intro
// line carries the postcode's homes in the order the
// read model served them (house-number order), each
// row keyed by its home key so a choice goes straight
// to that home's check.
//
// BUG-185 (23 Nov 2026): the dropdown is rebuilt as the
// SAME custom dropdown as the search box — the native
// select could not hold the "Don't see your home?"
// action row. The pins below replace the old
// select/option pins deliberately: the closed field is
// a button in the field dress carrying the prompt; the
// panel (and with it the rows and the action row) opens
// on the client, so static markup carries the closed
// form only and the row order is pinned at the source.
describe("the home picker on the whole-postcode check", () => {
  const addresses = [
    { key: "1|RODBER CLOSE", label: "1 Rodber Close" },
    { key: "2|RODBER CLOSE", label: "2 Rodber Close" },
    { key: "10|RODBER CLOSE", label: "10 Rodber Close" },
  ];

  it("renders the heading, the title, the intro line and the closed custom dropdown", () => {
    const html = renderToStaticMarkup(
      createElement(HomeList, {
        postcode: "BA9 9BR",
        heading: "Rodber Close",
        addresses,
      }),
    );
    expect(html).toContain("<h2>Rodber Close</h2>");
    expect(html).toContain('<h3 class="picker__title">Pick a home</h3>');
    expect(html).toContain(
      "Flood risk and school places can differ from one house to the next — pick your exact house for its own check.",
    );
    // The closed field: a button in the kit's field
    // dress (Sample 48's form kept), prompted, chevroned
    // by the stylesheet — and NO native select anywhere.
    expect(html).toContain(
      '<button type="button" class="field__input picker__select picker__trigger"',
    );
    expect(html).toContain("Choose your exact house");
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<option");
    // The panel is closed in the static form: the rows
    // (and the action row) render only once it opens.
    expect(html).not.toContain("picker__panel");
    expect(html).not.toContain("1 Rodber Close");
    // The dump and its count line stay gone.
    expect(html).not.toContain("picker__list");
    expect(html).not.toContain("picker__row");
    expect(html).not.toContain("picker__count");
    expect(html).not.toContain("3 addresses");
  });

  it("keeps the homes in the served order — the panel maps the rows as given, never re-sorted", async () => {
    // The panel is client-opened, so the order pin sits
    // at the source: the rows render by a plain map over
    // the served array, with the action row after them.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/HomeList.tsx", "utf8");
    expect(source).toContain("rows.map((row)");
    expect(source).not.toMatch(/rows\.sort|\.sort\(.*label/);
    const mapAt = source.indexOf("rows.map((row)");
    const rowAt = source.indexOf("<SupplementRow");
    expect(mapAt).toBeGreaterThan(-1);
    // The "Don't see your home?" row is the panel's LAST
    // item — after the homes it supplements.
    expect(rowAt).toBeGreaterThan(mapAt);
  });

  it("the empty postcode keeps its named empty line and offers no dropdown (switch off)", () => {
    const html = renderToStaticMarkup(
      createElement(HomeList, {
        postcode: "CM0 7AA",
        heading: "CM0 7AA",
        addresses: [],
      }),
    );
    expect(html).toContain("No addresses we can list for this postcode yet.");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("picker__trigger");
    expect(html).not.toContain("picker__dropdown");
  });

  it("the empty postcode with the switch on stands the dropdown holding only the row", () => {
    const html = renderToStaticMarkup(
      createElement(HomeList, {
        postcode: "CM0 7AA",
        heading: "CM0 7AA",
        addresses: [],
        supplementEnabled: true,
      }),
    );
    expect(html).toContain("No addresses we can list for this postcode yet.");
    // The closed field stands under the line; the row
    // itself waits inside the (closed) panel.
    expect(html).toContain("picker__trigger");
    expect(html).toContain("Choose your exact house");
    expect(html).not.toContain("<select");
  });
});
