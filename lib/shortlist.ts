import { distanceBand, type DistanceBand, type DistanceFamily } from "./results";

// The shortlist (plan step M7.5, built to D40 with the gap
// check's four rulings of 17 Nov 2026). Everything about the
// list that is not tied to one component lives here, purely:
// the storage contract, the record logic (the soft limit of
// 3, order preservation), the comparison's construction from
// saved snapshots, and the browser-storage access the client
// islands call. No brain is read here and nothing is fetched:
// a card is a SNAPSHOT of the facts exactly as rendered when
// the home was saved (ruling 3), and /shortlist renders
// purely from what this module reads back.
//
// The shortlist is 3 homes for everyone, paid or free
// (founder's ruling, 17 Nov 2026): the earlier sketch of a
// fuller comparison for report-holders (up to 10 homes)
// was dropped the same evening — the £4.99 buys the
// report's depth, never more shortlist slots, and M9.6
// builds no entitlement and no wider comparison.

// ------------------------------------------------------------------
// The storage contract (fold-in 1 — pinned now as the Phase 2
// contract). One versioned localStorage key on the site
// origin. localStorage is the only mechanism consistent
// with the design's privacy line ("nothing about which homes
// someone is considering is stored on any server"): it is
// never transmitted, needs no account, and survives browser
// restarts. Phase 2 sharing is an extension-brokered sync
// against this record — the extension works on portal
// origins and cannot literally read this origin's storage,
// so D40's "same list" is a user-truth delivered by that
// sync, never a storage-truth.
// ------------------------------------------------------------------

export const SHORTLIST_STORAGE_KEY = "cmnh-shortlist-v1";
export const SHORTLIST_LIMIT = 3;

// The same-tab update signal: the cross-tab `storage` event
// does not fire in the tab that made the change, so every
// write through this module also dispatches this event and
// every island subscribes to both.
export const SHORTLIST_UPDATED_EVENT = "cmnh:shortlist-updated";

// ------------------------------------------------------------------
// Pinned wording. The empty state is the Final Design's
// Section 4B standard verbatim. The full line is the
// founder's simple-message form (17 Nov 2026): tapping add
// with 3 saved shows this line in place of the button —
// no panel opens. The pointer wording survives only as
// the render for cards saved before the same evening's
// ruling put real flood and crime figures in the cells
// (see ShortlistCell below). The remaining lines are
// composed at this step and pinned here so no component
// invents its own.
// ------------------------------------------------------------------

export const SHORTLIST_LEAD_LINE =
  "Nothing about which homes you are considering is stored on any server.";
export const SHORTLIST_EMPTY_HEADING = "Your shortlist is empty";
export const SHORTLIST_EMPTY_LINE =
  "No homes have been saved yet, so there is nothing to compare. Homes you save are kept only in this browser. Next step: check a postcode on the website, or open a listing and tap 'Shortlist this home' — saved homes will appear here.";
export const SHORTLIST_KEPT_LINE = "Homes you save are kept only in this browser.";
export const SHORTLIST_UNAVAILABLE_LINE =
  "Your shortlist is kept in this browser, but this browser is not allowing storage right now — so saved homes can't be kept or shown here.";
export const SHORTLIST_FULL_LINE = "Your shortlist is full — it holds 3 homes.";
export const SEE_THIS_HOMES_CHECK = "See this home's check";
export const NOT_COVERED_LINE = "This check is not covered for this postcode.";
// The Air quality row's cell for a card saved before the
// row existed (BUG-164): the snapshot holds no air fact,
// and none is borrowed — the row says so, in the table's
// plain dress.
export const AIR_NOT_SAVED_LINE = "Air quality is not in this saved snapshot.";

// ------------------------------------------------------------------
// The record shape (pinned in tests/shortlist.test.ts)
// ------------------------------------------------------------------

// One comparison cell. A distance cell carries the nearest
// place exactly as snapshotted (name + straight-line miles;
// the miles figure takes its colour from the row's family
// thresholds at render). A line cell carries a fact or a
// named state verbatim — a fact a rung does not serve
// renders its named state, never a borrowed figure
// (fold-in 7); flood and crime are line cells carrying the
// real bands and the real 12-month count (founder's
// ruling, 17 Nov 2026). A line cell may also carry a BAND
// (BUG-163): the pill verdict's colour for its fact,
// derived at assembly from lib/results.ts's own band
// functions — flood by floodPillBand, crime by
// crimePillBand over the calibration pair, air quality by
// airPillBand (BUG-164) — and absent wherever the verdict
// cannot honestly be produced (a pre-calibration crime
// snapshot carries no rate pair, so its cell stays plain;
// no threshold is ever faked on the raw count). A pointer
// cell carries nothing and is LEGACY: only cards saved
// before that ruling hold one, and the renderer still
// honours the shape so a saved list is never dropped for
// its age — new assembly never produces one.
//
// A SEGMENTS cell (BUG-291, BUG-292): a line whose colour
// belongs to the VALUES, not the whole line — each segment
// is plain text or one banded value, so the labels stay
// plain while the figures take the pill's dress. The
// flood cell's two bands and the crime cell's verdict are
// segments; every other row stays a plain line.
export type ShortlistSegment = { text: string; band?: DistanceBand };

export type ShortlistCell =
  | { kind: "distance"; name: string; miles: number }
  | { kind: "line"; text: string; band?: DistanceBand }
  | { kind: "segments"; segments: ShortlistSegment[] }
  | { kind: "pointer" };

export type ComparisonRowKey =
  | "primary"
  | "secondary"
  | "grammar"
  | "nursery"
  | "flood"
  | "crime"
  | "air"
  | "gp"
  | "ae"
  | "station"
  | "vet"
  | "councilTax";

// The comparison's row set, pinned in tests. The ORDER is
// the D75 summary-pill priority order (founder's ruling,
// 17 Nov 2026): Flood and Crime lead, Air quality follows
// Crime (BUG-164's rank, founder ruling 22 Nov 2026),
// then the schools (grammar grouped with them — it is a
// row here though it is not a pill factor), A&E before
// GP, then Vet, Station and Nursery in their pill order;
// Council tax is not a pill factor at all and closes the
// table as a cost fact. The family is the M7.4
// distance-colour family for the row's miles figure
// (lib/results.ts's thresholds); rows without a family
// never carry a distance cell in a form that colours
// (grammar's, flood's, crime's and air quality's cells
// are lines; council tax is a line).
export const COMPARISON_ROWS: {
  key: ComparisonRowKey;
  label: string;
  family: DistanceFamily | null;
}[] = [
  { key: "flood", label: "Flood", family: null },
  { key: "crime", label: "Crime — 12-month total", family: null },
  { key: "air", label: "Air quality", family: null },
  { key: "primary", label: "Nearest primary", family: "school" },
  { key: "secondary", label: "Nearest secondary", family: "school" },
  { key: "grammar", label: "Grammar school nearby", family: null },
  { key: "ae", label: "Hospital with A&E", family: "hospital" },
  { key: "gp", label: "GP", family: "everyday" },
  { key: "vet", label: "Nearest vet", family: "everyday" },
  { key: "station", label: "Station", family: "everyday" },
  { key: "nursery", label: "Nursery", family: "school" },
  { key: "councilTax", label: "Council tax", family: null },
];

export interface ShortlistLastSale {
  price: number;
  // The sale date as filed (ISO); display forms derive from
  // it at render, never the other way round.
  date: string;
  // The register's property-type and tenure codes rendered
  // as the register's category names at assembly (see
  // lib/shortlist-card.ts); null where the filed sale
  // carries neither, and the line then omits the segment.
  typeLabel: string | null;
  tenureLabel: string | null;
}

export interface ShortlistCard {
  // The card's identity: rung 1 is postcode + home key;
  // rung 3 is the outward code (the `postcode` field carries
  // the outward code at rung 3 — the area is the identity).
  id: string;
  postcode: string;
  homeKey: string | null;
  rung: 1 | 3;
  scopeLabel: string;
  addressLine: string;
  // Rung 1 only: the home's own last sale as filed. Null
  // when the home has no recorded sale (its named state is
  // on the results page, not invented here).
  lastSale: ShortlistLastSale | null;
  // The card's headline facts line, composed at assembly
  // from what the results page rendered; null where no
  // headline fact serves.
  factsLine: string | null;
  comparison: Record<ComparisonRowKey, ShortlistCell>;
  // The save moment (ISO), stamped by the control that
  // writes the card — the snapshot's provenance.
  savedAt: string;
}

export interface ShortlistRecord {
  v: 1;
  // Saved order is the array order; the page renders it as
  // stored and never re-sorts.
  cards: ShortlistCard[];
}

export function emptyShortlistRecord(): ShortlistRecord {
  return { v: 1, cards: [] };
}

export function shortlistCardId(rung: 1 | 3, postcode: string, homeKey: string | null): string {
  return rung === 1 ? `r1:${postcode}:${homeKey ?? ""}` : `r3:${postcode}`;
}

// ------------------------------------------------------------------
// Display composition from a snapshot (deterministic — the
// same fields always compose the same lines, so what the
// visitor saved is what every surface shows)
// ------------------------------------------------------------------

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthYear(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const month = SHORT_MONTHS[Number(match[2]) - 1];
  if (!month) return null;
  return `${month} ${match[1]}`;
}

function pounds(value: number): string {
  return `£${value.toLocaleString("en-GB")}`;
}

// The card's last-sale line, in the Final Design's card
// form: "£270,000 • Last sale, Jan 2014 • Maisonette,
// leasehold" — price, the sale's month and year, then the
// type and tenure as filed where the sale carries them.
export function cardLastSaleLine(card: ShortlistCard): string | null {
  const sale = card.lastSale;
  if (!sale) return null;
  const when = monthYear(sale.date);
  const parts = [pounds(sale.price), when ? `Last sale, ${when}` : "Last sale"];
  const kind: string[] = [];
  if (sale.typeLabel) kind.push(sale.typeLabel);
  if (sale.tenureLabel)
    kind.push(kind.length > 0 ? sale.tenureLabel.toLowerCase() : sale.tenureLabel);
  if (kind.length > 0) parts.push(kind.join(", "));
  return parts.join(" • ");
}

// The comparison column's header sale line, in the design's
// form: "£270,000 — last sale 2014". Null at rung 3 (its
// columns carry no last-sale header — fold-in 7) and where
// the home has no recorded sale.
export function comparisonSaleLine(card: ShortlistCard): string | null {
  const sale = card.lastSale;
  if (!sale) return null;
  const match = /^(\d{4})-/.exec(sale.date);
  if (!match) return null;
  return `${pounds(sale.price)} — last sale ${match[1]}`;
}

// ------------------------------------------------------------------
// The comparison's construction: a pure transpose of the
// saved snapshots into rows. No winner, no score, no ranking
// exists in this shape — the rows are the design's set and
// each column is one saved home in saved order.
// ------------------------------------------------------------------

export interface ComparisonView {
  columns: ShortlistCard[];
  rows: {
    key: ComparisonRowKey;
    label: string;
    family: DistanceFamily | null;
    cells: ShortlistCell[];
  }[];
}

export function buildComparison(cards: ShortlistCard[]): ComparisonView {
  return {
    columns: cards,
    rows: COMPARISON_ROWS.map((row) => ({
      key: row.key,
      label: row.label,
      family: row.family,
      cells: cards.map((card) => {
        const cell = card.comparison[row.key];
        if (cell !== undefined) return cell;
        // Only the Air quality row can be absent: a card
        // saved before BUG-164 added the row holds no air
        // cell (isCard below tolerates exactly that one
        // gap), and the row serves the not-saved line for
        // it rather than dropping the card or borrowing a
        // figure.
        return { kind: "line", text: AIR_NOT_SAVED_LINE };
      }),
    })),
  };
}

// BUG-189 (founder-found 23 Nov 2026): a card saved
// before the BUG-163/BUG-164 colour work stores its
// flood, crime and air line cells with no band, and the
// stored record is never rewritten (it is the visitor's
// own snapshot) — so where the snapshot's stored values
// still determine the pill's verdict on their own, the
// band is derived at display time, here, from the
// cell's own text. The derivation is deliberately
// narrow: it speaks only where EVERY state of the
// facts the snapshot does not hold gives the pill the
// same colour.
//   - Flood: the cell stores both layers' band words
//     ("Rivers & sea: X · Surface water: Y"). A Medium
//     or High word makes the pill red whatever the
//     planning zone says — the likelihood alone paints
//     red (floodPillBand), and a zone can only agree
//     or stand aside. But a Low worst word is orange
//     or red by the zone, and a Very-low pair is
//     green, orange or red by the zone — and the zone
//     is not in the snapshot, so those cells stay
//     plain rather than guess at it.
//   - Crime: the cell stores the count alone. The
//     verdict needs the calibration pair (the local
//     rate against England's), which no snapshot
//     stores — plain, as assembly has always held:
//     no threshold is ever faked on the raw count.
//   - Air quality: a card old enough to lack the band
//     holds no air cell at all (buildComparison serves
//     the not-saved line); a stored air cell already
//     carries the band its verdict produced, and a
//     bandless one is the verdict's honest "neither".
const LEGACY_FLOOD_CELL_TEXT =
  /^Rivers & sea: (Very low|Low|Medium|High) · Surface water: (Very low|Low|Medium|High)$/;

function derivedLegacyBand(rowKey: ComparisonRowKey, text: string): DistanceBand | null {
  if (rowKey !== "flood") return null;
  const match = LEGACY_FLOOD_CELL_TEXT.exec(text);
  if (!match) return null;
  return match[1] === "Medium" ||
    match[1] === "High" ||
    match[2] === "Medium" ||
    match[2] === "High"
    ? "red"
    : null;
}

// The colour a cell takes in the table (BUG-163, founder
// ruling 22 Nov 2026): the reports' own colour machinery,
// never a second set of thresholds. A distance cell takes
// its row family's band (lib/results.ts's distanceBand) —
// except GP: its family stands in the row table, but the
// product never colours a GP distance anywhere, so the
// table does not start. A line cell takes the band
// assembly derived for it from the pill verdicts (flood,
// crime, air quality) — or, for a pre-colour-work card
// that stored none, the band its stored values still
// determine (BUG-189, above); every other line — council
// tax above all — stays plain, as does a legacy pointer.
export function comparisonCellBand(
  rowKey: ComparisonRowKey,
  family: DistanceFamily | null,
  cell: ShortlistCell,
): DistanceBand | null {
  if (cell.kind === "distance") {
    if (family === null || rowKey === "gp") return null;
    return distanceBand(family, cell.miles);
  }
  if (cell.kind === "line") return cell.band ?? derivedLegacyBand(rowKey, cell.text);
  return null;
}

// ------------------------------------------------------------------
// Record logic — the soft limit (D40): removing and
// re-adding is allowed and harmless; nothing hardens the
// limit (no fingerprinting, no tracking).
// ------------------------------------------------------------------

export type AddOutcome =
  | { outcome: "added"; record: ShortlistRecord }
  | { outcome: "already-saved"; record: ShortlistRecord }
  | { outcome: "full"; record: ShortlistRecord };

export function addCardToRecord(record: ShortlistRecord, card: ShortlistCard): AddOutcome {
  if (record.cards.some((saved) => saved.id === card.id))
    return { outcome: "already-saved", record };
  if (record.cards.length >= SHORTLIST_LIMIT) return { outcome: "full", record };
  return { outcome: "added", record: { v: 1, cards: [...record.cards, card] } };
}

export function removeCardFromRecord(record: ShortlistRecord, id: string): ShortlistRecord {
  return { v: 1, cards: record.cards.filter((card) => card.id !== id) };
}

export function isCardSaved(record: ShortlistRecord, id: string): boolean {
  return record.cards.some((card) => card.id === id);
}

// ------------------------------------------------------------------
// Serialisation. Parsing is tolerant in exactly one
// direction: a record from another version, or no record at
// all, reads as the empty list (a cleared list is
// indistinguishable from a never-saved one — the empty
// state is its named line, fold-in 5); a malformed card
// inside a v1 record is dropped rather than crashing the
// page, and the well-formed cards survive.
// ------------------------------------------------------------------

function isCell(value: unknown): value is ShortlistCell {
  if (typeof value !== "object" || value === null) return false;
  const cell = value as Record<string, unknown>;
  if (cell.kind === "pointer") return true;
  if (cell.kind === "line")
    return (
      typeof cell.text === "string" &&
      (cell.band === undefined ||
        cell.band === "green" ||
        cell.band === "orange" ||
        cell.band === "red")
    );
  if (cell.kind === "segments")
    return (
      Array.isArray(cell.segments) &&
      cell.segments.length > 0 &&
      cell.segments.every((segment) => {
        if (typeof segment !== "object" || segment === null) return false;
        const part = segment as Record<string, unknown>;
        return (
          typeof part.text === "string" &&
          (part.band === undefined ||
            part.band === "green" ||
            part.band === "orange" ||
            part.band === "red")
        );
      })
    );
  if (cell.kind === "distance")
    return typeof cell.name === "string" && typeof cell.miles === "number";
  return false;
}

function isCard(value: unknown): value is ShortlistCard {
  if (typeof value !== "object" || value === null) return false;
  const card = value as Record<string, unknown>;
  if (typeof card.id !== "string" || typeof card.postcode !== "string") return false;
  if (card.rung !== 1 && card.rung !== 3) return false;
  if (typeof card.scopeLabel !== "string" || typeof card.addressLine !== "string") return false;
  if (typeof card.savedAt !== "string") return false;
  if (card.homeKey !== null && typeof card.homeKey !== "string") return false;
  if (card.factsLine !== null && typeof card.factsLine !== "string") return false;
  if (card.lastSale !== null) {
    if (typeof card.lastSale !== "object") return false;
    const sale = card.lastSale as Record<string, unknown>;
    if (typeof sale.price !== "number" || typeof sale.date !== "string") return false;
    if (sale.typeLabel !== null && typeof sale.typeLabel !== "string") return false;
    if (sale.tenureLabel !== null && typeof sale.tenureLabel !== "string") return false;
  }
  if (typeof card.comparison !== "object" || card.comparison === null) return false;
  const comparison = card.comparison as Record<string, unknown>;
  // The Air quality cell is the one tolerated gap
  // (BUG-164): cards saved before the row existed hold no
  // air cell at all, and the card survives — the stored
  // record is never rewritten; buildComparison serves the
  // not-saved line for that row instead.
  return COMPARISON_ROWS.every((row) =>
    row.key === "air"
      ? comparison[row.key] === undefined || isCell(comparison[row.key])
      : isCell(comparison[row.key]),
  );
}

export function parseShortlistRecord(raw: string | null): ShortlistRecord {
  if (!raw) return emptyShortlistRecord();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyShortlistRecord();
  }
  if (typeof parsed !== "object" || parsed === null) return emptyShortlistRecord();
  const record = parsed as Record<string, unknown>;
  if (record.v !== 1 || !Array.isArray(record.cards)) return emptyShortlistRecord();
  return { v: 1, cards: record.cards.filter(isCard).slice(0, SHORTLIST_LIMIT) };
}

export function serializeShortlistRecord(record: ShortlistRecord): string {
  return JSON.stringify(record);
}

// ------------------------------------------------------------------
// Browser storage access. Every touch is guarded: storage
// can be absent (server render), refuse reads (private
// mode, disabled storage) or refuse writes (quota) — each
// refusal is the named "unavailable" state, never a silent
// failure (fold-in 5). The functions take an optional
// storage so tests drive fakes; in the browser the default
// is this origin's localStorage.
// ------------------------------------------------------------------

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type ShortlistLoad = { status: "ok"; record: ShortlistRecord } | { status: "unavailable" };

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadShortlist(storage?: StorageLike | null): ShortlistLoad {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return { status: "unavailable" };
  try {
    return { status: "ok", record: parseShortlistRecord(store.getItem(SHORTLIST_STORAGE_KEY)) };
  } catch {
    return { status: "unavailable" };
  }
}

export function saveShortlist(record: ShortlistRecord, storage?: StorageLike | null): boolean {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return false;
  try {
    store.setItem(SHORTLIST_STORAGE_KEY, serializeShortlistRecord(record));
    return true;
  } catch {
    return false;
  }
}

// Announce a write to every island in this tab (the header
// badge, the add controls) and let the browser's own
// `storage` event carry it to other tabs.
export function notifyShortlistChanged(): void {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SHORTLIST_UPDATED_EVENT));
  } catch {
    // A failed announcement leaves the islands showing the
    // state they last read; the next navigation re-reads.
  }
}

export function subscribeShortlistChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === SHORTLIST_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SHORTLIST_UPDATED_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SHORTLIST_UPDATED_EVENT, listener);
  };
}
