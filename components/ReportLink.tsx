"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { fireJourneyEvent } from "./JourneyBeacon";

// A "Get the full report" link that counts its click
// (plan step M7.14: report_clicked). It renders exactly
// the anchor it replaces — same class, same href, same
// children — with the counting on the click; a failed
// count never blocks the visitor's way to the report
// door. BUG-402 (28 Nov 2026): the anchor is next/link,
// not a plain <a> — a plain anchor navigates by full
// document load, which destroys the router cache holding
// the page the buyer came from, so Back to the results
// forced a full server re-render and the "Opening your
// results…" fallback. A client-side navigation keeps the
// results entry in the segment cache, and Back restores
// the rendered results directly. prefetch={false}: the
// payment page's render reads the gift and fulfilment
// stores — work for a click, never for a viewport
// sighting.
export default function ReportLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      className={className}
      href={href}
      prefetch={false}
      onClick={() => {
        fireJourneyEvent("report_clicked");
      }}
    >
      {children}
    </Link>
  );
}
