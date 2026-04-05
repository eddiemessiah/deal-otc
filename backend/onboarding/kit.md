---
schema: kit/1.0
owner: matt-clawd
slug: employee-onboarding-automator
title: Employee Onboarding Automator
summary: >-
  Generates personalized onboarding checklists for new hires using AI and tracks
  completion across categories.
version: 1.0.2
license: UNLICENSED
tags:
  - onboarding
  - hr
  - automation
  - productivity
  - employee-experience
model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  hosting: cloud API — requires ANTHROPIC_API_KEY
tools:
  - terminal
  - file-reader
skills:
  - onboarding-planning
  - checklist-generation
tech:
  - typescript
  - node
services:
  - name: Anthropic API
    role: LLM for checklist personalization
    version: 2024-01
    setup: >-
      Sign up at console.anthropic.com, create an API key, set ANTHROPIC_API_KEY
      env var
parameters:
  - name: ONBOARDING_DAYS
    value: '30'
    description: Total onboarding duration in days (7-180)
  - name: NOTIFICATION_CHANNEL
    value: email
    description: 'How to notify stakeholders: email, slack, or teams'
failures:
  - problem: Claude returns malformed JSON for personalization
    resolution: >-
      Parser falls back to empty personalization — the base template is used
      as-is
    scope: general
  - problem: ANTHROPIC_API_KEY missing or invalid
    resolution: >-
      loadConfig() throws an explicit error with setup instructions before any
      API call
    scope: general
  - problem: Tracker file written to non-existent directory
    resolution: createTracker() creates parent directories recursively with mkdirSync
    scope: general
  - problem: Node.js ESM resolution fails for .ts imports
    resolution: >-
      All imports use .js extensions for ESM compatibility; run with tsx or
      ts-node/esm
    scope: environment
inputs:
  - name: New hire profile
    description: >-
      NewHire object with name, email, role, title, team, manager, buddy,
      startDate, location, and optional techStack
outputs:
  - name: Onboarding plan
    description: >-
      OnboardingPlan with personalized checklist, milestones, and tracker file
      path
  - name: Tracker file
    description: 'Persistent JSON file tracking item statuses, updated via updateItem()'
  - name: Progress report
    description: >-
      Human-readable progress report with completion percentages, overdue items,
      and action items
fileManifest:
  - path: types.ts
    role: types
    description: TypeScript interfaces and enums for all onboarding data structures
  - path: config.ts
    role: configuration
    description: Loads and validates onboarding configuration from environment variables
  - path: templates.ts
    role: templates
    description: >-
      Role-specific base checklist templates for engineering, design, product,
      sales, and general
  - path: personalize.ts
    role: ai-integration
    description: Uses Claude to personalize checklists based on hire profile and seniority
  - path: tracker.ts
    role: tracking
    description: Creates and manages persistent JSON tracker files for onboarding progress
  - path: generate.ts
    role: orchestrator
    description: >-
      Main entry point — assembles template, personalizes, creates tracker,
      returns plan
  - path: report.ts
    role: reporting
    description: Generates markdown progress reports from tracker data
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
    npx tsx -e "import { ChecklistCategory } from './src/types.ts';
    console.log('Types loaded:', typeof ChecklistCategory)"
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
    Works on any OS. Shell commands in verification steps assume bash; adapt for
    PowerShell on Windows.
---

# Employee Onboarding Automator

## Goal

Generate personalized onboarding checklists for new hires and track their completion across preboarding, day-one, first-week, first-month, compliance, tools-access, and team-integration categories. The kit produces a tailored plan based on the hire's role, seniority, location, and tech stack, then provides ongoing progress tracking and reporting.

## When to Use

- A new employee is joining and you need a structured onboarding plan
- You want to standardize onboarding across engineering, design, product, and sales roles
- You need to track onboarding progress and identify overdue or blocked items
- You want AI-powered personalization that adapts to seniority, remote/office status, and tech stack

## Setup

### Environment

1. Install Node.js 18 or later
2. Install the Anthropic SDK: `npm install @anthropic-ai/sdk`
3. Set the `ANTHROPIC_API_KEY` environment variable

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `ONBOARDING_DAYS` | `30` | Total onboarding window in days (7–180) |
| `NOTIFICATION_CHANNEL` | `email` | Notification method: `email`, `slack`, or `teams` |
| `ONBOARDING_OUTPUT_DIR` | `./onboarding-output` | Directory for tracker files |

## Steps

### 1. Prepare a new hire profile

Create a JSON file with the new hire's information. See `examples/sample-hire.json` for the expected shape. Required fields: `name`, `email`, `role`, `title`, `team`, `manager`, `buddy`, `startDate`, `location`. Optional: `techStack`.

### 2. Generate the onboarding plan

```typescript
import { loadConfig } from "./config.js";
import { generateOnboardingPlan } from "./generate.js";

const hire = {
  name: "Sarah Kim",
  email: "sarah.kim@company.com",
  role: "engineering",
  title: "Senior Frontend Engineer",
  team: "Platform",
  manager: "Alex Johnson",
  buddy: "Chris Lee",
  startDate: "2026-04-15",
  location: "remote",
  techStack: ["React", "TypeScript", "GraphQL"],
};

const config = loadConfig();
const plan = await generateOnboardingPlan(hire, config);
console.log(`Plan created: ${plan.checklist.length} items, tracker at ${plan.trackerPath}`);
```

### 3. Track progress

Update item statuses as the new hire completes tasks:

```typescript
import { updateItem } from "./tracker.js";
import { ItemStatus } from "./types.js";

updateItem(plan.trackerPath, "pre-01", ItemStatus.COMPLETED);
updateItem(plan.trackerPath, "d1-04", ItemStatus.IN_PROGRESS);
```

### 4. Generate progress reports

```typescript
import { generateProgressReport } from "./report.js";

const report = generateProgressReport(plan.trackerPath);
console.log(report);
```

The report includes overall completion percentage, category breakdowns with progress bars, overdue items, upcoming milestones, and recommended action items.

### 5. Handle role-specific templates

The kit includes built-in templates for five roles:

- **Engineering**: repo setup, CI/CD access, coding standards review, first PR, on-call orientation
- **Design**: design tool access, design system review, design critique participation
- **Product**: analytics access, roadmap review, customer call shadowing, first PRD
- **Sales**: CRM setup, demo training, sales playbook, solo demo delivery
- **General**: shared items only — suitable for operations, finance, or other roles

Pass the role string when creating the hire profile. Unrecognized roles fall back to the general template.

## Inputs

A `NewHire` JSON object with the hire's profile. See `examples/sample-hire.json` for a complete example.

## Outputs

1. **OnboardingPlan** — structured plan with personalized checklist items and milestones
2. **Tracker file** — persistent JSON file at `<outputDir>/<name>-tracker.json` for status updates
3. **Progress report** — markdown document with completion stats, overdue items, and action items

## Failures Overcome

- **Malformed Claude responses**: The personalization parser extracts JSON from freeform text and falls back gracefully if parsing fails, preserving the base template.
- **Missing API key**: Configuration validation catches missing `ANTHROPIC_API_KEY` before any network call, with a clear error message.
- **Directory creation**: The tracker automatically creates missing parent directories so the output path doesn't need to exist in advance.
- **ESM import resolution**: All internal imports use `.js` extensions for Node.js ESM compatibility. Use `tsx` or `ts-node/esm` to run TypeScript directly.

## Validation

1. Create a hire profile from `examples/sample-hire.json`
2. Run the plan generator and verify the tracker file is created
3. Update a few items and generate a progress report
4. Confirm the report shows accurate completion percentages and category breakdowns

## Constraints

- Requires an active Anthropic API key with access to Claude Sonnet
- Personalization quality depends on the detail in the hire profile — sparse profiles get fewer customizations
- Tracker files are local JSON — not suitable for concurrent multi-user writes without external locking
- Templates cover five roles; additional roles use the general template unless extended

## Safety Notes
- The Safety Notes section in kit.md ends mid-sentence: 'A maliciou.' — the intended warning about malicious hire profile fields injecting instructions .
- In buildPrompt(), fields like hire.name, hire.title, hire.team, and hire.techStack are interpolated directly into the Claude prompt string. A maliciou.

- The hire profile may contain PII (name, email). Tracker files are stored locally and never sent to external services beyond the initial Claude personalization call.
- The Claude API call sends the hire's name, title, role, team, location, and tech stack for personalization. Review your organization's data handling policy before including sensitive information.
- Tracker files should be stored in a directory with appropriate access controls since they contain employee information.
- No destructive file operations are performed — tracker files are created and updated but never deleted by the kit.

