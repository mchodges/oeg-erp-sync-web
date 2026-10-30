"use client";

import { useState } from "react";
import { IngestPanel } from "./IngestPanel";
import { EstimatePanel } from "./EstimatePanel";
import { TrendsPanel } from "./TrendsPanel";
import { AboutPanel } from "./AboutPanel";

type Mode = "ingest" | "estimate" | "trends" | "about";

export default function PricingPage() {
  const [mode, setMode] = useState<Mode>("ingest");

  const tab = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        mode === m
          ? "bg-indigo-600 text-white"
          : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-[1800px] mx-auto px-6 py-8 space-y-5">
        <div className="flex items-center gap-2">
          {tab("ingest", "Ingest")}
          {tab("estimate", "Estimate")}
          {tab("trends", "Trends")}
          {tab("about", "About")}
        </div>

        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">Order of work:</span> 1. Ingest new bid tabs and review the AI
          matches &rarr; 2. Estimate prices and write them to the Master Catalog. Trends charts price movement over time.
        </p>

        {mode === "ingest" ? (
          <IngestPanel />
        ) : mode === "trends" ? (
          <div className="max-w-6xl">
            <TrendsPanel />
          </div>
        ) : mode === "about" ? (
          <div className="max-w-3xl">
            <AboutPanel />
          </div>
        ) : (
          <div className="max-w-5xl">
            <EstimatePanel />
          </div>
        )}
      </div>
    </main>
  );
}
