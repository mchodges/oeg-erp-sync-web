import { normalizeDescription } from "./normalizeText";

/** Words that appear in nearly every bid description and say nothing about which item it is. */
const STOPWORDS = new Set([
  "a", "all", "an", "and", "as", "at", "be", "by", "complete", "contractor", "contractors", "etc",
  "for", "furnish", "in", "include", "included", "includes", "including", "install", "installed",
  "installation", "of", "on", "or", "per", "place", "price", "required", "shall", "the", "to", "with",
]);

export function tokens(text: string): string[] {
  const words = normalizeDescription(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w));
  return [...new Set(words)];
}

export interface SimilarityIndex<T> {
  /** The `limit` entries most similar to `text`, best first, each with a score from 0 to 1. */
  nearest(text: string, limit: number): { entry: T; score: number }[];
}

/**
 * A small TF-IDF cosine index over bid descriptions. Rare words (a size, a material like
 * "polypropylene") count for more than common ones ("storm", "sewer"), so a 36-inch
 * polypropylene line finds other polypropylene lines rather than any storm sewer line.
 */
export function buildSimilarityIndex<T>(entries: T[], textOf: (entry: T) => string): SimilarityIndex<T> {
  const docs = entries.map((entry) => ({ entry, terms: tokens(textOf(entry)) }));
  const docFreq = new Map<string, number>();
  for (const d of docs) for (const t of d.terms) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);

  const idf = (term: string) => Math.log(1 + docs.length / (1 + (docFreq.get(term) ?? 0)));
  const norm = (terms: string[]) => Math.sqrt(terms.reduce((s, t) => s + idf(t) ** 2, 0));
  const withNorm = docs.map((d) => ({ ...d, norm: norm(d.terms) }));

  return {
    nearest(text, limit) {
      const query = tokens(text);
      if (query.length === 0) return [];
      const queryTerms = new Set(query);
      const queryNorm = norm(query);
      const scored: { entry: T; score: number }[] = [];
      for (const d of withNorm) {
        if (d.norm === 0) continue;
        let dot = 0;
        for (const t of d.terms) if (queryTerms.has(t)) dot += idf(t) ** 2;
        if (dot > 0) scored.push({ entry: d.entry, score: dot / (queryNorm * d.norm) });
      }
      return scored.sort((a, b) => b.score - a.score).slice(0, limit);
    },
  };
}
