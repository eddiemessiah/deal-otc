export enum ClauseType {
  Indemnification = "indemnification",
  LimitationOfLiability = "limitation-of-liability",
  Termination = "termination",
  Confidentiality = "confidentiality",
  IpOwnership = "ip-ownership",
  PaymentTerms = "payment-terms",
  Warranty = "warranty",
  DataProtection = "data-protection",
  NonCompete = "non-compete",
  ForceMajeure = "force-majeure",
  GoverningLaw = "governing-law",
  AutoRenewal = "auto-renewal",
  Other = "other",
}

export enum RiskLevel {
  Low = "low",
  Medium = "medium",
  High = "high",
  Critical = "critical",
}

export interface Contract {
  fileName: string;
  rawContent: string;
  sections: string[];
  extractedAt: string;
}

export interface Clause {
  id: string;
  type: ClauseType;
  title: string;
  rawText: string;
  keyTerms: string[];
  obligations: string[];
  deadlines: string[];
  monetaryValues: string[];
  parties: string[];
  sectionIndex: number;
}

export interface RiskAssessment {
  clauseId: string;
  clauseType: ClauseType;
  riskLevel: RiskLevel;
  explanation: string;
  suggestedRevision: string;
  flags: string[];
}

export interface ExtractionResult {
  contract: Contract;
  clauses: Clause[];
  risks: RiskAssessment[];
  summary: ContractSummary;
}

export interface ContractSummary {
  parties: string[];
  effectiveDate: string | null;
  term: string | null;
  keyObligations: string[];
  financialTerms: string[];
  riskHeatmap: Record<ClauseType, RiskLevel>;
  topConcerns: string[];
  overallRiskScore: RiskLevel;
  clauseCount: number;
  highRiskCount: number;
}

export interface AnalysisConfig {
  apiKey: string;
  riskThreshold: RiskLevel;
  outputFormat: "json" | "markdown";
  clauseTypes: ClauseType[];
  model: string;
  maxBatchSize: number;
}

