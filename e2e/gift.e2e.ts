import { expect, test } from "./fixtures";

// The Check Together claim flow (plan step M7.13,
// decision D21; Master views 17–23) against the SERVED
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
      await expect(
        page.getByRole("heading", { name: "Check your email to finish claiming" }),
      ).toBeVisible();
    },
  );

  test(
    "the happy path: claim, confirm by email, land on the dedicated claimed page",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto(`/gift/${ISSUED_ONE}`);
      await page.getByLabel("Your email address").fill(CLAIMANT);
      await page.getByRole("button", { name: "Claim my free report" }).click();
      await expect(
        page.getByRole("heading", { name: "Check your email to finish claiming" }),
      ).toBeVisible();
      await expect(page.getByText(CLAIMANT)).toBeVisible();

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
    "a seeded claimed gift serves the Text 3 guard at once (view 20)",
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
    "(d) a redeemed gift serves Text 2 and no claim form (view 21)",
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
    "(j) an expired gift serves Text 1 and no claim form — claimed-but-unused dies at day 30 too (view 22)",
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
    "a made-up link, the sample's mock slug, and bare /gift all serve the plain not-recognised page (view 23)",
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
