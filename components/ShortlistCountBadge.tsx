"use client";

import { useEffect, useState } from "react";

import { loadShortlist, subscribeShortlistChanged } from "../lib/shortlist";

// The header's shortlist count (plan step M7.5, fold-in 2):
// a small client island inside the header's Shortlist link.
// The server-rendered header cannot read browser storage,
// so the badge appears once this island has read the list —
// through the same .shortlist-count markup the header's
// shortlistCount prop renders — and it stays current on the
// cross-tab storage event plus the same-tab update signal
// every shortlist write fires. The badge shows only when
// the count is 1 or more; the nav item itself is unchanged
// on every page.
export default function ShortlistCountBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const read = () => {
      const load = loadShortlist();
      setCount(load.status === "ok" ? load.record.cards.length : 0);
    };
    read();
    return subscribeShortlistChanged(read);
  }, []);

  if (count === null || count < 1) return null;
  return <span className="shortlist-count">{count}</span>;
}
