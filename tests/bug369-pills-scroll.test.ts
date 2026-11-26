import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// BUG-369 (26 Nov 2026) — the results pill strip is one
// horizontally scrollable row at phone width, not stacked
// rows. The CSS pins read app/globals.css the way the
// look-feel kit does. The strip's base rule (the first
// `.results-strip {` in the file) is the desktop form;
// the phone form lives in the @media (max-width: 40rem)
// block below it.

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

function stripRules(): string[] {
  return css.match(/\.results-strip\s*\{[^}]*\}/g) ?? [];
}

describe("BUG-369 — one scrollable row of pills on mobile", () => {
  it("the phone rule makes the strip a single non-wrapping scroll row", () => {
    expect(css).toMatch(/\.results-strip\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*\}/);
    expect(css).toMatch(/\.results-strip\s*\{[^}]*overflow-x:\s*auto;[^}]*\}/);
  });

  it("the phone rule centres safely, so an overflowing row never clips its left edge", () => {
    expect(css).toMatch(/\.results-strip\s*\{[^}]*justify-content:\s*safe center;[^}]*\}/);
  });

  it("the strip's pills keep their full width on the row", () => {
    expect(css).toMatch(/\.results-strip > \.pill\s*\{[^}]*flex-shrink:\s*0;[^}]*\}/);
  });

  it("the scrollbar stays unobtrusive", () => {
    expect(css).toMatch(/\.results-strip\s*\{[^}]*scrollbar-width:\s*thin;[^}]*\}/);
    expect(css).toContain(".results-strip::-webkit-scrollbar {");
    expect(css).toContain("height: 4px;");
  });

  it("the desktop strip still wraps — exactly one strip rule sets nowrap", () => {
    const nowrapRules = stripRules().filter((rule) => /flex-wrap:\s*nowrap;/.test(rule));
    expect(nowrapRules).toHaveLength(1);
    const base = stripRules()[0] ?? "";
    expect(base).toContain("flex-wrap: wrap;");
    expect(base).not.toContain("overflow-x:");
    expect(base).not.toContain("flex-wrap: nowrap;");
  });
});
