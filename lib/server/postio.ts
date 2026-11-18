// The Postio client (entry-point build, 18 Nov 2026;
// decision D72 — Postio is the hybrid's BACKSTOP, never its
// front door).
//
// Postio's published API (postio.co.uk/docs, OpenAPI v1.2):
// base https://api.postio.co.uk/v1, GET only, the key in the
// x-api-key header. Three address calls:
//   GET /address/postcode/{postcode} — every delivery point
//     on a postcode, full structured objects; billable on a
//     hit (1 lookup per postcode searched, picking free).
//   GET /address/search?q= — free typeahead; returns only
//     {udprn, suggestion} pairs. ABUSE-MONITORED: a high
//     volume of searches with no matching billable resolves
//     can suspend the key, so this client is NEVER called
//     per keystroke — the search box's suggestions are
//     local-only by ruling (D72 item 4). searchAddresses
//     exists for word filtering at pick/list time and for
//     the Phase 2 extension's listing strings.
//   GET /address/udprn/{udprn} — the one full address for a
//     picked suggestion; billable on a hit.
// Errors are HTTP-shaped: 402 = out of credit (the resolve
// is REFUSED — the hybrid's fallback fires), 401 = bad key,
// 403 = key not allowed here, 429 = rate limit, 5xx =
// server-side. Every response carries the envelope
// {success, results, meta:{requestId}} — the requestId is
// logged with every call so a Postio-side trace can be
// quoted to their support.
//
// The client's discipline, all pinned by the gap check:
//   * a hard 1,500ms timeout per call — past it, the
//     fallback fires, never a longer wait;
//   * every failure is a VALUE, never a throw: timeout,
//     error, zero-balance, refused and no-key all degrade
//     the same way at the caller (the fallback);
//   * with no key configured (local dev, CI) the client is
//     the no-key client: every call answers no-key without
//     touching the network, so the whole hybrid degrades to
//     local + fallback exactly as it does on a Postio outage.
//
// PAF fields map onto the product's filed parts shape
// (LoadedAddressParts — the price_paid PAON/SAON/street
// form) so a Postio row and a filed row are interchangeable
// everywhere downstream: PAON is "BUILDING NAME, number"
// when both exist (the Land Registry form), the flat rides
// in SAON from sub_building_name, and the street is the
// thoroughfare. PAF serves its fields in upper case, as
// Price Paid does, so the mapping keeps that form and the
// display layer tidies casing exactly as it does for filed
// rows.

import { labelForAddressParts, type LoadedAddressParts } from "../address";
import { entryNow, logEntry } from "./entry-log";

// The founder's pinned budget (D72 item 4): a Postio call
// gets 1,500ms, then the fallback fires.
export const POSTIO_TIMEOUT_MS = 1_500;

const DEFAULT_BASE_URL = "https://api.postio.co.uk/v1";

export interface PostioAddress {
  udprn: string;
  parts: LoadedAddressParts;
  label: string;
}

export interface PostioSuggestion {
  udprn: string;
  suggestion: string;
}

export type PostioFailure = "timeout" | "error" | "zero-balance" | "no-key" | "refused";

export type PostioOutcome<T> =
  { ok: true; value: T; ms: number } | { ok: false; reason: PostioFailure; ms: number };

export interface PostioClient {
  listForPostcode(postcode: string, req?: string): Promise<PostioOutcome<PostioAddress[]>>;
  searchAddresses(query: string, req?: string): Promise<PostioOutcome<PostioSuggestion[]>>;
  byUdprn(udprn: string, req?: string): Promise<PostioOutcome<PostioAddress>>;
  // The free health probe (GET /connect): the key is
  // active and the service reachable. Postio publishes NO
  // balance endpoint (checked against its OpenAPI spec,
  // 18 Nov 2026) — a balance can only be learned from a
  // 402 at call time, which is why zero-balance is a call
  // outcome here and the canary probe reports health, not
  // a number (docs/entry-point.md).
  connect(req?: string): Promise<PostioOutcome<{ active: true }>>;
}

// ------------------------------------------------------------------
// PAF -> filed parts
// ------------------------------------------------------------------

// The raw full-address object Postio returns (the fields
// the mapping reads; the rest — DPS, grid refs, district —
// are not address parts and never enter the product).
interface PostioRawAddress {
  udprn?: number | string;
  postcode?: string;
  organisation_name?: string;
  building_name?: string;
  building_number?: string;
  sub_building_name?: string;
  thoroughfare?: string;
  dependent_locality?: string;
  post_town?: string;
}

function clean(value: string | undefined): string | null {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  return text === "" ? null : text;
}

export function partsFromPostio(raw: PostioRawAddress): LoadedAddressParts | null {
  const postcode = clean(raw.postcode);
  if (!postcode || raw.udprn === undefined || raw.udprn === null) return null;
  const buildingName = clean(raw.building_name);
  const buildingNumber = clean(raw.building_number);
  const organisation = clean(raw.organisation_name);
  // PAON in the Land Registry form: a named building keeps
  // its street number after a comma ("MINERVA HOUSE, 12");
  // a lone number or a lone name stands as it is. An
  // organisation with no building identity of its own is
  // the primary object (a business-only delivery point).
  let paon: string | null;
  if (buildingName && buildingNumber) paon = `${buildingName}, ${buildingNumber}`;
  else if (buildingName) paon = buildingName;
  else if (buildingNumber) paon = buildingNumber;
  else paon = organisation;
  return {
    postcode,
    paon,
    saon: clean(raw.sub_building_name),
    street: clean(raw.thoroughfare),
    locality: clean(raw.dependent_locality),
    town: clean(raw.post_town),
  };
}

export function addressFromPostio(raw: PostioRawAddress): PostioAddress | null {
  const parts = partsFromPostio(raw);
  if (!parts) return null;
  return {
    udprn: String(raw.udprn),
    parts,
    label: labelForAddressParts(parts),
  };
}

// ------------------------------------------------------------------
// The real client
// ------------------------------------------------------------------

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export interface PostioClientOptions {
  apiKey: string | null;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
}

interface PostioEnvelope {
  success?: boolean;
  results?: unknown[];
  error?: string;
  meta?: { requestId?: string };
}

export function createPostioClient(options: PostioClientOptions): PostioClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? POSTIO_TIMEOUT_MS;
  const fetchImpl: FetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));

  async function call<T>(
    op: string,
    path: string,
    req: string | undefined,
    map: (results: unknown[]) => T | null,
  ): Promise<PostioOutcome<T>> {
    const started = entryNow();
    const done = (
      outcome: PostioOutcome<T>,
      extra?: Record<string, string | number | boolean | undefined>,
    ): PostioOutcome<T> => {
      if (req) {
        logEntry(req, "postio.call", {
          layer: "postio",
          reason: outcome.ok ? "ok" : outcome.reason,
          ms: outcome.ms,
          op,
          ...extra,
        });
      }
      return outcome;
    };
    if (!options.apiKey) return done({ ok: false, reason: "no-key", ms: 0 });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: "GET",
        headers: { "x-api-key": options.apiKey, accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      const ms = entryNow() - started;
      // An abort at our own deadline is a timeout; anything
      // else is a network error. Both degrade identically.
      return done({ ok: false, reason: controller.signal.aborted ? "timeout" : "error", ms });
    }
    clearTimeout(timer);
    const ms = entryNow() - started;

    if (response.status === 402) return done({ ok: false, reason: "zero-balance", ms });
    if (response.status === 401 || response.status === 403) {
      return done({ ok: false, reason: "refused", ms });
    }
    if (!response.ok) return done({ ok: false, reason: "error", ms });

    let envelope: PostioEnvelope;
    try {
      envelope = (await response.json()) as PostioEnvelope;
    } catch {
      return done({ ok: false, reason: "error", ms });
    }
    const requestId = envelope.meta?.requestId;
    if (!envelope.success || !Array.isArray(envelope.results)) {
      return done(
        { ok: false, reason: "error", ms },
        requestId ? { postioRequestId: requestId } : undefined,
      );
    }
    const value = map(envelope.results);
    if (value === null) {
      return done(
        { ok: false, reason: "error", ms },
        requestId ? { postioRequestId: requestId } : undefined,
      );
    }
    return done({ ok: true, value, ms }, requestId ? { postioRequestId: requestId } : undefined);
  }

  return {
    listForPostcode(postcode, req) {
      const compact = postcode.replace(/\s+/g, "");
      return call(
        `postcode`,
        `/address/postcode/${encodeURIComponent(compact)}`,
        req,
        (results) => {
          const out: PostioAddress[] = [];
          for (const raw of results) {
            const address = addressFromPostio(raw as PostioRawAddress);
            if (address) out.push(address);
          }
          return out;
        },
      );
    },
    searchAddresses(query, req) {
      return call(`search`, `/address/search?q=${encodeURIComponent(query)}`, req, (results) => {
        const out: PostioSuggestion[] = [];
        for (const raw of results as { udprn?: number | string; suggestion?: string }[]) {
          if (raw.udprn !== undefined && raw.udprn !== null && raw.suggestion) {
            out.push({ udprn: String(raw.udprn), suggestion: raw.suggestion });
          }
        }
        return out;
      });
    },
    byUdprn(udprn, req) {
      return call(`udprn`, `/address/udprn/${encodeURIComponent(udprn)}`, req, (results) => {
        const first = results[0] as PostioRawAddress | undefined;
        return first ? addressFromPostio(first) : null;
      });
    },
    connect(req) {
      return call(`connect`, `/connect`, req, () => ({ active: true as const }));
    },
  };
}

// The process-wide client, from the environment: POSTIO_
// API_KEY is the founder-placed secret (server env only —
// never a value in the repo); POSTIO_API_BASE_URL overrides
// the base for a test rig. No key → the no-key client.
let sharedClient: PostioClient | null = null;

export function getPostioClient(): PostioClient {
  if (!sharedClient) {
    sharedClient = createPostioClient({
      apiKey: process.env.POSTIO_API_KEY ?? null,
      baseUrl: process.env.POSTIO_API_BASE_URL ?? undefined,
    });
  }
  return sharedClient;
}

// ------------------------------------------------------------------
// The fake client — the seam's test double. Tests script its
// lists, its suggestions and its failure modes (including a
// delay past the timeout budget); it counts every call so a
// scenario can prove Postio was never touched. No live call
// exists anywhere in the test suite.
// ------------------------------------------------------------------

export interface FakePostioScript {
  // Full address lists by normalised postcode.
  postcodes?: Record<string, PostioAddress[]>;
  // Search suggestions by exact query string.
  searches?: Record<string, PostioSuggestion[]>;
  // The failure every billable call returns, or a per-op
  // failure. "timeout" is simulated with a real delay past
  // the client's budget — pass a small timeoutMs to
  // createFakePostioClient to keep the test fast.
  fail?:
    PostioFailure | Partial<Record<"postcode" | "search" | "udprn" | "connect", PostioFailure>>;
  delayMs?: number;
}

export interface FakePostioClient extends PostioClient {
  calls: { op: string; arg: string }[];
}

export function createFakePostioClient(
  script: FakePostioScript,
  options: { timeoutMs?: number } = {},
): FakePostioClient {
  const timeoutMs = options.timeoutMs ?? POSTIO_TIMEOUT_MS;
  const calls: { op: string; arg: string }[] = [];

  async function run<T>(
    op: "postcode" | "search" | "udprn" | "connect",
    arg: string,
    req: string | undefined,
    produce: () => T,
  ): Promise<PostioOutcome<T>> {
    calls.push({ op, arg });
    const started = entryNow();
    const failure = typeof script.fail === "object" ? script.fail[op] : script.fail;
    if (script.delayMs) await new Promise((r) => setTimeout(r, script.delayMs));
    const ms = entryNow() - started;
    let outcome: PostioOutcome<T>;
    if (failure) {
      outcome = {
        ok: false,
        reason: failure === "timeout" || ms > timeoutMs ? "timeout" : failure,
        ms,
      };
    } else if (ms > timeoutMs) {
      outcome = { ok: false, reason: "timeout", ms };
    } else {
      try {
        outcome = { ok: true, value: produce(), ms };
      } catch {
        outcome = { ok: false, reason: "error", ms };
      }
    }
    if (req) {
      logEntry(req, "postio.call", {
        layer: "postio",
        reason: outcome.ok ? "ok" : outcome.reason,
        ms: outcome.ms,
        op,
        fake: true,
      });
    }
    return outcome;
  }

  const byUdprnIndex = new Map<string, PostioAddress>();
  for (const list of Object.values(script.postcodes ?? {})) {
    for (const address of list) byUdprnIndex.set(address.udprn, address);
  }

  return {
    calls,
    listForPostcode: (postcode, req) =>
      run("postcode", postcode, req, () => script.postcodes?.[postcode] ?? []),
    searchAddresses: (query, req) =>
      run("search", query, req, () => script.searches?.[query] ?? []),
    byUdprn: (udprn, req) =>
      run("udprn", udprn, req, () => {
        const address = byUdprnIndex.get(udprn);
        if (!address) throw new Error(`fake postio: unknown udprn ${udprn}`);
        return address;
      }),
    connect: (req) => run("connect", "", req, () => ({ active: true as const })),
  };
}
