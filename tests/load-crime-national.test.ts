import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { join } from "node:path";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  countArchiveEnglandTotal,
  countEnglandRecords,
  csvRecords,
} from "../loaders/load-crime-national.mjs";

// Plan step M6.20 (decision D39): the England numerator's
// counting core. The loader stream-counts Police.uk's
// monthly archives on the E01 LSOA prefix — these tests pin
// the counter itself (the header is the contract, quoted
// fields cannot shift a count, non-England codes never
// count). The archive walk and the filing are proven by
// the rehearsal and the backfill; no England total is
// asserted here — the real figure is pinned by the
// backfill and recorded in the golden matrix.

const loader = readFileSync(join(process.cwd(), "loaders/load-crime-national.mjs"), "utf8");

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe("load-crime-national — the CSV reader", () => {
  it("honours quoted fields: commas, doubled quotes and newlines inside quotes", async () => {
    const csv = 'a,b,c\n"x,y","say ""hi""","line one\nline two"\n1,2,3\n';
    const records = await collect(csvRecords(Readable.from([csv])));
    expect(records).toEqual([
      ["a", "b", "c"],
      ["x,y", 'say "hi"', "line one\nline two"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF line endings and a final record with no trailing newline", async () => {
    const records = await collect(csvRecords(Readable.from(["a,b\r\n1,2"])));
    expect(records).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("load-crime-national — the England count", () => {
  const HEADER =
    "Crime ID,Month,Reported by,Falls within,Longitude,Latitude,Location,LSOA code,LSOA name,Crime type,Last outcome category,Context";

  function csvOf(rows: string[]): Readable {
    return Readable.from([[HEADER, ...rows].join("\n") + "\n"]);
  }

  it("counts exactly the E01 rows — Wales, Scotland and blank codes never count", async () => {
    const count = await countEnglandRecords(
      csvOf([
        "id1,2026-09,A,B,-0.1,51.5,On or near High Street,E01000001,City 001A,Violence,,",
        "id2,2026-09,A,B,-0.1,51.5,On or near High Street,W01000001,Welsh 001A,Violence,,",
        "id3,2026-09,A,B,-0.1,51.5,On or near High Street,S01000001,Scots 001A,Violence,,",
        "id4,2026-09,A,B,-0.1,51.5,On or near High Street,,Unknown,Violence,,",
        'id5,2026-09,A,B,-0.1,51.5,"On or near High Street, North",E01021395,Braintree 018C,Burglary,,"a, quoted, context"',
        "short,row",
      ]),
    );
    expect(count).toBe(2);
  });

  it("fails loudly when the header carries no LSOA code column — never counts the wrong field as zero", async () => {
    await expect(countEnglandRecords(Readable.from(["A,B,C\n1,2,3\n"]))).rejects.toThrow(
      'no "LSOA code" column',
    );
  });

  it("fails loudly on an empty file", async () => {
    await expect(countEnglandRecords(Readable.from([""]))).rejects.toThrow("was empty");
  });
});

// A minimal stored (uncompressed) zip, built by hand —
// enough for yauzl to read: local headers, central
// directory, end record, with real CRCs.
function buildZip(entries: { name: string; content: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

describe("load-crime-national — counting one month inside the cumulative archive", () => {
  const HEADER = "Crime ID,Month,LSOA code,Crime type";
  function streetCsv(e01Rows: number): string {
    const rows = [HEADER];
    for (let i = 0; i < e01Rows; i += 1) rows.push(`id,2026-09,E0100000${i},Burglary`);
    rows.push("id,2026-09,W01000001,Burglary");
    return rows.join("\n") + "\n";
  }

  function archiveWithTwoMonths(): string {
    const zip = buildZip([
      { name: "2026-08/2026-08-metropolitan-street.csv", content: streetCsv(3) },
      { name: "2026-08/2026-08-metropolitan-outcomes.csv", content: streetCsv(9) },
      { name: "2026-09/2026-09-metropolitan-street.csv", content: streetCsv(5) },
      { name: "2026-09/2026-09-wiltshire-street.csv", content: streetCsv(2) },
    ]);
    const path = join(mkdtempSync(join(tmpdir(), "cmnh-zip-")), "archive.zip");
    writeFileSync(path, zip);
    return path;
  }

  it("counts ONLY the named month's folder — never the whole cumulative zip", async () => {
    const path = archiveWithTwoMonths();
    // September: 5 + 2 E01 rows across its two forces; the
    // other month's 3 and the outcomes files' rows (which
    // describe the same records) never count. Counting the
    // whole zip — the bug the first backfill attempt hit —
    // would return 19 here, and 16,220,417 on the real
    // 37-month archive.
    expect(await countArchiveEnglandTotal(path, "2026-09")).toBe(7);
    expect(await countArchiveEnglandTotal(path, "2026-08")).toBe(3);
  });

  it("resolves null for a month the archive's window does not reach", async () => {
    expect(await countArchiveEnglandTotal(archiveWithTwoMonths(), "2025-01")).toBeNull();
  });
});

describe("load-crime-national — the loader's shape", () => {
  it("counts the published monthly archives, resumably, and embeds through jsonb_set", () => {
    expect(loader).toContain("https://data.police.uk/data/archive/${month}.zip");
    expect(loader).toContain("ON CONFLICT (month) DO NOTHING");
    expect(loader).toContain("jsonb_set");
    // Only street files count; the outcomes files describe
    // the same records and would double the month.
    expect(loader).toContain("-street\\.csv$");
    // The freshness guard is the crime family's shared one.
    expect(loader).toContain("crimes-street-dates");
    expect(loader).toContain("MAX_LAG_MONTHS = 3");
    // The embed refresh skips an artefact whose figure is
    // already the computed one (the practice break-crime
    // proof diffs crime answers across a scenario run).
    expect(loader).toContain("current.total === national.total");
  });

  it("the practice fixture carries a full synthetic 12-month window", () => {
    const fixture = JSON.parse(
      readFileSync(join(process.cwd(), "tests/fixtures/police-uk-national/fixture.json"), "utf8"),
    ) as { dates: { date: string }[]; months: Record<string, number>; today: string };
    const months = Object.keys(fixture.months).sort();
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2025-10");
    expect(months[11]).toBe("2026-09");
    expect(fixture.dates.at(-1)?.date).toBe("2026-09");
    // Synthetic fixture values — their sum is asserted only
    // as fixture arithmetic, never as an England figure.
    expect(Object.values(fixture.months).reduce((a, b) => a + b, 0)).toBe(5503997);
  });
});
