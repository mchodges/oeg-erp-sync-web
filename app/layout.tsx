import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OEG Sync Tools",
  description: "Internal OEG tools: ERP syncs, bid pricing and process workflows",
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
