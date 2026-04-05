import { type ExtractionResult, RiskLevel } from "./types.js";

const RISK_EMOJI: Record<RiskLevel, string> = {
  [RiskLevel.Low]: "🟢",
  [RiskLevel.Medium]: "🟡",
  [RiskLevel.High]: "🟠",
  [RiskLevel.Critical]: "🔴",
};

export function formatMarkdown(result: ExtractionResult): string {
  const { summary, clauses, risks } = result;
  const lines: string[] = [];

  lines.push("# Contract Analysis Report");
  lines.push("");
  lines.push(`**Overall Risk:** ${RISK_EMOJI[summary.overallRiskScore]} ${summary.overallRiskScore.toUpperCase()}`);
  lines.push(`**Clauses Analyzed:** ${summary.clauseCount}`);
  lines.push(`**High-Risk Items:** ${summary.highRiskCount}`);
  lines.push("");

  if (summary.parties.length > 0) {
    lines.push("## Parties");
    for (const party of summary.parties) {
      lines.push(`- ${party}`);
    }
    lines.push("");
  }

  if (summary.effectiveDate) {
    lines.push(`**Effective Date:** ${summary.effectiveDate}`);
  }
  if (summary.term) {
    lines.push(`**Term:** ${summary.term}`);
  }
  lines.push("");

  lines.push("## Extracted Clauses");
  lines.push("");
  for (const clause of clauses) {
    const risk = risks.find((r) => r.clauseId === clause.id);
    const riskBadge = risk ? ` ${RISK_EMOJI[risk.riskLevel]} ${risk.riskLevel}` : "";
    lines.push(`### ${clause.title} (${clause.type})${riskBadge}`);
    lines.push("");
    if (clause.keyTerms.length > 0) {
      lines.push(`**Key Terms:** ${clause.keyTerms.join(", ")}`);
    }
    if (clause.obligations.length > 0) {
      lines.push("**Obligations:**");
      for (const ob of clause.obligations) {
        lines.push(`- ${ob}`);
      }
    }
    if (clause.deadlines.length > 0) {
      lines.push(`**Deadlines:** ${clause.deadlines.join(", ")}`);
    }
    if (clause.monetaryValues.length > 0) {
      lines.push(`**Financial:** ${clause.monetaryValues.join(", ")}`);
    }
    lines.push("");
  }

  if (summary.topConcerns.length > 0) {
    lines.push("## Top Concerns");
    lines.push("");
    for (const concern of summary.topConcerns) {
      lines.push(`- ${concern}`);
    }
    lines.push("");
  }

  lines.push("## Risk Heatmap");
  lines.push("");
  lines.push("| Clause Type | Risk Level |");
  lines.push("|-------------|------------|");
  for (const [clauseType, riskLevel] of Object.entries(summary.riskHeatmap)) {
    lines.push(`| ${clauseType} | ${RISK_EMOJI[riskLevel as RiskLevel]} ${riskLevel} |`);
  }
  lines.push("");

  const risksWithRevisions = risks.filter((r) => r.suggestedRevision);
  if (risksWithRevisions.length > 0) {
    lines.push("## Suggested Revisions");
    lines.push("");
    for (const risk of risksWithRevisions) {
      lines.push(`### ${risk.clauseType} (${risk.riskLevel})`);
      lines.push(`**Issue:** ${risk.explanation}`);
      lines.push(`**Suggested:** ${risk.suggestedRevision}`);
      lines.push("");
    }
  }

  if (summary.financialTerms.length > 0) {
    lines.push("## Financial Terms");
    lines.push("");
    for (const term of summary.financialTerms) {
      lines.push(`- ${term}`);
    }
    lines.push("");
  }

  if (summary.keyObligations.length > 0) {
    lines.push("## Key Obligations");
    lines.push("");
    for (const ob of summary.keyObligations) {
      lines.push(`- ${ob}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatJSON(result: ExtractionResult): string {
  return JSON.stringify(
    {
      summary: result.summary,
      clauses: result.clauses.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        keyTerms: c.keyTerms,
        obligations: c.obligations,
        deadlines: c.deadlines,
        monetaryValues: c.monetaryValues,
        parties: c.parties,
      })),
      risks: result.risks,
    },
    null,
    2,
  );
}

