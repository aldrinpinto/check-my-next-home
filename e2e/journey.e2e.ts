import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// M7.3 E2E (D68) — the checker journey against the SERVED
// app + the seeded golden corpus (scripts/seed-golden.mjs).
//
// Smoke: the step's authored journey — full postcode →
// postcode check (carrying the full home list) → checking
// → results — once per universal golden home. These gate
// the step in CI. Regression: everything else the step
// makes testable (outward codes, normalisation, the
// mistype classes, the nations, the empty home list, the
// standalone checking screen, the robot check, the
// whole-check failure, refresh). No Regression spec is
// promoted to Smoke (D68 clause 7).
//
// Picker removal (founder ruling, 18 Nov 2026, parity fix
// batch): the picker page is retired — a button press with
// a full postcode lands on the whole-postcode check, whose
// home list links straight to each home's check, and
// /search?postcode= redirects there.
//
// M7.4 re-pointed the holding-page assertions at the real
// results page (.results) that replaced it; M7.4's own
// specs live in e2e/results.e2e.ts.
//
// Test discipline (fold-in 9): only pre-filed golden
// postcodes; no spec depends on a cold load completing —
// Beaulieu's crime is a genuine first-check load, so its
// spec asserts the server-rendered states only.
//
// T-WEB map (M7.15 citation tidy) — the T-WEB rows this
// file discharges, per spec:
//   T-WEB-02 — "mistypes land on their named states".
//   T-WEB-03 — "Edinburgh EH1 1AD goes straight to the
//     not-covered page" and "Belfast BT1 1AA goes
//     straight to the not-covered page" (the Northern
//     Ireland spec is the M7.15 follow-up's item 4a).
//   T-WEB-05 — "a normal search completes end to end
//     with the robot check active" (cited in its title)
//     and "a robot check that cannot run blocks the
//     search with a friendly retry".
//   T-WEB-07 — "an outward code lands on the district
//     page" (cited in its title); the dropdown leg is in
//     e2e/suggest.e2e.ts.
//   T-WEB-08 — "the postcode check carries the full home
//     list" (cited in its title; the row's picker form as
//     amended when the picker was removed, 18 Nov 2026).
//   T-WEB-09 — "the bare route redirects to the landing
//     page with the unplaced notice" (the retired
//     no-location route's served form).
//   T-WEB-10 — "normalisation: 'e161gn' and ' cm3 2jt '
//     reach the same home lists as the tidy forms".
//   T-WEB-11, in part — "a full address carrying its
//     postcode resolves straight to the home"; the
//     street and place legs are in e2e/suggest.e2e.ts.
//   No T-WEB row: the three Smoke journeys (D68's
//   critical journey), the two checking-screen specs,
//   the Beaulieu / Southminster / stale-key / refresh
//   specs (M7.15B and the fold-ins), the whole-check
//   failure spec (D44(7)) and the per-row failure spec
//   (the M7.15 follow-up's item 4d).

async function searchFromHome(page: Page, text: string) {
  await page.goto("/");
  await page.locator("#postcode").fill(text);
  // Fidelity pass 2: the landing's bare box carries the
  // sample's Brass button, "Check this home" (the journey
  // surfaces' standard form keeps "Check a home").
  await page.getByRole("button", { name: "Check this home" }).click();
}

async function pickAndReachResults(page: Page, postcode: string, rowName: string) {
  // The submit lands on the whole-postcode check (the
  // /search?postcode= route redirects there); its home
  // list's rows are links straight to each home's check.
  await page.waitForURL(`**/search/home?postcode=${postcode.replace(" ", "+")}`);
  await page.getByRole("link", { name: rowName, exact: true }).click();
  await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
  await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
}

test.describe("checker journey — smoke", () => {
  test(
    "Birkdale CM3 2JT: postcode → home list → checking → results",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await pickAndReachResults(page, "CM3 2JT", "19 Birkdale Rise");
      // Item 5 (parity fix batch): the H1 carries the
      // postcode, in the Master's form.
      await expect(page.locator(".results-head h1")).toHaveText("19 Birkdale Rise, CM3 2JT");
    },
  );

  test(
    "Exeter E16 1GN: postcode → home list → checking → results",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "E16 1GN");
      await pickAndReachResults(page, "E16 1GN", "6 Exeter Road");
      await expect(page.locator(".results-head h1")).toHaveText("6 Exeter Road, E16 1GN");
    },
  );

  test(
    "Minerva KT17 1FH: postcode → home list → checking → results",
    { tag: "@smoke" },
    async ({ page }) => {
      await searchFromHome(page, "KT17 1FH");
      await page.waitForURL("**/search/home?postcode=KT17+1FH");
      await page
        .getByRole("link", { name: /Flat 4, Minerva House/ })
        .first()
        .click();
      await page.waitForURL(/\/search\/home\?postcode=KT17\+1FH&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toContainText("KT17 1FH");
    },
  );
});

test.describe("checker journey — regression", () => {
  test(
    "the checking screen shows the five groups completing with their finding lines, then advances",
    { tag: "@regression" },
    async ({ page }) => {
      // The founder-chosen checking design (19 Nov 2026;
      // the D73 mechanics stand): group completion is
      // driven by the three part calls' real settlements,
      // paced ~720ms apart, and each row completes with a
      // FINDING line derived from the served data — never a
      // bare "Done". Hold the brain calls so the screen is
      // observable: while they are held, no group can
      // complete, the live line shows its starting sentence
      // and the seal stays unfilled.
      await page.route("**/api/check/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        await route.continue();
      });
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      await page.getByRole("link", { name: "19 Birkdale Rise", exact: true }).click();

      await expect(page.locator(".checking .page-title")).toHaveText("Your check is under way");
      const rows = page.locator(".checking__row");
      await expect(rows).toHaveCount(5);
      await expect(page.locator(".checking__row-label")).toHaveText([
        "Schools & nurseries",
        "Health & the everyday",
        "Safety & surroundings",
        "Costs & connections",
        "Past sales & prices",
      ]);
      await expect(page.locator(".checking__row-source")).toHaveText([
        "Ofsted",
        "NHS & local data",
        "Police.uk · Environment Agency",
        "Council & providers",
        "HM Land Registry",
      ]);
      await expect(page.locator(".checking__intro")).toHaveText(
        "We present the facts — the decision is yours.",
      );
      await expect(page.locator(".checking__ticker")).toContainText("Starting your check…");
      await expect(page.locator(".checking__seal-caption")).toHaveText("Five checks · one seal");
      // The schools group completes with its finding line —
      // the per-category filed counts for the seeded corpus.
      await expect(
        page.locator('.checking__row[data-row="schools"] .checking__row-state'),
      ).toContainText("Within 2 miles:", { timeout: 15_000 });
      // The progress bar counts groups: five of five when
      // the seal stamps, just before the reveal.
      await expect(page.locator(".checking__progress")).toHaveAttribute("aria-valuemax", "5");
      await expect(page.locator(".checking__progress")).toHaveAttribute("aria-valuenow", "5", {
        timeout: 15_000,
      });
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
    },
  );

  test(
    "the checking screen stands alone: no results shell, no back link, no status line (items 2–4)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.route("**/api/check/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        await route.continue();
      });
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      await page.getByRole("link", { name: "19 Birkdale Rise", exact: true }).click();
      await expect(page.locator(".checking__row")).toHaveCount(5);

      // Item 2: the screen is NOT inside the results shell
      // — no results H1, no manifesto, no results block.
      await expect(page.locator(".results")).toHaveCount(0);
      await expect(page.locator(".results-head")).toHaveCount(0);
      // The only address reference is the slim eyebrow.
      await expect(page.locator(".checking .addr-line")).toContainText("19 Birkdale Rise");
      await expect(page.locator(".checking .addr-line")).toContainText("CM3 2JT");
      // Item 3: no "Back to the address list" link.
      await expect(page.getByRole("link", { name: "Back to the address list" })).toHaveCount(0);
      // Item 4: no visible status line.
      await expect(page.locator(".checking")).not.toContainText("Checks are running.");
      await expect(page.locator(".checking")).not.toContainText("Every check has finished.");
    },
  );

  test(
    "an outward code lands on the district page: scope label, four tabs and the bridge (T-WEB-07)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "E16");
      await page.waitForURL("**/search?outward=E16");
      // Held reveal (the wider-area checking screen,
      // 19 Nov 2026): the heading arrives with the results.
      await expect(page.getByRole("heading", { name: "Wider area — E16" })).toHaveText(
        "Wider area — E16",
        { timeout: 30_000 },
      );
      // The district page (founder ruling, 18 Nov 2026)
      // supersedes the unlock banner: the results page's
      // four tabs carry the district sections, and the
      // bridge is the only forward path.
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("tab")).toHaveCount(4);
      await expect(page.locator(".unlock-banner")).toHaveCount(0);
      await expect(page.locator(".district-bridge__heading")).toHaveText(
        "Checking one home in E16?",
      );
    },
  );

  test(
    "the wider-area checking screen plays over the district page: four named groups and the sweep, then the results",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search?outward=E16");
      // The screen is what the navigation shows first
      // (the loading frame and the live screen are one
      // dress): its own heading, the four D76 groups
      // named as rows, and the schematic sweep — and no
      // seal: a place is not a home.
      const screen = page.locator('section[aria-label="Checking the wider area"]');
      await expect(screen).toBeVisible();
      await expect(screen.getByRole("heading", { name: "Checking the wider area…" })).toBeVisible();
      for (const key of ["family", "neighbourhood", "home", "nearby"]) {
        await expect(screen.locator(`[data-row="${key}"]`)).toHaveCount(1);
      }
      await expect(screen.locator(".dchecking__sweep")).toBeVisible();
      await expect(screen.locator(".checking__seal")).toHaveCount(0);
      // The reveal: the district results land whole and
      // the screen is gone.
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(screen).toHaveCount(0);
    },
  );

  test(
    "normalisation: 'e161gn' and ' cm3 2jt ' reach the same home lists as the tidy forms",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "e161gn");
      await page.waitForURL("**/search/home?postcode=E16+1GN");
      await expect(page.getByRole("link", { name: "6 Exeter Road", exact: true })).toBeVisible();

      await searchFromHome(page, " cm3 2jt ");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      await expect(page.getByRole("link", { name: "19 Birkdale Rise", exact: true })).toBeVisible();
    },
  );

  test(
    "a full address carrying its postcode resolves straight to the home (rung 1)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "19 Birkdale Rise, Hatfield Peverel CM3 2JT");
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
    },
  );

  test(
    "the postcode check carries the full home list — a home pick goes straight to that home's check (T-WEB-08, picker removed)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      // Rung 2's results-page scope label (M7.4, ruling 3).
      await expect(page.locator(".results-head h1")).toHaveText(
        "Postcode area — CM3 2JT, not one exact home",
      );
      await page
        .locator(".picker")
        .getByRole("link", { name: "19 Birkdale Rise", exact: true })
        .click();
      await page.waitForURL(/\/search\/home\?postcode=CM3\+2JT&home=/);
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toHaveText("19 Birkdale Rise, CM3 2JT");
    },
  );

  test(
    "the bare route redirects to the landing page with the unplaced notice, and a bare street name lands there too (18 Nov 2026)",
    { tag: "@regression" },
    async ({ page }) => {
      // The standalone no-location page is retired (founder
      // ruling, 18 Nov 2026): a direct hit on the bare
      // route returns to the landing page — its own
      // headline, no separate page served — with the small
      // notice at the search box.
      await page.goto("/search");
      await page.waitForURL(/\/\?notice=unplaced/);
      await expect(page.locator("h1")).toHaveText(
        "You're not buying a house. You're choosing your family's home.",
      );
      await expect(page.locator(".unplaced-notice")).toHaveText(
        "We couldn't place that. Try a full postcode — for example SW1A 1AA — or start typing a street name and pick it from the list.",
      );
      await expect(page.locator("#postcode")).toBeVisible();

      // A bare street name submitted from the landing box
      // lands back on the landing page the same way.
      await searchFromHome(page, "Birkdale Rise");
      await page.waitForURL(/\/\?notice=unplaced/);
      await expect(page.locator(".unplaced-notice")).toBeVisible();
    },
  );

  test(
    "mistypes land on their named states: unheld full postcode → wider area naming it; unknown outward → the landing page with the unplaced notice",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JA");
      // The wait commits at the redirect, not at the
      // destination's full load (Regression run
      // 44535680408 follow-up, 19 Nov 2026): the
      // wider-area page is the suite's heaviest render,
      // and on that run's starved runner its load event
      // outlasted the 60s test timeout on both attempts —
      // while the redirect itself is two indexed reads
      // and lands at once. The content assertions below
      // (the heading, the notice, the bridge) prove the
      // destination itself, separately.
      await page.waitForURL("**/search?outward=CM3&notfound=CM3+2JA", { waitUntil: "commit" });
      // Held reveal (the wider-area checking screen,
      // 19 Nov 2026): the heading arrives with the results.
      await expect(page.getByRole("heading", { name: "Wider area — CM3" })).toHaveText(
        "Wider area — CM3",
        { timeout: 30_000 },
      );
      await expect(page.locator(".journey-notice")).toHaveText(
        "CM3 2JA isn't a postcode we hold — this is the wider area it points to instead.",
      );
      // The bridge (founder fix batch, 19 Nov 2026)
      // carries the Final Sample Master's own dress: a
      // light section with a postcode-only field and the
      // sample's button — the labelled full search block
      // it replaced is gone from this page.
      await expect(page.locator(".district-bridge__input")).toHaveAttribute(
        "placeholder",
        "Enter a postcode, street or town — e.g. SW1A 1AA",
      );
      await expect(
        page.locator(".district-bridge").getByRole("button", { name: "Check this home →" }),
      ).toBeVisible();

      await searchFromHome(page, "ZZ1 1ZZ");
      await page.waitForURL(/\/\?notice=unplaced/);
      await expect(page.locator(".unplaced-notice")).toBeVisible();
    },
  );

  test(
    "Edinburgh EH1 1AD goes straight to the not-covered page (ruling 4)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "EH1 1AD");
      await page.waitForURL("**/search/home?postcode=EH1+1AD");
      await expect(page.locator("h1")).toHaveText("EH1 1AD is in Scotland");
      // M7.4: the not-covered page is the results page —
      // the four tabs (D76) render with each section's
      // served not-covered line in place.
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("tab")).toHaveCount(4);
      await expect(page.locator('[data-section="flood"]')).toContainText(/not covered/i);
      await expect(page.locator(".picker")).toHaveCount(0);
      // Scotland gating (fold-in workstream 6, gap check
      // extension): the class (a) register sections carry
      // the D77(c) not-covered line, and no three-digit-mile
      // figure appears anywhere on the page — the assertion
      // that would have caught the defect on the seed corpus.
      await expect(page.locator('[data-section="schools-primary"]')).toContainText(
        "isn't part of this check in Scotland",
      );
      await expect(page.locator('[data-section="nurseries"]')).toContainText(
        "isn't part of this check in Scotland",
      );
      await page.getByRole("tab", { name: "What's Nearby" }).click();
      await expect(page.locator('[data-section="health"]')).toContainText(
        "isn't part of this check in Scotland",
      );
      await expect(page.locator('[data-section="hospitals"]')).toContainText(
        "isn't part of this check in Scotland",
      );
      const bodyText = await page.locator("main").innerText();
      expect(bodyText).not.toMatch(/\d{3}\.\d+ mi/);
    },
  );

  test(
    "Belfast BT1 1AA goes straight to the not-covered page (T-WEB-03, Northern Ireland)",
    { tag: "@regression" },
    async ({ page }) => {
      // The Northern Ireland mirror of the Edinburgh spec
      // above (M7.15 follow-up, gap-check item 4a): T-WEB-03
      // names Scotland AND Northern Ireland, and until now
      // only the Scotland half had a served-page spec. The
      // postcode is held by the replay directory fixture
      // (tests/fixtures/replay/directory-rows.json — region
      // "N99999999", an N-letter LSOA), so the journey
      // resolves it to the not-covered nation exactly as
      // EH1 1AD resolves to Scotland.
      await searchFromHome(page, "BT1 1AA");
      await page.waitForURL("**/search/home?postcode=BT1+1AA");
      await expect(page.locator("h1")).toHaveText("BT1 1AA is in Northern Ireland");
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("tab")).toHaveCount(4);
      await expect(page.locator('[data-section="flood"]')).toContainText(/not covered/i);
      await expect(page.locator(".picker")).toHaveCount(0);
      await expect(page.locator('[data-section="schools-primary"]')).toContainText(
        "isn't part of this check in Northern Ireland",
      );
      await expect(page.locator('[data-section="nurseries"]')).toContainText(
        "isn't part of this check in Northern Ireland",
      );
      await page.getByRole("tab", { name: "What's Nearby" }).click();
      await expect(page.locator('[data-section="health"]')).toContainText(
        "isn't part of this check in Northern Ireland",
      );
      await expect(page.locator('[data-section="hospitals"]')).toContainText(
        "isn't part of this check in Northern Ireland",
      );
      const bodyText = await page.locator("main").innerText();
      expect(bodyText).not.toMatch(/\d{3}\.\d+ mi/);
    },
  );

  test(
    "Beaulieu CM1 6ER: the postcode check lists the picking index's homes (M7.15B)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM1 6ER");
      // The submit redirects to the whole-postcode check,
      // which carries the list (picker removed).
      await page.waitForURL("**/search/home?postcode=CM1+6ER");
      // CI #233 follow-up: the same results wait as every
      // other spec here — the list renders inside the
      // results, behind the checking screen's reveal; this
      // spec previously rode on the warm-gate's cover for
      // CM1 6ER alone.
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      // M7.15B: the harness seed's fixture pass files the
      // EPC half of the picking index, and Beaulieu's 49
      // certificate homes (the odd numbers on George Heard
      // Crescent) are exactly what the union serves here —
      // the empty list this spec asserted before the
      // preload is gone by design (CI #215).
      await expect(page.locator(".picker__empty-line")).toHaveCount(0);
      await expect(page.locator(".picker__count")).toHaveText("49 addresses");
      await expect(
        page.getByRole("link", { name: "49 George Heard Crescent", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".results-head h1")).toHaveText(
        "Postcode area — CM1 6ER, not one exact home",
      );
    },
  );

  test(
    "Beaulieu CM1 6ER: an index-only home links through its durable home key, never a token (M7.15B)",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM1 6ER");
      await page.waitForURL("**/search/home?postcode=CM1+6ER");
      await page.getByRole("link", { name: "49 George Heard Crescent", exact: true }).click();
      // The row's link carries the home's durable key —
      // the same key a filed sale would carry — so the
      // pick lands on the canonical home route, not on a
      // transient resolve token.
      await page.waitForURL(
        /\/search\/home\?postcode=CM1\+6ER&home=49%7C%7CGEORGE\+HEARD\+CRESCENT/,
      );
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toHaveText(
        "49 George Heard Crescent, CM1 6ER",
      );
    },
  );

  test(
    "Southminster CM0 7AA: the empty home list is one named state on the postcode check",
    { tag: "@regression" },
    async ({ page }) => {
      // The neither-source witness (the entry-point unit
      // scenarios' own postcode): the directory fixture
      // holds CM0 7AA, but no seeded fixture files a sale,
      // a certificate or an index row for it, so the union
      // is empty and the named empty state is the served
      // truth. (Before M7.15B this spec ran on Beaulieu,
      // whose list the preload deliberately filled.)
      await searchFromHome(page, "CM0 7AA");
      await page.waitForURL("**/search/home?postcode=CM0+7AA");
      // CI #233 follow-up: the results wait comes first,
      // as everywhere else in this file. The empty line
      // renders inside the results, behind the checking
      // screen's designed reveal (the five groups
      // completing at the 720ms pacing once the part calls
      // settle, plus the advance) —
      // and CM0 7AA is the suite's one unwarmed results
      // postcode, so the default expect budget was too
      // thin a margin once M7.14's counting posts (every
      // page of every spec, into the same app server)
      // lengthened the journey's path in CI. The served
      // state is unchanged: results.e2e.ts pins this same
      // page, this same line, green in the same run.
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".picker__empty-line")).toHaveText(
        "No addresses we can list for this postcode yet.",
      );
      await expect(page.locator(".results-head h1")).toHaveText(
        "Postcode area — CM0 7AA, not one exact home",
      );
    },
  );

  test(
    "a stale home key returns to that postcode's check, never a guessed home (fold-in 1)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.goto("/search/home?postcode=CM3+2JT&home=no-such%7C%7Ckey");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      // CI #233 follow-up: the same results wait as every
      // other spec here — the home list renders inside
      // the results, behind the checking screen's reveal.
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("link", { name: "19 Birkdale Rise", exact: true })).toBeVisible();
    },
  );

  test(
    "refresh on a results URL re-derives and serves the same results page",
    { tag: "@regression" },
    async ({ page }) => {
      await searchFromHome(page, "CM3 2JT");
      await pickAndReachResults(page, "CM3 2JT", "19 Birkdale Rise");
      await page.reload();
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toHaveText("19 Birkdale Rise, CM3 2JT");
    },
  );

  test(
    "T-WEB-05: a normal search completes end to end with the robot check active (test keys)",
    { tag: "@regression" },
    async ({ page }) => {
      // This spec is T-WEB-05's authored home (fold-in 8):
      // the search is verified server-side and completes.
      // The suite runs on the harness's Turnstile seams by
      // default (founder ruling, 17 Nov 2026, after CI
      // #199); under E2E_REAL_TURNSTILE=1 this same spec is
      // the real-path proof — Cloudflare's published test
      // keys against the real widget and verify endpoint.
      await searchFromHome(page, "E16 1GN");
      await page.waitForURL("**/search/home?postcode=E16+1GN");
      await expect(page.getByRole("link", { name: "6 Exeter Road", exact: true })).toBeVisible();
    },
  );

  test(
    "a robot check that cannot run blocks the search with a friendly retry — nothing is sent (ruling 5)",
    { tag: "@regression" },
    async ({ page }) => {
      await page.route("**/challenges.cloudflare.com/**", (route) => route.abort());
      await page.goto("/");
      await page.locator("#postcode").fill("CM3 2JT");
      await page.getByRole("button", { name: "Check this home" }).click();
      await expect(page.locator(".field__message")).toHaveText(
        "The robot check couldn't run, so your search hasn't been sent. Please try again.",
      );
      expect(page.url()).toBe("http://127.0.0.1:4173/");
      await expect(page.locator("#postcode")).toHaveValue("CM3 2JT");
    },
  );

  test(
    "a resolution that fails outright lands on the whole-check failure state (D44(7))",
    { tag: "@regression" },
    async ({ page }) => {
      await page.route("**/api/resolve", (route) =>
        route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
      );
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search/failed**");
      // The failure landing wears the single error page
      // (Final Sample Master view 26, error-page build
      // 19 Nov 2026): the new headline, and the page's
      // search box still holding what was typed, under
      // the kept note.
      await expect(page.locator("h1")).toHaveText("Well — that wasn't supposed to happen");
      await expect(page.locator("#postcode")).toHaveValue("CM3 2JT");
      await expect(
        page.getByText(
          "We've kept the home you were checking in the box — just press the button to run it again, or type a different home.",
        ),
      ).toBeVisible();
    },
  );

  test(
    "one part of the check failing outright completes its group with the named failure line, and the results still open",
    { tag: "@regression" },
    async ({ page }) => {
      // M7.15 follow-up, gap-check item 4d — in the form
      // the founder-chosen checking design (19 Nov 2026)
      // gives it. The D73-era form of this spec asserted no
      // row state at all: the old screen was a pure graphic
      // with no failure states by design. The new design
      // completes each group with a finding line or its
      // honest named state, so a part that fails outright
      // completes its groups with their named failure lines
      // (D44(5)(ii)'s row-marking, restored): fail the flood
      // part outright and the safety group completes
      // unavailable, its line carrying the flood failure
      // beside the area part's real crime finding — while
      // the check still completes, the results open on the
      // home, and the journey never lands on the whole-check
      // failure state. The nearby and area parts are held
      // 2.5s so the safety row's completed state is
      // observable before the reveal (~600ms after the
      // fifth group).
      await page.route("**/api/check/flood**", (route) =>
        route.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
      );
      await page.route("**/api/check/nearby**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2_500));
        await route.continue();
      });
      await page.route("**/api/check/area**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2_500));
        await route.continue();
      });
      await searchFromHome(page, "CM3 2JT");
      await page.waitForURL("**/search/home?postcode=CM3+2JT");
      await page.getByRole("link", { name: "19 Birkdale Rise", exact: true }).click();
      const safetyRow = page.locator('.checking__row[data-row="safety"]');
      await expect(safetyRow).toHaveAttribute("data-state", "unavailable", { timeout: 15_000 });
      await expect(safetyRow.locator(".checking__row-state")).toContainText(
        "Flood couldn't be checked just now",
      );
      await expect(safetyRow.locator(".checking__row-state")).toContainText(
        "recorded crimes in the last 12 months",
      );
      await expect(page.locator(".results")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".results-head h1")).toHaveText("19 Birkdale Rise, CM3 2JT");
      expect(page.url()).not.toContain("/search/failed");
      const pills = page.locator(".results-strip .pill--summary");
      await expect(pills.nth(0)).toContainText("Schools");
      await expect(pills.nth(0).locator(".pill__figure")).toHaveText("0.3 / 1.9 mi");
    },
  );
});
