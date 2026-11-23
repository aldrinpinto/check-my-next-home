import { describe, expect, it, vi } from "vitest";
import { composeUpdateFailureAlert, failureFacts } from "../scripts/sold-prices-monthly";

// Guards the sold-prices monthly job's owner alert (Price
// Paid national step, adopted prep gap 11): when the
// twice-monthly update run fails or refuses, the alert that
// reaches the project inbox is factual — the edition the run
// attempted, the loader's own failure headline, and the
// missed-month remedy — and importing the module runs
// nothing (BUG-107's entry discipline).

describe("scripts/sold-prices-monthly — the failure facts", () => {
  it("reads the attempted edition and the FAILED headline out of the loader's output", () => {
    const output = [
      "load-sold-prices FAILED: the update file's edition 2026-12-24 is 57 days after the last applied edition 2026-10-28 — more than one monthly cycle, so a month has been missed and this file cannot heal it; the register is NOT updated (run the --national pass to file the complete register)",
      "",
    ].join("\n");
    const facts = failureFacts(output);
    expect(facts.edition).toBe("2026-12-24");
    expect(facts.errorLine).toContain("FAILED");
    expect(facts.errorLine).toContain("a month has been missed");
  });

  it("falls back to the last output line and no edition when the run died early", () => {
    const facts = failureFacts("the monthly update download failed: HTTP 503\n");
    expect(facts.edition).toBeNull();
    expect(facts.errorLine).toContain("HTTP 503");
  });
});

describe("scripts/sold-prices-monthly — the owner alert (gap 11)", () => {
  it("carries the edition, the failure and the --national remedy", () => {
    const email = composeUpdateFailureAlert({
      edition: "2026-12-24",
      errorLine: "load-sold-prices FAILED: a month has been missed",
    });
    expect(email.subject).toContain("FAILED");
    expect(email.subject).toContain("2026-12-24");
    expect(email.text).toContain("Edition attempted: 2026-12-24.");
    expect(email.text).toContain("a month has been missed");
    expect(email.text).toContain("npm run load:sold-prices-national");
    expect(email.text).toContain("NOT updated");
    expect(email.html).toContain("2026-12-24");
  });

  it("says the edition was not read when the run never named one", () => {
    const email = composeUpdateFailureAlert({ edition: null, errorLine: "boom" });
    expect(email.subject).toContain("not read");
    expect(email.text).toContain("Edition attempted: not read.");
  });

  it("escapes the failure line in the HTML part", () => {
    const email = composeUpdateFailureAlert({
      edition: "2026-11-25",
      errorLine: 'FAILED: <script>alert("x")</script>',
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("scripts/sold-prices-monthly — the entry (BUG-107)", () => {
  it("importing the module runs nothing: main is exported, unexecuted", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("the entry must not exit on import");
    }) as typeof process.exit);
    try {
      const entry = await import("../scripts/sold-prices-monthly");
      expect(typeof entry.main).toBe("function");
      await new Promise((resolve) => setTimeout(resolve, 25));
      const printed = [...log.mock.calls, ...error.mock.calls].flat().join(" ");
      expect(printed).not.toContain("sold-prices-monthly");
      expect(exit).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
      exit.mockRestore();
    }
  });
});
