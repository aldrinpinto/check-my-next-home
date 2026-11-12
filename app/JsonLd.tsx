import { ORGANIZATION_SCHEMA, WEBSITE_SCHEMA } from "../lib/seo";

// M2.11 — renders the sitewide structured data (Organization + WebSite)
// as JSON-LD in every page's output. The schema objects are plain data
// in lib/seo.ts so tests can validate them without rendering.
export default function JsonLd() {
  return (
    <>
      {[ORGANIZATION_SCHEMA, WEBSITE_SCHEMA].map((schema) => (
        <script
          key={schema["@type"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
