mkdir -p $(dirname examples/sample-hire.json) && cat << 'EOF_MARKER' > examples/sample-hire.json
{
  "name": "Sarah Kim",
  "email": "sarah.kim@company.com",
  "role": "engineering",
  "title": "Senior Frontend Engineer",
  "team": "Platform",
  "manager": "Alex Johnson",
  "buddy": "Chris Lee",
  "startDate": "2026-04-15",
  "location": "remote",
  "techStack": ["React", "TypeScript", "GraphQL"]
}

EOF_MARKER
mkdir -p $(dirname kit.md) && cat << 'EOF_MARKER' > kit.md
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

EOF_MARKER
mkdir -p $(dirname src/config.ts) && cat << 'EOF_MARKER' > src/config.ts
import type { OnboardingConfig } from "./types.js";

export function loadConfig(overrides: Partial<OnboardingConfig> = {}): OnboardingConfig {
  const config: OnboardingConfig = {
    onboardingDays: parseInt(process.env.ONBOARDING_DAYS ?? "30", 10),
    notificationChannel: (process.env.NOTIFICATION_CHANNEL as OnboardingConfig["notificationChannel"]) ?? "email",
    outputDir: process.env.ONBOARDING_OUTPUT_DIR ?? "./onboarding-output",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    ...overrides,
  };

  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required. Set it as an environment variable or pass it in overrides.");
  }

  if (config.onboardingDays < 7 || config.onboardingDays > 180) {
    throw new Error("ONBOARDING_DAYS must be between 7 and 180.");
  }

  if (!["email", "slack", "teams"].includes(config.notificationChannel)) {
    throw new Error("NOTIFICATION_CHANNEL must be one of: email, slack, teams.");
  }

  return config;
}

EOF_MARKER
mkdir -p $(dirname src/generate.ts) && cat << 'EOF_MARKER' > src/generate.ts
import * as crypto from "node:crypto";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { personalizeChecklist } from "./personalize.js";
import { getBaseChecklist } from "./templates.js";
import { createTracker } from "./tracker.js";
import type { Milestone, NewHire, OnboardingConfig, OnboardingPlan } from "./types.js";

function buildMilestones(role: string): Milestone[] {
  const common: Milestone[] = [
    {
      name: "Preboarding Complete",
      targetDay: 0,
      criteria: ["pre-01", "pre-02", "pre-03", "pre-04"],
      completed: false,
    },
    {
      name: "Day One Orientation Done",
      targetDay: 1,
      criteria: ["d1-01", "d1-02", "d1-03", "d1-04"],
      completed: false,
    },
    {
      name: "First Week Integration",
      targetDay: 5,
      criteria: ["w1-01", "w1-02", "w1-03"],
      completed: false,
    },
    {
      name: "Compliance Cleared",
      targetDay: 5,
      criteria: ["comp-01", "comp-02"],
      completed: false,
    },
    {
      name: "30-Day Review",
      targetDay: 30,
      criteria: ["m1-01", "m1-02"],
      completed: false,
    },
  ];

  const roleSpecific: Record<string, Milestone[]> = {
    engineering: [
      {
        name: "Dev Environment Ready",
        targetDay: 2,
        criteria: ["eng-01", "eng-02"],
        completed: false,
      },
      {
        name: "First PR Merged",
        targetDay: 10,
        criteria: ["eng-05"],
        completed: false,
      },
    ],
    design: [
      {
        name: "Design Tools Configured",
        targetDay: 2,
        criteria: ["des-01", "des-02"],
        completed: false,
      },
    ],
    product: [
      {
        name: "Roadmap Reviewed",
        targetDay: 5,
        criteria: ["pm-02", "pm-03"],
        completed: false,
      },
    ],
    sales: [
      {
        name: "CRM and Demo Ready",
        targetDay: 5,
        criteria: ["sales-01", "sales-02"],
        completed: false,
      },
    ],
  };

  return [...common, ...(roleSpecific[role.toLowerCase()] ?? [])];
}

export async function generateOnboardingPlan(hire: NewHire, config: OnboardingConfig): Promise<OnboardingPlan> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const baseChecklist = getBaseChecklist(hire.role);
  const personalizedChecklist = await personalizeChecklist(baseChecklist, hire, client);

  const planId = crypto.randomUUID();
  const safeName = hire.name.toLowerCase().replace(/\s+/g, "-");
  const trackerPath = path.join(config.outputDir, `${safeName}-tracker.json`);
  const milestones = buildMilestones(hire.role);

  const plan: OnboardingPlan = {
    id: planId,
    hire,
    checklist: personalizedChecklist,
    milestones,
    createdAt: new Date().toISOString(),
    trackerPath,
  };

  createTracker(plan);
  return plan;
}

EOF_MARKER
mkdir -p $(dirname src/personalize.ts) && cat << 'EOF_MARKER' > src/personalize.ts
import type Anthropic from "@anthropic-ai/sdk";
import { ChecklistCategory, type ChecklistItem, ItemStatus, type NewHire } from "./types.js";

interface PersonalizationResult {
  addItems: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    owner: string;
    dayTarget: number;
    required: boolean;
  }>;
  removeItemIds: string[];
  modifyItems: Array<{
    id: string;
    dayTarget?: number;
    description?: string;
    owner?: string;
  }>;
}

function buildPrompt(base: ChecklistItem[], hire: NewHire): string {
  return `You are an HR onboarding specialist. Given a new hire profile and a base checklist, personalize the onboarding plan.

NEW HIRE PROFILE:
- Name: ${hire.name}
- Title: ${hire.title}
- Role: ${hire.role}
- Team: ${hire.team}
- Manager: ${hire.manager}
- Buddy: ${hire.buddy}
- Start Date: ${hire.startDate}
- Location: ${hire.location}
- Tech Stack: ${hire.techStack?.join(", ") ?? "N/A"}

BASE CHECKLIST (${base.length} items):
${base.map((i) => `  [${i.id}] ${i.title} (category: ${i.category}, owner: ${i.owner}, day: ${i.dayTarget})`).join("\n")}

Personalize by:
1. Adding 3-5 items specific to the hire's role, seniority ("Senior" in title means leadership items), tech stack, and location (${hire.location}).
2. Removing items that don't apply (e.g., office tour for remote hires).
3. Adjusting timelines if the hire is senior (they may ramp faster).

Respond with ONLY valid JSON matching this schema:
{
  "addItems": [{ "id": "custom-XX", "title": "...", "description": "...", "category": "preboarding|day-one|first-week|first-month|compliance|tools-access|team-integration", "owner": "IT|HR|Manager|Buddy|NewHire", "dayTarget": N, "required": true|false }],
  "removeItemIds": ["item-id-to-remove"],
  "modifyItems": [{ "id": "existing-id", "dayTarget": N, "description": "updated text", "owner": "NewOwner" }]
}`;
}

function parseResponse(text: string): PersonalizationResult {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { addItems: [], removeItemIds: [], modifyItems: [] };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      addItems: Array.isArray(parsed.addItems) ? parsed.addItems : [],
      removeItemIds: Array.isArray(parsed.removeItemIds) ? parsed.removeItemIds : [],
      modifyItems: Array.isArray(parsed.modifyItems) ? parsed.modifyItems : [],
    };
  } catch {
    return { addItems: [], removeItemIds: [], modifyItems: [] };
  }
}

function isValidCategory(cat: string): cat is ChecklistCategory {
  return Object.values(ChecklistCategory).includes(cat as ChecklistCategory);
}

function applyPersonalization(base: ChecklistItem[], result: PersonalizationResult): ChecklistItem[] {
  const removeSet = new Set(result.removeItemIds);
  const items = base.filter((i) => !removeSet.has(i.id));

  for (const mod of result.modifyItems) {
    const target = items.find((i) => i.id === mod.id);
    if (!target) continue;
    if (mod.dayTarget !== undefined) target.dayTarget = mod.dayTarget;
    if (mod.description) target.description = mod.description;
    if (mod.owner) target.owner = mod.owner as ChecklistItem["owner"];
  }

  for (const add of result.addItems) {
    if (!isValidCategory(add.category)) continue;
    items.push({
      id: add.id,
      title: add.title,
      description: add.description,
      category: add.category as ChecklistCategory,
      owner: (add.owner ?? "NewHire") as ChecklistItem["owner"],
      dayTarget: add.dayTarget,
      status: ItemStatus.PENDING,
      required: add.required ?? false,
    });
  }

  return items.sort((a, b) => a.dayTarget - b.dayTarget);
}

export async function personalizeChecklist(
  base: ChecklistItem[],
  hire: NewHire,
  client: Anthropic,
): Promise<ChecklistItem[]> {
  const prompt = buildPrompt(base, hire);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const result = parseResponse(text);
  return applyPersonalization(base, result);
}

EOF_MARKER
mkdir -p $(dirname src/report.ts) && cat << 'EOF_MARKER' > src/report.ts
import { getProgress } from "./tracker.js";
import { ChecklistCategory, ItemStatus } from "./types.js";

const categoryLabels: Record<ChecklistCategory, string> = {
  [ChecklistCategory.PREBOARDING]: "Preboarding",
  [ChecklistCategory.DAY_ONE]: "Day One",
  [ChecklistCategory.FIRST_WEEK]: "First Week",
  [ChecklistCategory.FIRST_MONTH]: "First Month",
  [ChecklistCategory.COMPLIANCE]: "Compliance",
  [ChecklistCategory.TOOLS_ACCESS]: "Tools & Access",
  [ChecklistCategory.TEAM_INTEGRATION]: "Team Integration",
};

function progressBar(percentage: number, width = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${percentage}%`;
}

export function generateProgressReport(trackerPath: string): string {
  const progress = getProgress(trackerPath);
  const lines: string[] = [];

  lines.push(`# Onboarding Progress Report: ${progress.hireeName}`);
  lines.push(`_Generated: ${new Date().toISOString().split("T")[0]}_`);
  lines.push("");

  lines.push("## Overall Progress");
  lines.push("");
  lines.push(progressBar(progress.completionPercentage));
  lines.push("");
  lines.push(`| Status | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Completed | ${progress.completed} |`);
  lines.push(`| In Progress | ${progress.inProgress} |`);
  lines.push(`| Pending | ${progress.pending} |`);
  lines.push(`| Blocked | ${progress.blocked} |`);
  lines.push(`| Skipped | ${progress.skipped} |`);
  lines.push(`| **Total** | **${progress.totalItems}** |`);
  lines.push("");

  lines.push("## Progress by Category");
  lines.push("");
  for (const [cat, stats] of Object.entries(progress.categoryBreakdown)) {
    const label = categoryLabels[cat as ChecklistCategory] ?? cat;
    if (stats.total === 0) continue;
    lines.push(`### ${label}`);
    lines.push(progressBar(stats.percentage));
    lines.push(`${stats.completed}/${stats.total} items completed`);
    lines.push("");
  }

  if (progress.overdueItems.length > 0) {
    lines.push("## Overdue Items");
    lines.push("");
    lines.push("| Item | Owner | Target Day | Status |");
    lines.push("|------|-------|------------|--------|");
    for (const item of progress.overdueItems) {
      const statusLabel = item.status === ItemStatus.BLOCKED ? "BLOCKED" : "OVERDUE";
      lines.push(`| ${item.title} | ${item.owner} | Day ${item.dayTarget} | ${statusLabel} |`);
    }
    lines.push("");
  }

  if (progress.upcomingMilestones.length > 0) {
    lines.push("## Upcoming Milestones");
    lines.push("");
    for (const milestone of progress.upcomingMilestones) {
      lines.push(`- **${milestone.name}** — Target: Day ${milestone.targetDay}`);
    }
    lines.push("");
  }

  if (progress.blocked > 0 || progress.overdueItems.length > 0 || progress.completionPercentage < 50) {
    lines.push("## Action Items");
    lines.push("");
    if (progress.blocked > 0) {
      lines.push(`- Resolve ${progress.blocked} blocked item(s) — check dependencies and owners`);
    }
    if (progress.overdueItems.length > 0) {
      lines.push(`- Follow up on ${progress.overdueItems.length} overdue item(s)`);
    }
    if (progress.completionPercentage < 50) {
      lines.push("- Overall completion below 50% — consider reviewing workload with manager");
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("_Report generated by Employee Onboarding Automator_");

  return lines.join("\n");
}

EOF_MARKER
mkdir -p $(dirname src/templates.ts) && cat << 'EOF_MARKER' > src/templates.ts
import { ChecklistCategory as C, type ChecklistItem, ItemStatus } from "./types.js";

const S = ItemStatus.PENDING;

function mk(id: string, t: string, d: string, c: C, o: ChecklistItem["owner"], day: number, req = true): ChecklistItem {
  return { id, title: t, description: d, category: c, owner: o, dayTarget: day, status: S, required: req };
}

const shared: ChecklistItem[] = [
  mk("pre-01", "Send welcome email", "Welcome message with start date and first-day agenda", C.PREBOARDING, "HR", -7),
  mk("pre-02", "Prepare workstation", "Laptop, monitors, peripherals ordered and configured", C.PREBOARDING, "IT", -5),
  mk("pre-03", "Create company accounts", "Email, SSO, Slack, calendar provisioned", C.PREBOARDING, "IT", -3),
  mk("pre-04", "Set up payroll and benefits", "Add to payroll, send benefits enrollment link", C.PREBOARDING, "HR", -5),
  mk("d1-01", "Workspace walkthrough", "Office tour or virtual tools and channels walkthrough", C.DAY_ONE, "Buddy", 1),
  mk("d1-02", "Team introduction meeting", "Meet the team, learn roles and current projects", C.DAY_ONE, "Manager", 1),
  mk("d1-03", "HR orientation session", "Policies, values, org structure, key contacts", C.DAY_ONE, "HR", 1),
  mk("d1-04", "Set up work environment", "Install software, clone repos, configure tools", C.DAY_ONE, "NewHire", 1),
  mk(
    "w1-01",
    "Complete compliance training",
    "Security awareness, data handling, code of conduct",
    C.FIRST_WEEK,
    "NewHire",
    5,
  ),
  mk("w1-02", "1:1 with manager", "First check-in: answer questions, set short-term goals", C.FIRST_WEEK, "Manager", 3),
  mk("w1-03", "Review team documentation", "Read team wiki, runbooks, architecture docs", C.FIRST_WEEK, "NewHire", 5),
  mk("m1-01", "30-day check-in", "Review progress, adjust goals, collect feedback", C.FIRST_MONTH, "Manager", 30),
  mk(
    "m1-02",
    "Deliver first contribution",
    "Ship a feature, close a ticket, or finish a deliverable",
    C.FIRST_MONTH,
    "NewHire",
    20,
  ),
  mk("comp-01", "Sign NDA and IP agreement", "Review and sign legal documents", C.COMPLIANCE, "NewHire", 1),
  mk("comp-02", "Complete I-9 verification", "Employment eligibility verification", C.COMPLIANCE, "HR", 3),
  mk("tools-01", "VPN and security setup", "Configure VPN, 2FA, and password manager", C.TOOLS_ACCESS, "IT", 1),
  mk("team-01", "Attend first team standup", "Join the regular standup/sync meeting", C.TEAM_INTEGRATION, "NewHire", 2),
];

const engineeringExtras: ChecklistItem[] = [
  mk(
    "eng-01",
    "Clone and build main repos",
    "Set up local dev environment for primary services",
    C.DAY_ONE,
    "NewHire",
    1,
  ),
  mk(
    "eng-02",
    "Get CI/CD pipeline access",
    "Access to GitHub Actions, Jenkins, or build system",
    C.TOOLS_ACCESS,
    "IT",
    2,
  ),
  mk("eng-03", "Review coding standards", "Style guide, linting rules, and PR conventions", C.FIRST_WEEK, "NewHire", 3),
  mk(
    "eng-04",
    "Set up local test environment",
    "Database, Docker, and test fixtures running locally",
    C.FIRST_WEEK,
    "NewHire",
    4,
  ),
  mk("eng-05", "Submit first pull request", "Small bug fix or documentation improvement", C.FIRST_MONTH, "NewHire", 10),
  mk(
    "eng-06",
    "On-call orientation",
    "Review incident runbooks and escalation procedures",
    C.FIRST_MONTH,
    "Manager",
    15,
  ),
  mk(
    "eng-07",
    "Architecture deep-dive",
    "System architecture walkthrough with a senior engineer",
    C.FIRST_WEEK,
    "Buddy",
    5,
  ),
  mk(
    "eng-08",
    "Security review training",
    "Secure coding practices and vulnerability awareness",
    C.COMPLIANCE,
    "NewHire",
    7,
  ),
];

const designExtras: ChecklistItem[] = [
  mk("des-01", "Access design tools", "Figma, Sketch, or Adobe Creative Cloud provisioned", C.TOOLS_ACCESS, "IT", 1),
  mk("des-02", "Review design system", "Component library, tokens, and brand guidelines", C.FIRST_WEEK, "NewHire", 3),
  mk(
    "des-03",
    "Audit existing designs",
    "Review shipped designs for style and pattern familiarity",
    C.FIRST_WEEK,
    "Buddy",
    5,
  ),
  mk(
    "des-04",
    "Meet product partners",
    "Understand current product roadmap and priorities",
    C.FIRST_WEEK,
    "Manager",
    4,
  ),
  mk(
    "des-05",
    "Complete first design task",
    "Deliver a small design component or improvement",
    C.FIRST_MONTH,
    "NewHire",
    14,
  ),
  mk("des-06", "Present at design critique", "Share work-in-progress for team feedback", C.FIRST_MONTH, "NewHire", 21),
  mk("des-07", "User research session", "Observe or participate in a usability test", C.FIRST_MONTH, "Buddy", 18),
  mk(
    "des-08",
    "Accessibility standards review",
    "Learn accessibility guidelines and audit checklist",
    C.FIRST_WEEK,
    "NewHire",
    5,
  ),
];

const productExtras: ChecklistItem[] = [
  mk("pm-01", "Access analytics platforms", "Amplitude, Mixpanel, or dashboards provisioned", C.TOOLS_ACCESS, "IT", 1),
  mk("pm-02", "Review product roadmap", "Current quarter priorities and backlog", C.FIRST_WEEK, "Manager", 3),
  mk("pm-03", "Customer call shadowing", "Sit in on 2+ customer or user research calls", C.FIRST_WEEK, "Buddy", 5),
  mk("pm-04", "Write first PRD or spec", "Draft a small product requirements document", C.FIRST_MONTH, "NewHire", 14),
  mk(
    "pm-05",
    "Lead first sprint planning",
    "Facilitate a planning session with engineering",
    C.FIRST_MONTH,
    "NewHire",
    21,
  ),
  mk("pm-06", "Competitive landscape review", "Research and document key competitors", C.FIRST_MONTH, "NewHire", 20),
  mk(
    "pm-07",
    "Feature flag and experiment setup",
    "Learn experimentation framework and feature flags",
    C.FIRST_WEEK,
    "NewHire",
    5,
  ),
  mk("pm-08", "Stakeholder mapping", "Identify key internal and external stakeholders", C.FIRST_MONTH, "NewHire", 10),
];

const salesExtras: ChecklistItem[] = [
  mk("sales-01", "CRM setup", "Salesforce, HubSpot, or CRM access and pipeline config", C.TOOLS_ACCESS, "IT", 1),
  mk("sales-02", "Product demo training", "Learn the standard product demo flow end-to-end", C.FIRST_WEEK, "Buddy", 5),
  mk(
    "sales-03",
    "Review sales playbook",
    "Objection handling, pricing, competitive positioning",
    C.FIRST_WEEK,
    "NewHire",
    4,
  ),
  mk("sales-04", "Shadow 3 sales calls", "Observe reps on discovery and closing calls", C.FIRST_WEEK, "Buddy", 5),
  mk("sales-05", "Deliver first solo demo", "Run a product demo independently", C.FIRST_MONTH, "NewHire", 14),
  mk(
    "sales-06",
    "Territory / account planning",
    "Build pipeline plan for assigned territory",
    C.FIRST_MONTH,
    "Manager",
    20,
  ),
  mk(
    "sales-07",
    "Pricing deep-dive",
    "Learn pricing tiers, packaging, and discount policies",
    C.FIRST_WEEK,
    "Manager",
    4,
  ),
  mk(
    "sales-08",
    "First prospecting outreach",
    "Send first batch of outbound prospecting messages",
    C.FIRST_MONTH,
    "NewHire",
    12,
  ),
];

const roleTemplates: Record<string, ChecklistItem[]> = {
  engineering: engineeringExtras,
  design: designExtras,
  product: productExtras,
  sales: salesExtras,
  general: [],
};

export function getBaseChecklist(role: string): ChecklistItem[] {
  const extras = roleTemplates[role.toLowerCase()] ?? roleTemplates.general;
  return [...shared, ...extras].map((item) => ({ ...item }));
}

EOF_MARKER
mkdir -p $(dirname src/tracker.ts) && cat << 'EOF_MARKER' > src/tracker.ts
import * as fs from "node:fs";
import * as path from "node:path";
import {
  ChecklistCategory,
  type ChecklistItem,
  ItemStatus,
  type Milestone,
  type OnboardingPlan,
  type ProgressReport,
} from "./types.js";

interface TrackerData {
  planId: string;
  hireeName: string;
  hireeEmail: string;
  startDate: string;
  items: ChecklistItem[];
  milestones: Milestone[];
  lastUpdated: string;
}

export function createTracker(plan: OnboardingPlan): string {
  const dir = path.dirname(plan.trackerPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data: TrackerData = {
    planId: plan.id,
    hireeName: plan.hire.name,
    hireeEmail: plan.hire.email,
    startDate: plan.hire.startDate,
    items: plan.checklist,
    milestones: plan.milestones,
    lastUpdated: new Date().toISOString(),
  };

  fs.writeFileSync(plan.trackerPath, JSON.stringify(data, null, 2), "utf-8");
  return plan.trackerPath;
}

function readTracker(trackerPath: string): TrackerData {
  const raw = fs.readFileSync(trackerPath, "utf-8");
  return JSON.parse(raw) as TrackerData;
}

function writeTracker(trackerPath: string, data: TrackerData): void {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(trackerPath, JSON.stringify(data, null, 2), "utf-8");
}

export function updateItem(trackerPath: string, itemId: string, status: ItemStatus): void {
  const data = readTracker(trackerPath);
  const item = data.items.find((i) => i.id === itemId);
  if (!item) {
    throw new Error(`Item "${itemId}" not found in tracker at ${trackerPath}`);
  }
  item.status = status;

  updateMilestones(data);
  writeTracker(trackerPath, data);
}

function updateMilestones(data: TrackerData): void {
  for (const milestone of data.milestones) {
    milestone.completed = milestone.criteria.every((criterionId) => {
      const item = data.items.find((i) => i.id === criterionId);
      return item?.status === ItemStatus.COMPLETED;
    });
  }
}

function daysSinceStart(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function getProgress(trackerPath: string): ProgressReport {
  const data = readTracker(trackerPath);
  const elapsed = daysSinceStart(data.startDate);

  const counts = { completed: 0, inProgress: 0, pending: 0, blocked: 0, skipped: 0 };
  const catStats: Record<string, { total: number; completed: number }> = {};

  for (const cat of Object.values(ChecklistCategory)) {
    catStats[cat] = { total: 0, completed: 0 };
  }

  const overdueItems: ChecklistItem[] = [];

  for (const item of data.items) {
    switch (item.status) {
      case ItemStatus.COMPLETED:
        counts.completed++;
        break;
      case ItemStatus.IN_PROGRESS:
        counts.inProgress++;
        break;
      case ItemStatus.PENDING:
        counts.pending++;
        break;
      case ItemStatus.BLOCKED:
        counts.blocked++;
        break;
      case ItemStatus.SKIPPED:
        counts.skipped++;
        break;
    }

    const cat = catStats[item.category];
    if (cat) {
      cat.total++;
      if (item.status === ItemStatus.COMPLETED) cat.completed++;
    }

    const isOverdue =
      item.dayTarget <= elapsed && item.status !== ItemStatus.COMPLETED && item.status !== ItemStatus.SKIPPED;
    if (isOverdue) {
      overdueItems.push(item);
    }
  }

  const total = data.items.length;
  const completionPercentage = total > 0 ? Math.round((counts.completed / total) * 100) : 0;

  const categoryBreakdown = {} as ProgressReport["categoryBreakdown"];
  for (const [cat, stats] of Object.entries(catStats)) {
    categoryBreakdown[cat as ChecklistCategory] = {
      total: stats.total,
      completed: stats.completed,
      percentage: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
    };
  }

  const upcomingMilestones = data.milestones.filter((m) => !m.completed && m.targetDay > elapsed);

  return {
    hireeName: data.hireeName,
    totalItems: total,
    completed: counts.completed,
    inProgress: counts.inProgress,
    pending: counts.pending,
    blocked: counts.blocked,
    skipped: counts.skipped,
    completionPercentage,
    overdueItems,
    upcomingMilestones,
    categoryBreakdown,
  };
}

EOF_MARKER
mkdir -p $(dirname src/types.ts) && cat << 'EOF_MARKER' > src/types.ts
export enum ChecklistCategory {
  PREBOARDING = "preboarding",
  DAY_ONE = "day-one",
  FIRST_WEEK = "first-week",
  FIRST_MONTH = "first-month",
  COMPLIANCE = "compliance",
  TOOLS_ACCESS = "tools-access",
  TEAM_INTEGRATION = "team-integration",
}

export enum ItemStatus {
  PENDING = "pending",
  IN_PROGRESS = "in-progress",
  COMPLETED = "completed",
  BLOCKED = "blocked",
  SKIPPED = "skipped",
}

export type Owner = "IT" | "HR" | "Manager" | "Buddy" | "NewHire";

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  category: ChecklistCategory;
  owner: Owner;
  dayTarget: number;
  status: ItemStatus;
  required: boolean;
  dependsOn?: string[];
}

export interface NewHire {
  name: string;
  email: string;
  role: string;
  title: string;
  team: string;
  manager: string;
  buddy: string;
  startDate: string;
  location: "remote" | "office" | "hybrid";
  techStack?: string[];
}

export interface Milestone {
  name: string;
  targetDay: number;
  criteria: string[];
  completed: boolean;
}

export interface OnboardingPlan {
  id: string;
  hire: NewHire;
  checklist: ChecklistItem[];
  milestones: Milestone[];
  createdAt: string;
  trackerPath: string;
}

export interface OnboardingConfig {
  onboardingDays: number;
  notificationChannel: "email" | "slack" | "teams";
  outputDir: string;
  anthropicApiKey: string;
}

export interface ProgressReport {
  hireeName: string;
  totalItems: number;
  completed: number;
  inProgress: number;
  pending: number;
  blocked: number;
  skipped: number;
  completionPercentage: number;
  overdueItems: ChecklistItem[];
  upcomingMilestones: Milestone[];
  categoryBreakdown: Record<ChecklistCategory, { total: number; completed: number; percentage: number }>;
}

EOF_MARKER
