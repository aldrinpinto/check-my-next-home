// The search counting (plan step M9.11; the founder's
// ruling of 22 Nov 2026, recorded in ADMIN-PAGE-PLAN):
// aggregate counts of searches and checks at FULL-
// POSTCODE grain — counts only, never tied to a
// visitor, a cookie or an IP, and the words a visitor
// typed are never stored. The shelves are migration
// 0044's (search_counts, search_last_type), aggregate
// by construction: no column could hold a person.
//
// Why not the journey events: their catalogue is
// pinned and their scan rejects a full postcode on
// sight — the no-address rule for EVENTS stands
// untouched. This counting is a separate, deliberate
// collection the founder ruled on, with its own
// Privacy-page sentence landing in the same step.
//
// WHAT IS COUNTED, exactly:
//   - A completed home check (a results page served,
//     rung 1 or 2) counts once under its search type,
//     once under its full postcode, and — where the
//     check began as a street search — once under the
//     street it served. A completed district check
//     (rung 3) counts once under the wider-area type
//     and nowhere else: a district has no full
//     postcode to count.
//   - The search type names how the counted journey
//     began: a postcode entry, a street pick (the
//     narrowed check), or a wider-area entry.
//   - A rung-2 serve also sets its postcode's
//     last-touch type (search_last_type): how that
//     postcode's most recent counted check began. A
//     paid claim then counts as one purchase under
//     its postcode, attributed to that last-touch
//     type — the standard entry is the postcode box,
//     so a postcode nobody has counted attributes to
//     'postcode'. Last-touch at postcode grain is an
//     aggregate attribution, the honest limit of
//     counting without tracking: it never names a
//     person, and the admin panel captions it as
//     counting, not tracking.
//   - A test-lane purchase counts apart
//     ('purchase-test'), so the admin page's test
//     toggle keeps the founder's own testing out of
//     the bought numbers exactly as it does for
//     orders. Checks carry no test split — a check
//     serve cannot know, the same stated limit the
//     journey events carry (plan section 3.4).
//
// The seam in the house pattern: an interface, a
// database implementation, and an in-memory
// implementation the tests run. Callers treat every
// write as fire-and-forget beside the act it counts
// (the claim, the serve): a dropped count is a gap in
// a chart, never a broken journey.

import type { AddressQueryable } from "../address";
import type { AdminCounting } from "../admin";
import { getDbPool } from "./db";

export type SearchType = "postcode" | "street" | "wider-area";

export interface SearchCountingStore {
  // A completed check serve (see the header for what
  // counts, and where).
  noteCheck(input: {
    type: SearchType;
    // The full postcode the check served; null for a
    // wider-area check.
    postcode: string | null;
    // The street a street search served — its normal
    // key (street + town, the street table's own form)
    // and its display label. Null for other types.
    street: { key: string; label: string } | null;
    // A rung-2 serve sets the postcode's last-touch
    // type; a rung-1 serve does not (its journey began
    // at an earlier serve or a pick the counting does
    // not follow).
    setsLastType: boolean;
    now?: Date;
  }): Promise<void>;
  // A paid claim: one purchase under its postcode,
  // attributed by the last-touch shelf.
  notePurchase(input: { postcode: string; testOrder: boolean; now?: Date }): Promise<void>;
  // The period's aggregates, in the admin
  // composition's own shape.
  readPeriod(input: { from: Date; to: Date }): Promise<AdminCounting>;
}

// The serve-time entry point (the journey-events
// pattern): counting never slows or breaks the journey
// it measures, so this never throws — a failed write
// is logged in the entry-log style and forgotten.
export async function noteCheckServe(input: {
  type: SearchType;
  postcode: string | null;
  street: { key: string; label: string } | null;
  setsLastType: boolean;
}): Promise<void> {
  try {
    await createDbSearchCountingStore(getDbPool()).noteCheck(input);
  } catch (error) {
    console.warn(
      `search counting outcome=dropped type=${input.type} reason=${
        error instanceof Error ? error.message.slice(0, 120) : "unknown"
      }`,
    );
  }
}

function hourBucket(now: Date): Date {
  const bucket = new Date(now);
  bucket.setMinutes(0, 0, 0);
  return bucket;
}

function normalisePostcode(postcode: string): string {
  return postcode.trim().toUpperCase();
}

const ZERO_TYPES: Record<SearchType, number> = { postcode: 0, street: 0, "wider-area": 0 };

export function createDbSearchCountingStore(db: AddressQueryable): SearchCountingStore {
  async function bump(input: {
    bucket: Date;
    counter: string;
    type: SearchType;
    postcode: string;
    streetKey: string;
    streetLabel: string;
  }): Promise<void> {
    await db.query(
      `INSERT INTO search_counts (bucket, counter, search_type, postcode, street_key, street_label, count)
       VALUES ($1, $2, $3, $4, $5, $6, 1)
       ON CONFLICT (bucket, counter, search_type, postcode, street_key)
       DO UPDATE SET count = search_counts.count + 1, street_label = EXCLUDED.street_label`,
      [input.bucket, input.counter, input.type, input.postcode, input.streetKey, input.streetLabel],
    );
  }

  return {
    async noteCheck(input) {
      const now = input.now ?? new Date();
      const bucket = hourBucket(now);
      const postcode = input.postcode ? normalisePostcode(input.postcode) : null;
      await bump({
        bucket,
        counter: "check",
        type: input.type,
        postcode: "",
        streetKey: "",
        streetLabel: "",
      });
      if (postcode) {
        await bump({
          bucket,
          counter: "check",
          type: input.type,
          postcode,
          streetKey: "",
          streetLabel: "",
        });
      }
      if (input.street) {
        await bump({
          bucket,
          counter: "check",
          type: "street",
          postcode: "",
          streetKey: input.street.key,
          streetLabel: input.street.label,
        });
      }
      if (input.setsLastType && postcode) {
        await db.query(
          `INSERT INTO search_last_type (postcode, search_type, updated_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (postcode) DO UPDATE
             SET search_type = EXCLUDED.search_type, updated_at = EXCLUDED.updated_at`,
          [postcode, input.type, now],
        );
      }
    },

    async notePurchase(input) {
      const now = input.now ?? new Date();
      const postcode = normalisePostcode(input.postcode);
      const { rows } = await db.query(
        `SELECT search_type FROM search_last_type WHERE postcode = $1`,
        [postcode],
      );
      const type = ((rows as unknown as { search_type: SearchType }[])[0]?.search_type ??
        "postcode") as SearchType;
      await bump({
        bucket: hourBucket(now),
        counter: input.testOrder ? "purchase-test" : "purchase",
        type,
        postcode,
        streetKey: "",
        streetLabel: "",
      });
    },

    async readPeriod(input) {
      const byType = { ...ZERO_TYPES };
      const byTypeTest = { ...ZERO_TYPES };
      const { rows: typeRows } = await db.query(
        `SELECT counter, search_type, sum(count)::int AS n FROM search_counts
          WHERE bucket >= $1 AND bucket < $2 AND postcode = '' AND street_key = ''
          GROUP BY counter, search_type`,
        [input.from, input.to],
      );
      const checksByType = { ...ZERO_TYPES };
      for (const row of typeRows as unknown as {
        counter: string;
        search_type: SearchType;
        n: number;
      }[]) {
        if (row.counter === "check") checksByType[row.search_type] = row.n;
      }
      const { rows: purchaseRows } = await db.query(
        `SELECT counter, search_type, sum(count)::int AS n FROM search_counts
          WHERE bucket >= $1 AND bucket < $2 AND postcode <> ''
            AND counter IN ('purchase', 'purchase-test')
          GROUP BY counter, search_type`,
        [input.from, input.to],
      );
      for (const row of purchaseRows as unknown as {
        counter: string;
        search_type: SearchType;
        n: number;
      }[]) {
        if (row.counter === "purchase") byType[row.search_type] = row.n;
        else byTypeTest[row.search_type] = row.n;
      }
      const { rows: postcodeRows } = await db.query(
        `SELECT postcode, sum(count)::int AS n FROM search_counts
          WHERE bucket >= $1 AND bucket < $2 AND counter = 'check' AND postcode <> ''
          GROUP BY postcode ORDER BY n DESC, postcode ASC`,
        [input.from, input.to],
      );
      const { rows: streetRows } = await db.query(
        `SELECT street_key, max(street_label) AS label, sum(count)::int AS n FROM search_counts
          WHERE bucket >= $1 AND bucket < $2 AND counter = 'check' AND street_key <> ''
          GROUP BY street_key ORDER BY n DESC, street_key ASC`,
        [input.from, input.to],
      );
      return {
        checksByPostcode: (postcodeRows as unknown as { postcode: string; n: number }[]).map(
          (row) => ({ postcode: row.postcode, checks: row.n }),
        ),
        checksByStreet: (
          streetRows as unknown as { street_key: string; label: string; n: number }[]
        ).map((row) => ({ label: row.label, checks: row.n })),
        checksByType,
        purchasesByType: byType,
        purchasesByTypeTest: byTypeTest,
      };
    },
  };
}

// The in-memory implementation the tests run.
export function createMemorySearchCountingStore(): SearchCountingStore & {
  counts: Map<string, number>;
  lastType: Map<string, SearchType>;
} {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  const lastType = new Map<string, SearchType>();
  // The street key carries its own "|" (street|town),
  // so the shelf's composite key is a JSON row, which
  // round-trips any field content.
  const keyOf = (
    bucket: Date,
    counter: string,
    type: string,
    postcode: string,
    streetKey: string,
  ) => JSON.stringify([bucket.toISOString(), counter, type, postcode, streetKey]);
  const bump = (
    bucket: Date,
    counter: string,
    type: SearchType,
    postcode: string,
    streetKey: string,
    streetLabel: string,
  ) => {
    const key = keyOf(bucket, counter, type, postcode, streetKey);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (streetLabel) labels.set(streetKey, streetLabel);
  };
  const inWindow = (bucketIso: string, from: Date, to: Date) => {
    const at = new Date(bucketIso).getTime();
    return at >= from.getTime() && at < to.getTime();
  };

  return {
    counts,
    lastType,
    async noteCheck(input) {
      const now = input.now ?? new Date();
      const bucket = hourBucket(now);
      const postcode = input.postcode ? normalisePostcode(input.postcode) : null;
      bump(bucket, "check", input.type, "", "", "");
      if (postcode) bump(bucket, "check", input.type, postcode, "", "");
      if (input.street) bump(bucket, "check", "street", "", input.street.key, input.street.label);
      if (input.setsLastType && postcode) lastType.set(postcode, input.type);
    },
    async notePurchase(input) {
      const now = input.now ?? new Date();
      const postcode = normalisePostcode(input.postcode);
      const type = lastType.get(postcode) ?? "postcode";
      bump(hourBucket(now), input.testOrder ? "purchase-test" : "purchase", type, postcode, "", "");
    },
    async readPeriod(input) {
      const result: AdminCounting = {
        checksByPostcode: [],
        checksByStreet: [],
        checksByType: { ...ZERO_TYPES },
        purchasesByType: { ...ZERO_TYPES },
        purchasesByTypeTest: { ...ZERO_TYPES },
      };
      const byPostcode = new Map<string, number>();
      const byStreet = new Map<string, number>();
      for (const [key, n] of counts) {
        const [bucketIso, counter, type, postcode, streetKey] = JSON.parse(key) as string[];
        if (!inWindow(bucketIso, input.from, input.to)) continue;
        if (counter === "check" && postcode === "" && streetKey === "") {
          result.checksByType[type as SearchType] += n;
        } else if (counter === "check" && postcode !== "") {
          byPostcode.set(postcode, (byPostcode.get(postcode) ?? 0) + n);
        } else if (counter === "check" && streetKey !== "") {
          byStreet.set(streetKey, (byStreet.get(streetKey) ?? 0) + n);
        } else if (counter === "purchase") {
          result.purchasesByType[type as SearchType] += n;
        } else if (counter === "purchase-test") {
          result.purchasesByTypeTest[type as SearchType] += n;
        }
      }
      result.checksByPostcode = [...byPostcode.entries()]
        .map(([postcode, checks]) => ({ postcode, checks }))
        .sort((a, b) => b.checks - a.checks || a.postcode.localeCompare(b.postcode));
      result.checksByStreet = [...byStreet.entries()]
        .map(([key, checks]) => ({ label: labels.get(key) ?? key, checks }))
        .sort((a, b) => b.checks - a.checks || a.label.localeCompare(b.label));
      return result;
    },
  };
}
