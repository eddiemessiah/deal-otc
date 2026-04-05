import type Anthropic from "@anthropic-ai/sdk";
import { type AnalysisConfig, type Clause, ClauseType } from "./types.js";

const CLAUSE_TYPE_LIST = Object.values(ClauseType).join(", ");

function buildExtractionPrompt(section: string, clauseTypes: ClauseType[]): string {
  const typesFilter = clauseTypes.join(", ");
  return `Analyze this contract section and extract clause information.

Identify which clause type it belongs to from: ${typesFilter}

Return a JSON object with these fields:
- "type": one of [${CLAUSE_TYPE_LIST}]
- "title": a short descriptive title for this clause
- "keyTerms": array of important defined terms or concepts
- "obligations": array of obligations imposed on each party
- "deadlines": array of any time-bound requirements (dates, periods, notice windows)
- "monetaryValues": array of any dollar amounts, fees, percentages, or financial figures
- "parties": array of party names or roles referenced

If the section does not contain a recognizable clause, return:
{"type": "other", "title": "Non-clause content", "keyTerms": [], "obligations": [], "deadlines": [], "monetaryValues": [], "parties": []}

CONTRACT SECTION:
${section}

Respond with valid JSON only, no markdown fencing.`;
}

interface ClauseExtractionResult {
  type: string;
  title: string;
  keyTerms: string[];
  obligations: string[];
  deadlines: string[];
  monetaryValues: string[];
  parties: string[];
}

function parseClauseResponse(raw: string): ClauseExtractionResult {
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      type: "other",
      title: "Parse error",
      keyTerms: [],
      obligations: [],
      deadlines: [],
      monetaryValues: [],
      parties: [],
    };
  }
}

function validateClauseType(raw: string): ClauseType {
  const values = Object.values(ClauseType) as string[];
  return values.includes(raw) ? (raw as ClauseType) : ClauseType.Other;
}

async function extractSingle(
  section: string,
  index: number,
  config: AnalysisConfig,
  client: Anthropic,
): Promise<Clause> {
  const prompt = buildExtractionPrompt(section, config.clauseTypes);

  const response = await client.messages.create({
    model: config.model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseClauseResponse(text);

  return {
    id: `clause-${index}`,
    type: validateClauseType(parsed.type),
    title: parsed.title || `Section ${index + 1}`,
    rawText: section,
    keyTerms: parsed.keyTerms || [],
    obligations: parsed.obligations || [],
    deadlines: parsed.deadlines || [],
    monetaryValues: parsed.monetaryValues || [],
    parties: parsed.parties || [],
    sectionIndex: index,
  };
}

async function processBatch(
  sections: string[],
  startIndex: number,
  config: AnalysisConfig,
  client: Anthropic,
): Promise<Clause[]> {
  const promises = sections.map((section, i) => extractSingle(section, startIndex + i, config, client));
  return Promise.all(promises);
}

export async function extractClauses(sections: string[], config: AnalysisConfig, client: Anthropic): Promise<Clause[]> {
  const allClauses: Clause[] = [];

  for (let i = 0; i < sections.length; i += config.maxBatchSize) {
    const batch = sections.slice(i, i + config.maxBatchSize);
    const clauses = await processBatch(batch, i, config, client);
    allClauses.push(...clauses);
  }

  return allClauses.filter((c) => config.clauseTypes.includes(c.type) || c.type === ClauseType.Other);
}

