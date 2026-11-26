"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import ShortlistCountBadge from "./ShortlistCountBadge";

// BUG-363 (26 Nov 2026, founder ruling): at phone width
// the header nav no longer wraps 4 + 1 — it collapses
// behind a hamburger. This island is the small client
// piece (the same pattern as ShortlistCountBadge): the
// header itself stays a server component, and this owns
// only the open state. Above the 30rem breakpoint the
// list is the desktop row exactly as before; below it
// the list is hidden until the button opens it as a
// full-width dropdown under the header. The toggle
// carries aria-expanded + aria-controls; the menu closes
// on a link tap, on Escape (focus returns to the
// button), and on a second tap. The Shortlist count
// badge stays visible in the closed header beside the
// button, so a saved home is never hidden behind the
// closed menu — the badge also still renders on the
// Shortlist row inside the open menu.
export type SiteNavItem = { label: string; href: string };

export default function SiteNav({
  items,
  shortlistCount,
}: {
  items: readonly SiteNavItem[];
  shortlistCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <nav className="site-nav" aria-label="Primary">
      <span className="site-nav__mobile">
        {shortlistCount !== undefined ? (
          <span className="shortlist-count">{shortlistCount}</span>
        ) : (
          <ShortlistCountBadge />
        )}
        <button
          ref={toggleRef}
          type="button"
          className="site-nav__toggle"
          aria-expanded={open}
          aria-controls="primary-nav-list"
          aria-label={open ? "Close menu" : "Menu"}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" />
            </svg>
          )}
        </button>
      </span>
      <ul
        id="primary-nav-list"
        className={open ? "site-nav__list site-nav__list--open" : "site-nav__list"}
      >
        {items.map((item) => (
          <li key={item.href}>
            <Link className="site-nav__link" href={item.href} onClick={() => setOpen(false)}>
              {item.label}
              {item.label === "Shortlist" &&
                (shortlistCount !== undefined ? (
                  <span className="shortlist-count">{shortlistCount}</span>
                ) : (
                  <ShortlistCountBadge />
                ))}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
