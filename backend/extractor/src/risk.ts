import type Anthropic from "@anthropic-ai/sdk";
import { type Clause, ClauseType, type RiskAssessment, RiskLevel } from "./types.js";

const RISK_RULES: Record<string, string[]> = {
  [ClauseType.Indemnification]: [
    "Unlimited indemnification without cap",
    "One-sided indemnification favoring only one party",
    "Indemnification covering third-party IP claims without limitation",
  ],
  [ClauseType.LimitationOfLiability]: [
    "No liability cap or unreasonably high cap",
    "Exclusion of consequential damages only benefits one party",
    "Liability limitation does not survive termination",
  ],
  [ClauseType.AutoRenewal]: [
    "Auto-renewal with no opt-out window or very short notice period",
    "Price escalation clause tied to auto-renewal",
    "Renewal term equals or exceeds initial term",
  ],
  [ClauseType.NonCompete]: [
    "Geographic scope is overly broad or worldwide",
    "Duration exceeds 2 years",
    "Scope covers unrelated business activities",
  ],
  [ClauseType.Termination]: [
    "Termination for convenience only available to one party",
    "Excessive cure period (>60 days) for material breach",
    "No termination right for insolvency or change of control",
  ],
  [ClauseType.DataProtection]: [
    "Missing data breach notification requirements",
    "No data deletion obligations upon termination",
    "Sub-processor usage without consent mechanism",
  ],
  [ClauseType.IpOwnership]: [
    "Broad IP assignment covering pre-existing IP",
    "Work-for-hire clause with no license-back provision",
    "Ambiguous ownership of derivative works",
  ],
};

function buildRiskPrompt(clause: Clause): string {
  const rulesContext = RISK_RULES[clause.type]
    ? `\nKnown risk patterns for ${clause.type}:\n${RISK_RULES[clause.type].map((r) => `- ${r}`).join("\n")}`
    : "";

  return `Assess the legal risk of this contract clause.
${rulesContext}

Clause type: ${clause.type}
Clause title: ${clause.title}
Clause text:
${clause.rawText}

Return a JSON object:
- "riskLevel": one of "low", "medium", "high", "critical"
- "explanation": 1-2 sentence explanation of the risk
- "suggestedRevision": specific language change to mitigate the risk
- "flags": array of risk flags that apply (e.g. "unlimited-liability", "one-sided-termination", "missing-data-protection")

Respond with valid JSON only, no markdown fencing.`;
}

interface RiskResponse {
  riskLevel: string;
  explanation: string;
  suggestedRevision: string;
  flags: string[];
}

function parseRiskResponse(raw: string): RiskResponse {
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      riskLevel: "medium",
      explanation: "Unable to parse risk assessment",
      suggestedRevision: "Manual review recommended",
      flags: ["parse-error"],
    };
  }
}

function validateRiskLevel(raw: string): RiskLevel {
  const map: Record<string, RiskLevel> = {
    low: RiskLevel.Low,
    medium: RiskLevel.Medium,
    high: RiskLevel.High,
    critical: RiskLevel.Critical,
  };
  return map[raw.toLowerCase()] || RiskLevel.Medium;
}

async function assessSingle(clause: Clause, client: Anthropic, model: string): Promise<RiskAssessment> {
  const prompt = buildRiskPrompt(clause);

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseRiskResponse(text);

  return {
    clauseId: clause.id,
    clauseType: clause.type,
    riskLevel: validateRiskLevel(parsed.riskLevel),
    explanation: parsed.explanation,
    suggestedRevision: parsed.suggestedRevision,
    flags: parsed.flags || [],
  };
}

export async function assessRisks(
  clauses: Clause[],
  client: Anthropic,
  model: string = "claude-sonnet-4-20250514",
): Promise<RiskAssessment[]> {
  const substantiveClauses = clauses.filter((c) => c.type !== ClauseType.Other);
  const assessments: RiskAssessment[] = [];

  const BATCH_SIZE = 3;
  for (let i = 0; i < substantiveClauses.length; i += BATCH_SIZE) {
    const batch = substantiveClauses.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((clause) => assessSingle(clause, client, model)));
    assessments.push(...results);
  }

  return assessments;
}

