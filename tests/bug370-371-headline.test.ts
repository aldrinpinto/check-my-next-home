import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// BUG-370 + BUG-371 (26 Nov 2026) — the headline fixes. The CSS
// pins read app/globals.css the way the look-feel kit does: the
// phone rules must stack the two head/buy-bar button rows, the
// desktop rows must stay side by side, and the pill strip's own
// phone rule must be untouched (another build owns it).

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

// Every "@media (max-width: 40rem) { ... }" block, extracted with
// balanced braces — a plain split would run past a block's end
// into the ordinary CSS that follows it.
function phoneBlocks(): string[] {
  const blocks: string[] = [];
  const marker = "@media (max-width: 40rem) {";
  let from = 0;
  for (;;) {
    const start = css.indexOf(marker, from);
    if (start === -1) break;
    let depth = 0;
    let i = start + marker.length - 1;
    for (; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    blocks.push(css.slice(start, i + 1));
    from = i + 1;
  }
  return blocks;
}

function phoneBlockFor(selector: string): string | undefined {
  return phoneBlocks().find((block) => block.includes(`${selector} {`));
}

describe("BUG-371 — head and buy-bar buttons stack on mobile", () => {
  it("the head actions stack vertically, full width, at phone width", () => {
    const block = phoneBlockFor(".results-actions");
    expect(block).toBeDefined();
    expect(block).toContain("flex-direction: column;");
    expect(block).toContain("align-items: stretch;");
    expect(block).toContain("width: 100%;");
    expect(block).toContain("justify-content: center;");
  });

  it("the buy-bar actions stack the same way at phone width", () => {
    const block = phoneBlockFor(".buy-bar__actions");
    expect(block).toBeDefined();
    expect(block).toContain("flex-direction: column;");
    expect(block).toContain("align-items: stretch;");
    expect(block).toContain("width: 100%;");
    expect(block).toContain("justify-content: center;");
  });

  it("the desktop rows stay side by side (wrapping flex rows)", () => {
    expect(css).toContain(".results-actions {\n  display: inline-flex;");
    expect(css).toContain(".buy-bar__actions {\n  display: flex;\n  flex-wrap: wrap;");
  });

  it("the pill strip's phone rule is untouched", () => {
    // Merge resolution (group push, 26 Nov 2026): the strip rule is
    // BUG-369's scroll-row form, not the pre-369 centred form this
    // pin was written against — BUG-371 still does not touch it.
    expect(css).toContain(
      "@media (max-width: 40rem) {\n  .results-strip {\n    justify-content: safe center;\n    flex-wrap: nowrap;\n    overflow-x: auto;\n    scrollbar-width: thin;\n  }\n  .results-strip > .pill {\n    flex-shrink: 0;\n  }\n  .results-strip::-webkit-scrollbar {\n    height: 4px;\n  }\n  .results-strip::-webkit-scrollbar-thumb {\n    background: var(--colour-band-line);\n    border-radius: 999px;\n  }\n}",
    );
  });
});
