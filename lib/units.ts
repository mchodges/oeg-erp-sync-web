const ALIASES: Record<string, string> = {
  TONS: "TON",
  FT: "LF",
  LNFT: "LF",
  LINFT: "LF",
  SQYD: "SY",
  SYD: "SY",
  CUYD: "CY",
  CYD: "CY",
  EACH: "EA",
  LOT: "EA",
  LOTS: "EA",
  LUMPSUM: "LS",
  ACRE: "AC",
  ACRES: "AC",
  CUBICYARD: "CY",
  CUBICYARDS: "CY",
  LINEARFOOT: "LF",
  LINEARFEET: "LF",
  SQUAREYARD: "SY",
  SQUAREYARDS: "SY",
  SQUAREFOOT: "SF",
  DAYS: "DAY",
  DY: "DAY",
  VERTICALFEET: "VF",
  VERTICALFOOT: "VF",
};

/** Units a new Master_Catalog item may use (the Standard_Unit choices; TONS is the legacy spelling of TON). */
export const CATALOG_UNITS = ["SY", "LF", "EA", "TON", "AC", "LS", "CY", "VF", "DAY", "SF"] as const;

/** Upper-cases a unit and folds spelling variants together (TONS → TON, "Each" → EA). */
export function normalizeUnit(unit: string | null | undefined): string {
  const key = String(unit ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return ALIASES[key] ?? key;
}

/** True only when both units are known and genuinely different; a blank unit never conflicts. */
export function unitsConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeUnit(a);
  const y = normalizeUnit(b);
  return x !== "" && y !== "" && x !== y;
}
