import { describe, expect, it } from "vitest";

import { POST } from "../app/gift/[token]/claim/route";
import { GET } from "../app/gift/[token]/confirm/[pending]/route";
import { GIFT_ENTRY_COOKIE_NAME, giftClaimPath, giftConfirmPath } from "../lib/gift";
import { publicOriginOf } from "../lib/server/public-url";
import { GIFT_TOKEN } from "./fixtures/gift";

// The gift route handlers' URLs (Regression run
// 44535680408 follow-up, 19 Nov 2026). The handlers used
// to mint every redirect — and the confirmation email's
// link — from request.url, whose origin under
// `next start` is the server's LISTEN host
// ("localhost:3000" on the play server), not the public
// origin: the claim POST answered with a loopback
// Location, the browser navigated cross-host, and the
// one-shot entry cookie — set correctly, on the
// request's host — never reached the re-served page, so
// the mistyped-email spec found the field empty while
// every unit test passed (they inject the entry into
// the view; nothing exercised the cookie across the
// redirect). These tests pin the two rules of
// lib/server/public-url.ts at the handlers themselves:
// redirects carry a RELATIVE Location, and the emailed
// link's origin follows the forwarded headers.
//
// The requests below are addressed to the listen origin
// on purpose — that is the input that used to leak.

const LISTEN = "http://localhost:3000";

function claimRequest(email: string, caller: string): Request {
  const form = new FormData();
  form.set("email", email);
  return new Request(`${LISTEN}/gift/${GIFT_TOKEN}/claim`, {
    method: "POST",
    body: form,
    headers: { "cf-connecting-ip": caller },
  });
}

function entryCookieValue(response: Response): string | null {
  const header = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${GIFT_ENTRY_COOKIE_NAME}=`));
  if (!header) return null;
  return decodeURIComponent(header.split(";")[0].slice(GIFT_ENTRY_COOKIE_NAME.length + 1));
}

describe("the claim route's redirects are relative", () => {
  it("a malformed token bounces to the claim path, path only", async () => {
    const response = await POST(new Request(`${LISTEN}/gift/bad/claim`, { method: "POST" }), {
      params: Promise.resolve({ token: "bad" }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(giftClaimPath("bad"));
  });

  it("a mistyped email: the error redirect is relative and the entry cookie rides it", async () => {
    const response = await POST(claimRequest("name@exampl", "203.0.113.1"), {
      params: Promise.resolve({ token: GIFT_TOKEN }),
    });
    expect(response.status).toBe(303);
    const location = response.headers.get("location");
    expect(location).toBe(`${giftClaimPath(GIFT_TOKEN)}?error=email`);
    expect(location).not.toContain("://");
    // The cookie the page will read back — set on THIS
    // response, for the host the browser actually used.
    expect(entryCookieValue(response)).toBe("name@exampl");
  });
});

describe("the confirm route's redirects are relative", () => {
  it("a malformed pending token bounces to the claim path, path only", async () => {
    const response = await GET(new Request(`${LISTEN}/gift/${GIFT_TOKEN}/confirm/bad`), {
      params: Promise.resolve({ token: GIFT_TOKEN, pending: "bad" }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(giftClaimPath(GIFT_TOKEN));
  });
});

describe("the confirmation email's link origin (publicOriginOf)", () => {
  it("follows the forwarded host and proto, never the listen origin", () => {
    const request = new Request(`${LISTEN}/gift/${GIFT_TOKEN}/claim`, {
      headers: {
        "x-forwarded-host": "play.checkmynexthome.co.uk",
        "x-forwarded-proto": "https",
      },
    });
    const confirmUrl = `${publicOriginOf(request)}${giftConfirmPath(GIFT_TOKEN, "pending-1")}`;
    expect(confirmUrl).toBe(
      `https://play.checkmynexthome.co.uk/gift/${GIFT_TOKEN}/confirm/pending-1`,
    );
    expect(confirmUrl).not.toContain("localhost");
  });

  it("takes the first forwarded host where a proxy chain lists several", () => {
    const request = new Request(`${LISTEN}/gift/${GIFT_TOKEN}/claim`, {
      headers: {
        "x-forwarded-host": "play.checkmynexthome.co.uk, tunnel.internal",
        "x-forwarded-proto": "https, http",
      },
    });
    expect(publicOriginOf(request)).toBe("https://play.checkmynexthome.co.uk");
  });

  it("falls back to the Host header and the request's own scheme (the harness form)", () => {
    const request = new Request(`http://127.0.0.1:4173/gift/${GIFT_TOKEN}/claim`);
    expect(publicOriginOf(request)).toBe("http://127.0.0.1:4173");
  });
});
