import { tokens } from "./similarity";

/**
 * Words that never change which catalog item a line belongs to: they restate a unit, say "this is
 * a pipe", or give boilerplate ("all depths", "all sizes"). Every other word has to match, because
 * one word is often the whole difference ("near" vs "far" side, "restrained" joint, "detention"
 * vs "amenity" basin).
 */
const FILLER = new Set([
  "inch", "inches", "in", "pipe", "lf", "ft", "ea", "each", "sy", "cy", "ls", "unit",
  "all", "depth", "depths", "size", "sizes",
]);

interface Signature {
  /** Anything containing a digit (a size, "C900", "SDR35", "4000 psi"): must match exactly. */
  numbers: string[];
  /** The other descriptive words, lightly de-pluralised. */
  words: Set<string>;
}

function signature(text: string): Signature {
  const numbers: string[] = [];
  const words = new Set<string>();
  for (const t of tokens(text)) {
    if (/\d/.test(t)) numbers.push(t);
    else if (!FILLER.has(t)) words.add(t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);
  }
  return { numbers: numbers.sort(), words };
}

function nearIdentical(a: Signature, b: Signature): boolean {
  if (a.numbers.length !== b.numbers.length || a.numbers.some((n, i) => n !== b.numbers[i])) return false;
  if (a.words.size === 0 || a.words.size !== b.words.size) return false;
  for (const w of a.words) if (!b.words.has(w)) return false;
  return true;
}

/** True when two bid descriptions differ only in punctuation, word form or filler ("8-inch" vs 8"), never in a size, spec or material. */
export function isNearDuplicate(a: string, b: string): boolean {
  return nearIdentical(signature(a), signature(b));
}

export interface ApprovedDescription {
  rawDescription: string;
  masterItemId: string;
}

/**
 * Looks for a reviewer-approved description that the new one is nearly identical to. Returns it
 * only when every nearly-identical approved line points to the same catalog item, so a line that
 * sits between two items is never settled automatically.
 */
export function findApprovedTwin<T extends ApprovedDescription>(
  description: string,
  approved: { entry: T; sig: Signature }[],
): T | null {
  const sig = signature(description);
  let twin: T | null = null;
  for (const a of approved) {
    if (!nearIdentical(sig, a.sig)) continue;
    if (twin && twin.masterItemId !== a.entry.masterItemId) return null;
    twin ??= a.entry;
  }
  return twin;
}

/** Precomputes the word signatures of the approved lines once per batch. */
export function indexApproved<T extends ApprovedDescription>(approved: T[]): { entry: T; sig: Signature }[] {
  return approved.map((entry) => ({ entry, sig: signature(entry.rawDescription) }));
}
