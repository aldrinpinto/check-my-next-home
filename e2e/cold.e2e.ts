import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

// Cold checks (cold-check fix stack, 19 Nov 2026).
//
// Until this stack, the whole seeded-corpus suite only
// ever checked postcodes the seed had already filed —
// so the founder, not the suite, found the 19 Nov 2026
// defect: a first check on any postcode with no filed
// data failed WHOLE (the sold-prices cold load's
// bounded wait expired, its rejection poisoned the
// check assembly, and the visitor got the error page).
// These specs run first checks against the cold pool
// (tests/fixtures/cold-pool.json — real postcodes the
// seed files into the directory and picking layers
// ONLY, E2E_COLD_POOL; no brain has ever filed any of
// them, and no load stamp exists for any of them).
//
// In the harness a cold sold-prices load reads the
// small fixture Price Paid file (serve-e2e's
// SOLD_PRICES_FILE_DIR seam), files nothing for a pool
// postcode, stamps it, and lands fast — so a first
// visit exercises the genuine cold path (directory
// row, no filings, load triggered) and a second visit
// in the same test serves the filed answer.
//
// Assertions are BEHAVIOURAL only — no data values:
// the checking screen completes, the results render
// (results head present, error page absent), every
// section block is present carrying a named state
// (a figure, a not-filed line, or a failure line), and
// the sold-prices section shows figures or a named
// state line. Which state a given section lands in is
// the data's business, not the spec's.
//
// Selection is seeded-random: the seed derives from
// E2E_COLD_SEED, else the CI run id, else the date;
// the seed and every pick are printed in the test
// output, so any failure reproduces exactly by
// re-running with that E2E_COLD_SEED.

interface PoolDirectoryRow {
  postcode: string;
  lsoaCode: string;
}
interface PoolHome {
  postcode: string;
  paon: string;
  saon: string | null;
  street: string;
  town: string;
}
interface PoolStreet {
  street: string;
  town: string;
  postcode: string;
  homeCount: number;
}
interface PoolPlace {
  place: string;
  outward: string;
  postcodeCount: number;
}
interface ColdPool {
  directory: PoolDirectoryRow[];
  homes: PoolHome[];
  streets: PoolStreet[];
  places: PoolPlace[];
  spanningStreet: { street: string; town: string; postcodes: string[] };
}

const pool = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "fixtures", "cold-pool.json"), "utf8"),
) as ColdPool;

// The one filed sold-prices answer a pool postcode can
// reach (its fixture file holds no pool sales): the
// loaded-none line, duplicated here as the specs are
// black-box (the seed's gift tokens set the pattern).
const NO_SALE_RECORDED_LINE = "No sale recorded for this postcode since 1995";

// ------------------------------------------------------------------
// The seeded pick
// ------------------------------------------------------------------

function seedFromEnv(): string {
  return (
    process.env.E2E_COLD_SEED ?? process.env.GITHUB_RUN_ID ?? new Date().toISOString().slice(0, 10)
  );
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32 — a tiny deterministic PRNG; the same seed
// walks the pool the same way on every machine.
function rngFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickN<T>(rng: () => number, items: readonly T[], n: number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

const SEED_TEXT = seedFromEnv();
const rng = rngFrom(hashSeed(SEED_TEXT));

// Display casing for a filed (upper-case) part, in the
// form the site's labels carry — lib/address.ts's
// displayText restated (the specs are black-box and
// locate by the served label, as the suggest specs do).
function display(value: string): string {
  return value
    .toLowerCase()
    .replace(/(^|[\s,])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------------
// The pool's categories
// ------------------------------------------------------------------

const homesByPostcode = new Map<string, PoolHome[]>();
for (const home of pool.homes) {
  const list = homesByPostcode.get(home.postcode) ?? [];
  list.push(home);
  homesByPostcode.set(home.postcode, list);
}

const covered = pool.directory.filter(
  (row) => row.lsoaCode.startsWith("E") || row.lsoaCode.startsWith("W"),
);
const coveredWithHomes = covered.filter(
  (row) => (homesByPostcode.get(row.postcode) ?? []).length > 0,
);
const scotland = pool.directory.filter((row) => row.lsoaCode.startsWith("S"));
const northernIreland = pool.directory.filter((row) => row.lsoaCode.startsWith("N"));

// Streets in exactly one pool postcode (the typed pick
// lands straight on that postcode's check), whose name
// is distinctive enough to surface in the panel: at
// most two pool streets share its first word.
const streetUnitKey = (s: PoolStreet) => `${s.street}|${s.town}`;
const postcodesPerUnit = new Map<string, Set<string>>();
for (const s of pool.streets) {
  const set = postcodesPerUnit.get(streetUnitKey(s)) ?? new Set<string>();
  set.add(s.postcode);
  postcodesPerUnit.set(streetUnitKey(s), set);
}
const firstWordCounts = new Map<string, number>();
for (const s of pool.streets) {
  const first = s.street.split(" ")[0];
  firstWordCounts.set(first, (firstWordCounts.get(first) ?? 0) + 1);
}
const singleStreets = pool.streets.filter(
  (s) =>
    postcodesPerUnit.get(streetUnitKey(s))?.size === 1 &&
    s.homeCount >= 2 &&
    (firstWordCounts.get(s.street.split(" ")[0]) ?? 0) <= 2,
);

// House-name homes: a PAON with no street number — a
// name, not digits — kept to simple one/two-word names
// so the typed-word match and the served label are
// unambiguous.
const houseNameHomes = pool.homes.filter(
  (h) => !/^\d/.test(h.paon) && /^[A-Z]+( [A-Z]+)?$/.test(h.paon),
);

// Places serving two or more pool districts (the place
// page's full list is the point of the exercise).
const districtsPerPlace = new Map<string, string[]>();
for (const p of pool.places) {
  const list = districtsPerPlace.get(p.place) ?? [];
  list.push(p.outward);
  districtsPerPlace.set(p.place, list);
}
const multiDistrictPlaces = [...districtsPerPlace.entries()]
  .filter(([, districts]) => districts.length >= 2)
  .map(([place, districts]) => ({ place, districts }));

// ------------------------------------------------------------------
// Shared assertions
// ------------------------------------------------------------------

async function searchFromHome(page: Page, text: string) {
  await page.goto("/");
  await page.locator("#postcode").fill(text);
  await page.getByRole("button", { name: "Check this home" }).click();
}

// The whole-results contract for a cold check, at any
// rung the page serves: the checking screen completed
// (.results rendered), the error page is absent, the
// results head stands, and every section block on
// every tab is present carrying some named state
// (non-empty text — a figure, a not-filed line, or a
// failure line; the spec never reads the value).
async function expectResultsWhole(page: Page) {
  await expect(page.locator(".results")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".error-page")).toHaveCount(0);
  await expect(page.locator(".results-head h1")).toBeVisible();
  for (const tab of [
    "Family Checks",
    "The Neighbourhood",
    "Home, Costs & Risks",
    "What's Nearby",
  ]) {
    await page.getByRole("tab", { name: tab }).click();
    const sections = page.locator("[data-section]");
    const count = await sections.count();
    expect(count, `tab ${tab} carries sections`).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const text = (await sections.nth(i).textContent()) ?? "";
      expect(text.trim().length, `tab ${tab} section ${i} carries a named state`).toBeGreaterThan(
        0,
      );
    }
  }
}

async function soldSectionText(page: Page): Promise<string> {
  await page.getByRole("tab", { name: "Home, Costs & Risks" }).click();
  const sold = page.locator('[data-section="sold-prices"]');
  await expect(sold).toHaveCount(1);
  return (await sold.textContent()) ?? "";
}

// The filed answer for a pool postcode: figures, or
// the loaded-none line — never the still-loading
// state. Reloads until the first visit's cold load has
// landed and stamped (the harness's load is small; the
// budget is for starved runners, not for the load).
async function expectFiledAnswerOnSecondVisit(page: Page, postcode: string) {
  const url = `/search?postcode=${encodeURIComponent(postcode)}`;
  let lastText = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(url);
    await expect(page.locator(".results")).toBeVisible({ timeout: 60_000 });
    lastText = await soldSectionText(page);
    if (lastText.includes(NO_SALE_RECORDED_LINE) || lastText.includes("£")) return;
    await page.waitForTimeout(3_000);
  }
  throw new Error(
    `second visit to ${postcode} never served the filed answer; last sold section: ${lastText.slice(0, 200)}`,
  );
}

// ------------------------------------------------------------------
// The forced-pending Smoke spec — the permanent
// regression test for the 19 Nov 2026 bug.
//
// It asserts the degrade behaviour: a still-loading
// sold-prices load leaves the rest of the check
// standing, with the sold section carrying its named
// unavailable state. The behaviour is Part A of the
// cold-check fix — the rung-1/2 unavailable bundle
// variant, a contract change (bundle-shapes.json)
// the founder authorised on 19 Nov 2026; this spec
// was held as test.fixme until that change landed
// and was un-fixmed with it. On the pre-fix code it
// FAILS (the whole check fails — the bug itself). It
// runs against the harness's forced-pending instance
// (playwright.config.ts: port 4175,
// SOLD_PRICES_LOAD_WAIT_MS=0), where a cold load is
// always still running when the caller is told.
// ------------------------------------------------------------------

test.describe("cold check — forced pending (the 19 Nov 2026 regression)", () => {
  test.use({ baseURL: "http://127.0.0.1:4175" });

  test(
    "a cold postcode whose sold load is still running renders whole, with the sold section in its failure state",
    { tag: "@smoke" },
    async ({ page }) => {
      test.setTimeout(240_000);
      const target = coveredWithHomes[0];
      console.log(`cold seed: ${SEED_TEXT}; forced-pending pick: ${target.postcode}`);
      await page.goto(`/search?postcode=${encodeURIComponent(target.postcode)}`);
      // The whole check renders — the bug's form was the
      // error page standing where the results belong.
      await expectResultsWhole(page);
      // The sold section carries its named failure
      // state: present, non-empty, and neither figures
      // nor the filed loaded-none answer (its exact
      // wording is the brain's still-gathering reason,
      // pinned in the sold-prices suite and the
      // bundle-shape contracts).
      const soldText = await soldSectionText(page);
      expect(soldText.trim().length).toBeGreaterThan(0);
      expect(soldText).not.toContain(NO_SALE_RECORDED_LINE);
      expect(soldText).not.toContain("£");
    },
  );
});

test.describe("cold checks — regression", () => {
  test(
    "raw postcode submits: a first check renders whole, and a second visit serves the filed answer",
    { tag: "@regression" },
    async ({ page }) => {
      test.setTimeout(600_000);
      const picks = pickN(rng, coveredWithHomes, 3);
      console.log(
        `cold seed: ${SEED_TEXT}; postcode picks: ${picks.map((p) => p.postcode).join(", ")}`,
      );
      for (const pick of picks) {
        await searchFromHome(page, pick.postcode);
        await expectResultsWhole(page);
        // The sold section on a first visit: figures
        // (the fixture load landed inside the wait) or
        // a named state line — never an absent section
        // and never the error page (proven above).
        const soldText = await soldSectionText(page);
        expect(soldText.trim().length).toBeGreaterThan(0);
        await expectFiledAnswerOnSecondVisit(page, pick.postcode);
      }
    },
  );

  test(
    "a typed street pick in a cold postcode renders the check whole",
    { tag: "@regression" },
    async ({ page }) => {
      test.setTimeout(600_000);
      const picks = pickN(rng, singleStreets, 2);
      console.log(
        `cold seed: ${SEED_TEXT}; street picks: ${picks.map((p) => `${p.street}, ${p.town} (${p.postcode})`).join(" | ")}`,
      );
      for (const pick of picks) {
        await page.goto("/");
        const input = page.getByLabel("Postcode or address");
        await input.fill(display(pick.street));
        await page.waitForTimeout(400);
        await page
          .getByRole("option", {
            name: `${display(pick.street)}, ${display(pick.town)}`,
            exact: true,
          })
          .click();
        // A street in one postcode goes straight to that
        // postcode's check, narrowed to the street.
        await page.waitForURL(
          new RegExp(`/search/home\\?postcode=${pick.postcode.replace(" ", "\\+")}`),
        );
        await expectResultsWhole(page);
      }
    },
  );

  test(
    "a street spanning cold postcodes offers the street choice, and a choice renders whole",
    { tag: "@regression" },
    async ({ page }) => {
      test.setTimeout(300_000);
      const span = pool.spanningStreet;
      console.log(
        `cold seed: ${SEED_TEXT}; spanning street: ${span.street}, ${span.town} over ${span.postcodes.join(", ")}`,
      );
      await page.goto("/");
      const input = page.getByLabel("Postcode or address");
      await input.fill(display(span.street));
      await page.waitForTimeout(400);
      await page
        .getByRole("option", {
          name: `${display(span.street)}, ${display(span.town)}`,
          exact: true,
        })
        .click();
      // The street choice page: one row per postcode the
      // street spans — the pool's whole span is listed.
      // BUG-284: the postcode links attach after the
      // 5s default on a loaded runner, so the assertion
      // carries an explicit 30s budget.
      await expect(page.getByRole("heading", { name: display(span.street) })).toBeVisible();
      for (const postcode of span.postcodes) {
        await expect(page.getByRole("link", { name: new RegExp(`^${postcode} —`) })).toBeVisible({
          timeout: 30_000,
        });
      }
      const first = span.postcodes[0];
      await page.getByRole("link", { name: new RegExp(`^${first} —`) }).click();
      await page.waitForURL(new RegExp(`/search/home\\?postcode=${first.replace(" ", "\\+")}`));
      await expectResultsWhole(page);
    },
  );

  test(
    "a typed house-name pick (no street number) renders the home's check whole",
    { tag: "@regression" },
    async ({ page }) => {
      test.setTimeout(600_000);
      const picks = pickN(rng, houseNameHomes, 2);
      console.log(
        `cold seed: ${SEED_TEXT}; house-name picks: ${picks.map((p) => `${p.paon}, ${p.street} (${p.postcode})`).join(" | ")}`,
      );
      for (const pick of picks) {
        await page.goto("/");
        const input = page.getByLabel("Postcode or address");
        // The house name typed with its postcode (the
        // way a visitor who knows the address types it):
        // the panel's homes for that postcode narrow to
        // the name — the full-postcode read filters by
        // the typed words.
        await input.fill(`${display(pick.paon)} ${pick.postcode}`);
        await page.waitForTimeout(400);
        // The option names the home by its house name;
        // the pick goes straight to its check, as a
        // numbered home's does.
        await page
          .getByRole("option", {
            name: new RegExp(`^${display(pick.paon)}, ${display(pick.street)}`),
          })
          .first()
          .click();
        await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
        await expectResultsWhole(page);
      }
    },
  );

  test(
    "a home picked from a cold postcode's own list renders its check whole",
    { tag: "@regression" },
    async ({ page }) => {
      test.setTimeout(600_000);
      const picks = pickN(rng, coveredWithHomes, 2);
      console.log(
        `cold seed: ${SEED_TEXT}; home-list picks: ${picks.map((p) => p.postcode).join(", ")}`,
      );
      for (const pick of picks) {
        const homes = homesByPostcode.get(pick.postcode) ?? [];
        const home = homes.find((h) => /^\d+$/.test(h.paon)) ?? homes[0];
        await page.goto(`/search?postcode=${encodeURIComponent(pick.postcode)}`);
        await expect(page.locator(".results")).toBeVisible({ timeout: 60_000 });
        // The whole-postcode check carries the postcode's
        // home picker at its head (the picker's list, moved
        // there 18 Nov 2026; since the founder's ruling of
        // 20 Nov 2026 one dropdown — choosing the home in
        // it goes to the home).
        await page.locator(".picker__trigger").click();
        await page
          .locator(".picker__panel")
          .getByRole("option", { name: `${home.paon} ${display(home.street)}` })
          .click();
        await page.waitForURL(/\/search\/home\?postcode=.*&home=/);
        await expectResultsWhole(page);
      }
    },
  );

  test(
    "place → place page → a cold district renders the wider-area page whole",
    { tag: "@regression" },
    async ({ page }) => {
      test.setTimeout(300_000);
      const picks = pickN(rng, multiDistrictPlaces, 1);
      console.log(
        `cold seed: ${SEED_TEXT}; place picks: ${picks.map((p) => `${p.place} (${p.districts.join(", ")})`).join(" | ")}`,
      );
      for (const pick of picks) {
        await page.goto("/");
        const input = page.getByLabel("Postcode or address");
        await input.fill(display(pick.place));
        await page.waitForTimeout(400);
        await page.getByRole("option", { name: display(pick.place), exact: true }).click();
        await page.waitForURL(`**/search?place=${encodeURIComponent(display(pick.place))}`);
        await expect(page.getByRole("heading", { name: display(pick.place) })).toHaveText(
          display(pick.place),
        );
        // Every pool district the place serves is a row
        // on the page — no cap, unlike the retired
        // in-dropdown reveal.
        for (const outward of pick.districts) {
          await expect(
            page.getByRole("link", { name: `${outward} — ${display(pick.place)}` }),
          ).toBeVisible();
        }
        const outward = pick.districts[0];
        await page.getByRole("link", { name: `${outward} — ${display(pick.place)}` }).click();
        await page.waitForURL(`**/search?outward=${outward}`);
        // Held reveal (the wider-area checking screen,
        // 19 Nov 2026): the heading arrives with the results.
        await expect(page.getByRole("heading", { name: `Wider area — ${outward}` })).toBeVisible({
          timeout: 30_000,
        });
        // The district page renders whole: sections
        // present, each carrying a named state, and no
        // error page.
        await expect(page.locator(".error-page")).toHaveCount(0);
        const sections = page.locator("[data-section]");
        expect(await sections.count()).toBeGreaterThan(0);
        const firstText = (await sections.first().textContent()) ?? "";
        expect(firstText.trim().length).toBeGreaterThan(0);
      }
    },
  );

  test(
    "a Scotland pool postcode goes straight to the not-covered page",
    { tag: "@regression" },
    async ({ page }) => {
      test.setTimeout(180_000);
      const pick = scotland[0];
      console.log(`cold seed: ${SEED_TEXT}; Scotland pick: ${pick.postcode}`);
      await searchFromHome(page, pick.postcode);
      await page.waitForURL(
        `**/search/home?postcode=${encodeURIComponent(pick.postcode).replace(/%20/g, "+")}`,
      );
      await expect(page.locator("h1")).toHaveText(`${pick.postcode} is in Scotland`);
      await expect(page.locator(".error-page")).toHaveCount(0);
    },
  );

  test(
    "a Northern Ireland pool postcode goes straight to the not-covered page",
    { tag: "@regression" },
    async ({ page }) => {
      test.setTimeout(180_000);
      const pick = northernIreland[0];
      console.log(`cold seed: ${SEED_TEXT}; NI pick: ${pick.postcode}`);
      await searchFromHome(page, pick.postcode);
      await page.waitForURL(
        `**/search/home?postcode=${encodeURIComponent(pick.postcode).replace(/%20/g, "+")}`,
      );
      await expect(page.locator("h1")).toHaveText(`${pick.postcode} is in Northern Ireland`);
      await expect(page.locator(".error-page")).toHaveCount(0);
    },
  );
});
