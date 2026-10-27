import type { UnmatchedItem } from "@/types";
import type { FewShotExample, RejectedExample } from "./aiMatch";
import { buildSimilarityIndex } from "./similarity";

const VERIFIED_PER_ITEM = 3;
const REJECTED_PER_ITEM = 2;
const MAX_VERIFIED = 60;
const MAX_REJECTED = 20;
/** Below this similarity an example is just noise for the line in question. */
const MIN_SCORE = 0.2;
/** Always show at least this many verified examples so the AI sees the catalog's naming style. */
const MIN_VERIFIED = 8;

function topUnique<T extends { rawDescription: string }>(
  items: UnmatchedItem[],
  pool: T[],
  perItem: number,
  cap: number,
): T[] {
  const index = buildSimilarityIndex(pool, (e) => e.rawDescription);
  const best = new Map<T, number>();
  for (const item of items) {
    for (const { entry, score } of index.nearest(item.description, perItem)) {
      if (score >= MIN_SCORE && score > (best.get(entry) ?? 0)) best.set(entry, score);
    }
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([entry]) => entry);
}

/**
 * Picks the past reviewer decisions most relevant to this batch, instead of 20 random ones:
 * approved matches for the closest-looking lines (so "36-Inch Polypropylene" finds the earlier
 * polypropylene approvals) and lines the reviewer said have no catalog item.
 */
export function selectExamples(
  items: UnmatchedItem[],
  verified: FewShotExample[],
  rejected: RejectedExample[],
): { fewShot: FewShotExample[]; rejected: RejectedExample[] } {
  const fewShot = topUnique(items, verified, VERIFIED_PER_ITEM, MAX_VERIFIED);

  if (fewShot.length < MIN_VERIFIED) {
    const chosen = new Set(fewShot);
    const filler = verified
      .filter((v) => !chosen.has(v))
      .sort(() => Math.random() - 0.5)
      .slice(0, MIN_VERIFIED - fewShot.length);
    fewShot.push(...filler);
  }

  return { fewShot, rejected: topUnique(items, rejected, REJECTED_PER_ITEM, MAX_REJECTED) };
}
