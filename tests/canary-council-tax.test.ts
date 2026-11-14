import { afterEach, describe, expect, it, vi } from "vitest";
import { councilTaxVerdict, probeCouncilTax } from "../loaders/canary-council-tax.mjs";
import { currentTaxYear, nextTaxYear } from "../loaders/load-council-tax.mjs";

// Council tax canary probe (plan step M5.10). The probe
// watches two annual publishers for the three changes
// that matter to a hand-filed seed: the next year's
// release landing (spring pass due), the filed year's
// release being revised (re-seed), and the Welsh dataset
// going stale. Its discipline is the canary house rule:
// an unreachable source is a skip in its own words, NEVER
// read as "no revision" or "no new release"; a warning
// found on either publisher is reported even when the
// other half cannot be read. The verdict is tested pure;
// the probe itself is tested with the network stubbed,
// keyed off the loader's own tax-year helpers so the test
// holds whatever year it runs in.

const NOW = new Date("2026-11-13T12:00:00Z");
const BASE = {
  filedYear: "2026-27",
  filedUpdated: "2026-03-25", // == RELEASES["2026-27"].england: unrevised
  filedMissing: false,
  nextExists: false,
  walesUpdated: "2026-03-24",
  now: NOW,
};

describe("councilTaxVerdict — the three watches", () => {
  it("healthy: the filed release stands and no new release has landed", () => {
    const verdict = councilTaxVerdict(BASE);
    expect(verdict.warning).toBeUndefined();
    expect(verdict.skipped).toBeUndefined();
    expect(verdict.logLine).toContain("the spring pass is not due");
    expect(verdict.sourceDate).toBe("2026-03-25");
  });

  it("the next year's release landing is the spring-pass warning", () => {
    const verdict = councilTaxVerdict({ ...BASE, nextExists: true });
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("2027-28");
    expect(verdict.logLine).toContain("the spring pass is due");
  });

  it("a filed year updated after the filed stamp is the revision warning", () => {
    const verdict = councilTaxVerdict({ ...BASE, filedUpdated: "2026-09-30" });
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("has been revised");
    expect(verdict.logLine).toContain("2026-03-25");
  });

  it("a revision at exactly the filed stamp is not a warning (the state that was filed)", () => {
    const verdict = councilTaxVerdict({
      ...BASE,
      filedYear: "2025-26",
      filedUpdated: "2026-04-22", // the revised re-issue the 2025-26 seed files from
    });
    expect(verdict.warning).toBeUndefined();
    expect(verdict.logLine).toContain("stands unrevised");
  });

  it("a filed year whose page cannot be found warns — late release or moved release", () => {
    const verdict = councilTaxVerdict({ ...BASE, filedUpdated: null, filedMissing: true });
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("cannot be found");
  });

  it("a Welsh dataset untouched for over 400 days warns", () => {
    const verdict = councilTaxVerdict({ ...BASE, walesUpdated: "2025-03-25" });
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("StatsWales");
    expect(verdict.logLine).toContain("looks missed");
  });
});

describe("councilTaxVerdict — unreachable is never a clean bill", () => {
  it("every half unreadable is a skip that says what was not concluded", () => {
    const verdict = councilTaxVerdict({
      ...BASE,
      filedUpdated: null,
      nextExists: null,
      walesUpdated: null,
    });
    expect(verdict.warning).toBeUndefined();
    expect(verdict.skipped).toContain("source unreachable");
    expect(verdict.skipped).toContain('not read as "no revision"');
  });

  it("one unreadable half is still a skip when nothing warns", () => {
    const verdict = councilTaxVerdict({ ...BASE, walesUpdated: null });
    expect(verdict.skipped).toContain("the StatsWales dataset could not be read");
  });

  it("a warning on one publisher is reported even when the other is unreachable", () => {
    const verdict = councilTaxVerdict({ ...BASE, nextExists: true, walesUpdated: null });
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("the spring pass is due");
    expect(verdict.logLine).toContain("the StatsWales dataset could not be read");
  });
});

describe("probeCouncilTax — the wired probe, network stubbed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the two GOV.UK release pages and the StatsWales metadata into a healthy verdict", async () => {
    const filed = currentTaxYear();
    const next = nextTaxYear(filed);
    const slug = (year: string) =>
      `council-tax-levels-set-by-local-authorities-in-england-${year.slice(0, 4)}-to-${Number(year.slice(0, 4)) + 1}`;
    vi.stubGlobal("fetch", async (input: unknown) => {
      const url = String(input);
      if (url.includes(slug(next))) return { ok: false, status: 404 };
      if (url.includes(slug(filed)))
        return {
          ok: true,
          status: 200,
          json: async () => ({ public_updated_at: "2000-01-01T00:00:00.000Z" }),
        };
      if (url.includes("api.stats.gov.wales"))
        return {
          ok: true,
          status: 200,
          json: async () => ({ last_updated_at: new Date().toISOString() }),
        };
      throw new Error(`unexpected fetch: ${url}`);
    });
    const verdict = await probeCouncilTax();
    expect(verdict.warning).toBeUndefined();
    expect(verdict.skipped).toBeUndefined();
    expect(verdict.logLine).toContain("mhclg-council-tax");
  });

  it("a GOV.UK that never answers is a skip, never a healthy verdict", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    const verdict = await probeCouncilTax();
    expect(verdict.warning).toBeUndefined();
    expect(verdict.skipped).toContain("source unreachable");
    // The probe's one retry per source, with its backoff,
    // makes a fully unreachable run slow by design.
  }, 30_000);
});
