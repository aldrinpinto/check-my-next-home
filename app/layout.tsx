import type { Metadata } from "next";
import "./globals.css";
import { TEST_BANNER_TEXT, showTestBanner } from "../lib/site";
import { HOME_PAGE_SEO, pageMetadata } from "../lib/seo";
import JsonLd from "./JsonLd";

// M2.11: page metadata comes from the SEO helper — every page gets its
// own title, description and canonical URL. The helper keeps play/test
// environments out of search engines (the M2.7 lockout) and indexes only
// the real site; public/_headers adds the X-Robots-Tag as a second
// layer, and app/robots.ts is the third.
//
// M6.10 (D38): the layout consumes the LOCKED homepage entry
// (PAGE_SEO["/"] — its title leads with the D12 tagline). Titles and
// descriptions are per-page, set by the page, never inherited from
// this layout: the layout carries the homepage's entry only because
// the homepage is the only page that exists today, and M7 performs
// the move of metadata into the pages. No default title or
// description may ever be added here.
export const metadata: Metadata = pageMetadata({
  title: HOME_PAGE_SEO.title,
  description: HOME_PAGE_SEO.description,
  path: "/",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body>
        {showTestBanner() && (
          <div className="test-banner" role="note">
            {TEST_BANNER_TEXT}
          </div>
        )}
        {children}
        <JsonLd />
      </body>
    </html>
  );
}
