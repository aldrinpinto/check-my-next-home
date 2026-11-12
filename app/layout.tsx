import type { Metadata } from "next";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME } from "../lib/site";

export const metadata: Metadata = {
  title: `${SITE_NAME} — check what the listing doesn't tell you`,
  description: SITE_DESCRIPTION,
  // M2.7: the play site must never be listed by search engines. The
  // production site removes this when it goes public at launch (M13);
  // the X-Robots-Tag header in public/_headers is the second layer.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
