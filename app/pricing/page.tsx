"use client";

import { useState } from "react";
import { IngestPanel } from "./IngestPanel";
import { EstimatePanel } from "./EstimatePanel";

type Mode = "ingest" | "estimate";

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
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center gap-2">
          {tab("ingest", "Ingest")}
          {tab("estimate", "Estimate")}
        </div>

        {mode === "ingest" ? <IngestPanel /> : <EstimatePanel />}
      </div>
    </main>
  );
}
