import type { Metadata } from "next";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, TEST_BANNER_TEXT, showTestBanner } from "../lib/site";
import { pageMetadata } from "../lib/seo";
import JsonLd from "./JsonLd";

// M2.11: page metadata comes from the SEO helper — every page gets its
// own title, description and canonical URL. The helper keeps play/test
// environments out of search engines (the M2.7 lockout) and indexes only
// the real site; public/_headers adds the X-Robots-Tag as a second
// layer, and app/robots.ts is the third.
export const metadata: Metadata = pageMetadata({
  title: `${SITE_NAME} — check what the listing doesn't tell you`,
  description: SITE_DESCRIPTION,
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
