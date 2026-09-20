import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OEG Sync Tools",
  description: "ERP sync automations for DPP Projects Airtable base",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
