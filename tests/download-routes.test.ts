import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as fileGET } from "../app/report/download/[token]/file/route";
import { POST as reissuePOST } from "../app/report/download/[token]/reissue/route";
import { downloadPath } from "../lib/download";
import { createDownloadSigner } from "../lib/server/download-links";
import { resetRateLimits } from "../lib/server/rate-limit";
import { DOWNLOAD_SECRET } from "./fixtures/download";

// M8.6 — the download routes at the handlers
// themselves (the gift routes' test pattern): the
// file route bounces anything but a genuine in-date
// link back to the landing page, and the re-issue
// route refuses a link that is not genuine while
// answering every genuine one — matched, unmatched or
// machinery-down — with the identical redirect to the
// sent presentation.
//
// The environment carries the fixture's THROWAWAY
// secret (K16's real value is never in this suite) and
// no database: the service behind a genuine re-issue
// therefore fails inside the route's guard, which is
// itself one of the pinned cases — the uniform answer
// stands even then.

const LISTEN = "http://localhost:3000";
const signer = createDownloadSigner(DOWNLOAD_SECRET);
const DELIVERY_ID = "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1";

// The handlers verify against the wall clock, so the
// tokens are minted against it too: one live, one
// thirty days old and therefore spent.
const live = signer.mint(DELIVERY_ID, new Date()).token;
const spent = signer.mint(DELIVERY_ID, new Date(Date.now() - 30 * 86_400_000)).token;
const [id, expiry, sig] = live.split(".") as [string, string, string];
const forged = `${id}.${expiry}.${sig.startsWith("a") ? "b" : "a"}${sig.slice(1)}`;

beforeEach(() => {
  vi.stubEnv("REPORT_SIGNING_SECRET", DOWNLOAD_SECRET);
  resetRateLimits();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function reissueRequest(token: string, email: string, caller: string): Request {
  const form = new FormData();
  form.set("email", email);
  return new Request(`${LISTEN}/report/download/${token}/reissue`, {
    method: "POST",
    body: form,
    headers: { "cf-connecting-ip": caller },
  });
}

describe("the file route", () => {
  it("bounces a tampered link to the landing page, path only", async () => {
    const response = await fileGET(new Request(`${LISTEN}/report/download/${forged}/file`), {
      params: Promise.resolve({ token: forged }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(downloadPath(forged));
  });

  it("bounces an expired link to the landing page, which serves its expired card", async () => {
    const response = await fileGET(new Request(`${LISTEN}/report/download/${spent}/file`), {
      params: Promise.resolve({ token: spent }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(downloadPath(spent));
  });

  it("bounces a made-up link the same way", async () => {
    const response = await fileGET(new Request(`${LISTEN}/report/download/x7k2-together/file`), {
      params: Promise.resolve({ token: "x7k2-together" }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(downloadPath("x7k2-together"));
  });
});

describe("the re-issue route", () => {
  it("refuses a tampered link: back to the landing page, NO sent flag", async () => {
    const response = await reissuePOST(
      reissueRequest(forged, "buyer@example.co.uk", "203.0.113.9"),
      { params: Promise.resolve({ token: forged }) },
    );
    expect(response.status).toBe(303);
    const location = response.headers.get("location");
    expect(location).toBe(downloadPath(forged));
    expect(location).not.toContain("sent=1");
  });

  it("answers a genuine expired link with the uniform sent redirect", async () => {
    const response = await reissuePOST(
      reissueRequest(spent, "buyer@example.co.uk", "203.0.113.10"),
      { params: Promise.resolve({ token: spent }) },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${downloadPath(spent)}?sent=1`);
  });

  it("the answer is identical for an address that matches nothing", async () => {
    const response = await reissuePOST(
      reissueRequest(spent, "nobody@example.co.uk", "203.0.113.11"),
      { params: Promise.resolve({ token: spent }) },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${downloadPath(spent)}?sent=1`);
  });
});
