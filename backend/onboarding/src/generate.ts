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

