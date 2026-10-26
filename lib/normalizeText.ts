/**
 * Comparison key for raw bid-tab descriptions. The same line item shows up with
 * curly vs. straight quotes, en/em dashes, non-breaking spaces and stray double
 * spaces depending on who typed it, which tool echoed it back (Claude returns
 * straight quotes for curly ones) and where it was stored. Every exact-string
 * lookup (dictionary map, "already reviewed" checks, ignored set, estimate
 * resolve) goes through this so those variants all collapse to one key.
 * Stored text is never rewritten - only compared in this form.
 */
export function normalizeDescription(s: string): string {
  return s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ") // \s covers NBSP and other unicode spaces, tabs and newlines
    .trim();
}
