import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OEG ERP Hours Sync",
  description: "Sync ERP time report hours into Airtable",
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
