import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import RedirectTo from "../components/RedirectTo";
import { redirectFrameKind, redirectOrRender } from "../lib/redirect-or-render";

// BUG-396 (27 Nov 2026): the "Opening your check…"
// interstitial must not appear in the search → checking
// journey. The redirect helper's plain-load branch used
// to render that line beside the client-side navigation;
// it now renders the destination's own checking frame
// (or nothing, where no check is opening) and the
// navigation. These tests pin the branch's output —
// rendered to static markup, as the BUG-268 pins do —
// plus the RSC branch's redirect (the BUG-186 landing
// guarantee: the mechanism is unchanged, only the
// visible content beside it).
//
// The helper reads request headers, so next/headers and
// next/navigation are mocked: headers() answers from
// the hoisted state (RSC or plain), redirect() throws
// the NEXT_REDIRECT digest exactly as the real one
// does, and useRouter() hands out a replace spy.

const { mockHeadersState, mockReplace } = vi.hoisted(() => ({
  mockHeadersState: { rsc: false },
  mockReplace: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(mockHeadersState.rsc ? { rsc: "1" } : {}),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT;replace;${url};307;`);
  },
  useRouter: () => ({ replace: mockReplace }),
}));

function findRedirectTo(node: unknown): ReactElement | null {
  if (node === null || typeof node !== "object") return null;
  const element = node as ReactElement;
  if (element.type === RedirectTo) return element;
  const children = (element.props as { children?: unknown } | null)?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findRedirectTo(child);
      if (found) return found;
    }
  } else if (children !== undefined) {
    return findRedirectTo(children);
  }
  return null;
}

describe("BUG-396 — redirectFrameKind picks the destination's checking frame", () => {
  it("home routes take the home frame", () => {
    expect(redirectFrameKind("/search/home?postcode=CM3+2JT")).toBe("home");
    expect(redirectFrameKind("/search/home?postcode=CM3+2JT&home=19%7C%7CBIRKDALE+RISE")).toBe(
      "home",
    );
  });

  it("other /search routes take the wider-area frame", () => {
    expect(redirectFrameKind("/search?outward=CM3")).toBe("district");
    expect(redirectFrameKind("/search?postcode=CM3+2JT")).toBe("district");
    expect(redirectFrameKind("/search?place=Hatfield+Peverel")).toBe("district");
    expect(redirectFrameKind("/search")).toBe("district");
  });

  it("non-check destinations take no frame", () => {
    expect(redirectFrameKind("/?notice=unplaced")).toBeNull();
    expect(redirectFrameKind("/")).toBeNull();
  });
});

describe("BUG-396 — redirectOrRender plain-load branch carries no interstitial line", () => {
  it("home destination renders the home checking frame, not the line", async () => {
    mockHeadersState.rsc = false;
    const html = renderToStaticMarkup(await redirectOrRender("/search/home?postcode=CM3+2JT"));
    expect(html).not.toContain("Opening your check");
    expect(html).toContain("Your check is under way");
  });

  it("district destination renders the wider-area checking frame, not the line", async () => {
    mockHeadersState.rsc = false;
    const html = renderToStaticMarkup(await redirectOrRender("/search?outward=CM3"));
    expect(html).not.toContain("Opening your check");
    expect(html).toContain("Checking the wider area…");
  });

  it("landing destination renders no frame and no line", async () => {
    mockHeadersState.rsc = false;
    const html = renderToStaticMarkup(await redirectOrRender("/?notice=unplaced"));
    expect(html).not.toContain("Opening your check");
    expect(html).not.toContain("Your check is under way");
    expect(html).not.toContain("Checking the wider area");
  });

  it("the client-side navigation still fires for plain loads (BUG-186)", async () => {
    mockHeadersState.rsc = false;
    const url = "/search/home?postcode=CM3+2JT";
    const element = await redirectOrRender(url);
    const nav = findRedirectTo(element);
    expect(nav).not.toBeNull();
    expect((nav?.props as { to?: string } | null)?.to).toBe(url);
  });
});

describe("BUG-396 — RSC navigations still redirect (BUG-186 landing guarantee)", () => {
  it("throws the NEXT_REDIRECT digest naming the destination", async () => {
    mockHeadersState.rsc = true;
    await expect(redirectOrRender("/search/home?postcode=CM3+2JT")).rejects.toThrow(
      "NEXT_REDIRECT;replace;/search/home?postcode=CM3+2JT;307;",
    );
  });
});
