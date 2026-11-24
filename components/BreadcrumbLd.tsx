import { breadcrumbSchema } from "../lib/seo";

// M7.8 — renders a page's BreadcrumbList structured data
// (lib/seo.ts). BUG-229 (24 Nov 2026): the same trail is
// now drawn visibly too (components/Breadcrumb) — the
// structured data matches the visible trail, so a guide
// page's list gains the Guides middle step (parents) that
// the M7.8 two-item form used to omit.
export default function BreadcrumbLd({
  name,
  path,
  parents = [],
}: {
  name: string;
  path: string;
  parents?: { name: string; path: string }[];
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(breadcrumbSchema({ name, path, parents })),
      }}
    />
  );
}
