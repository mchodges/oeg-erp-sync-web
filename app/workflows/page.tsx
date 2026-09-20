import Link from "next/link";
import type { Metadata } from "next";
import { dppProcess } from "./_data/dpp-process";
import type { FlowChartData } from "./_data/types";

export const metadata: Metadata = {
  title: "Workflows | OEG Sync Tools",
};

const flowcharts: FlowChartData[] = [dppProcess];

export default function WorkflowsIndexPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Process Workflows</h1>
            <p className="mt-1 text-sm text-gray-500">
              Interactive process flowcharts. Each page below is meant to be embedded directly into a SharePoint
              site via the Embed web part — use its URL as the embed source.
            </p>
          </div>
          <Link href="/" className="shrink-0 text-sm text-indigo-600 hover:text-indigo-800">
            ← OEG Sync Tools
          </Link>
        </div>

        <ul className="space-y-3">
          {flowcharts.map((fc) => (
            <li key={fc.slug}>
              <Link
                href={`/workflows/${fc.slug}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
              >
                <div className="font-medium text-gray-900">{fc.title}</div>
                {fc.description && <div className="mt-0.5 text-sm text-gray-500">{fc.description}</div>}
                <div className="mt-2 font-mono text-xs text-gray-400">/workflows/{fc.slug}</div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
