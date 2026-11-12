// The site's identity, in one place. Pages and tests both read from here,
// so the name and strapline can never drift apart.

export const SITE_NAME = "Check My Next Home";

export const SITE_STRAPLINE = "Your family's next home — check what the listing doesn't tell you.";

export const SITE_DESCRIPTION =
  "Your family's next home — check what the listing doesn't tell you. Schools, flooding, crime counts, sold prices, broadband and more, checked from one postcode.";

// M2.8 — the TEST banner. Every page on the play site carries this strip.
// It is tied to the environment name, never hand-edited per site: the
// banner shows on every environment EXCEPT the real one. The play site
// (and local builds) leave NEXT_PUBLIC_SITE_ENV unset or set to "play";
// the real server sets it to "production" at launch (M12/M13), which is
// the only value that hides the banner. The setting is documented in
// .env.example.
export const TEST_BANNER_TEXT = "TEST SITE — not the real service";

export function showTestBanner(
  env: string | undefined = process.env.NEXT_PUBLIC_SITE_ENV,
): boolean {
  return env !== "production";
}
