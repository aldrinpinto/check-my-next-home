"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

// The chrome switch (D2, parity fix stack, 18 Nov 2026).
// The samples carry two chrome families: the app chrome
// (views 1–3, 13–16 — landing, the journey, the shortlist)
// and the content chrome (views 4–8 — the site pages).
// Every route whose page renders <main className=
// "site-pages"> wears the content chrome; everything else
// keeps the app chrome exactly as it was. The switch is
// this client wrapper because the layout cannot know the
// route's family without it; the header and footer render
// their variant from the same prefix list, so the two can
// never disagree.
const CONTENT_PREFIXES = [
  "/about",
  "/how-we-check",
  "/contact",
  "/privacy",
  "/sample-report",
  "/guides",
  "/check",
] as const;

function isContentPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return CONTENT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const content = isContentPath(pathname);
  return (
    <>
      <SiteHeader
        variant={content ? "content" : "app"}
        currentPath={content ? (pathname ?? undefined) : undefined}
      />
      {children}
      <SiteFooter variant={content ? "content" : "app"} />
    </>
  );
}
