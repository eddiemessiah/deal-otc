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

