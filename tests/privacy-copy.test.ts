import { describe, expect, it } from "vitest";

import { PRIVACY_CARDS, type PrivacyBlock } from "../lib/site-pages";

// The Privacy wordings the founder approved verbatim on
// 19 Nov 2026, pinned character-for-character in the
// gift.test.ts manner: the counting bullet and the
// amended shortlist line close the M7.14 Privacy gap
// (the adopted prep's approved forms were lost when its
// file truncated, so the founder approved these forms
// fresh), and the gift-cookie paragraph is M7.13's
// T-LEG-02 record — the Privacy page names the cmnh-gift
// cookie now that the claim flow sets it. Any future
// change to these words is a founder decision, not an
// edit; change the pin and the words together, with the
// approval on record.

const card = (heading: string) => {
  const found = PRIVACY_CARDS.find((c) => c.heading === heading);
  if (!found) throw new Error(`no Privacy card headed ${heading}`);
  return found;
};

const listItems = (blocks: PrivacyBlock[]): string[] =>
  blocks.flatMap((b) => (b.kind === "ul" ? b.items : []));

const paragraphs = (blocks: PrivacyBlock[]): string[] =>
  blocks.flatMap((b) => (b.kind === "p" ? [b.text] : []));

const SHORTLIST_LINE =
  "**Your shortlist** — this lives in your own browser, on your own device. We cannot see which homes are on it. Our counting only learns that a home was added or removed — never which home.";

const COUNTING_LINE =
  "**Counting, kept at home** — we count how the site is used — which pages are opened, how many checks run, where people stop — with our own counting on our own server, plus Cloudflare Web Analytics for traffic. The counting never records the home or postcode you checked, your email, or anything that identifies you: it counts journeys, not people. No analytics company is involved, and counting sets no cookies.";

const GIFT_COOKIE_LINE =
  "One more cookie appears if you arrive through a Check Together gift link. It remembers that the gift was claimed on this device, so your free report stays unlocked. It holds no personal details and is never used for counting or advertising.";

const CONTACT_LINE =
  "**Messages you send us** — if you write to us on the Contact page, we keep your name, your email address and your message on our server, so we can read it and reply. The message is saved before anything else happens, so it reaches us even if the email alerting us to it does not.";

describe("the founder-approved Privacy wordings (19 Nov 2026)", () => {
  it("carries the amended shortlist line and the counting bullet in the collect card's list", () => {
    const items = listItems(card("What we collect and why").blocks);
    expect(items).toContain(SHORTLIST_LINE);
    expect(items).toContain(COUNTING_LINE);
    // The counting bullet closes the list, after the
    // calculators item, ahead of the whole-list close.
    expect(items[items.length - 1]).toBe(COUNTING_LINE);
    expect(items.indexOf(COUNTING_LINE)).toBeGreaterThan(
      items.findIndex((i) => i.startsWith("**Anything you type into the calculators**")),
    );
  });

  it("no longer carries the pre-amendment shortlist line anywhere", () => {
    const everyWord = PRIVACY_CARDS.flatMap((c) => [
      ...listItems(c.blocks),
      ...paragraphs(c.blocks),
    ]).join("\n");
    expect(everyWord).not.toContain("It never reaches us, and we cannot see it.");
  });

  it("names the gift cookie in the Cookies card, after the two standing paragraphs", () => {
    const ps = paragraphs(card("Cookies").blocks);
    expect(ps).toEqual([
      "This site only uses the cookies it needs to work and to stay secure.",
      "We do not use cookies to follow you around the web, to build a profile of you, or to show you advertising.",
      GIFT_COOKIE_LINE,
    ]);
  });
});

describe("the founder-approved Privacy wording (20 Nov 2026)", () => {
  it("carries the contact-messages bullet in the collect card's list, ahead of the counting bullet", () => {
    const items = listItems(card("What we collect and why").blocks);
    expect(items).toContain(CONTACT_LINE);
    expect(items.indexOf(CONTACT_LINE)).toBeLessThan(items.indexOf(COUNTING_LINE));
  });
});
