import { expect, test } from "./fixtures";
import pg from "pg";

// The preparing success page's search box (BUG-216,
// founder, 24 Nov 2026): while the report was being
// prepared, the "Check another home" box's suggestions
// appeared, then instantly disappeared — type a
// letter, the panel came up, then vanished; type
// another, the same — and once the report was ready
// the box worked fine. The cause was the preparing
// page's refresh beat: it reloaded the whole document
// every 5s, destroying the box's typed text and its
// open panel on every tick. The beat is now the App
// Router's soft refresh, which re-renders the server
// state in place while the box keeps its state — so
// the panel must stand open across a tick, and the
// typed text with it.
//
// The specs drive a real preparing order: a fulfilment
// claim standing 'claimed' under a test reference, so
// the success page renders the preparing frame. The
// fulfilment worker does not run in the e2e harness,
// so the claim stands claimed until a spec flips it —
// the flip spec is the ready half of the same story.
// The row is marked a test order and deleted after
// each spec, so it never leaks into any other spec's
// readings.

const REF = "e2e-bug216-preparing";
const EMAIL = "buyer@example.co.uk";
const POSTCODE = "CM3 2JT";
const HOME_KEY = "19||BIRKDALE RISE";

function connect() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set for the harness.");
  return new pg.Pool({ connectionString });
}

test.describe("preparing success page — regression", () => {
  test.beforeEach(async () => {
    const db = connect();
    try {
      await db.query(
        `INSERT INTO fulfilment_claims
           (ref, kind, email, postcode, home_key, test_order, status, claimed_at)
         VALUES ($1, 'paid', $2, $3, $4, true, 'claimed', now())
         ON CONFLICT (ref) DO UPDATE
           SET status = 'claimed', delivery_id = NULL, mail_sent = NULL, fulfilled_at = NULL`,
        [REF, EMAIL, POSTCODE, HOME_KEY],
      );
    } finally {
      await db.end();
    }
  });

  test.afterEach(async () => {
    const db = connect();
    try {
      await db.query(`DELETE FROM fulfilment_claims WHERE ref = $1`, [REF]);
    } finally {
      await db.end();
    }
  });

  test(
    "the search box keeps its suggestions across the readiness beat while the report is preparing",
    { tag: "@regression" },
    async ({ page }) => {
      // The wait below runs past the 5s beat; the 120s
      // timeout is headroom for the served page's own
      // warm-up, not an expectation — the spec itself
      // takes about ten seconds.
      test.setTimeout(120_000);
      await page.goto(`/report/success?order=${REF}`);
      await expect(page.locator("h1")).toHaveText("Your report is being prepared");

      const box = page.locator("#postcode");
      const panel = page.locator("#postcode-suggestions");
      await box.fill("CM3");
      await expect(panel).toBeVisible();
      await expect(panel.locator(".suggest__group-label").first()).toHaveText("Postcodes");
      await expect(panel.getByRole("option", { name: "CM3 2JT", exact: true })).toBeAttached();

      // One readiness beat passes with the panel open:
      // a document reload would wipe the typed text and
      // close the panel, so the value and the panel
      // standing after the beat is the fix itself.
      await page.waitForTimeout(6500);
      await expect(box).toHaveValue("CM3");
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("option", { name: "CM3 2JT", exact: true })).toBeAttached();
      await expect(page.locator("h1")).toHaveText("Your report is being prepared");
    },
  );

  test(
    "once the report is ready the page flips and the box still works",
    { tag: "@regression" },
    async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(`/report/success?order=${REF}`);
      await expect(page.locator("h1")).toHaveText("Your report is being prepared");

      // The worker's own fulfilment, by hand: the next
      // readiness beat re-reads the claim and the page
      // flips to the ready surface — with the box still
      // standing, its state carried across the flip.
      const db = connect();
      try {
        await db.query(
          `UPDATE fulfilment_claims
              SET status = 'fulfilled', delivery_id = 'del_e2e_bug216',
                  mail_sent = true, fulfilled_at = now()
            WHERE ref = $1`,
          [REF],
        );
      } finally {
        await db.end();
      }
      await expect(page.locator("h1")).toHaveText("Your report is ready", { timeout: 15_000 });

      const box = page.locator("#postcode");
      const panel = page.locator("#postcode-suggestions");
      await box.fill("CM3");
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("option", { name: "CM3 2JT", exact: true })).toBeAttached();
    },
  );
});
