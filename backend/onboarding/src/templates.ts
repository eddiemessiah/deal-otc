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

