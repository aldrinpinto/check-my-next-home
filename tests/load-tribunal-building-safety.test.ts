import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOLDEN_CASE_REF,
  buildCases,
  buildingKey,
  expandRefs,
  extractPdfText,
  extractPostcode,
  fileCases,
  goldenChecks,
  isSingleFlat,
  kindForRef,
  parseDecisionHeader,
  previousFailureCount,
  readFixturePdf,
  selectItems,
} from "../loaders/load-tribunal-building-safety.mjs";

// Tribunal building-safety loader (plan step M5.14),
// tested against the fixture set under
// tests/fixtures/tribunal-building-safety — trimmed
// cuts (first two pages) of REAL GOV.UK tribunal
// decision PDFs, captured 14 Nov 2026, with a manifest
// mirroring the live enumeration. What is pinned: the
// selection rule (the BSA/BSB series only); the header
// parse against the real header shapes (standard form,
// order documents, letter-spaced runs, tight layouts,
// corrected decisions); the reference expansions
// (short forms, ranges, zero-padding); the case merge
// (an order document speaks for its case); the
// parse-failure count, by name; and the Oyster Bay
// control golden, exact.

const FIXTURES = join(process.cwd(), "tests/fixtures/tribunal-building-safety");

type Item = { link: string; title: string; decisionDate: string | null };
type Doc = { item: Item; parsed: ReturnType<typeof parseDecisionHeader> };

async function fixtureDocuments(): Promise<Doc[]> {
  const manifest = JSON.parse(readFileSync(join(FIXTURES, "manifest.json"), "utf8")) as {
    items: (Item & { pdf: string })[];
  };
  const documents: Doc[] = [];
  for (const entry of manifest.items) {
    const buffer = await readFixturePdf(FIXTURES, entry.pdf);
    documents.push({
      item: { link: entry.link, title: entry.title, decisionDate: entry.decisionDate },
      parsed: parseDecisionHeader(extractPdfText(buffer)),
    });
  }
  return documents;
}

describe("the selection rule — the BSA/BSB series only", () => {
  it("keeps titles carrying a /BSA/ or /BSB/ case reference, drops the rest of the category", () => {
    const results = [
      { title: "Somewhere House: HAV/00HQ/BSA/2025/0002", link: "/a" },
      { title: "Another Block: LON/00BB/BSB/2024/0011", link: "/b" },
      { title: "Vista Tower: LON/00AN/HYI/2022/0007", link: "/c" },
      { title: "A service charge case: LON/00AG/LSC/2024/0001", link: "/d" },
      { title: "No reference in this title", link: "/e" },
    ];
    expect(selectItems(results).map((r: { link: string }) => r.link)).toEqual(["/a", "/b"]);
  });
});

describe("expandRefs — the case-reference field's own grammar", () => {
  it("expands a range into one reference per case", () => {
    expect(expandRefs("MAN/00BN/BSB/2024/0001-0007")).toEqual([
      "MAN/00BN/BSB/2024/0001",
      "MAN/00BN/BSB/2024/0002",
      "MAN/00BN/BSB/2024/0003",
      "MAN/00BN/BSB/2024/0004",
      "MAN/00BN/BSB/2024/0005",
      "MAN/00BN/BSB/2024/0006",
      "MAN/00BN/BSB/2024/0007",
    ]);
  });

  it("expands short-form continuations against the full reference before them", () => {
    expect(expandRefs("HAV/00HN/BSA/2024/0001and0002")).toEqual([
      "HAV/00HN/BSA/2024/0001",
      "HAV/00HN/BSA/2024/0002",
    ]);
    expect(expandRefs("LON/00AE/BSA/2024/0007,0500&0502")).toEqual([
      "LON/00AE/BSA/2024/0007",
      "LON/00AE/BSA/2024/0500",
      "LON/00AE/BSA/2024/0502",
    ]);
  });

  it("zero-pads a three-digit serial to the canonical four", () => {
    expect(expandRefs("LON/00BG/BSB/2024/009")).toEqual(["LON/00BG/BSB/2024/0009"]);
  });
});

describe("the fixture corpus — real headers, filed cases", () => {
  it("files 11 cases from 9 documents, with exactly one parse failure, named", async () => {
    const { rows, failures } = buildCases(await fixtureDocuments());
    expect(rows).toHaveLength(11);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("RIDLEY HOUSE");
  });

  it("the Oyster Bay control golden, exact", async () => {
    const { rows } = buildCases(await fixtureDocuments());
    expect(() => goldenChecks(rows)).not.toThrow();
    const golden = rows.find((r) => r.caseRef === GOLDEN_CASE_REF)!;
    expect(golden).toMatchObject({
      decisionDate: "2026-04-10",
      orderKind: "remediation-order",
      propertyText: "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN",
      postcode: "BH15 2FN",
      buildingKey: "oyster bay apartments sterte poole",
      isSingleFlat: false,
    });
    // And a BH15 2FN lookup returns it.
    expect(rows.filter((r) => r.postcode === "BH15 2FN").map((r) => r.caseRef)).toEqual([
      GOLDEN_CASE_REF,
    ]);
  });

  it("a remediation contribution order files under its BSB reference", async () => {
    const { rows } = buildCases(await fixtureDocuments());
    const planetree = rows.find((r) => r.caseRef === "LON/00BH/BSB/2024/0500")!;
    expect(planetree).toMatchObject({
      decisionDate: "2025-06-10",
      orderKind: "remediation-contribution-order",
      propertyText: "1-9 PLANETREE PATH, LONDON E17 7FW",
      postcode: "E17 7FW",
    });
  });

  it("the Thanet Lodge decision files one row per case reference — and, as its Property line prints the building, not flat-specific", async () => {
    const { rows } = buildCases(await fixtureDocuments());
    const thanet = rows.filter((r) => r.buildingKey === "thanet lodge 10 mapesbury road london");
    expect(thanet.map((r) => r.caseRef).sort()).toEqual([
      "LON/00AE/BSA/2024/0007",
      "LON/00AE/BSA/2024/0500",
      "LON/00AE/BSA/2024/0502",
    ]);
    for (const row of thanet) {
      expect(row.propertyText).toBe("Thanet Lodge, 10 Mapesbury Road, London NW2 4JA");
      expect(row.isSingleFlat).toBe(false);
      expect(row.decisionDate).toBe("2025-02-18");
    }
  });

  it("Purbeck House: short-form references expand, and the decision date is the decision's — not the correction's", async () => {
    const { rows } = buildCases(await fixtureDocuments());
    const purbeck = rows.filter((r) => r.postcode === "BH8 8ES");
    expect(purbeck.map((r) => r.caseRef).sort()).toEqual([
      "HAV/00HN/BSA/2024/0001",
      "HAV/00HN/BSA/2024/0002",
    ]);
    // The decision is dated 8 May 2025; it was corrected
    // under Rule 50 on 16 May 2025 (the GOV.UK metadata
    // date) — the correction never displaces the date.
    for (const row of purbeck) expect(row.decisionDate).toBe("2025-05-08");
  });

  it("Hillside: a corrected decision keeps its original date", async () => {
    const { rows } = buildCases(await fixtureDocuments());
    const hillside = rows.find((r) => r.caseRef === "LON/00AE/BSA/2024/0503")!;
    expect(hillside.decisionDate).toBe("2025-09-05");
    expect(hillside.propertyText).toBe("2 Hillside, London, NW10 8GE");
  });

  it("East Village: a Regulation 3 appeal files as other-building-safety, with no postcode — the Property prints only the district", async () => {
    const { rows } = buildCases(await fixtureDocuments());
    const east = rows.filter((r) => r.caseRef.startsWith("LON/00BB/BSA/2025/"));
    expect(east.map((r) => r.caseRef).sort()).toEqual([
      "LON/00BB/BSA/2025/0002",
      "LON/00BB/BSA/2025/0003",
    ]);
    for (const row of east) {
      expect(row.orderKind).toBe("other-building-safety");
      expect(row.postcode).toBeNull();
      expect(row.decisionDate).toBe("2026-01-29");
    }
  });

  it("Empire Square: the order document speaks for the BSB case — contribution order, the order's own property text", async () => {
    const { rows } = buildCases(await fixtureDocuments());
    const empire = rows.find((r) => r.caseRef === "LON/00BE/BSB/2024/0602")!;
    expect(empire).toMatchObject({
      decisionDate: "2025-06-05",
      orderKind: "remediation-contribution-order",
      propertyText: "EMPIRE SQUARE, 34 LONG LANE, LONDON, SE1 4NH",
      postcode: "SE1 4NH",
    });
    // The HYI-series remediation-order case the combined
    // decision also carries files nothing here.
    expect(rows.some((r) => r.caseRef.includes("/HYI/"))).toBe(false);
  });

  it("goldenChecks refuses a drifted or missing golden", async () => {
    const { rows } = buildCases(await fixtureDocuments());
    const drifted = rows.map((r) =>
      r.caseRef === GOLDEN_CASE_REF ? { ...r, decisionDate: "2026-04-11" } : r,
    );
    expect(() => goldenChecks(drifted)).toThrow("drifted");
    expect(() => goldenChecks(rows.filter((r) => r.caseRef !== GOLDEN_CASE_REF))).toThrow(
      "missing",
    );
  });
});

describe("parseDecisionHeader — the header shapes", () => {
  it("reads an order document: bare CASE REFERENCE line, PREMISES, the order's own heading", () => {
    const text = [
      "IN THE FIRST-TIER TRIBUNAL (PROPERTY CHAMBER)",
      "CASE REFERENCE: LON/00BE/BSB/2024/0602",
      "PREMISES: EMPIRE SQUARE, 34 LONG LANE, LONDON, SE1 4NH",
      "FAIRHOLD ATHENA LIMITED Applicant -and- THE BERKELEY GROUP HOLDINGS PLC Respondent",
      "REMEDIATION CONTRIBUTION ORDER Section 124 of the Building Safety Act 2022",
      "UPON considering the applications, evidence and submissions in this matter",
    ].join("\n");
    const parsed = parseDecisionHeader(text.padEnd(600, " x"));
    expect(parsed).not.toBeNull();
    expect(parsed!.refs).toEqual(["LON/00BE/BSB/2024/0602"]);
    expect(parsed!.property).toBe("EMPIRE SQUARE, 34 LONG LANE, LONDON, SE1 4NH");
    expect(parsed!.docKind).toBe("remediation-contribution-order");
    expect(parsed!.isOrderDoc).toBe(true);
    expect(parsed!.headerDate).toBeNull();
  });

  it("recovers a case reference letter-spaced mid-token by the PDF's text runs", () => {
    const text =
      "FIRST - TIER TRIBUNAL PROPERTY CHAMBER (RESIDENTIAL PROPERTY) " +
      "Case r eference : LON/00 AT /BSB/2025/060 8 " +
      "Property : Pieris House, High Street, Feltham TW13 4GD " +
      "Applicant s : BDW Trading Limited " +
      "Type of a pplication : Application for Remediation Contribution Order section 124 Building Safety Act 2022 " +
      "Date of d ecision : 2 April 2026 " +
      "x ".repeat(150);
    const parsed = parseDecisionHeader(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.refs).toEqual(["LON/00AT/BSB/2025/0608"]);
    expect(parsed!.docKind).toBe("remediation-contribution-order");
    expect(parsed!.headerDate).toBe("2026-04-02");
  });

  it("a corrected decision's own date stands; the correction date is never read as it", () => {
    const text =
      "FIRST-TIER TRIBUNAL PROPERTY CHAMBER (RESIDENTIAL PROPERTY) " +
      "Case reference : LON/00AE/BSA/2024/0503 Property : 2 Hillside, London, NW10 8GE " +
      "Type of application : For a remediation order under section 123 of the Building Safety Act 2022 " +
      "Date of Hearing : 24 July 2025 Date of Decision : 5 September 2025 " +
      "Date of Corrected Decision : 16 September 2025 Corrected DECISION " +
      "x ".repeat(150);
    expect(parseDecisionHeader(text)!.headerDate).toBe("2025-09-05");
  });

  it("a field listing several dates ends on the decision date", () => {
    const text =
      "FIRST-TIER TRIBUNAL PROPERTY CHAMBER (RESIDENTIAL PROPERTY) " +
      "Case references : LON/00BB/BSD/2024/0601 LON/00BB/BSA/2025/0002 " +
      "Property : Land at the East Village, Stratford, London E20 " +
      "Type of application : Appeal under Regulation 3 of the Building Safety (Leaseholder Protections) Regulations 2022/859 " +
      "Date : 16th January 2026 29th January 2026 DECISION " +
      "x ".repeat(150);
    const parsed = parseDecisionHeader(text);
    expect(parsed!.headerDate).toBe("2026-01-29");
    expect(parsed!.docKind).toBe("other");
  });

  it("unreadable text is a parse failure (null), never a guess", () => {
    expect(parseDecisionHeader("")).toBeNull();
    expect(parseDecisionHeader("\f\f")).toBeNull();
    expect(parseDecisionHeader("some scanned page image noise")).toBeNull();
  });
});

describe("kindForRef — the kind rules", () => {
  it("a combined decision kinds each case by its own series", () => {
    expect(kindForRef("both", "LON/00BG/BSA/2024/0005")).toBe("remediation-order");
    expect(kindForRef("both", "LON/00BG/BSB/2024/0009")).toBe("remediation-contribution-order");
  });
  it("no type line falls back to the series; a non-order type stays other", () => {
    expect(kindForRef(null, "LON/00BG/BSA/2024/0005")).toBe("remediation-order");
    expect(kindForRef("other", "LON/00BB/BSA/2025/0002")).toBe("other-building-safety");
    expect(kindForRef("remediation-order", "LON/00HQ/BSA/2025/0002")).toBe("remediation-order");
  });
});

describe("the filed row's derived fields", () => {
  it("postcode, building key and the flat flag", () => {
    expect(extractPostcode("1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN")).toBe("BH15 2FN");
    expect(extractPostcode("Canary Riverside Estate, Westferry Circus, London E14")).toBeNull();
    expect(extractPostcode("Prince Park Apartments, London, Nw5 3LN")).toBe("NW5 3LN");
    expect(buildingKey("1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN", "BH15 2FN")).toBe(
      "oyster bay apartments sterte poole",
    );
    expect(
      buildingKey("Flats 5, 15 & 29 Thanet Lodge, 10 Mapesbury Road, NW2 4JA", "NW2 4JA"),
    ).toBe("thanet lodge 10 mapesbury road");
    expect(isSingleFlat("Flat 5, Hillside, London, NW10 8GE")).toBe(true);
    expect(isSingleFlat("Flats 5, 15 & 29 Thanet Lodge, 10 Mapesbury Road")).toBe(true);
    expect(isSingleFlat("2 Hillside, London, NW10 8GE")).toBe(false);
  });

  it("a decision naming one flat files flat-specific through buildCases", () => {
    const doc: Doc = {
      item: { link: "/flat-case", title: "Flat 5, Hillside", decisionDate: "2025-09-05" },
      parsed: {
        refs: ["LON/00AE/BSA/2024/0503"],
        property: "Flat 5, Hillside, London, NW10 8GE",
        typeValues: ["For a remediation order under section 123"],
        docKind: "remediation-order",
        headingKind: null,
        headerDate: "2025-09-05",
        isOrderDoc: false,
      },
    };
    const { rows } = buildCases([doc]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      isSingleFlat: true,
      buildingKey: "hillside london",
      postcode: "NW10 8GE",
    });
  });
});

describe("fileCases — the stage-swap", () => {
  function recordingPool(failOn?: string) {
    const statements: string[] = [];
    const calls: { sql: string; params: unknown[] }[] = [];
    let released = false;
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const head = sql.trim().replace(/\s+/g, " ");
        statements.push(head);
        calls.push({ sql: head, params: [...params] });
        if (failOn && head.startsWith(failOn)) throw new Error(`forced failure: ${failOn}`);
        return { rows: [], rowCount: 0 };
      },
      release() {
        released = true;
      },
    };
    return { statements, calls, released: () => released, pool: { connect: async () => client } };
  }

  const row = {
    caseRef: GOLDEN_CASE_REF,
    decisionDate: "2026-04-10",
    orderKind: "remediation-order",
    propertyText: "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN",
    postcode: "BH15 2FN",
    buildingKey: "oyster bay apartments sterte poole",
    isSingleFlat: false,
    sourceUrl: "https://www.gov.uk/golden",
  };

  it("stages, swaps and commits in order, with the row's values as parameters", async () => {
    const rec = recordingPool();
    await fileCases(rec.pool as never, [row]);
    const at = (prefix: string) => rec.statements.findIndex((s) => s.startsWith(prefix));
    expect(rec.statements[0]).toBe("BEGIN");
    expect(at("CREATE TEMP TABLE stg_tribunal_building_safety_decisions")).toBeGreaterThan(0);
    expect(at("INSERT INTO stg_tribunal_building_safety_decisions")).toBeGreaterThan(
      at("CREATE TEMP TABLE stg_tribunal_building_safety_decisions"),
    );
    expect(at("DELETE FROM tribunal_building_safety_decisions")).toBeGreaterThan(
      at("INSERT INTO stg_tribunal_building_safety_decisions"),
    );
    expect(at("INSERT INTO tribunal_building_safety_decisions")).toBeGreaterThan(
      at("DELETE FROM tribunal_building_safety_decisions"),
    );
    expect(rec.statements.at(-1)).toBe("COMMIT");
    const staged = rec.calls.find((c) =>
      c.sql.startsWith("INSERT INTO stg_tribunal_building_safety_decisions"),
    )!;
    expect(staged.params.slice(0, 8)).toEqual([
      GOLDEN_CASE_REF,
      "2026-04-10",
      "remediation-order",
      "1-31 Oyster Bay Apartments, Sterte, Poole BH15 2FN",
      "BH15 2FN",
      "oyster bay apartments sterte poole",
      false,
      "https://www.gov.uk/golden",
    ]);
    expect(rec.released()).toBe(true);
  });

  it("a second pass issues the identical statements (the swap is the idempotency)", async () => {
    const first = recordingPool();
    await fileCases(first.pool as never, [row]);
    const second = recordingPool();
    await fileCases(second.pool as never, [row]);
    expect(second.statements).toEqual(first.statements);
  });

  it("a failure mid-swap rolls back and still releases the client", async () => {
    const rec = recordingPool("DELETE FROM tribunal_building_safety_decisions");
    await expect(fileCases(rec.pool as never, [row])).rejects.toThrow("forced failure");
    expect(rec.statements).toContain("ROLLBACK");
    expect(rec.statements).not.toContain("COMMIT");
    expect(rec.released()).toBe(true);
  });
});

describe("previousFailureCount — the parse-failure baseline", () => {
  it("reads the count out of the last recorded log line", async () => {
    const pool = {
      query: async () => ({
        rows: [
          {
            log_line:
              "load-tribunal-building-safety: 28 cases filed · parse failures: 3 (A; B; C) · more",
          },
        ],
      }),
    };
    expect(await previousFailureCount(pool as never)).toBe(3);
  });
  it("any trouble reading it means no baseline, never a crash", async () => {
    const pool = {
      query: async () => {
        throw new Error("no table yet");
      },
    };
    expect(await previousFailureCount(pool as never)).toBeNull();
  });
});
