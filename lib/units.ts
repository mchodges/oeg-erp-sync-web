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
  LUMPSUM: "LS",
  ACRE: "AC",
  ACRES: "AC",
};

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
