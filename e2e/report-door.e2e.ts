import { expect, test } from "./fixtures";

// M7.6 E2E (D68) — the report door against the SERVED app
// + the seeded golden corpus: the buy bar on the results
// page (the shortlist control inside it, the D21 mystery
// tease, and the /report?postcode=&home= link contract on
// the bar's button and the truncation lines) and the
// /report page in its identity forms (a resolved home
// named, a postcode-only arrival, a cold visit's generic
// form). All Regression — D68: no Smoke is authored for
// M7.6.
//
// Parity fix batch (18 Nov 2026): item 6 adds the second
// shortlist control and the priced report button level
// with the H1 in the results head; item 19 makes the
// bar's button the unpriced form.
//
// M9.6 re-pin: the door stands at "paid" — the page these
// specs land on is the payment page (Sample 9), not the
// holding page. The heading, the contents card and the
// price line are the door's own, unchanged; what the
// flip adds is the honesty block, the delivery-email
// field and the consent tick. The holding page's own
// proofs live in tests/report-door.test.ts, and the
// window state's in the same file's flag-forced form.
// The served app carries no payment keys, so no payment
// can start here — the card panel's unconfigured state
// is what renders, and nothing in these specs pays.
//
// T-WEB map (M7.15 citation tidy):
//   No T-WEB row — the three specs discharge M7.6's
//   report door (the buy bar's contract and the door
//   page's identity forms).

const BIRKDALE_DOOR_HREF = "/report?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE";

async function reachResults(
  page: import("@playwright/test").Page,
  postcode: string,
  rowName: string,
) {
  // The retired picker route redirects to the
  // whole-postcode check (picker removed, 18 Nov 2026);
  // its home dropdown carries the postcode's homes
  // (founder ruling, 20 Nov 2026 — the list dump is
  // gone), and choosing one is the pick.
  await page.goto(`/search?postcode=${postcode.replace(" ", "+")}`);
  await page.waitForURL(/\/search\/home\?postcode=/);
  await page.locator(".picker__trigger").click();
  await page.locator(".picker__panel").getByRole("option", { name: rowName }).click();
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

test.describe("report door — regression", () => {
  test(
    "the buy bar and the results head carry the controls, the tease and the contract; the bar's button opens the payment page naming the home",
    { tag: "@regression" },
    async ({ page }) => {
      await reachResults(page, "CM3 2JT", "19 Birkdale Rise");

      const bar = page.locator(".buy-bar");
      await expect(bar).toBeVisible();
      // Item 6 (parity fix batch): the shortlist control
      // now sits in TWO places — level with the H1 in the
      // results head and inside the buy bar — one control
      // per place, both instances of the same component.
      await expect(bar.locator("[data-shortlist-toggle]")).toHaveCount(1);
      await expect(page.locator("[data-shortlist-toggle]")).toHaveCount(2);
      await expect(page.locator(".results-actions [data-shortlist-toggle]")).toHaveCount(1);
      // The mystery tease rides in the bar, naming nothing.
      await expect(bar.locator(".buy-bar__mystery")).toContainText(
        "Every report comes with a mystery extra, on us",
      );
      // Item 19: the bar's button is the UNPRICED form on
      // the contract href; the priced form is the head's
      // button alone, on the same href.
      const button = bar.locator(".report-btn");
      await expect(button).toHaveText("Get the full report");
      await expect(button).toHaveAttribute("href", BIRKDALE_DOOR_HREF);
      const headButton = page.locator(".results-actions .report-btn");
      await expect(headButton).toHaveText("Get the full report — £4.99");
      await expect(headButton).toHaveAttribute("href", BIRKDALE_DOOR_HREF);
      // A truncation row carries the same contract (D3,
      // parity fix stack: the row is the sample's .truncRow
      // link itself now, not a link inside a line).
      await expect(page.locator("a.trunc-row").first()).toHaveAttribute("href", BIRKDALE_DOOR_HREF);

      await button.click();
      await page.waitForURL("**/report?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE");
      await expect(page.locator("h1")).toHaveText("The detailed report for 19 Birkdale Rise");
      await expect(page.locator("p.type-lead").first()).toHaveText("Hatfield Peverel, CM3 2JT");
      await expect(page.locator(".report-door__card h2").first()).toHaveText(
        "What the detailed report adds",
      );
      // Re-pinned (BUG-214, founder ruling 24 Nov 2026):
      // the mapped-layers tail is trimmed — the lead
      // stands alone.
      await expect(page.locator(".report-door__card").first()).toContainText(
        "Plus the flood findings in full",
      );
      // BUG-215 (founder ruling, 24 Nov 2026): the
      // consent card is a single checkbox line in
      // small print — the one line with its Terms link
      // and the change-of-mind sentence. The old
      // "Make my report now" label and the bold price
      // line are gone; the price stands on the Pay
      // button alone. This also retires the stale
      // BUG-131-era assertion here — "The detailed
      // report costs £4.99 — …" never stood in this
      // block (no source rendered it).
      await expect(page.locator(".report-door__price")).toHaveCount(0);
      await expect(page.locator(".report-payment__honesty")).toContainText(
        "The report is information from official sources — not advice. By paying, you agree to our Terms of service. I understand the 14-day change-of-mind right ends when it's delivered.",
      );
      await expect(page.locator(".report-payment__honesty")).not.toContainText(
        "Make my report now",
      );
      await expect(page.locator(".report-payment__honesty")).not.toContainText(
        "one payment, no subscription",
      );
      // Sample 2 "Checkout alongside" (founder,
      // 24 Nov 2026): the checkout card carries the
      // plain one-payment line (no £4.99 prefix — the
      // price shows only on the Pay button), no hint
      // line under the Pay button, and the Card and
      // Revolut Pay method rows visible from the start.
      const checkout = page.locator(".report-payment__checkout-card");
      await expect(checkout).toContainText("One payment, no subscription, nothing further to pay.");
      await expect(checkout).not.toContainText("£4.99 — one payment");
      await expect(checkout).not.toContainText("Tick the box and add your email to pay.");
      await expect(checkout.locator(".report-payment__method").first()).toHaveText("Card");
      await expect(checkout.locator(".report-payment__method").nth(1)).toHaveText("Revolut Pay");
      // The paid state's own furniture (M9.4/M9.5): the
      // honesty block with the consent tick, and the
      // delivery-email field — the holding page's state
      // line is gone, and the door takes the buyer's
      // email and tick, nothing else of ours.
      await expect(page.locator(".report-door__state")).toHaveCount(0);
      await expect(page.locator("#payment-email")).toBeVisible();
      await expect(page.locator("#payment-consent")).toBeVisible();
      await expect(page.locator("#payment-consent")).not.toBeChecked();
      await expect(page.locator("input")).toHaveCount(2);
      // BUG-132: an unticked attempt to pay is answered
      // under the tick line. A valid email goes in
      // first (the email check answers before the tick
      // check); the consent error then stands, and
      // ticking the box clears it.
      await page.locator("#payment-email").fill("buyer@example.co.uk");
      await page.locator(".report-payment__pay").click();
      await expect(page.locator(".report-payment__consent-error")).toBeVisible();
      await expect(page.locator(".report-payment__consent-error")).toContainText(
        "Tick this box to continue",
      );
      await page.locator("#payment-consent").check();
      await expect(page.locator(".report-payment__consent-error")).toHaveCount(0);
    },
  );

  test(
    "a postcode-only arrival names the postcode and guesses no home",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/report?postcode=CM3+2JT");
      await expect(page.locator("h1")).toHaveText("The detailed report for CM3 2JT");
      await expect(page.locator("#payment-email")).toBeVisible();
    },
  );

  test(
    "a cold visit to /report renders the generic payment page",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/report");
      await expect(page.locator("h1")).toHaveText("The detailed report");
      await expect(page.locator(".report-door__card h2").first()).toHaveText(
        "What the detailed report adds",
      );
      await expect(page.locator("#payment-email")).toBeVisible();
      await expect(page.locator("#payment-consent")).toBeVisible();
    },
  );
});
