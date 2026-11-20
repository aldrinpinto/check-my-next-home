import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST } from "../app/contact/send/route";
import { CONTACT_ENTRY_COOKIE_NAME, decodeContactEntry } from "../lib/contact";
import { resetRateLimits } from "../lib/server/rate-limit";

// BUG-028 fix (founder ruling 19 Nov 2026) — the send
// route's answers, at the handler itself, in the gift
// routes tests' manner: redirects carry a RELATIVE
// Location; a refused submission carries the typed
// values back on the entry cookie; and the thanks'
// redirect (?sent=1) is earned only by a stored
// message — with no database configured the pool
// cannot even be built, so a valid submission must
// land on the failure answer, never the thanks. That
// last pin is the fix's honesty in one line: an
// unstored message cannot be thanked for.

const LISTEN = "http://localhost:3000";

const savedDatabaseUrl = process.env.DATABASE_URL;

beforeAll(() => {
  // This file's valid-submission case is the no-store
  // case: the pool factory must refuse. (The unit
  // suite runs without a database; the store's real
  // insert is proven against one in db/prove.mjs and
  // the CI database job.)
  delete process.env.DATABASE_URL;
  resetRateLimits();
});

afterAll(() => {
  if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDatabaseUrl;
});

function contactRequest(fields: Record<string, string>, caller: string): Request {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return new Request(`${LISTEN}/contact/send`, {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": caller },
  });
}

function entryCookieValue(response: Response) {
  const header = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${CONTACT_ENTRY_COOKIE_NAME}=`));
  if (!header) return undefined;
  const raw = decodeURIComponent(header.split(";")[0].slice(CONTACT_ENTRY_COOKIE_NAME.length + 1));
  return decodeContactEntry(raw);
}

describe("the send route's answers", () => {
  it("a mistyped email: the error redirect is relative and the entry cookie rides it", async () => {
    const response = await POST(
      contactRequest(
        { name: "Alex Morgan", email: "name@exampl", message: "Hello, a question." },
        "203.0.113.10",
      ),
    );
    expect(response.status).toBe(303);
    const location = response.headers.get("location");
    expect(location).toBe("/contact?error=email");
    expect(location).not.toContain("://");
    // The values the re-served form will stand in its
    // fields — set on THIS response.
    expect(entryCookieValue(response)).toEqual({
      name: "Alex Morgan",
      email: "name@exampl",
      message: "Hello, a question.",
    });
  });

  it("an empty submission names every field, in the form's order", async () => {
    const response = await POST(
      contactRequest({ name: "", email: "", message: "" }, "203.0.113.11"),
    );
    expect(response.headers.get("location")).toBe("/contact?error=name,email,message");
  });

  it("a valid submission with no store behind it lands on the failure answer — never the thanks", async () => {
    const response = await POST(
      contactRequest(
        { name: "Alex Morgan", email: "alex@example.co.uk", message: "A real question." },
        "203.0.113.12",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/contact?sendfailed=1");
    // The typed values ride back (the BUG-029 pattern),
    // so the form under the failure line stands filled.
    expect(entryCookieValue(response)).toEqual({
      name: "Alex Morgan",
      email: "alex@example.co.uk",
      message: "A real question.",
    });
  });

  it("the caller's 121st post inside a minute is refused before anything is judged", async () => {
    const caller = "203.0.113.13";
    let last: Response | null = null;
    for (let i = 0; i < 120; i += 1) {
      last = await POST(contactRequest({ name: "", email: "", message: "" }, caller));
    }
    // The 120th still earns the validation answer…
    expect(last?.headers.get("location")).toBe("/contact?error=name,email,message");
    // …and the 121st is the rate limit's: the bare
    // failure answer, no fields judged, nothing stored.
    const limited = await POST(
      contactRequest(
        { name: "Alex Morgan", email: "alex@example.co.uk", message: "A real question." },
        caller,
      ),
    );
    expect(limited.headers.get("location")).toBe("/contact?sendfailed=1");
    expect(entryCookieValue(limited)).toBeUndefined();
  });
});
