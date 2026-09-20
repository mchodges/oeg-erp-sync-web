export type PartyCode = "PM" | "DM" | "DE" | "SR" | "CAD" | "PCR" | "AGY";

export const PARTY_NAMES: Record<PartyCode, string> = {
  PM: "Project Manager",
  DM: "Design Manager",
  DE: "Design Engineer",
  SR: "Site Representative",
  CAD: "Designer / CAD Technician",
  PCR: "Permit Coordinator",
  AGY: "Agency",
};

export interface FlowNode {
  id: string;
  label: string;
  shape: "process" | "decision";
  party: PartyCode;
  /** Dashed border marks an as-needed / not-always-required step. */
  dashed?: boolean;
  href: string;
}

export interface FlowLane {
  id: string;
  label: string;
  fill: string;
  stroke: string;
  nodes: FlowNode[];
}

export interface FlowChartData {
  slug: string;
  title: string;
  description?: string;
  lanes: FlowLane[];
}
