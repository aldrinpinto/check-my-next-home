import { expect, test } from "./fixtures";

// The Check Together claim flow (plan step M7.13,
// decision D21; Master views 17–27) against the SERVED
// app + the seeded gift fixtures (scripts/seed-golden.mjs
// section 4 — the token literals below are duplicated
// there; change both together).
//
// The confirmation email is captured by the harness's
// mailer seam (e2e/serve-e2e.mjs, 127.0.0.1:4182): the
// spec reads the link back and follows it, exactly as a
// claimant follows the email. D68: the claim states are
// Regression (the Smoke set stays as authored until
// M7.15's audit; D44's smoke half — the happy path —
// promotes when M9.6 wires issuance and the gifted
// delivery email exists to assert on).
//
// T-WEB map (M7.15 citation tidy):
//   No T-WEB row — this file discharges the D21 claim
//   flow's served states (M7.13). The claim leg of D68's
//   consolidated chain is composed in e2e/chain.e2e.ts,
//   on the chain's own seeded gift.

const ISSUED_ONE = "seed-gift-issued-one-0000000000001";
const ISSUED_TWO = "seed-gift-issued-two-0000000000002";
const CLAIMED = "seed-gift-claimed-0000000000000003";
const REDEEMED = "seed-gift-redeemed-000000000000004";
const EXPIRED = "seed-gift-expired-0000000000000005";
const CLAIMED_EXPIRED = "seed-gift-claimedexp-000000000006";
const BUYER = "gift.buyer@example.co.uk";
const CLAIMANT = "gift.claimant@example.co.uk";

async function capturedConfirmation(token: string): Promise<{ confirmUrl: string }> {
  const response = await fetch(`http://127.0.0.1:4182/last?token=${token}`);
  expect(response.ok).toBe(true);
  return (await response.json()) as { confirmUrl: string };
}

test.describe("Check Together claim flow — regression", () => {
  test(
    "the claim screen serves the claim copy and the email field (view 17)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto(`/gift/${ISSUED_ONE}`);
      await expect(
        page.getByRole("heading", { name: "You've been given a free home check" }),
      ).toBeVisible();
      await expect(
        page.getByText("Someone who bought a full report from us has passed you a free one."),
      ).toBeVisible();
      await expect(page.getByLabel("Your email address")).toBeVisible();
      await expect(page.getByRole("button", { name: "Claim my free report" })).toBeVisible();
      await expect(
        page.getByText("The gift is valid for 30 days from the day the report was bought"),
      ).toBeVisible();
    },
  );

  test(
    "(e) the buyer's own email is refused under Text 4 — and the link is NOT burned",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto(`/gift/${ISSUED_TWO}`);
      await page.getByLabel("Your email address").fill(BUYER);
      await page.getByRole("button", { name: "Claim my free report" }).click();
      await expect(
        page.getByRole("heading", { name: "This gift is for someone else" }),
      ).toBeVisible();
      await expect(page.getByText("Nothing is used up — your link is still valid.")).toBeVisible();
      // The same link still claims for a different email:
      // the refusal wrote nothing.
      await page.getByLabel("Your email address").fill(CLAIMANT);
      await page.getByRole("button", { name: "Claim my free report" }).click();
      await expect(page.getByRole("heading", { name: "You're nearly there" })).toBeVisible();
    },
  );

  test(
    "a mistyped email: the entry stands in the field under the error line — and a corrected submit proceeds as before (view 18)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto(`/gift/${ISSUED_TWO}`);
      await page.getByLabel("Your email address").fill("name@exampl");
      await page.getByRole("button", { name: "Claim my free report" }).click();
      await expect(page.getByText("Enter an email address, like you@example.co.uk")).toBeVisible();
      // The sample's state: the bad entry stands in the
      // field, ready to correct — it rode the one-shot
      // entry cookie, never the URL.
      await expect(page.getByLabel("Your email address")).toHaveValue("name@exampl");
      expect(page.url()).not.toContain("name@exampl");
      // Correct the entry and submit: the flow proceeds
      // exactly as it does from a clean form.
      await page.getByLabel("Your email address").fill(CLAIMANT);
      await page.getByRole("button", { name: "Claim my free report" }).click();
      await expect(page.getByRole("heading", { name: "You're nearly there" })).toBeVisible();
    },
  );

  test(
    "the happy path: claim, confirm by email, land on the dedicated claimed page",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto(`/gift/${ISSUED_ONE}`);
      await page.getByLabel("Your email address").fill(CLAIMANT);
      await page.getByRole("button", { name: "Claim my free report" }).click();
      await expect(page.getByRole("heading", { name: "You're nearly there" })).toBeVisible();
      await expect(page.getByText(CLAIMANT)).toBeVisible();
      // View 20's success state (BUG-271): the tick and
      // the address as plain text — no form stands, and
      // the resend is a quiet link that confirms when
      // used. The resend's fresh link is the one the
      // later confirm leg follows.
      await expect(page.getByLabel("Your email address")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Send a fresh link" })).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Didn't get it? Send it again" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Didn't get it? Send it again" }).click();
      await expect(page.getByRole("status")).toContainText("We've sent another email to");

      // Nothing is claimed yet: the link alone, reopened,
      // still offers the claim (the binding is the click).
      await page.goto(`/gift/${ISSUED_ONE}`);
      await expect(
        page.getByRole("heading", { name: "You've been given a free home check" }),
      ).toBeVisible();

      const { confirmUrl } = await capturedConfirmation(ISSUED_ONE);
      await page.goto(confirmUrl);
      await expect(
        page.getByRole("heading", { name: "Your free report is claimed" }),
      ).toBeVisible();
      await expect(page.getByText("Gift saved to your email address")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Check a home now" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Check this home" })).toBeVisible();
      // The visit carries the strictly functional gift
      // cookie (T-LEG-02).
      const cookies = await page.context().cookies();
      expect(cookies.some((c) => c.name === "cmnh-gift" && c.value === ISSUED_ONE)).toBe(true);
    },
  );

  test(
    "(g)+(h) a bound gift: the bound email resumes to the claimed page; any other is refused under Text 3",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto(`/gift/${ISSUED_ONE}`);
      await expect(
        page.getByRole("heading", { name: "This gift is already claimed" }),
      ).toBeVisible();
      await expect(
        page.getByText("If you claimed this gift yourself, entering that same address here"),
      ).toBeVisible();
      await page.getByLabel("Your email address").fill("third@example.co.uk");
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(
        page.getByRole("heading", { name: "This gift is already claimed" }),
      ).toBeVisible();
      await page.getByLabel("Your email address").fill(CLAIMANT);
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(
        page.getByRole("heading", { name: "Your free report is claimed" }),
      ).toBeVisible();
    },
  );

  test(
    "a seeded claimed gift serves the Text 3 guard at once (view 24)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto(`/gift/${CLAIMED}`);
      await expect(
        page.getByRole("heading", { name: "This gift is already claimed" }),
      ).toBeVisible();
      await expect(
        page.getByText("Someone has claimed this gift with a different email address"),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    },
  );

  test(
    "(d) a redeemed gift serves Text 2 and no claim form (view 25)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto(`/gift/${REDEEMED}`);
      await expect(
        page.getByRole("heading", { name: "This gift has already been used" }),
      ).toBeVisible();
      await expect(
        page.getByText("has already been delivered, so the link can't be used again."),
      ).toBeVisible();
      await expect(page.getByText("support@checkmynexthome.co.uk")).toBeVisible();
      await expect(page.getByLabel("Your email address")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Check another home" })).toBeVisible();
    },
  );

  test(
    "(j) an expired gift serves Text 1 and no claim form — claimed-but-unused dies at day 30 too (view 26)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto(`/gift/${EXPIRED}`);
      await expect(page.getByRole("heading", { name: "This gift link has expired" })).toBeVisible();
      await expect(page.getByText("Gift links can't be extended or replaced.")).toBeVisible();
      await expect(page.getByText("a full report costs £4.99.")).toBeVisible();
      await expect(page.getByLabel("Your email address")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Check a home anyway" })).toBeVisible();

      await page.goto(`/gift/${CLAIMED_EXPIRED}`);
      await expect(page.getByRole("heading", { name: "This gift link has expired" })).toBeVisible();
      await expect(page.getByLabel("Your email address")).toHaveCount(0);
    },
  );

  test(
    "(k) BUG-346 — a rate-limited claim attempt is answered, not swallowed",
    { tag: "@regression" },
    async ({ page }) => {
      // Deterministic by construction: the flag is the
      // answer the route gives a refused attempt, so the
      // test loads the flag directly instead of tripping
      // the limiter (the limiter counts per caller IP
      // across the whole run, and tripping it here would
      // poison the claim tests that follow).
      await page.goto(`/gift/${ISSUED_ONE}?error=rate-limited`);
      await expect(page.locator(".gift-alert")).toHaveText(
        "Too many attempts — please try again in a moment.",
      );
      // The form stands, empty, ready for the retry.
      await expect(page.getByLabel("Your email address")).toBeVisible();
      await expect(page.getByLabel("Your email address")).toHaveValue("");
      await expect(page.getByRole("button", { name: "Claim my free report" })).toBeVisible();
    },
  );

  test(
    "(l) BUG-347/BUG-348 — the gift payment page carries the pill beside the banner, and its consent starts unticked",
    { tag: "@regression" },
    async ({ page }) => {
      // The visit holds the seeded CLAIMED gift, set
      // straight into the cookie — no claim POST, so
      // the run's claim attempts stay clear of the
      // rate limiter, and the claim flow itself is
      // already proven by the happy-path test above.
      await page
        .context()
        .addCookies([{ name: "cmnh-gift", value: CLAIMED, domain: "127.0.0.1", path: "/" }]);
      await page.goto("/report?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE");
      const payment = page.locator(".report-payment");
      // BUG-347: the founder-chosen pill stands beside
      // the banner — before it in the page, never in
      // place of it.
      await expect(payment.locator(".report-payment__gift-pill")).toHaveText(
        "Your full report is free",
      );
      await expect(payment.locator(".report-payment__gift")).toHaveText(
        "Your free report gift has been applied — there's nothing to pay for this report.",
      );
      // The bound email stands pre-filled.
      await expect(page.locator("#payment-email")).toHaveValue("gift.claimant@example.co.uk");
      // BUG-348: the consent starts UNTICKED, and the
      // button wears its disabled dress until the
      // claimant ticks it.
      await expect(page.locator("#payment-consent")).not.toBeChecked();
      await expect(page.locator(".report-payment__pay")).toHaveAttribute("aria-disabled", "true");
      await expect(page.locator(".report-payment__pay")).toHaveText("Get my free report");
      // An unticked attempt is answered under the tick
      // line (BUG-132, same as the paid form).
      await page.locator(".report-payment__pay").click({ force: true });
      await expect(page.locator(".report-payment__consent-error")).toContainText(
        "Tick this box to continue",
      );
      // The tick clears the error and enables the
      // button; the click places the gift order and
      // lands on the preparing page — the fulfilment
      // worker does not run in the harness, so the
      // report stays preparing.
      await page.locator("#payment-consent").check();
      await expect(page.locator(".report-payment__consent-error")).toHaveCount(0);
      await expect(page.locator(".report-payment__pay")).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await page.locator(".report-payment__pay").click();
      await page.waitForURL("**/report/success?order=**");
      await expect(page.locator("h1")).toHaveText("Your report is being prepared");
    },
  );

  test(
    "a made-up link, the sample's mock slug, and bare /gift all serve the plain not-recognised page (view 27)",
    { tag: "@regression" },
    async ({ page }) => {
      for (const path of [
        "/gift/made-up-token-00000000000000000000",
        "/gift/x7k2-together",
        "/gift",
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "This link doesn't work" })).toBeVisible();
        await expect(page.getByText("we can't find the gift it belongs to.")).toBeVisible();
        await expect(page.getByLabel("Your email address")).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "Check a home", exact: true }),
        ).toBeVisible();
      }
    },
  );
});
