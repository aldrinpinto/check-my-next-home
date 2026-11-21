// The download link signer (plan step M8.6, Key K16).
//
// A delivered report's link is a signed token: the
// delivery's id and the link's expiry instant, carried
// in the open, with an HMAC-SHA256 signature over both
// keyed by the report download signing secret (K16 —
// REPORT_SIGNING_SECRET in the server's secret file;
// .env.example carries the blank). The secret's value
// never appears in the repo, the logs or a fixture:
// this module reads it from the environment at the
// factory, and the build's tests inject a throwaway.
//
// Verification is STATELESS — no database read — which
// is what makes the flow's rules cheap to keep:
//   - The expiry rides inside the signed payload, so a
//     link dies on its own seventh day whatever else
//     happens, and the report behind it never expires
//     (a fresh link is a new token over the same
//     delivery, minted by the re-issue flow).
//   - Re-issuing mints a NEW token; it cannot touch the
//     old one, so the old link keeps working until its
//     own expiry — there is nothing to revoke.
//   - A signature that does not verify is one answer —
//     "invalid" — for a made-up link, a mistyped one
//     and a tampered one alike: the landing page serves
//     the site's error page for all three, and nothing
//     about the difference is given away.
//
// The comparison is timing-safe, and a token that
// fails the form check (lib/download.ts's
// DOWNLOAD_TOKEN_FORM) is refused before any crypto is
// spent on it.

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  DOWNLOAD_LINK_VALIDITY_MS,
  isDownloadTokenForm,
  type DownloadVerification,
} from "../download";

export interface DownloadSigner {
  // Mint a fresh token for a delivery, living from
  // `issuedAt` for the link's seven days.
  mint(deliveryId: string, issuedAt: Date): { token: string; expiresAt: Date };
  // The three-state answer the landing page serves by:
  // genuine and in date, genuine but spent, or not
  // genuine at all.
  verify(token: string, now: Date): DownloadVerification;
}

function signature(secret: string, deliveryId: string, expiresAtMs: number): string {
  return createHmac("sha256", secret)
    .update(`${deliveryId}.${expiresAtMs}`, "utf8")
    .digest("base64url");
}

export function createDownloadSigner(secret: string): DownloadSigner {
  return {
    mint(deliveryId, issuedAt) {
      const expiresAt = new Date(issuedAt.getTime() + DOWNLOAD_LINK_VALIDITY_MS);
      const expiresAtMs = expiresAt.getTime();
      return {
        token: `${deliveryId}.${expiresAtMs}.${signature(secret, deliveryId, expiresAtMs)}`,
        expiresAt,
      };
    },

    verify(token, now) {
      if (!isDownloadTokenForm(token)) return { kind: "invalid" };
      const [deliveryId, expiresPart, presented] = token.split(".") as [string, string, string];
      const expiresAtMs = Number(expiresPart);
      if (!Number.isSafeInteger(expiresAtMs)) return { kind: "invalid" };
      const expected = signature(secret, deliveryId, expiresAtMs);
      const presentedBytes = Buffer.from(presented, "utf8");
      const expectedBytes = Buffer.from(expected, "utf8");
      if (
        presentedBytes.length !== expectedBytes.length ||
        !timingSafeEqual(presentedBytes, expectedBytes)
      ) {
        return { kind: "invalid" };
      }
      const expiresAt = new Date(expiresAtMs);
      // In date strictly before the expiry instant — at
      // the instant itself the link is spent (the gift
      // lifecycle's boundary rule, D21).
      return now.getTime() < expiresAtMs
        ? { kind: "ok", deliveryId, expiresAt }
        : { kind: "expired", deliveryId, expiresAt };
    },
  };
}

// The environment's signer: K16 from the server's
// secret file. Absent (an unconfigured environment),
// there is no signer — no link can be minted and none
// verifies, so every presented link takes the
// not-recognised answer. The value is read here and
// nowhere else, and is never logged.
export function getDownloadSigner(): DownloadSigner | null {
  const { REPORT_SIGNING_SECRET: secret } = process.env;
  return secret ? createDownloadSigner(secret) : null;
}
