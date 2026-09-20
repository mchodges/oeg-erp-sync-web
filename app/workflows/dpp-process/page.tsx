import type { Metadata } from "next";
import { FlowChart } from "../_components/FlowChart";
import { Legend } from "../_components/Legend";
import { dppProcess } from "../_data/dpp-process";

export const metadata: Metadata = {
  title: "DPP Process | OEG Workflows",
};

export default function DppProcessPage() {
  return (
    <main className="min-h-screen bg-white p-4 sm:p-6">
      <FlowChart data={dppProcess} />
      <Legend data={dppProcess} />
    </main>
  );
}
