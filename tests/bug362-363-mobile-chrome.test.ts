import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import SiteHeader from "../components/SiteHeader";

// BUG-362 + BUG-363 (26 Nov 2026, founder ruling) — the
// mobile chrome round: the footer stops stretching its
// groups on a phone, and the header nav collapses behind
// a hamburger. The CSS pins read app/globals.css the way
// the look-feel kit does; the markup pins drive the real
// header through its server render.

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

describe("BUG-362 — the footer groups size to their content on a phone", () => {
  it("the 40rem block resets the group's flex basis, so the 10rem is a width on desktop only", () => {
    // The base rule keeps the desktop min width.
    expect(css).toMatch(/\.site-footer__group\s*\{\s*flex:\s*1 1 10rem;\s*\}/);
    // Inside the phone block the group sizes to content.
    const phone = css.match(/@media \(max-width: 40rem\) \{[\s\S]*?\.site-footer__group \{[^}]*\}/);
    expect(phone?.[0]).toContain("flex: none;");
  });

  it("the phone block still stacks the groups — only the stretch is gone", () => {
    expect(css).toMatch(
      /@media \(max-width: 40rem\) \{[\s\S]*?\.site-footer__nav \{[^}]*flex-direction:\s*column;[^}]*\}/,
    );
  });
});

describe("BUG-363 — the header nav is a hamburger below 30rem", () => {
  it("the toggle is hidden above the breakpoint and the list is hidden below it until opened", () => {
    // Base (desktop): the button and its badge cluster do
    // not render — the desktop nav is exactly as before.
    expect(css).toMatch(/\.site-nav__toggle\s*\{\s*display:\s*none;\s*\}/);
    expect(css).toMatch(/\.site-nav__mobile\s*\{\s*display:\s*none;\s*\}/);
    // Below 30rem the button shows at the kit's tap
    // target and the list is hidden until open.
    expect(css).toMatch(
      /@media \(max-width: 30rem\) \{[\s\S]*?\.site-nav__toggle \{[^}]*display:\s*inline-flex;[^}]*\}/,
    );
    expect(css).toMatch(
      /@media \(max-width: 30rem\) \{[\s\S]*?\.site-nav__toggle \{[^}]*width:\s*var\(--tap-target\);[^}]*\}/,
    );
    expect(css).toMatch(
      /@media \(max-width: 30rem\) \{[\s\S]*?\.site-nav__list \{[^}]*display:\s*none;[^}]*\}/,
    );
    expect(css).toMatch(
      /@media \(max-width: 30rem\) \{[\s\S]*?\.site-nav__list--open \{[^}]*display:\s*flex;[^}]*\}/,
    );
  });

  it("the header renders the toggle wired to the list, closed, with all five links present", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader, {}));
    expect(html).toContain('class="site-nav__toggle"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="primary-nav-list"');
    expect(html).toContain('aria-label="Menu"');
    expect(html).toContain('id="primary-nav-list"');
    for (const href of ["/how-we-check", "/sample-report", "/about", "/shortlist", "/contact"]) {
      expect(html).toContain(`href="${href}"`);
    }
    // Closed: the list carries no open class.
    expect(html).not.toContain("site-nav__list--open");
  });

  it("the Shortlist count stays visible beside the button and on the Shortlist row", () => {
    const html = renderToStaticMarkup(createElement(SiteHeader, { shortlistCount: 3 }));
    // One badge beside the hamburger in the closed header,
    // one on the Shortlist row inside the menu.
    expect(html.match(/shortlist-count/g)?.length).toBe(2);
    expect(html).toContain('<span class="shortlist-count">3</span>');
  });
});
