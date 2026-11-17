# Brand — Check My Next Home

Decided by Aldrin Pinto and finalised on 12 Nov 2026. This file is the site's single source for its identity tokens; the build applies the palette and logo at step M7.1 of the Phase 1 plan. (The tagline and manifesto entries below were corrected to decision D12 on 15 Nov 2026 at step M6.10: D12 was decided on 13 Nov 2026, after this file, and had never been written into it — the code carried the same drift until M6.10 reconciled both.)

## Name

**Check My Next Home** — the brand name and the website name are identical, everywhere, with no alternates.

1. Canonical host: checkmynexthome.co.uk (the .com domain 301-redirects to it).
2. Tagline (D12, decided 13 Nov 2026): Check the house. Choose the home.
3. Manifesto (D12): For the family who'll live there — not just the buyer. Hero kicker only — never in the header, a page title or a meta description.
4. Superseded: the M3 strapline is retired entirely (D44, corrected at M7.2). It is no longer the site's strapline and no longer homepage hero copy — it survives nowhere in the product. The homepage hero headline is the D44 line: "You're not buying a house. You're choosing your family's home."

## Colours — Theme 2, Forest green + brass

1. **Forest green** — `#2F5D3E` — the primary colour.
2. **Deep forest** — `#1E402C` — the darker forest shade.
3. **Brass** — `#C29A3B` — the accent colour.
4. **Brass pale** — `#E4CF9A` — the lighter brass shade.
5. **Cream** — `#FDF8E8` — the light background colour.

Teal is dropped entirely and must never be used. Rightmove owns teal (`#00DEB6`) and Zoopla owns purple (`#8046F1`); this palette does not overlap Rightmove, Zoopla or OnTheMarket.

## Typefaces

Decided at the design-alignment pass (D70, R1, 17 Nov 2026), replacing the M7.1 system-stack record:

1. **Newsreader** — the display face: headings (H1/H2), the brand name in the header and footer lockups, and the manifesto block's head. Weights 600 and 700.
2. **DM Sans** — the text and UI face: body copy, labels, buttons, pills and figures. Weights 400, 600, 700, 800 and 900.
3. Both faces are **self-hosted** — latin subsets served from the site's own `/fonts`, never loaded from a third-party font service. Sources: the Fontsource packages `@fontsource/newsreader` and `@fontsource/dm-sans`; both faces are licensed under the SIL Open Font License 1.1. The system stack remains only as the fallback while a face loads or if it fails.

## Logo

**The One-Line Roof-Tick** — the original Logo 1 (variant 1A, the polished original), chosen on 12 Nov 2026.

1. Ruled out by the user and not to be used: variant 1B (green tick) and variant 1C (bold tick).
2. The asset pack is complete and lives in the Brand section of the Phase 1 Implementation Plan (files under assets/brand, plus an all-in-one ZIP): SVG masters, PNG and JPG exports, a favicon set (16, 28, 32 and 48 pixels, plus .ico) and a 180 pixel touch icon, a 1024 pixel social avatar on forest green, a reversed version, lock-ups, a brand sheet and CSS tokens.
3. When the branding is applied (step M7.1), the site header and favicon use these assets, and the Organization structured data (lib/seo.ts) gains the logo URL.
