import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Check My Next Home — check what the listing doesn't tell you",
  description:
    "Your family's next home — check what the listing doesn't tell you. Schools, flooding, crime counts, sold prices, broadband and more, checked from one postcode.",
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
