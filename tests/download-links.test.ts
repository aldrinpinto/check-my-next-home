import { describe, expect, it } from "vitest";

import { DOWNLOAD_LINK_VALIDITY_MS } from "../lib/download";
import { createDownloadSigner } from "../lib/server/download-links";
import { DOWNLOAD_NOW, DOWNLOAD_OTHER_SECRET, DOWNLOAD_SECRET } from "./fixtures/download";

// M8.6 — the signer: a minted link verifies, lives
// exactly seven days, and dies on its own day; anything
// not genuine — tampered payload, tampered signature,
// a different secret, a made-up string — is the one
// "invalid" answer. All secrets here are the fixture's
// throwaways; K16's real value is never in this suite.

const signer = createDownloadSigner(DOWNLOAD_SECRET);
const DELIVERY_ID = "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1";
const DAY_MS = 24 * 60 * 60 * 1000;

describe("mint and verify", () => {
  it("round-trips: a fresh link is ok, carrying the id and its seventh day", () => {
    const { token, expiresAt } = signer.mint(DELIVERY_ID, DOWNLOAD_NOW);
    expect(expiresAt.getTime()).toBe(DOWNLOAD_NOW.getTime() + DOWNLOAD_LINK_VALIDITY_MS);
    expect(signer.verify(token, DOWNLOAD_NOW)).toEqual({
      kind: "ok",
      deliveryId: DELIVERY_ID,
      expiresAt,
    });
    expect(signer.verify(token, new Date(DOWNLOAD_NOW.getTime() + 6 * DAY_MS)).kind).toBe("ok");
  });

  it("expires at the seventh day's instant, and stays expired after it", () => {
    const { token } = signer.mint(DELIVERY_ID, DOWNLOAD_NOW);
    const atExpiry = new Date(DOWNLOAD_NOW.getTime() + DOWNLOAD_LINK_VALIDITY_MS);
    expect(signer.verify(token, atExpiry).kind).toBe("expired");
    expect(signer.verify(token, new Date(atExpiry.getTime() + 30 * DAY_MS)).kind).toBe("expired");
    // An expired link still names its delivery — the
    // re-issue flow reads the id from a spent link.
    expect(signer.verify(token, atExpiry)).toMatchObject({
      kind: "expired",
      deliveryId: DELIVERY_ID,
    });
  });
});

describe("tampering is refused — one invalid answer for every forgery", () => {
  const { token } = signer.mint(DELIVERY_ID, DOWNLOAD_NOW);
  const [id, expiry, sig] = token.split(".") as [string, string, string];

  it("a changed delivery id does not verify", () => {
    const forged = `${id.startsWith("a") ? "b" : "a"}${id.slice(1)}.${expiry}.${sig}`;
    expect(signer.verify(forged, DOWNLOAD_NOW)).toEqual({ kind: "invalid" });
  });

  it("a changed expiry does not verify — a link cannot extend itself", () => {
    const forged = `${id}.${Number(expiry) + 365 * DAY_MS}.${sig}`;
    expect(signer.verify(forged, DOWNLOAD_NOW)).toEqual({ kind: "invalid" });
  });

  it("a changed signature does not verify", () => {
    const forged = `${id}.${expiry}.${sig.startsWith("a") ? "b" : "a"}${sig.slice(1)}`;
    expect(signer.verify(forged, DOWNLOAD_NOW)).toEqual({ kind: "invalid" });
  });

  it("a link minted under another secret does not verify", () => {
    const other = createDownloadSigner(DOWNLOAD_OTHER_SECRET).mint(DELIVERY_ID, DOWNLOAD_NOW);
    expect(signer.verify(other.token, DOWNLOAD_NOW)).toEqual({ kind: "invalid" });
  });

  it("made-up strings are refused before any crypto", () => {
    for (const junk of ["", "x7k2-together", "a.b.c", `${id}.${expiry}`, "....", token + "x"]) {
      expect(signer.verify(junk, DOWNLOAD_NOW)).toEqual({ kind: "invalid" });
    }
  });
});

describe("re-issue does not kill the old link", () => {
  it("two links over one delivery each live and die on their own seven days", () => {
    const first = signer.mint(DELIVERY_ID, DOWNLOAD_NOW);
    const reissuedAt = new Date(DOWNLOAD_NOW.getTime() + 3 * DAY_MS);
    const second = signer.mint(DELIVERY_ID, reissuedAt);
    expect(second.token).not.toBe(first.token);

    // The day the first link dies, the re-issued one
    // still has four days — minting the second never
    // shortened or lengthened the first.
    const daySeven = new Date(DOWNLOAD_NOW.getTime() + DOWNLOAD_LINK_VALIDITY_MS);
    expect(signer.verify(first.token, daySeven).kind).toBe("expired");
    expect(signer.verify(second.token, daySeven).kind).toBe("ok");
    expect(signer.verify(second.token, new Date(daySeven.getTime() + 3 * DAY_MS)).kind).toBe(
      "expired",
    );
  });
});
