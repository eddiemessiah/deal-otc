mkdir -p $(dirname examples/sample-contract.txt) && cat << 'EOF_MARKER' > examples/sample-contract.txt
SAAS SERVICE AGREEMENT

This SaaS Service Agreement ("Agreement") is entered into as of January 15, 2025
("Effective Date") by and between Acme Cloud Corp ("Provider") and Beta Industries
LLC ("Customer"), collectively referred to as the "Parties."

1. PAYMENT TERMS

1.1 Customer shall pay Provider a monthly subscription fee of $2,500 USD, due
within 30 days of each invoice date. Late payments shall accrue interest at a
rate of 1.5% per month.

1.2 Provider reserves the right to increase fees by up to 10% annually upon
60 days written notice prior to the renewal date.

2. LIMITATION OF LIABILITY

2.1 In no event shall Provider's total aggregate liability exceed the fees paid
by Customer during the 12 months preceding the claim. This limitation applies
to all causes of action in the aggregate.

2.2 Neither party shall be liable for indirect, incidental, special, or
consequential damages, including lost profits or data loss.

3. TERMINATION

3.1 Either party may terminate this Agreement for cause upon 30 days written
notice if the other party materially breaches and fails to cure within such period.

3.2 Provider may terminate for convenience upon 90 days written notice.
Customer may not terminate for convenience during the initial 12-month term.

4. CONFIDENTIALITY

4.1 Each party agrees to keep confidential all non-public information disclosed
by the other party. Confidential information excludes information that is publicly
available, independently developed, or rightfully received from a third party.

4.2 Confidentiality obligations survive for 3 years after termination.

5. DATA PROTECTION

5.1 Provider shall process Customer data solely for the purpose of delivering
the Services. Provider shall implement industry-standard security measures.

5.2 In the event of a data breach, Provider shall notify Customer within
72 hours of discovery.

5.3 Upon termination, Provider shall delete all Customer data within 30 days
unless retention is required by applicable law.

6. AUTO-RENEWAL

6.1 This Agreement shall automatically renew for successive 12-month terms
unless either party provides written notice of non-renewal at least 15 days
prior to the end of the then-current term.

6.2 Renewal pricing is subject to the fee increase provisions in Section 1.2.

EOF_MARKER
mkdir -p $(dirname kit.md) && cat << 'EOF_MARKER' > kit.md
---
schema: kit/1.0
owner: matt-clawd
slug: contract-clause-extractor
title: Contract Clause Extractor
summary: >-
  Analyzes legal contracts to extract key clauses, assess risk levels, and
  generate structured summaries with actionable revision suggestions.
version: 1.0.1
license: UNLICENSED
tags:
  - legal
  - contracts
  - risk
  - compliance
  - automation
model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  hosting: cloud API — requires ANTHROPIC_API_KEY
tools:
  - terminal
  - file-reader
skills:
  - contract-analysis
  - risk-assessment
tech:
  - typescript
  - node
services:
  - name: Anthropic API
    role: LLM for clause extraction and risk analysis
    version: 2024-01
    setup: >-
      Sign up at console.anthropic.com to obtain an API key. Set
      ANTHROPIC_API_KEY in your environment.
parameters:
  - name: RISK_THRESHOLD
    value: medium
    description: 'Minimum risk level to flag — low, medium, high, or critical'
  - name: OUTPUT_FORMAT
    value: markdown
    description: Report output format — json or markdown
  - name: CLAUSE_TYPES
    value: all
    description: 'Comma-separated clause types to extract, or ''all'' for every type'
  - name: maxBatchSize
    value: '5'
    description: Number of sections processed concurrently per batch
  - name: max_tokens
    value: '1024'
    description: Token limit per Claude API call
failures:
  - problem: Claude returns malformed JSON for complex nested clauses
    resolution: >-
      Added JSON cleanup stripping markdown fencing and fallback to default
      structure on parse error
    scope: general
  - problem: Large contracts exceed context window causing truncated analysis
    resolution: >-
      Implemented batched section processing with configurable maxBatchSize to
      keep each request within token limits
    scope: general
  - problem: Rate limiting on Anthropic API during high-volume extraction
    resolution: >-
      Sequential batch processing with configurable concurrency prevents hitting
      rate limits
    scope: general
  - problem: Contract without standard section numbering causes empty section list
    resolution: >-
      Added paragraph-boundary fallback parser and ALL_CAPS heading detection
      for non-standard formats
    scope: general
inputs:
  - name: contract-file
    description: Plain-text contract document (.txt) to analyze
outputs:
  - name: analysis-report
    description: 'Structured report with extracted clauses, risk assessments, and summary'
fileManifest:
  - path: types.ts
    role: types
    description: 'TypeScript interfaces and enums for clauses, risks, and analysis config'
  - path: config.ts
    role: configuration
    description: Loads analysis configuration from environment variables
  - path: parse.ts
    role: parser
    description: Splits contract text into logical sections using structural patterns
  - path: extract.ts
    role: extraction
    description: Sends sections to Claude for clause identification and term extraction
  - path: risk.ts
    role: risk-assessment
    description: Analyzes extracted clauses for legal risks and suggests revisions
  - path: summarize.ts
    role: summarization
    description: Builds structured contract summary with risk heatmap and top concerns
  - path: format.ts
    role: formatting
    description: Renders analysis results as markdown report or structured JSON
prerequisites:
  - name: Node.js 18+
    check: node --version
  - name: npm or pnpm
    check: npm --version
dependencies:
  runtime:
    node: '>=18'
  npm:
    tsx: '>=4.0.0'
    '@anthropic-ai/sdk': '>=0.30.0'
  secrets:
    - ANTHROPIC_API_KEY
verification:
  command: >-
    npx tsx -e "import { ClauseType } from './src/types.ts'; console.log('Types
    loaded:', typeof ClauseType)"
  expected: 'Types loaded: object'
selfContained: true
requiredResources:
  - resourceId: anthropic-api
    kind: api-service
    required: true
    purpose: Anthropic Claude API for LLM inference
    deliveryMethod: connection
environment:
  runtime: node
  adaptationNotes: >-
    Works on any OS with Node.js. Shell commands in verification steps use Unix
    syntax; adjust for PowerShell on Windows.
---

# Contract Clause Extractor

## Goal

Extract key clauses from legal contracts, assess each clause for risk, and produce a structured report with risk scores, a heatmap, and suggested revisions — enabling faster, more consistent contract review.

## When to Use

- Reviewing vendor or SaaS agreements before signing
- Auditing existing contracts for compliance gaps
- Screening large volumes of contracts for high-risk terms
- Preparing negotiation briefs by identifying unfavorable clauses
- Onboarding new legal team members with structured contract breakdowns

## Setup

### Prerequisites

1. **Node.js 18+** — required for TypeScript execution via `tsx`
2. **Anthropic API key** — obtain from [console.anthropic.com](https://console.anthropic.com)

### Installation

```bash
npm init -y
npm install @anthropic-ai/sdk tsx typescript
```

### Environment

```bash
export ANTHROPIC_API_KEY="your-key-here"
export RISK_THRESHOLD="medium"       # low | medium | high | critical
export OUTPUT_FORMAT="markdown"       # markdown | json
export CLAUSE_TYPES="all"            # comma-separated or "all"
```

### Models

This kit uses **claude-sonnet-4-20250514** via the Anthropic cloud API for both clause extraction and risk assessment. Each contract section is sent as a separate request with a 1024-token response limit. Alternative Claude models (Haiku for speed, Opus for depth) can be substituted by modifying the `model` field in `config.ts`.

### Parameters

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `RISK_THRESHOLD` | `medium` | Minimum risk level included in the overall score |
| `OUTPUT_FORMAT` | `markdown` | Output format for the analysis report |
| `CLAUSE_TYPES` | `all` | Which clause types to extract |
| `maxBatchSize` | `5` | Concurrent sections per processing batch |
| `max_tokens` | `1024` | Token limit per API call |

## Steps

### 1. Prepare the contract

Place the contract in a plain-text file. The parser handles three common formats:
- **Numbered sections** (`1.`, `1.1`, `2.3.1`)
- **Article/Section headings** (`ARTICLE I`, `SECTION 3`)
- **ALL-CAPS headings** and markdown-style headings

### 2. Parse the contract into sections

```typescript
import { parseContract } from "./parse.js";
import { readFileSync } from "fs";

const content = readFileSync("contract.txt", "utf-8");
const sections = parseContract(content);
```

The parser detects structural boundaries and merges fragments shorter than 50 characters into adjacent sections to avoid noise.

### 3. Extract clauses

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { extractClauses } from "./extract.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const client = new Anthropic({ apiKey: config.apiKey });
const clauses = await extractClauses(sections, config, client);
```

Each section is classified into one of 13 clause types. The extractor identifies key terms, obligations, deadlines, monetary values, and party references.

### 4. Assess risks

```typescript
import { assessRisks } from "./risk.js";

const risks = await assessRisks(clauses, client, config.model);
```

The risk engine evaluates each clause against known risk patterns (unlimited liability, auto-renewal traps, broad non-competes, etc.) and returns a risk level, explanation, and suggested revision.

### 5. Generate summary and format output

```typescript
import { generateSummary } from "./summarize.js";
import { formatMarkdown, formatJSON } from "./format.js";

const summary = generateSummary(clauses, risks, config);
const result = { contract, clauses, risks, summary };

const output = config.outputFormat === "json"
  ? formatJSON(result)
  : formatMarkdown(result);
```

## Inputs

| Input | Format | Description |
|-------|--------|-------------|
| Contract file | `.txt` plain text | The legal contract to analyze |

## Outputs

| Output | Format | Description |
|--------|--------|-------------|
| Analysis report | Markdown or JSON | Extracted clauses, risk assessments, risk heatmap, and suggested revisions |

The markdown report includes:
- Overall risk score with emoji indicators
- Clause-by-clause breakdown with key terms and obligations
- Risk heatmap table showing risk level per clause type
- Suggested revisions for high-risk clauses
- Financial terms and key obligations summary

## Constraints

- Contracts must be in plain-text format; PDF or DOCX extraction is out of scope
- Maximum recommended contract length is ~50 pages to stay within reasonable API costs
- Clause type classification is limited to the 13 predefined types; uncommon clause structures map to `other`
- Risk assessment provides guidance only and does not constitute legal advice
- API costs scale linearly with section count (two calls per substantive section: extraction + risk)

## Safety Notes

- **No data persistence**: contract text is sent to the Anthropic API for analysis but is not stored by this kit
- **API key security**: the ANTHROPIC_API_KEY is read from environment variables only; never hardcode it in source files
- **Legal disclaimer**: output is for informational purposes and does not replace professional legal counsel
- **Sensitive content**: contracts may contain proprietary business terms — review your Anthropic data usage policy before processing highly confidential agreements
- **Cost awareness**: large contracts generate many API calls; use `CLAUSE_TYPES` filtering to reduce scope when testing

## Failures Overcome

1. **Malformed JSON responses** — Claude occasionally wraps JSON in markdown code fences or includes commentary. The extraction and risk modules strip fencing and fall back to safe defaults on parse failure, preventing pipeline crashes.

2. **Context window overflow** — Sending an entire contract in one request risks truncation. Batched processing splits work into configurable groups of sections, each well within the token limit.

3. **Non-standard contract formats** — Many contracts lack numbered sections. The parser chains multiple detection strategies (numbered, article-based, ALL-CAPS headings, paragraph boundaries) and merges short fragments to handle diverse formatting.

4. **Rate limit pressure** — High-volume extraction with full concurrency hits Anthropic rate limits. Sequential batch processing with a configurable `maxBatchSize` throttles requests to stay within limits.

## Validation

1. Install dependencies: `npm install @anthropic-ai/sdk tsx typescript`
2. Set `ANTHROPIC_API_KEY` in your environment
3. Run the sample contract through the pipeline
4. Verify the output includes at least 5 extracted clauses covering payment, liability, termination, confidentiality, and data protection
5. Confirm risk assessments include explanations and suggested revisions
6. Check that the risk heatmap covers all identified clause types

EOF_MARKER
mkdir -p $(dirname src/config.ts) && cat << 'EOF_MARKER' > src/config.ts
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

EOF_MARKER
mkdir -p $(dirname src/extract.ts) && cat << 'EOF_MARKER' > src/extract.ts
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

EOF_MARKER
mkdir -p $(dirname src/format.ts) && cat << 'EOF_MARKER' > src/format.ts
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

EOF_MARKER
mkdir -p $(dirname src/parse.ts) && cat << 'EOF_MARKER' > src/parse.ts
const HEADING_PATTERN = /^#{1,4}\s+.+/;
const NUMBERED_SECTION = /^(\d+\.)+\s+/;
const LETTERED_SUBSECTION = /^\s*\(?[a-z]\)\s+/i;
const ARTICLE_PATTERN = /^(ARTICLE|SECTION|CLAUSE)\s+[IVXLCDM\d]+/i;
const DEFINED_TERM_LINE = /^"[A-Z][^"]*"\s+(means|refers to|shall mean)/;
const ALL_CAPS_HEADING = /^[A-Z][A-Z\s]{4,}$/;

interface SectionBoundary {
  lineIndex: number;
  type: "heading" | "numbered" | "article" | "caps-heading";
}

function detectBoundaries(lines: string[]): SectionBoundary[] {
  const boundaries: SectionBoundary[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (ARTICLE_PATTERN.test(line)) {
      boundaries.push({ lineIndex: i, type: "article" });
    } else if (HEADING_PATTERN.test(line)) {
      boundaries.push({ lineIndex: i, type: "heading" });
    } else if (NUMBERED_SECTION.test(line) && !LETTERED_SUBSECTION.test(line)) {
      boundaries.push({ lineIndex: i, type: "numbered" });
    } else if (ALL_CAPS_HEADING.test(line) && line.length < 80) {
      boundaries.push({ lineIndex: i, type: "caps-heading" });
    }
  }

  return boundaries;
}

function splitByBoundaries(lines: string[], boundaries: SectionBoundary[]): string[] {
  if (boundaries.length === 0) return splitByParagraphs(lines);

  const sections: string[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].lineIndex;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].lineIndex : lines.length;
    const sectionLines = lines.slice(start, end);
    const content = sectionLines.join("\n").trim();
    if (content.length > 0) {
      sections.push(content);
    }
  }

  if (boundaries[0].lineIndex > 0) {
    const preamble = lines.slice(0, boundaries[0].lineIndex).join("\n").trim();
    if (preamble.length > 20) {
      sections.unshift(preamble);
    }
  }

  return sections;
}

function splitByParagraphs(lines: string[]): string[] {
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) {
        const content = current.join("\n").trim();
        if (content.length > 20) {
          sections.push(content);
        }
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    const content = current.join("\n").trim();
    if (content.length > 20) {
      sections.push(content);
    }
  }

  return sections;
}

function mergeShortSections(sections: string[], minLength: number = 50): string[] {
  const merged: string[] = [];

  for (const section of sections) {
    if (merged.length > 0 && merged[merged.length - 1].length < minLength) {
      merged[merged.length - 1] += "\n\n" + section;
    } else {
      merged.push(section);
    }
  }

  return merged;
}

export function parseContract(content: string): string[] {
  const lines = content.split("\n");
  const boundaries = detectBoundaries(lines);
  const rawSections = splitByBoundaries(lines, boundaries);
  return mergeShortSections(rawSections);
}

EOF_MARKER
mkdir -p $(dirname src/risk.ts) && cat << 'EOF_MARKER' > src/risk.ts
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

EOF_MARKER
mkdir -p $(dirname src/summarize.ts) && cat << 'EOF_MARKER' > src/summarize.ts
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

EOF_MARKER
mkdir -p $(dirname src/types.ts) && cat << 'EOF_MARKER' > src/types.ts
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

EOF_MARKER
