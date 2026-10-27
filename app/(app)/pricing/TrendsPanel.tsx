"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MasterCatalogOption } from "@/types";
import {
  bidPeriodLabel,
  buildPeriods,
  type Granularity,
  type TrendData,
  type TrendItem,
  type TrendPeriod,
} from "@/lib/priceTrend";
import { Card, ErrorCard, Spinner } from "./ui";
import { MasterItemPicker } from "./MasterItemPicker";

const W = 960;
const H = 340;
const M = { left: 64, right: 20, top: 16, bottom: 40 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const LINE = "#4f46e5";
const BAND = "#e0e7ff";
const DOT = "#9ca3af";
const GRID = "#f3f4f6";
const TEXT = "#6b7280";

function money(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n >= 1000 ? 0 : 2, maximumFractionDigits: n >= 1000 ? 0 : 2 });
}

function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const rough = span / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** Runs of consecutive periods that have data, so a quiet period breaks the line instead of bridging it. */
function runs(periods: TrendPeriod[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  periods.forEach((p, i) => {
    if (p.median !== null) cur.push(i);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-gray-300 overflow-hidden">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-medium border-r last:border-r-0 border-gray-300 ${
            o.value === value ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chart({ item, periods, g }: { item: TrendItem; periods: TrendPeriod[]; g: Granularity }) {
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const filled = periods.filter((p) => p.median !== null);
    if (filled.length === 0) return null;
    // Bids far above the middle half would flatten the chart, so the scale follows the
    // middle half plus a Tukey-style margin; anything beyond is counted below the chart.
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of filled) {
      const iqr = (p.p75 as number) - (p.p25 as number);
      lo = Math.min(lo, Math.max(p.low as number, (p.p25 as number) - 1.5 * iqr));
      hi = Math.max(hi, Math.min(p.high as number, (p.p75 as number) + 1.5 * iqr));
    }
    const pad = (hi - lo) * 0.08 || Math.max(hi * 0.1, 1);
    lo = Math.max(0, lo - pad);
    hi += pad;
    const ticks = niceTicks(lo, hi);
    const top = Math.max(hi, ticks[ticks.length - 1]);
    const bottom = Math.min(lo, ticks[0]);
    return { ticks, top, bottom };
  }, [periods]);

  if (!geometry) return null;
  const { ticks, top, bottom } = geometry;

  const slot = PLOT_W / periods.length;
  const x = (i: number) => M.left + slot * (i + 0.5);
  const y = (v: number) => M.top + PLOT_H * (1 - (v - bottom) / (top - bottom || 1));

  // Raw bids inside the shown periods (and the scale), so the spread behind each median is visible.
  const periodIndexByKey = new Map<string, number>();
  periods.forEach((p, i) => periodIndexByKey.set(p.label, i));
  let outside = 0;
  const dots: { cx: number; cy: number; key: string }[] = [];
  item.bids.forEach((b, k) => {
    const i = periodIndexByKey.get(bidPeriodLabel(b.date, g));
    if (i === undefined) return;
    if (b.price > top || b.price < bottom) {
      outside++;
      return;
    }
    // A fixed pseudo-random offset keeps overlapping bids from stacking into one dot.
    const jitter = (((k * 37) % 21) - 10) / 10;
    dots.push({ cx: x(i) + jitter * Math.min(slot * 0.28, 18), cy: y(b.price), key: String(k) });
  });

  const labelEvery = Math.max(1, Math.ceil(periods.length / 12));
  const segs = runs(periods);
  const hp = hover !== null ? periods[hover] : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.floor((px - M.left) / slot);
    setHover(i >= 0 && i < periods.length ? i : null);
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Price trend for ${item.name}: median by ${g}, with the middle half of bids shaded. A table of the same numbers follows.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={TEXT}>
              {money(t)}
            </text>
          </g>
        ))}
        {periods.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.key} x={x(i)} y={H - M.bottom + 20} textAnchor="middle" fontSize={11} fill={TEXT}>
              {p.label}
            </text>
          ) : null,
        )}

        {/* the middle half of the bids in each period */}
        {segs.map((run, r) =>
          run.length === 1 ? (
            <rect
              key={`b${r}`}
              x={x(run[0]) - 10}
              width={20}
              y={y(periods[run[0]].p75 as number)}
              height={Math.max(2, y(periods[run[0]].p25 as number) - y(periods[run[0]].p75 as number))}
              fill={BAND}
              rx={3}
            />
          ) : (
            <path
              key={`b${r}`}
              fill={BAND}
              d={
                run.map((i, k) => `${k === 0 ? "M" : "L"}${x(i)},${y(periods[i].p75 as number)}`).join(" ") +
                " " +
                [...run].reverse().map((i) => `L${x(i)},${y(periods[i].p25 as number)}`).join(" ") +
                " Z"
              }
            />
          ),
        )}

        {dots.map((d) => (
          <circle key={d.key} cx={d.cx} cy={d.cy} r={2.5} fill={DOT} opacity={0.55} />
        ))}

        {segs.map((run, r) =>
          run.length > 1 ? (
            <polyline
              key={`l${r}`}
              fill="none"
              stroke={LINE}
              strokeWidth={2}
              strokeLinejoin="round"
              points={run.map((i) => `${x(i)},${y(periods[i].median as number)}`).join(" ")}
            />
          ) : null,
        )}
        {periods.map((p, i) =>
          p.median === null ? null : (
            <circle
              key={p.key}
              cx={x(i)}
              cy={y(p.median)}
              r={hover === i ? 6 : 4.5}
              fill={p.thin ? "#ffffff" : LINE}
              stroke={p.thin ? LINE : "#ffffff"}
              strokeWidth={2}
            />
          ),
        )}

        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} stroke={LINE} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        )}
        {/* an invisible full-height column per period, so the hover target is bigger than the mark */}
        {periods.map((p, i) => (
          <rect key={`h${p.key}`} x={M.left + slot * i} y={M.top} width={slot} height={PLOT_H} fill="transparent" />
        ))}
      </svg>

      {hp && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: 8,
            transform: hover > periods.length / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          <p className="font-semibold text-gray-900">{hp.label}</p>
          {hp.median === null ? (
            <p className="mt-1 text-gray-500">No bids in this period.</p>
          ) : (
            <>
              <p className="mt-1 text-gray-700">
                Median <span className="font-semibold">{money(hp.median)}</span> / {item.unit}
              </p>
              <p className="text-gray-500">
                Middle half {money(hp.p25)} – {money(hp.p75)}
              </p>
              <p className="text-gray-500">
                Low {money(hp.low)} · High {money(hp.high)}
              </p>
              <p className="text-gray-500">
                {hp.n} bid{hp.n === 1 ? "" : "s"} from {hp.projects} project{hp.projects === 1 ? "" : "s"}
              </p>
              {hp.thin && <p className="mt-1 text-amber-700">Thin sample: treat this median with caution.</p>}
            </>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true">
            <line x1="0" x2="22" y1="5" y2="5" stroke={LINE} strokeWidth={2} />
          </svg>
          Median
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: BAND }} />
          Middle half of bids
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: DOT }} />
          Each bid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: LINE }} />
          Thin sample (under 3 bids or 2 projects)
        </span>
        {outside > 0 && <span>{outside} bid{outside === 1 ? "" : "s"} outside the chart range (in the table)</span>}
      </div>
    </div>
  );
}

export function TrendsPanel() {
  const [data, setData] = useState<TrendData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [itemId, setItemId] = useState("");
  const [g, setG] = useState<Granularity>("month");
  const [range, setRange] = useState<"12" | "all">("12");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/pricing/trends", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Server error ${res.status}`);
      const d = json as TrendData;
      setData(d);
      const firstBenchmark = d.benchmarks.find((b) => b.itemId && d.items.some((i) => i.id === b.itemId));
      const busiest = [...d.items].sort((a, b) => b.bids.length - a.bids.length)[0];
      setItemId((cur) => cur || firstBenchmark?.itemId || busiest?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const options: MasterCatalogOption[] = useMemo(
    () => (data?.items ?? []).map((i) => ({ id: i.id, name: i.name, unit: i.unit, category: i.category })),
    [data],
  );
  const item = data?.items.find((i) => i.id === itemId);

  const periods = useMemo(() => {
    if (!data || !item) return [];
    const keep = range === "all" ? null : g === "month" ? 12 : 4;
    return buildPeriods(item.bids, g, data.lastDate, keep);
  }, [data, item, g, range]);

  if (loading && !data) {
    return (
      <Card className="px-8 py-20 flex flex-col items-center gap-4">
        <Spinner />
        <p className="text-sm text-gray-500">Reading the bid history…</p>
      </Card>
    );
  }
  if (error) return <ErrorCard error={error} onRetry={load} />;
  if (!data) return null;

  const filled = periods.filter((p) => p.median !== null);
  const first = filled[0];
  const latest = filled[filled.length - 1];
  const change =
    first && latest && first !== latest && first.median ? ((latest.median as number) - first.median) / first.median : null;
  const totalBids = periods.reduce((s, p) => s + p.n, 0);

  return (
    <div className="space-y-4">
      <Card className="px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">Benchmarks</span>
          {data.benchmarks.map((b) => {
            const available = b.itemId && data.items.some((i) => i.id === b.itemId);
            return (
              <button
                key={b.key}
                type="button"
                disabled={!available}
                aria-pressed={b.itemId === itemId}
                onClick={() => b.itemId && setItemId(b.itemId)}
                title={available ? undefined : "No priced bids for this catalog item yet"}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  b.itemId === itemId
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Any item</span>
          <MasterItemPicker items={options} value={itemId} onChange={setItemId} />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Segmented
              label="Group bids by"
              value={g}
              onChange={setG}
              options={[
                { value: "month", label: "Monthly" },
                { value: "quarter", label: "Quarterly" },
              ]}
            />
            <Segmented
              label="Time range"
              value={range}
              onChange={setRange}
              options={[
                { value: "12", label: "Last 12 months" },
                { value: "all", label: "All history" },
              ]}
            />
          </div>
        </div>
      </Card>

      {!item ? (
        <Card className="px-6 py-12 text-center text-sm text-gray-400">No priced bids to chart yet.</Card>
      ) : (
        <Card className="px-6 py-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{item.name}</h2>
              <p className="text-xs text-gray-500">
                {item.category || "Uncategorized"} · price per {item.unit || "unit"}
              </p>
            </div>
            <dl className="flex gap-6 text-right">
              <div>
                <dt className="text-xs text-gray-500">Latest median{latest ? ` (${latest.label})` : ""}</dt>
                <dd className="text-lg font-semibold text-gray-900">{money(latest?.median ?? null)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Change since {first && first !== latest ? first.label : "start"}</dt>
                <dd className="text-lg font-semibold text-gray-900">
                  {change === null ? "—" : `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Bids shown</dt>
                <dd className="text-lg font-semibold text-gray-900">{totalBids}</dd>
              </div>
            </dl>
          </div>

          {filled.length < 2 && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Only {filled.length === 1 ? "one period" : "no periods"} of history so far for this item, so there is no trend to
              draw yet. The line fills in as older bid tabs are ingested.
            </p>
          )}

          <Chart item={item} periods={periods} g={g} />

          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-medium text-indigo-600">Show as a table</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4 font-medium">{g === "month" ? "Month" : "Quarter"}</th>
                    <th className="py-2 pr-4 font-medium text-right">Bids</th>
                    <th className="py-2 pr-4 font-medium text-right">Projects</th>
                    <th className="py-2 pr-4 font-medium text-right">Median</th>
                    <th className="py-2 pr-4 font-medium text-right">Middle half</th>
                    <th className="py-2 pr-4 font-medium text-right">Low</th>
                    <th className="py-2 font-medium text-right">High</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...periods].reverse().map((p) => (
                    <tr key={p.key} className={p.median === null ? "text-gray-400" : "text-gray-800"}>
                      <td className="py-1.5 pr-4">
                        {p.label}
                        {p.median !== null && p.thin && <span className="ml-1.5 text-amber-700">thin</span>}
                      </td>
                      <td className="py-1.5 pr-4 text-right">{p.n}</td>
                      <td className="py-1.5 pr-4 text-right">{p.projects}</td>
                      <td className="py-1.5 pr-4 text-right font-medium">{money(p.median)}</td>
                      <td className="py-1.5 pr-4 text-right">
                        {p.median === null ? "—" : `${money(p.p25)} – ${money(p.p75)}`}
                      </td>
                      <td className="py-1.5 pr-4 text-right">{money(p.low)}</td>
                      <td className="py-1.5 text-right">{money(p.high)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <p className="text-xs text-gray-400">
            Each bid is one contractor’s unit price on one project, dated by the bid date. The same rules as the pricing
            report apply (priced, quantity above zero, unit matches the catalog, one line per project, contractor and price).
            {data.skipped.unitMismatch > 0 && ` ${data.skipped.unitMismatch} rows were left out for a unit mismatch.`}
            {data.skipped.undated > 0 && ` ${data.skipped.undated} rows have no readable bid date and are not shown.`}
          </p>
        </Card>
      )}
    </div>
  );
}
