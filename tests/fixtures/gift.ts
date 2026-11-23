import { GIFT_VALIDITY_MS, type GiftRecord } from "../../lib/gift";

// Gift-record fixtures (plan step M7.13) — one factory
// per lifecycle state the claim flow serves, built the
// way the store writes them: emails normalised, the
// 30-day expiry derived from the issue moment, a token
// in the built form (long, un-guessable — never the
// sample's mock slug).

export const GIFT_NOW = new Date("2026-11-19T12:00:00.000Z");
export const GIFT_BUYER = "buyer@example.co.uk";
export const GIFT_FRIEND = "friend@example.co.uk";
export const GIFT_TOKEN = "fixture-gift-token-0000000000000001";
export const GIFT_CONFIRM_TOKEN = "fixture-confirm-token-000000000001";

const DAY_MS = 24 * 60 * 60 * 1000;

export function giftRecord(overrides: Partial<GiftRecord> = {}): GiftRecord {
  const issuedAt = overrides.issuedAt ?? new Date(GIFT_NOW.getTime() - 2 * DAY_MS);
  return {
    token: GIFT_TOKEN,
    buyerEmail: GIFT_BUYER,
    claimantEmail: null,
    status: "issued",
    orderRef: "order-fixture-1",
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + GIFT_VALIDITY_MS),
    claimedAt: null,
    redeemedAt: null,
    voidedAt: null,
    pendingEmail: null,
    pendingToken: null,
    pendingSentAt: null,
    ...overrides,
  };
}

// An unclaimed gift, in date.
export const issuedGift = (): GiftRecord => giftRecord();

// An unclaimed gift with a confirmation outstanding.
export const pendingGift = (): GiftRecord =>
  giftRecord({
    pendingEmail: GIFT_FRIEND,
    pendingToken: GIFT_CONFIRM_TOKEN,
    pendingSentAt: new Date(GIFT_NOW.getTime() - 60_000),
  });

// A bound gift: claimed by the friend, unconsumed.
export const claimedGift = (): GiftRecord =>
  giftRecord({
    status: "claimed",
    claimantEmail: GIFT_FRIEND,
    claimedAt: new Date(GIFT_NOW.getTime() - DAY_MS),
  });

// A consumed gift: the report was delivered.
export const redeemedGift = (): GiftRecord =>
  giftRecord({
    status: "redeemed",
    claimantEmail: GIFT_FRIEND,
    claimedAt: new Date(GIFT_NOW.getTime() - 2 * DAY_MS),
    redeemedAt: new Date(GIFT_NOW.getTime() - DAY_MS),
  });

// Issued 31 days ago — past the 30-day validity.
export const expiredGift = (): GiftRecord =>
  giftRecord({ issuedAt: new Date(GIFT_NOW.getTime() - 31 * DAY_MS) });

// Claimed in time, never redeemed, now past day 30.
export const claimedExpiredGift = (): GiftRecord =>
  giftRecord({
    status: "claimed",
    claimantEmail: GIFT_FRIEND,
    claimedAt: new Date(GIFT_NOW.getTime() - 29 * DAY_MS),
    issuedAt: new Date(GIFT_NOW.getTime() - 31 * DAY_MS),
  });
