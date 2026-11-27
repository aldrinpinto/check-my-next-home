// BUG-387: re-fetch short pages, then a 1% read tolerance — tribunal
// building-safety (group A).
//
// Assessment (read from the loop before wiring): page.total CAN serve
// as the independent expected. It is the GOV.UK search API's count of
// results matching the filtered query, so the paged enumeration should
// return exactly that many results in total — the loop already trusts
// it as its bound. The BUG-265 "No total" note means the total counts
// category items, not the selected documents, so the gate is
// read-vs-total over `enumerated`, and the filed/geoless pair is the
// enumeration's own reconciliation (selected for a document fetch vs
// counted as not selected); the case rows-vs-staged reconciliation
// stays fileCases' own check. The expected is fixed from the FIRST
// page's total — a snapshot: items published mid-run wait for the next
// run, and items removed mid-run fail the gate rather than filing thin.
//
// Covered: (a) a short read fails today — a short mid-stream page the
// re-fetch cannot recover still fails the gate with nothing filed (on
// the unfixed loader this test fails at the import: enumerateLive was
// not exported, and the loop silently skipped the short page's tail);
// (b) a short page recovered by the re-fetch enumerates complete, with
// the re-fetch logged; (c) a shortfall over 1% after the re-fetch
// still fails; (d) a shortfall within 1% is accepted, with the loud
// notice; an overshoot is never tolerated; a final page returning the
// remainder is never re-fetched; a selected document still flows.
import { afterEach, describe, expect, it } from "vitest";
import { enumerateLive } from "../loaders/load-tribunal-building-safety.mjs";
import { createProgressLogger } from "../loaders/progress.mjs";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}
function collectProgress() {
  const lines: string[] = [];
  return {
    lines,
    progress: createProgressLogger({
      name: "bug387-group-a-tribunal",
      log: (line: string) => lines.push(line),
    }),
  };
}

function tribResult(i: number) {
  return { link: `/decision-${i}`, title: `Decision ${i}` };
}
function tribResults(from: number, n: number) {
  return Array.from({ length: n }, (_, k) => tribResult(from + k));
}

// A stubbed GOV.UK search API with scripted pages: pages[start] is the
// list of successive page bodies that start answers, in order. An
// unscripted start answers an empty page. Content fetches answer a
// document with no PDF attachments, so no PDF is ever fetched; the
// scripted results carry plain titles, so nothing is selected either,
// unless a test says otherwise.
function govukService(pages: Record<number, { total: number; results: unknown[] }[]>) {
  const requests: number[] = [];
  const stub = async (url: unknown) => {
    const u = String(url);
    if (u.includes("search.json")) {
      const start = Number(new URL(u).searchParams.get("start") ?? "0");
      requests.push(start);
      const script = pages[start] ?? [];
      const body = script.shift();
      return okJson(body ?? { total: 0, results: [] });
    }
    return okJson({ details: { metadata: {}, attachments: [] } });
  };
  return { stub, requests };
}

describe("enumerateLive re-fetches a short page (BUG-387)", () => {
  it("(b) a short page recovered by the re-fetch enumerates complete", async () => {
    const { stub, requests } = govukService({
      0: [{ total: 250, results: tribResults(0, 100) }],
      100: [
        { total: 250, results: tribResults(100, 60) },
        { total: 250, results: tribResults(100, 100) },
      ],
      200: [{ total: 250, results: tribResults(200, 50) }],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const { lines, progress } = collectProgress();
    const documents: unknown[] = [];
    const result = await enumerateLive(
      (doc) => {
        documents.push(doc);
      },
      { progress },
    );
    expect(result.enumerated).toBe(250);
    expect(result.categoryTotal).toBe(250);
    expect(documents).toHaveLength(0);
    expect(result.refetch.refetched).toBe(1);
    expect(result.refetch.recovered).toBe(40);
    expect(result.verdict).toEqual({ shortfall: 0, withinTolerance: false, notice: null });
    expect(requests).toEqual([0, 100, 100, 200]);
    expect(lines.some((l) => l.includes("warning · short page re-fetched (BUG-387)"))).toBe(true);
  });

  it("(a/c) a shortfall over 1% after the re-fetch still fails with nothing filed", async () => {
    const { stub, requests } = govukService({
      0: [{ total: 250, results: tribResults(0, 100) }],
      100: [
        { total: 250, results: tribResults(100, 60) },
        { total: 250, results: tribResults(100, 60) },
      ],
      200: [{ total: 250, results: tribResults(200, 50) }],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    await expect(enumerateLive(() => {})).rejects.toThrow(
      "tribunal decisions: read 210 features but the service count is 250 — re-fetched 1 short page, still short by 40 — nothing filed",
    );
    expect(requests).toEqual([0, 100, 100, 200]);
  });

  it("(d) a shortfall within 1% is accepted, with the loud notice", async () => {
    const { stub, requests } = govukService({
      0: [{ total: 200, results: tribResults(0, 100) }],
      100: [
        { total: 200, results: tribResults(100, 99) },
        { total: 200, results: tribResults(100, 99) },
      ],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const result = await enumerateLive(() => {});
    expect(result.enumerated).toBe(199);
    expect(result.categoryTotal).toBe(200);
    expect(result.verdict.withinTolerance).toBe(true);
    expect(result.verdict.shortfall).toBe(1);
    expect(result.verdict.notice).toContain("read 199 of 200");
    expect(result.verdict.notice).toContain("re-fetching 1 short page");
    expect(result.verdict.notice).toContain("accepted within the 1% tolerance (BUG-387)");
    expect(result.refetch.refetched).toBe(1);
    expect(result.refetch.recovered).toBe(0);
    expect(requests).toEqual([0, 100, 100]);
  });

  it("an overshoot is never tolerated", async () => {
    const { stub } = govukService({
      0: [{ total: 200, results: tribResults(0, 100) }],
      100: [{ total: 200, results: tribResults(100, 101) }],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    await expect(enumerateLive(() => {})).rejects.toThrow(
      "tribunal decisions: read 201 features but the service count is 200 — nothing filed",
    );
  });

  it("a final page returning the remainder is never re-fetched", async () => {
    const { stub, requests } = govukService({
      0: [{ total: 250, results: tribResults(0, 100) }],
      100: [{ total: 250, results: tribResults(100, 100) }],
      200: [{ total: 250, results: tribResults(200, 50) }],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const result = await enumerateLive(() => {});
    expect(result.enumerated).toBe(250);
    expect(result.refetch.refetched).toBe(0);
    expect(requests).toEqual([0, 100, 200]);
  });

  it("a selected document still flows through the enumeration", async () => {
    const { stub, requests } = govukService({
      0: [
        {
          total: 1,
          results: [{ link: "/decision-bsa", title: "Re: /BSA/2025/0001 — order" }],
        },
      ],
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    const documents: { item: { link: string }; parsed: unknown }[] = [];
    const result = await enumerateLive((doc) => {
      documents.push(doc as never);
    });
    expect(result.enumerated).toBe(1);
    expect(result.refetch.refetched).toBe(0);
    expect(documents).toHaveLength(1);
    expect(documents[0].item.link).toBe("/decision-bsa");
    expect(documents[0].parsed).toBeNull();
    expect(requests).toEqual([0]);
  });
});
