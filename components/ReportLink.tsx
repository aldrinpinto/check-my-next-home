"use client";

import type { ReactNode } from "react";

import { fireJourneyEvent } from "./JourneyBeacon";

// A "Get the full report" link that counts its click
// (plan step M7.14: report_clicked). It renders exactly
// the anchor it replaces — same class, same href, same
// children — with the counting on the click; navigation
// is untouched, and a failed count never blocks the
// visitor's way to the report door.
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
    <a
      className={className}
      href={href}
      onClick={() => {
        fireJourneyEvent("report_clicked");
      }}
    >
      {children}
    </a>
  );
}
