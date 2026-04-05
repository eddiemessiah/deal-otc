import {
  type AnalysisConfig,
  type Clause,
  ClauseType,
  type ContractSummary,
  type RiskAssessment,
  RiskLevel,
} from "./types.js";

const RISK_ORDER: Record<RiskLevel, number> = {
  [RiskLevel.Low]: 0,
  [RiskLevel.Medium]: 1,
  [RiskLevel.High]: 2,
  [RiskLevel.Critical]: 3,
};

function extractParties(clauses: Clause[]): string[] {
  const partySet = new Set<string>();
  for (const clause of clauses) {
    for (const party of clause.parties) {
      partySet.add(party);
    }
  }
  return Array.from(partySet);
}

function extractEffectiveDate(clauses: Clause[]): string | null {
  for (const clause of clauses) {
    for (const deadline of clause.deadlines) {
      const dateMatch = deadline.match(/effective\s+(date|as of)\s*:?\s*(.+)/i);
      if (dateMatch) return dateMatch[2].trim();
    }
  }
  return null;
}

function extractTerm(clauses: Clause[]): string | null {
  const termClause = clauses.find((c) => c.type === ClauseType.Termination || c.type === ClauseType.AutoRenewal);
  if (termClause && termClause.deadlines.length > 0) {
    return termClause.deadlines[0];
  }
  return null;
}

function collectKeyObligations(clauses: Clause[]): string[] {
  const obligations: string[] = [];
  for (const clause of clauses) {
    for (const obligation of clause.obligations.slice(0, 2)) {
      obligations.push(`[${clause.type}] ${obligation}`);
    }
  }
  return obligations.slice(0, 10);
}

function collectFinancialTerms(clauses: Clause[]): string[] {
  const terms: string[] = [];
  for (const clause of clauses) {
    for (const value of clause.monetaryValues) {
      terms.push(`[${clause.type}] ${value}`);
    }
  }
  return terms;
}

function buildRiskHeatmap(risks: RiskAssessment[]): Record<ClauseType, RiskLevel> {
  const heatmap: Partial<Record<ClauseType, RiskLevel>> = {};

  for (const risk of risks) {
    const existing = heatmap[risk.clauseType];
    if (!existing || RISK_ORDER[risk.riskLevel] > RISK_ORDER[existing]) {
      heatmap[risk.clauseType] = risk.riskLevel;
    }
  }

  return heatmap as Record<ClauseType, RiskLevel>;
}

function identifyTopConcerns(risks: RiskAssessment[]): string[] {
  return risks
    .filter((r) => r.riskLevel === RiskLevel.High || r.riskLevel === RiskLevel.Critical)
    .sort((a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel])
    .slice(0, 5)
    .map((r) => `[${r.riskLevel.toUpperCase()}] ${r.clauseType}: ${r.explanation}`);
}

function computeOverallRisk(risks: RiskAssessment[], threshold: RiskLevel): RiskLevel {
  if (risks.length === 0) return RiskLevel.Low;

  const criticalCount = risks.filter((r) => r.riskLevel === RiskLevel.Critical).length;
  const highCount = risks.filter((r) => r.riskLevel === RiskLevel.High).length;

  if (criticalCount > 0) return RiskLevel.Critical;
  if (highCount >= 3) return RiskLevel.Critical;
  if (highCount >= 1) return RiskLevel.High;

  const mediumCount = risks.filter((r) => r.riskLevel === RiskLevel.Medium).length;
  if (mediumCount >= 3) return RiskLevel.Medium;

  const thresholdOrder = RISK_ORDER[threshold];
  const maxRisk = Math.max(...risks.map((r) => RISK_ORDER[r.riskLevel]));
  if (maxRisk >= thresholdOrder) {
    return Object.entries(RISK_ORDER).find(([, v]) => v === maxRisk)![0] as RiskLevel;
  }

  return RiskLevel.Low;
}

export function generateSummary(clauses: Clause[], risks: RiskAssessment[], config: AnalysisConfig): ContractSummary {
  const highRiskCount = risks.filter(
    (r) => r.riskLevel === RiskLevel.High || r.riskLevel === RiskLevel.Critical,
  ).length;

  return {
    parties: extractParties(clauses),
    effectiveDate: extractEffectiveDate(clauses),
    term: extractTerm(clauses),
    keyObligations: collectKeyObligations(clauses),
    financialTerms: collectFinancialTerms(clauses),
    riskHeatmap: buildRiskHeatmap(risks),
    topConcerns: identifyTopConcerns(risks),
    overallRiskScore: computeOverallRisk(risks, config.riskThreshold),
    clauseCount: clauses.length,
    highRiskCount,
  };
}

