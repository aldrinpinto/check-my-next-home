import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GiftClaimCard, GiftClaimedCard, GiftClosedCard } from "../components/GiftClaimPage";
import { GIFT_FRIEND, GIFT_TOKEN } from "./fixtures/gift";

// M7.13 — the claim flow's screens as rendered: each of
// the eleven states serves its sample copy in its ruled
// placement (Master views 17–27; the placement ruling
// of 18 Nov 2026, the set completed by the conform pass
// of 19 Nov 2026). The words themselves are pinned
// character-for-character in tests/gift.test.ts; here
// the assertions are that the right words reach the
// right screen, with the right form furniture — and
// that no screen carries another state's words.
//
// React's static renderer escapes apostrophes in text
// (&#x27;); the assertions read the unescaped form, so
// they judge the words a browser shows.
const text = (html: string) =>
  html.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

describe("the claim screen (view 17)", () => {
  const html = text(
    renderToStaticMarkup(createElement(GiftClaimCard, { token: GIFT_TOKEN, variant: "claim" })),
  );

  it("serves the claim copy and the standard field block", () => {
    expect(html).toContain("You've been given a free home check");
    expect(html).toContain("Someone who bought a full report from us has passed you a free one.");
    expect(html).toContain("<strong>any home</strong>");
    expect(html).toContain("Your email address");
    expect(html).toContain('name="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain("e.g. you@example.co.uk");
    expect(html).toContain("Claim my free report");
    expect(html).toContain(
      "The gift is valid for 30 days from the day the report was bought, and it can be claimed once",
    );
    expect(html).toContain(`action="/gift/${GIFT_TOKEN}/claim"`);
    expect(html).toContain('method="post"');
    // The flow's own shape check is the one judge of an
    // address (view 18's inline error is its answer):
    // the form opts out of native validation so a
    // mistyped entry reaches it.
    expect(html).toContain('noValidate=""');
  });

  it("carries no other state's words", () => {
    expect(html).not.toContain("This gift is for someone else");
    expect(html).not.toContain("This gift is already claimed");
    expect(html).not.toContain("Gift saved to your email address");
  });
});

describe("the mistyped-email state (view 18)", () => {
  const html = text(
    renderToStaticMarkup(
      createElement(GiftClaimCard, {
        token: GIFT_TOKEN,
        variant: "claim",
        emailError: true,
        entryEmail: "name@exampl",
      }),
    ),
  );

  it("stands the bad entry in the field under the pinned error line", () => {
    expect(html).toContain('value="name@exampl"');
    expect(html).toContain("Enter an email address, like you@example.co.uk");
    expect(html).toContain("Claim my free report");
  });

  it("without the entry the error stands alone, the field empty", () => {
    const bare = text(
      renderToStaticMarkup(
        createElement(GiftClaimCard, { token: GIFT_TOKEN, variant: "claim", emailError: true }),
      ),
    );
    expect(bare).toContain("Enter an email address, like you@example.co.uk");
    expect(bare).not.toContain('value="');
  });

  it("an entry without the error never stands — the two are one presentation", () => {
    const plain = text(
      renderToStaticMarkup(
        createElement(GiftClaimCard, {
          token: GIFT_TOKEN,
          variant: "claim",
          entryEmail: "name@exampl",
        }),
      ),
    );
    expect(plain).not.toContain('value="');
    expect(plain).not.toContain("Enter an email address, like you@example.co.uk");
  });
});

describe("the send-failure state (view 19) — the typed entry stands too (BUG-029)", () => {
  it("stands the typed address in the field under the failure line", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(GiftClaimCard, {
          token: GIFT_TOKEN,
          variant: "claim",
          sendFailed: true,
          entryEmail: "friend@example.co.uk",
        }),
      ),
    );
    expect(html).toContain('value="friend@example.co.uk"');
    expect(html).toContain(
      "We couldn't send the confirmation email just now — nothing has been claimed.",
    );
  });

  it("without the entry the failure line stands over an empty field", () => {
    const bare = text(
      renderToStaticMarkup(
        createElement(GiftClaimCard, { token: GIFT_TOKEN, variant: "claim", sendFailed: true }),
      ),
    );
    expect(bare).toContain("We couldn't send the confirmation email just now");
    expect(bare).not.toContain('value="');
  });
});

describe("the rate-limit state (BUG-346) — the attempt was heard, try again in a moment", () => {
  it("stands the rate-limit line over the claim form, the field empty", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(GiftClaimCard, { token: GIFT_TOKEN, variant: "claim", rateLimited: true }),
      ),
    );
    expect(html).toContain("Too many attempts — please try again in a moment.");
    expect(html).toContain('role="alert"');
    expect(html).toContain('name="email"');
    expect(html).toContain("Claim my free report");
    expect(html).not.toContain('value="');
  });

  it("names no limit size or window, and carries no other state's words", () => {
    const html = text(
      renderToStaticMarkup(
        createElement(GiftClaimCard, { token: GIFT_TOKEN, variant: "claim", rateLimited: true }),
      ),
    );
    expect(html).not.toContain("10 per minute");
    expect(html).not.toContain("10/minute");
    expect(html).not.toContain("We couldn't send the confirmation email just now");
    expect(html).not.toContain("Enter an email address, like you@example.co.uk");
    expect(html).not.toContain("This gift is for someone else");
  });
});

describe("the same-email refusal (view 23 — Text 4 over the form)", () => {
  const html = text(
    renderToStaticMarkup(
      createElement(GiftClaimCard, { token: GIFT_TOKEN, variant: "same-email" }),
    ),
  );

  it("serves Text 4 in full, with the claim form live beneath it", () => {
    expect(html).toContain("This gift is for someone else");
    expect(html).toContain("Nothing is used up — your link is still valid.");
    expect(html).toContain("they can claim a free full report for any home.");
    expect(html).toContain('name="email"');
    expect(html).toContain("Claim my free report");
  });

  it("stands in the samples' message box, with no badge (conform pass, 19 Nov 2026)", () => {
    expect(html).toContain('class="gift-message"');
    expect(html).not.toContain("gift-badge");
  });
});

describe("the claimed-different-email guard (view 24 — Text 3)", () => {
  const html = text(
    renderToStaticMarkup(createElement(GiftClaimCard, { token: GIFT_TOKEN, variant: "different" })),
  );

  it("serves Text 3 with its Continue button and helper line", () => {
    expect(html).toContain("This gift is already claimed");
    expect(html).toContain("it can only be used with that address.");
    expect(html).toContain(">Continue</button>");
    expect(html).toContain(
      "If you claimed this gift yourself, entering that same address here will take you through to checking a home.",
    );
  });

  it("stands in the message box and speaks to the holder in its field", () => {
    expect(html).toContain('class="gift-message"');
    expect(html).not.toContain("gift-badge");
    expect(html).toContain('placeholder="The address you claimed it with"');
  });
});

describe("the confirmation-pending screen (view 20) — BUG-271 success state", () => {
  const html = text(
    renderToStaticMarkup(
      createElement(GiftClaimCard, {
        token: GIFT_TOKEN,
        variant: "pending",
        pendingEmail: GIFT_FRIEND,
      }),
    ),
  );

  it("is a success state: tick, the address as plain text, no form standing", () => {
    expect(html).toContain("You're nearly there");
    expect(html).toContain("Check your inbox");
    expect(html).toContain(`<strong>${GIFT_FRIEND}</strong>`);
    expect(html).toContain("The gift isn't claimed until you click.");
    // No form stands: no visible email field and no
    // big fresh-link button — the resend is a quiet
    // link, and the address travels in a hidden input
    // only.
    expect(html).not.toContain("Check your email to finish claiming");
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain("Your email address");
    expect(html).not.toContain(">Send a fresh link</button>");
    expect(html).toContain("Didn't get it? Send it again");
    expect(html).toContain("Wrong email? Change it");
    expect(html).toContain(
      "The gift is valid for 30 days from the day the report was bought, and it can be claimed once.",
    );
    // Exactly one tick: the success badge's.
    expect(html.split("m4.5 12.5 5 5 10-11").length - 1).toBe(1);
  });

  it("the resend confirmation names the address and stands as a status", () => {
    const resent = text(
      renderToStaticMarkup(
        createElement(GiftClaimCard, {
          token: GIFT_TOKEN,
          variant: "pending",
          pendingEmail: GIFT_FRIEND,
          resent: true,
        }),
      ),
    );
    expect(resent).toContain(`We've sent another email to <strong>${GIFT_FRIEND}</strong>`);
    expect(resent).toContain("it should arrive in a moment");
    expect(resent).toContain('role="status"');
  });

  it("the change-email state brings the form back, exactly as it stood (BUG-271)", () => {
    const form = text(
      renderToStaticMarkup(
        createElement(GiftClaimCard, {
          token: GIFT_TOKEN,
          variant: "pending",
          pendingEmail: GIFT_FRIEND,
          pendingForm: true,
        }),
      ),
    );
    expect(form).toContain("Check your email to finish claiming");
    expect(form).toContain("We've sent a confirmation email to");
    expect(form).toContain(`<strong>${GIFT_FRIEND}</strong>`);
    expect(form).toContain('name="email"');
    expect(form).toContain(`value="${GIFT_FRIEND}"`);
    expect(form).toContain(">Send a fresh link</button>");
    expect(form).toContain(
      "The gift is valid for 30 days from the day the report was bought, and it can be claimed once.",
    );
    expect(form).not.toContain("so use the email address you'll order your report with");
  });
});

describe("the dedicated claimed page's card (view 22)", () => {
  const html = text(renderToStaticMarkup(createElement(GiftClaimedCard)));

  it("serves the chip, the claimed message and its own search block", () => {
    expect(html).toContain("Gift saved to your email address");
    expect(html).toContain("Your free report is claimed");
    expect(html).toContain(
      "<strong>we'll apply your free report for you, so there's nothing to pay.</strong>",
    );
    expect(html).toContain("Check a home now");
    expect(html).toContain("Enter a postcode to see the headline facts for a home, free.");
    expect(html).toContain("Check this home");
  });

  it("carries no claim form — the gift is already claimed", () => {
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain("Claim my free report");
  });

  it("carries exactly one tick — the pill's (BUG-222: the standalone badge tick is gone)", () => {
    // The tick path stands once: inside the "Gift saved"
    // pill. The standalone badge tick the founder
    // flagged is gone, Master first, product following.
    const ticks = html.split("m4.5 12.5 5 5 10-11").length - 1;
    expect(ticks).toBe(1);
    expect(html).toContain("Gift saved to your email address");
    expect(html).not.toContain("icon-badge ok");
  });
});

describe("the closed screens (views 25–27)", () => {
  it("already used serves Text 2 in full, support line included, with its search block", () => {
    const html = text(renderToStaticMarkup(createElement(GiftClosedCard, { variant: "used" })));
    expect(html).toContain("This gift has already been used");
    expect(html).toContain("The free report from this gift link has already been delivered");
    expect(html).toContain("has already been delivered, so the link can't be used again.");
    expect(html).toContain('href="mailto:support@checkmynexthome.co.uk"');
    expect(html).toContain("and we'll look into it.");
    expect(html).toContain("Check another home");
    expect(html).not.toContain('name="email"');
  });

  it("expired serves Text 1 in full, with its search block", () => {
    const html = text(renderToStaticMarkup(createElement(GiftClosedCard, { variant: "expired" })));
    expect(html).toContain("This gift link has expired");
    expect(html).toContain("Gift links can't be extended or replaced.");
    expect(html).toContain("a full report costs £4.99.");
    expect(html).toContain("Check a home anyway");
    expect(html).not.toContain('name="email"');
  });

  it("not recognised serves its plain page, with its search block", () => {
    const html = text(
      renderToStaticMarkup(createElement(GiftClosedCard, { variant: "not-recognised" })),
    );
    expect(html).toContain("This link doesn't work");
    expect(html).toContain("we can't find the gift it belongs to.");
    expect(html).toContain(">Check a home</h2>");
    expect(html).not.toContain('name="email"');
  });
});

describe("the gift pages' search box fills the card (BUG-271)", () => {
  it("the in-card postcode box carries no width cap", () => {
    // Founder direction, 25 Nov 2026: the "Check
    // another home" input on the gift-used page read
    // small under its 520px cap. The box now fills the
    // card's content width; the row and the phone stack
    // are untouched, so the button stays alongside at
    // desktop and stacks below 30rem as before.
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toContain(
      ".gift-page .gift-card .postcode-box {\n  text-align: left;\n  max-width: none;",
    );
  });
});
