import type { FlowChartData, FlowNode, PartyCode } from "../_data/types";
import { PARTY_NAMES } from "../_data/types";

// ── Layout constants ────────────────────────────────────────────────────────

const PROCESS_W = 160;
const PROCESS_H = 100;
const DECISION_W = 158;
const DECISION_H = 130;
const GAP = 38;
const LANE_LABEL_W = 190;
const LANE_LABEL_H = 58;
const LANE_LABEL_GAP = 40;
const ROW_H = 180;
const PAD_X = 28;
const PAD_TOP = 40;
const PAD_BOTTOM = 24;
const BADGE_R = 17;

interface LaidOutNode extends FlowNode {
  x0: number;
  x1: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
}

interface LaidOutLane {
  id: string;
  label: string;
  fill: string;
  stroke: string;
  cy: number;
  pillX0: number;
  pillX1: number;
  nodes: LaidOutNode[];
}

function layout(data: FlowChartData) {
  let maxRight = 0;
  const lanes: LaidOutLane[] = data.lanes.map((lane, rowIndex) => {
    const cy = PAD_TOP + rowIndex * ROW_H + ROW_H / 2;
    const pillX0 = PAD_X;
    const pillX1 = pillX0 + LANE_LABEL_W;
    let cursor = pillX1 + LANE_LABEL_GAP;

    const nodes: LaidOutNode[] = lane.nodes.map((n) => {
      const w = n.shape === "decision" ? DECISION_W : PROCESS_W;
      const h = n.shape === "decision" ? DECISION_H : PROCESS_H;
      const x0 = cursor;
      const x1 = x0 + w;
      cursor = x1 + GAP;
      return { ...n, x0, x1, cx: x0 + w / 2, cy, w, h };
    });

    const laneRight = nodes.length ? nodes[nodes.length - 1].x1 : pillX1;
    maxRight = Math.max(maxRight, laneRight);

    return { id: lane.id, label: lane.label, fill: lane.fill, stroke: lane.stroke, cy, pillX0, pillX1, nodes };
  });

  const width = maxRight + PAD_X;
  const height = PAD_TOP + data.lanes.length * ROW_H + PAD_BOTTOM;
  return { lanes, width, height };
}

function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function NodeLabel({ cx, cy, lines, fontSize, lineHeight }: { cx: number; cy: number; lines: string[]; fontSize: number; lineHeight: number }) {
  const startDy = -((lines.length - 1) / 2) * lineHeight;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} className="fill-slate-800 font-semibold select-none">
      {lines.map((line, i) => (
        <tspan key={i} x={cx} dy={i === 0 ? startDy : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function PartyBadge({ cx, topY, party, stroke }: { cx: number; topY: number; party: PartyCode; stroke: string }) {
  return (
    <g className="flow-badge">
      <circle cx={cx} cy={topY} r={BADGE_R} fill="white" stroke={stroke} strokeWidth={1.75} />
      <text x={cx} y={topY} textAnchor="middle" dominantBaseline="middle" fontSize={11} className="fill-slate-700 font-bold select-none">
        {party}
      </text>
    </g>
  );
}

function FlowNodeShape({ node, stroke }: { node: LaidOutNode; stroke: string }) {
  const dash = node.dashed ? "6 4" : undefined;
  if (node.shape === "decision") {
    const hw = node.w / 2;
    const hh = node.h / 2;
    const points = [
      `${node.cx},${node.cy - hh}`,
      `${node.cx + hw},${node.cy}`,
      `${node.cx},${node.cy + hh}`,
      `${node.cx - hw},${node.cy}`,
    ].join(" ");
    return (
      <polygon
        points={points}
        fill="white"
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray={dash}
        className="flow-shape"
        filter="url(#nodeShadow)"
      />
    );
  }
  return (
    <rect
      x={node.x0}
      y={node.cy - node.h / 2}
      width={node.w}
      height={node.h}
      rx={14}
      fill="white"
      stroke={stroke}
      strokeWidth={2}
      strokeDasharray={dash}
      className="flow-shape"
      filter="url(#nodeShadow)"
    />
  );
}

export function FlowChart({ data }: { data: FlowChartData }) {
  const { lanes, width, height } = layout(data);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ height: "auto" }} role="group" aria-label={data.title}>
        <defs>
          <filter id="nodeShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#0f172a" floodOpacity="0.18" />
          </filter>
        </defs>

        {lanes.map((lane) => (
          <g key={lane.id}>
            {/* connector: pill -> first node */}
            {lane.nodes.length > 0 && (
              <line x1={lane.pillX1} y1={lane.cy} x2={lane.nodes[0].x0} y2={lane.cy} stroke="#94a3b8" strokeWidth={2} />
            )}
            {/* connectors between nodes */}
            {lane.nodes.slice(1).map((n, i) => (
              <line key={n.id} x1={lane.nodes[i].x1} y1={lane.cy} x2={n.x0} y2={lane.cy} stroke="#94a3b8" strokeWidth={2} />
            ))}

            {/* lane label pill */}
            <rect x={lane.pillX0} y={lane.cy - LANE_LABEL_H / 2} width={LANE_LABEL_W} height={LANE_LABEL_H} rx={LANE_LABEL_H / 2} fill={lane.fill} stroke="#0f172a" strokeOpacity={0.08} strokeWidth={1} />
            <text x={lane.pillX0 + LANE_LABEL_W / 2} y={lane.cy} textAnchor="middle" dominantBaseline="middle" fontSize={15.5} className="fill-slate-900 font-bold select-none">
              {lane.label}
            </text>

            {/* nodes */}
            {lane.nodes.map((node) => {
              const maxChars = node.shape === "decision" ? 12 : 18;
              const fontSize = node.shape === "decision" ? 12.5 : 13;
              const lineHeight = node.shape === "decision" ? 14.5 : 15;
              const lines = wrapLabel(node.label, maxChars);
              const topY = node.cy - node.h / 2;
              const partyName = PARTY_NAMES[node.party];
              const accessibleName = `${node.label} — ${partyName}${node.dashed ? " (as-needed)" : ""}`;
              return (
                <a key={node.id} href={node.href} target="_blank" rel="noopener noreferrer" className="flow-node" aria-label={accessibleName}>
                  <title>{accessibleName}</title>
                  <FlowNodeShape node={node} stroke={lane.stroke} />
                  <NodeLabel cx={node.cx} cy={node.cy} lines={lines} fontSize={fontSize} lineHeight={lineHeight} />
                  <PartyBadge cx={node.cx} topY={topY} party={node.party} stroke={lane.stroke} />
                </a>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}
