import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./Nav";

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
      <body className="antialiased">
        <header className="bg-indigo-700 px-6 py-3 shadow">
          <h1 className="text-lg font-semibold text-white tracking-tight">
            OEG Sync Tools
          </h1>
          <p className="text-indigo-300 text-xs mt-0.5">DPP Projects Airtable</p>
        </header>
        <Nav />
        {children}
      </body>
    </html>
  );
}
