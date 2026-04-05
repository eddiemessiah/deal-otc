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

