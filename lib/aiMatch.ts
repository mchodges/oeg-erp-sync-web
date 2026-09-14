import Anthropic from "@anthropic-ai/sdk";
import type { MatchConfidence, UnmatchedItem } from "@/types";
import type { MasterCatalogRecord } from "./airtablePricing";

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

  return input.matches.map((m) => ({
    rawDescription: m.raw_description,
    rawUnit: m.raw_unit,
    aiGuess: m.ai_guessed_master_item,
    confidence: (["High", "Medium", "Low"].includes(m.confidence)
      ? m.confidence
      : "Low") as MatchConfidence,
  }));
}
