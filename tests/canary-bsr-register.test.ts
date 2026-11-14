import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KNOWN_BENIGN_TITLES,
  bsrRegisterVerdict,
  probeBsrRegister,
} from "../loaders/canary-bsr-register.mjs";

// Building Safety Register canary (plan step M5.14),
// on the canary-council-tax.test.ts pattern: the pure
// verdict over the three states, then the wired probe
// with the network stubbed. What is pinned: the
// recorded benign catalogue baseline (the three
// service-performance datasets, 14 Nov 2026); a novel
// catalogue title is the re-open warning, named; the
// lookup changing shape is a warning; and an
// unreachable source is a skip — never read as "no
// extract" and never as "the lookup is unchanged".

const BENIGN = [...KNOWN_BENIGN_TITLES];

function fetched(overrides: Record<string, unknown> = {}) {
  return {
    guidance: {
      state: "ok",
      hasServiceLink: true,
      mentionsPostcode: true,
      updated: "2026-10-01",
    },
    serviceReachable: true,
    catalogue: { state: "ok", titles: BENIGN },
    ...overrides,
  } as never;
}

describe("bsrRegisterVerdict — the states", () => {
  it("healthy: the lookup stands and the catalogue holds only the benign baseline", () => {
    const verdict = bsrRegisterVerdict(fetched());
    expect(verdict.warning).toBeUndefined();
    expect(verdict.skipped).toBeUndefined();
    expect(verdict.logLine).toContain("bsr-register");
    expect(verdict.logLine).toContain("hand-off stands");
    expect(verdict.sourceDate).toBe("2026-10-01");
  });

  it("a novel catalogue title is the re-open warning, and it names the dataset", () => {
    const verdict = bsrRegisterVerdict(
      fetched({
        catalogue: {
          state: "ok",
          titles: [...BENIGN, "High-rise residential buildings register extract"],
        },
      }),
    );
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("High-rise residential buildings register extract");
    expect(verdict.logLine).toContain("re-open the M5.14 register half");
  });

  it("the guidance dropping the search service is the shape warning", () => {
    const verdict = bsrRegisterVerdict(
      fetched({
        guidance: {
          state: "ok",
          hasServiceLink: false,
          mentionsPostcode: true,
          updated: "2026-10-01",
        },
      }),
    );
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("no longer presents");
  });

  it("a guidance page that cannot be found is the shape warning in its other form", () => {
    const verdict = bsrRegisterVerdict(
      fetched({
        guidance: {
          state: "missing",
          hasServiceLink: false,
          mentionsPostcode: false,
          updated: null,
        },
      }),
    );
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("cannot be found");
  });

  it("the search service not answering is a warning — the hand-off link points at it", () => {
    const verdict = bsrRegisterVerdict(fetched({ serviceReachable: false }));
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("not answering");
  });
});

describe("bsrRegisterVerdict — unreachable is never a clean bill", () => {
  it("every source unreachable is a skip that says what was not concluded", () => {
    const verdict = bsrRegisterVerdict(
      fetched({
        guidance: {
          state: "unreachable",
          hasServiceLink: false,
          mentionsPostcode: false,
          updated: null,
        },
        serviceReachable: null,
        catalogue: { state: "unreachable", titles: [] },
      }),
    );
    expect(verdict.warning).toBeUndefined();
    expect(verdict.skipped).toContain("source unreachable");
    expect(verdict.skipped).toContain('not read as "no extract"');
  });

  it("one unreachable half is still a skip when nothing warns", () => {
    const verdict = bsrRegisterVerdict(
      fetched({ catalogue: { state: "unreachable", titles: [] } }),
    );
    expect(verdict.warning).toBeUndefined();
    expect(verdict.skipped).toContain("the data.gov.uk catalogue could not be read");
  });

  it("a warning on one half is reported even when the other is unreachable", () => {
    const verdict = bsrRegisterVerdict(
      fetched({
        guidance: {
          state: "unreachable",
          hasServiceLink: false,
          mentionsPostcode: false,
          updated: null,
        },
        catalogue: { state: "ok", titles: [...BENIGN, "Register of high-rise buildings"] },
      }),
    );
    expect(verdict.warning).toBe(true);
    expect(verdict.logLine).toContain("Register of high-rise buildings");
    expect(verdict.logLine).toContain("the GOV.UK guidance page could not be read");
  });
});

describe("probeBsrRegister — the wired probe, network stubbed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the guidance, the search service and the catalogue into a healthy verdict", async () => {
    vi.stubGlobal("fetch", async (input: unknown) => {
      const url = String(input);
      if (url.includes("find-a-high-rise-residential-building"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            public_updated_at: "2026-10-01T00:00:00.000Z",
            details: {
              body:
                "<p>Search the register by postcode.</p>" +
                '<a href="https://www.register-high-rise-building.service.gov.uk/public-register/search">Find a building</a>',
            },
          }),
        };
      if (url.includes("register-high-rise-building.service.gov.uk"))
        return { ok: true, status: 200 };
      if (url.includes("data.gov.uk")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: { results: BENIGN.map((title) => ({ title })) },
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const verdict = await probeBsrRegister();
    expect(verdict.warning).toBeUndefined();
    expect(verdict.skipped).toBeUndefined();
    expect(verdict.logLine).toContain("bsr-register");
  });

  it("a network that never answers is a skip, never a healthy verdict", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    const verdict = await probeBsrRegister();
    expect(verdict.warning).toBeUndefined();
    expect(verdict.skipped).toContain("source unreachable");
    // The probe's one retry per source, with its
    // backoff, makes a fully unreachable run slow by
    // design.
  }, 30_000);
});
