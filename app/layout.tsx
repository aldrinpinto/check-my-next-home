import "./globals.css";
import { TEST_LABEL_TEXT, showTestLabel } from "../lib/site";
import JsonLd from "./JsonLd";
import SiteChrome from "../components/SiteChrome";

// M7.8: the layout carries NO metadata of its own. Until
// this step it consumed the locked homepage entry for every
// route (the homepage was the only page that existed when
// the helper landed); metadata has now moved into the
// pages, as the helper's design always intended — every
// page exports its own locked pair through pageMetadata(),
// and the journey pages export explicit noindex metadata.
// No default title or description may ever be added here:
// a shared default is exactly the duplication the SEO
// helper exists to prevent.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body>
        {showTestLabel() && (
          <div className="test-label" role="note">
            {TEST_LABEL_TEXT}
          </div>
        )}
        {/* The chrome wears the samples' two families
            (D2, parity fix stack, 18 Nov 2026): the
            content chrome on the .site-pages routes, the
            app chrome everywhere else — SiteChrome makes
            the switch by route. */}
        <SiteChrome>{children}</SiteChrome>
        <JsonLd />
      </body>
    </html>
  );
}
