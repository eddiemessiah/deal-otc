import { type AnalysisConfig, ClauseType, RiskLevel } from "./types.js";

const ALL_CLAUSE_TYPES = Object.values(ClauseType);

const RISK_LEVEL_MAP: Record<string, RiskLevel> = {
  low: RiskLevel.Low,
  medium: RiskLevel.Medium,
  high: RiskLevel.High,
  critical: RiskLevel.Critical,
};

function parseClauseTypes(raw: string | undefined): ClauseType[] {
  if (!raw || raw.trim() === "" || raw.trim().toLowerCase() === "all") {
    return ALL_CLAUSE_TYPES;
  }
  const requested = raw.split(",").map((s) => s.trim().toLowerCase());
  const valid: ClauseType[] = [];
  for (const r of requested) {
    if (ALL_CLAUSE_TYPES.includes(r as ClauseType)) {
      valid.push(r as ClauseType);
    } else {
      console.warn(`Unknown clause type "${r}", skipping.`);
    }
  }
  return valid.length > 0 ? valid : ALL_CLAUSE_TYPES;
}

function parseRiskThreshold(raw: string | undefined): RiskLevel {
  if (!raw) return RiskLevel.Medium;
  const level = RISK_LEVEL_MAP[raw.trim().toLowerCase()];
  if (!level) {
    console.warn(`Unknown risk threshold "${raw}", defaulting to medium.`);
    return RiskLevel.Medium;
  }
  return level;
}

function parseOutputFormat(raw: string | undefined): "json" | "markdown" {
  if (!raw) return "markdown";
  const lower = raw.trim().toLowerCase();
  if (lower === "json" || lower === "markdown") return lower;
  console.warn(`Unknown output format "${raw}", defaulting to markdown.`);
  return "markdown";
}

export function loadConfig(): AnalysisConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required. Set it as an environment variable.");
  }

  return {
    apiKey,
    riskThreshold: parseRiskThreshold(process.env.RISK_THRESHOLD),
    outputFormat: parseOutputFormat(process.env.OUTPUT_FORMAT),
    clauseTypes: parseClauseTypes(process.env.CLAUSE_TYPES),
    model: "claude-sonnet-4-20250514",
    maxBatchSize: 5,
  };
}

