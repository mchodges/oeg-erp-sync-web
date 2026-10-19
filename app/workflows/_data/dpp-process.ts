import type { FlowChartData, FlowNode } from "./types";

// Real SharePoint procedure pages, keyed by node id. Nodes without an entry
// fall back to a placeholder search link.
const PROCEDURE_LINKS: Record<string, string> = {
  handoff:
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-10-Project-Handoff.aspx",
  "design-planning-existing-conditions":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-11-Design-Planning-%26-Existing-Conditions-Review.aspx",
  "master-planning":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-12-Master-Planning.aspx",
  "predesign-agency":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-13-Pre-Design-Agency-Meeting.aspx",
  "constructability-1":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-14-Constructability-Review.aspx",
  "one-line":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-20-One-Line-Design.aspx",
  "hh-calcs":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-21-H%26H-Calculations.aspx",
  "calc-site-plan":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-22-Calculated-Site-Plan-Review.aspx",
  "surface-model":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-23-Surface%20Model.aspx",
  "base-file-prep":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-30-Base-File-Preparation.aspx",
  "reconcile-hh":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-31-Reconcile-H%26H-Calculations.aspx",
  "land-site-review":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-32-Site-Plan-%26-Easement-Review.aspx",
  kickoff:
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-40-Plan-Production-Kickoff-Meeting.aspx",
  "sheet-cut-review":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-41-Sheet-Cut-Review.aspx",
  "plan-production":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-42-Plan-Production.aspx",
  "initial-submittal":
    "https://odysseyeg.sharepoint.com/sites/OEG/SitePages/DPP-43-Intial-Submittal-%26-Composite-Set.aspx",
};

function placeholder(label: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(label)}`;
}

function node(
  id: string,
  label: string,
  party: FlowNode["party"],
  opts: { shape?: FlowNode["shape"]; dashed?: boolean } = {}
): FlowNode {
  return {
    id,
    label,
    party,
    shape: opts.shape ?? "process",
    dashed: opts.dashed,
    href: PROCEDURE_LINKS[id] ?? placeholder(label),
  };
}

export const dppProcess: FlowChartData = {
  slug: "dpp-process",
  title: "DPP Process",
  description: "Design & Plan Production workflow, from project handoff through the after-action report.",
  lanes: [
    {
      id: "planning",
      label: "Planning Phase",
      fill: "#a7f3d0",
      stroke: "#059669",
      nodes: [
        node("handoff", "Project Handoff Meeting", "PM"),
        node("design-planning-existing-conditions", "Design Planning & Existing Conditions Review", "DM"),
        node("master-planning", "Master Planning", "DM", { dashed: true }),
        node("predesign-agency", "Pre-Design Agency Meeting", "DM", { dashed: true }),
        node("constructability-1", "Constructability Review", "SR", { dashed: true }),
      ],
    },
    {
      id: "design",
      label: "Design Phase",
      fill: "#fde68a",
      stroke: "#d97706",
      nodes: [
        node("one-line", "One Line Design", "DM"),
        node("hh-calcs", "H&H Calculations", "DM"),
        node("calc-site-plan", "Calculated Site Plan Review", "DM"),
        node("surface-model", "Surface Model", "DM", { dashed: true }),
        node("approved-design", "Approved Design", "DM", { shape: "decision" }),
      ],
    },
    {
      id: "base-files",
      label: "Base Files Phase",
      fill: "#ddd6fe",
      stroke: "#7c3aed",
      nodes: [
        node("base-file-prep", "Base File Preparation", "CAD"),
        node("reconcile-hh", "Reconcile H&H Calculations to Design Files", "DE"),
        node("land-site-review", "Land/Site Plan & Easement Review", "CAD"),
        node("approve-base-files", "Approve Base Files", "CAD", { shape: "decision" }),
      ],
    },
    {
      id: "plan-production",
      label: "Plan Production Phase",
      fill: "#fca5a5",
      stroke: "#dc2626",
      nodes: [
        node("kickoff", "Plan Production Kickoff Meeting", "DE"),
        node("sheet-cut-review", "Sheet Cut Review", "DE"),
        node("plan-production", "Plan Production", "CAD"),
        node("de-reviews-set", "DE Reviews Set", "DE", { shape: "decision" }),
        node("dm-approves-set", "DM Approves Set", "DM", { shape: "decision" }),
        node("initial-submittal", "Initial Submittal & Composite Set", "PCR"),
      ],
    },
    {
      id: "qaqc",
      label: "QAQC",
      fill: "#bae6fd",
      stroke: "#0284c7",
      nodes: [
        node("constructability-2", "Constructability Review", "SR", { dashed: true }),
        node("engineering-qaqc", "Engineering QAQC", "DE"),
        node("add-comments", "Add Comments to Composite as Received", "DE"),
        node("agency-coordination", "Agency Coordination Call / Meeting", "DE", { dashed: true }),
        node("long-lead-comments", "Address Long Lead Agency Comments", "DE"),
      ],
    },
    {
      id: "final-plan-production",
      label: "Final Plan Production",
      fill: "#d9f99d",
      stroke: "#65a30d",
      nodes: [
        node("address-composite", "Address Composite Set", "CAD"),
        node("confirm-comments", "Confirm ALL composite set comments are addressed", "DE"),
        node("signs-seals", "Engineer Signs & Seals Plans", "DM", { shape: "decision" }),
        node("submit-approval", "Submit for Approval", "DE"),
        node("plans-approved", "Plans Approved", "AGY", { shape: "decision" }),
        node("paar", "Project After Action Report (PAAR)", "DE"),
      ],
    },
  ],
};
