import { breadcrumbSchema } from "../lib/seo";

// M7.8 — renders a page's BreadcrumbList structured data
// (lib/seo.ts). Structured data only: no visible breadcrumb
// trail exists anywhere on the site — the finalised samples
// show none, and the schema's trail is the honest two-item
// form (Home → this page).
export default function BreadcrumbLd({ name, path }: { name: string; path: string }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema({ name, path })) }}
    />
  );
}
