import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// BUG-266 (founder, 25 Nov 2026): the live footer's four
// groups wrapped 2+2 on desktop instead of sitting side by
// side in one row, as the Final Sample Master v82/v83
// specifies — and with no flex-grow the nav sized to its
// content and sat right-of-centre, leaving the large empty
// dark-green area. The v83 fix only ever landed in the
// Master, never in product code. One pin per half of the
// fix, on the CSS rule (the mobile stack's pattern).

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

describe("BUG-266 — the footer nav stays one row on desktop", () => {
  it("the nav never wraps and grows to fill the space beside the brand", () => {
    expect(css).toContain(
      ".site-footer__nav {\n  display: flex;\n  flex-wrap: nowrap;\n  flex: 1 1 auto;",
    );
  });

  it("the phone form still stacks the groups under the 40rem rule", () => {
    expect(css).toContain(
      "  .site-footer__nav {\n    flex-direction: column;\n    width: 100%;\n  }",
    );
  });
});
