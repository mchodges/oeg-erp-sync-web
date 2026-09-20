import type { FlowChartData } from "../_data/types";
import { PARTY_NAMES } from "../_data/types";

function usedParties(data: FlowChartData) {
  const seen = new Set<string>();
  for (const lane of data.lanes) for (const n of lane.nodes) seen.add(n.party);
  return Object.entries(PARTY_NAMES).filter(([code]) => seen.has(code));
}

function hasDashed(data: FlowChartData) {
  return data.lanes.some((lane) => lane.nodes.some((n) => n.dashed));
}

export function Legend({ data }: { data: FlowChartData }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
      <div className="flex items-center gap-1.5">
        <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
          <rect x="1" y="1" width="18" height="12" rx="3" fill="white" stroke="#64748b" strokeWidth="1.5" />
        </svg>
        Process step
      </div>
      <div className="flex items-center gap-1.5">
        <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden="true">
          <polygon points="10,1 19,8 10,15 1,8" fill="white" stroke="#64748b" strokeWidth="1.5" />
        </svg>
        Decision point
      </div>
      {hasDashed(data) && (
        <div className="flex items-center gap-1.5">
          <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
            <rect x="1" y="1" width="18" height="12" rx="3" fill="white" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          As-needed step
        </div>
      )}

      <span className="hidden sm:inline text-slate-300">|</span>

      {usedParties(data).map(([code, name]) => (
        <div key={code} className="flex items-center gap-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 bg-white text-[9px] font-bold text-slate-700">
            {code}
          </span>
          <span>{name}</span>
        </div>
      ))}
    </div>
  );
}
