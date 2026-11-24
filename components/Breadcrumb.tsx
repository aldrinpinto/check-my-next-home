import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

// BUG-229 (24 Nov 2026) — the visible breadcrumb trail,
// drawn under the header, above the page title, on every
// content page that carries the structured-data trail (the
// check pages, the three guides, the /guides hub and the
// chrome pages). One small line in the samples' own
// language: small print, Forest links, Brass separators,
// the current page as plain text — never a link — with
// aria-current="page". The trail it draws is the same
// trail lib/seo.ts emits as structured data, so the two
// can never disagree: guide pages take Home → Guides →
// guide, check and chrome pages take Home → page (a check
// page has no single honest parent — it is reached from
// guides, the report and search — so no Guides middle
// item is forced in front of it).
//
// On phones the trail shortens rather than wrapping: the
// line is one row with overflow hidden, the leading items
// never shrink, and only the current page's name
// truncates with an ellipsis (its H1 stands directly
// below, so nothing is lost).
export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.label}>
              {index > 0 && (
                <span className="breadcrumb__sep" aria-hidden="true">
                  {"›"}
                </span>
              )}
              {isLast || !item.href ? (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              ) : (
                <Link href={item.href}>{item.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
