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

