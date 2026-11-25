import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { GET } from "../app/sample-report.pdf/route";
import { sampleReportPdfContentDisposition } from "../lib/report-pdf";
import { BAKED_SAMPLE_REPORT_PDF_PATH } from "../lib/server/sample-pdf-baked";

// BUG-270 — the sample report's PDF is baked, not
// printed live.
//
// What is pinned here:
//   (1) a standing bake file is served verbatim by the
//       route — the bytes, the PDF content type, the
//       descriptive download name and the noindex tag
//       while the sample is unindexed;
//   (2) a missing bake file answers 503 in plain text
//       — never a live print (a live print would
//       answer 200 where Chromium exists and 500
//       where it does not, so the 503 pins the
//       no-print behaviour either way);
//   (3) the bake script's entry (BUG-107): importing
//       it runs nothing — main is exported, unexecuted.
//
// The print itself is already pinned where it belongs:
// tests/report-pdf.test.ts prints the same composition
// from a local server (the generator,
// lib/server/sample-pdf.ts, is unchanged) — this file
// holds only the route's new serving shape.

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n%marker\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n",
  "latin1",
);

describe("the sample PDF route serves the baked file (BUG-270)", () => {
  it("a standing bake file is served verbatim", async () => {
    expect(existsSync(BAKED_SAMPLE_REPORT_PDF_PATH)).toBe(false);
    await mkdir(dirname(BAKED_SAMPLE_REPORT_PDF_PATH), { recursive: true });
    try {
      await writeFile(BAKED_SAMPLE_REPORT_PDF_PATH, MINIMAL_PDF);
      const response = await GET();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toBe(sampleReportPdfContentDisposition());
      expect(response.headers.get("x-robots-tag")).toBe("noindex");
      const served = Buffer.from(await response.arrayBuffer());
      expect(served.equals(MINIMAL_PDF)).toBe(true);
    } finally {
      // Only the file goes: the baked directory itself
      // is shared with the BUG-219 tests, whose own
      // cleanup removes it.
      await rm(BAKED_SAMPLE_REPORT_PDF_PATH, { force: true });
    }
  });

  it("a missing bake file answers 503 in plain text — never a live print", async () => {
    expect(existsSync(BAKED_SAMPLE_REPORT_PDF_PATH)).toBe(false);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("content-disposition")).toBeNull();
    const body = await response.text();
    expect(body).toContain("not baked yet");
  });
});

describe("scripts/bake-sample-report-pdf — the bake entry (BUG-107)", () => {
  it("importing the module runs nothing: main is exported, unexecuted", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("the entry must not exit on import");
    }) as typeof process.exit);
    try {
      const entry = await import("../scripts/bake-sample-report-pdf");
      expect(typeof entry.main).toBe("function");
      // Give any stray fire-and-forget run a beat to
      // betray itself before judging the silence.
      await new Promise((resolve) => setTimeout(resolve, 25));
      const printed = [...log.mock.calls, ...error.mock.calls].flat().join(" ");
      expect(printed).not.toContain("bake-sample-report-pdf:");
      expect(exit).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
      exit.mockRestore();
    }
  });
});
