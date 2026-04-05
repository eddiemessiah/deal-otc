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

