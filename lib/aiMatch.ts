import Anthropic from "@anthropic-ai/sdk";
import type { MatchConfidence, UnmatchedItem } from "@/types";
import type { MasterCatalogRecord } from "./airtablePricing";
import { normalizeDescription } from "./normalizeText";
import { CATALOG_UNITS } from "./units";

const MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface FewShotExample {
  rawDescription: string;
  rawUnit: string;
  masterItem: string;
}

export interface AiMatchGuess {
  rawDescription: string;
  rawUnit: string;
  aiGuess: string;
  confidence: MatchConfidence;
}

const RECORD_MATCHES_TOOL: Anthropic.Tool = {
  name: "record_matches",
  description: "Records the master-catalog match guessed for each new raw bid line-item description.",
  input_schema: {
    type: "object",
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            raw_description: { type: "string", description: "Echoed back exactly as given in the input." },
            raw_unit: {
              type: "string",
              description: "The unit standardized to one of: SY, LF, EA, TON, AC, LS, CY.",
            },
            ai_guessed_master_item: {
              type: "string",
              description: "The best-matching Master_Item_Name from the catalog, verbatim.",
            },
            confidence: { type: "string", enum: ["High", "Medium", "Low"] },
          },
          required: ["raw_description", "raw_unit", "ai_guessed_master_item", "confidence"],
        },
      },
    },
    required: ["matches"],
  },
};

export interface CatalogItemProposal {
  name: string;
  unit: string;
  category: string;
}

/**
 * Suggests how a bid line with no catalog item should be added to the catalog: a short
 * name in the catalog's own style, a unit and a category. The reviewer edits it before saving.
 */
export async function proposeCatalogItem(
  description: string,
  rawUnit: string,
  catalog: MasterCatalogRecord[],
  categories: string[],
): Promise<CatalogItemProposal> {
  const catalogText = catalog
    .filter((c) => c.masterItemName)
    .map((c) => `${c.masterItemName} | ${c.standardUnit} | ${c.category}`)
    .join("\n");

  const prompt = `You are an expert civil engineering estimator maintaining a Master Catalog of bid line items.
A bid line has no suitable catalog item. Propose a new catalog entry for it.

RULES:
1. NAME: short, generic and reusable across projects, in the same style as the existing names below
   (size first, then material/spec, then the item, e.g. "36-Inch, HPP Storm Sewer"). Drop boilerplate such as
   "furnish and install", "complete in place", spec section references and project-specific wording.
   Keep every size or spec that changes the price.
2. UNIT: the unit the item is priced in. The bid line's unit is a strong hint.
3. CATEGORY: choose the closest existing category.

EXISTING CATALOG (Master_Item_Name | Standard_Unit | Category):
${catalogText}

BID LINE:
${JSON.stringify({ Raw_Description: description, Raw_Unit: rawUnit })}

Call propose_catalog_item.`;

  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 512,
    temperature: 0.1,
    tools: [
      {
        name: "propose_catalog_item",
        description: "Records the proposed new Master Catalog entry.",
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            unit: { type: "string", enum: [...CATALOG_UNITS] },
            category: { type: "string", enum: categories },
          },
          required: ["name", "unit", "category"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "propose_catalog_item" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) throw new Error("Claude did not return a propose_catalog_item tool call.");
  const input = toolUse.input as Partial<CatalogItemProposal>;
  return {
    name: String(input.name ?? "").trim(),
    unit: String(input.unit ?? ""),
    category: String(input.category ?? ""),
  };
}

/** Batch-matches new raw line-item descriptions to Master Catalog items via Claude (notebook Chunk 6, adapted). */
export async function matchBatch(
  items: UnmatchedItem[],
  catalog: MasterCatalogRecord[],
  fewShot: FewShotExample[],
): Promise<AiMatchGuess[]> {
  if (items.length === 0) return [];

  const catalogText = catalog
    .map((c) => `${c.masterItemName} | ${c.standardUnit}`)
    .join("\n");

  const fewShotText = fewShot.length
    ? JSON.stringify(
        fewShot.map((f) => ({
          Raw_Description: f.rawDescription,
          Raw_Unit: f.rawUnit,
          AI_Guessed_Master_Item: f.masterItem,
        })),
        null,
        2,
      )
    : "(none yet)";

  const prompt = `You are an expert civil engineering estimator. Map these RAW DESCRIPTIONS to the appropriate MASTER ITEM.

GUIDELINES:
1. SIZE MATTERS: Match the exact pipe/item size and spec (e.g. 6-inch vs 8-inch). Do not guess a size that isn't stated.
2. UNIT STANDARDIZATION: Convert raw units into standard codes: SY, LF, EA, TON, AC, LS, CY.
3. PAST TRAINING (FEW-SHOT): Study these verified examples to understand our mapping style:
${fewShotText}

MASTER CATALOG (Master_Item_Name | Standard_Unit):
${catalogText}

NEW ITEMS TO MAP:
${JSON.stringify(items.map((i) => ({ Raw_Description: i.description, Raw_Unit: i.unit })))}

Call record_matches with one entry per new item, in the same order given.`;

  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.1,
    tools: [RECORD_MATCHES_TOOL],
    tool_choice: { type: "tool", name: "record_matches" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) throw new Error("Claude did not return a record_matches tool call.");

  const input = toolUse.input as {
    matches: {
      raw_description: string;
      raw_unit: string;
      ai_guessed_master_item: string;
      confidence: string;
    }[];
  };

  // Claude re-types the description it echoes (curly quotes come back straight),
  // so never store its copy: pair each guess with the input item it belongs to and
  // keep the input's exact text, which is what every later lookup compares against.
  const used = new Set<number>();
  return items.flatMap((item, i) => {
    const key = normalizeDescription(item.description);
    let idx = input.matches.findIndex(
      (m, j) => !used.has(j) && normalizeDescription(m.raw_description) === key,
    );
    if (idx === -1 && input.matches.length === items.length && !used.has(i)) idx = i;
    if (idx === -1) return [];
    used.add(idx);
    const m = input.matches[idx];
    return [
      {
        rawDescription: item.description,
        rawUnit: m.raw_unit,
        aiGuess: m.ai_guessed_master_item,
        confidence: (["High", "Medium", "Low"].includes(m.confidence)
          ? m.confidence
          : "Low") as MatchConfidence,
      },
    ];
  });
}
