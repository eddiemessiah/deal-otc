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

