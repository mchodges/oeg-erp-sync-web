export const TITLE_MAP: Record<string, string> = {
  "assistant project manager": "Assistant Project Manager",
  "cad technician i":          "CAD Tech 1",
  "cad technician":            "CAD Tech 1",
  "cad tech i":                "CAD Tech 1",
  "cad tech ii":               "CAD Tech 2",
  "cad technician ii":         "CAD Tech 2",
  "design cad technician":     "Design CAD Technician",
  "design engineer i":         "Design Engineer 1",
  "design engineer 1":         "Design Engineer 1",
  "design engineer ii":        "Design Engineer 2",
  "design engineer 2":         "Design Engineer 2",
  "design manager":            "Design Manager",
  "group manager":             "Group Manager",
  "principal":                 "Principal",
  "project engineer":          "Project Engineer",
  "project manager":           "Project Manager",
  "senior project engineer":   "Senior Project Engineer",
  "senior project manager":    "Senior Project Manager",
};

export const ALL_POSITIONS = [
  "Assistant Project Manager",
  "CAD Tech 1",
  "CAD Tech 2",
  "Design CAD Technician",
  "Design Engineer 1",
  "Design Engineer 2",
  "Design Manager",
  "Group Manager",
  "Principal",
  "Project Engineer",
  "Project Manager",
  "Senior Project Engineer",
  "Senior Project Manager",
] as const;

export type PositionName = (typeof ALL_POSITIONS)[number];

export function extractErpCodes(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(" | ")[0].trim())
    .filter(Boolean);
}

export function codeMatches(reportCode: string, atCode: string): boolean {
  const rc = reportCode.trim();
  const ac = atCode.trim();
  if (!ac) return false;
  if (rc === ac) return true;
  if (rc.startsWith(ac)) {
    const nextIdx = ac.length;
    if (nextIdx < rc.length) {
      return ["-", ":", " ", "."].includes(rc[nextIdx]);
    }
  }
  return false;
}

export interface ReportRow {
  erpCode: string;
  title: string;
  hours: number;
}

export function aggregateHours(
  rows: ReportRow[],
  atCodes: string[],
  unrecognized: Record<string, number>,
): { positionHours: Record<string, number>; nMatched: number } {
  const matched = rows.filter((row) =>
    atCodes.some((ac) => codeMatches(row.erpCode, ac)),
  );

  const positionHours: Record<string, number> = {};

  for (const row of matched) {
    const key = row.title.trim().toLowerCase();
    const mapped = TITLE_MAP[key];
    if (mapped) {
      positionHours[mapped] = (positionHours[mapped] ?? 0) + row.hours;
    } else if (row.title) {
      unrecognized[row.title] =
        (unrecognized[row.title] ?? 0) + row.hours;
    }
  }

  return { positionHours, nMatched: matched.length };
}

export function topPositions(
  positionHours: Record<string, number>,
  n = 3,
): string {
  return (
    Object.entries(positionHours)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .filter(([, h]) => h > 0)
      .map(([p, h]) => `${p}: ${h.toFixed(1)}`)
      .join(", ") || "—"
  );
}
