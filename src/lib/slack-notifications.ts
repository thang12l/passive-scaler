import { after } from "next/server";
import { logger } from "./logger";
import type { ProcessType } from "./process-type";
import { sendSlackMessage } from "./slack-client";

type ScalingAction = "scale_up" | "scale_down";
type DynoThreshold = "min" | "max";

export interface DynoThresholdReachedInput {
  appName: string;
  appSlug: string;
  processType: ProcessType;
  action: ScalingAction;
  threshold: DynoThreshold;
  fromDynos: number;
  toDynos: number;
  minDynos: number;
  maxDynos: number;
  reason: string;
}

export interface ScalingExecutionFailedInput {
  appName: string;
  appSlug: string;
  processType: ProcessType;
  action: ScalingAction;
  fromDynos: number;
  targetDynos: number;
  herokuError: string;
  reason: string;
}

function deploymentEnvironment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

function enqueueNotification(task: () => Promise<void>): void {
  const run = () =>
    task().catch((error) => {
      logger.error("Slack notification task failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    });

  try {
    after(run);
  } catch {
    void run();
  }
}

function mrkdwnSection(text: string) {
  return { type: "section" as const, text: { type: "mrkdwn" as const, text } };
}

export function notifyDynoThresholdReached(input: DynoThresholdReachedInput): void {
  enqueueNotification(() => postDynoThresholdReached(input));
}

export function notifyScalingExecutionFailed(input: ScalingExecutionFailedInput): void {
  enqueueNotification(() => postScalingExecutionFailed(input));
}

async function postDynoThresholdReached(input: DynoThresholdReachedInput): Promise<void> {
  const env = deploymentEnvironment();
  const direction = input.threshold === "max" ? "up" : "down";
  const text =
    `[${env}] ${input.processType} dynos on ${input.appName} scaled ${direction} to ${input.threshold} ` +
    `(${input.fromDynos} → ${input.toDynos}, min ${input.minDynos}, max ${input.maxDynos})`;

  await sendSlackMessage({
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${input.processType} reached ${input.threshold} dynos`,
          emoji: true,
        },
      },
      mrkdwnSection(
        `*App:* \`${input.appName}\` (\`${input.appSlug}\`)\n` +
          `*Process:* ${input.processType}\n` +
          `*Action:* ${input.action.replace("_", " ")}\n` +
          `*Dynos:* ${input.fromDynos} → *${input.toDynos}* (min ${input.minDynos}, max ${input.maxDynos})\n` +
          `*Reason:* ${input.reason}`
      ),
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `env: \`${env}\`` }],
      },
    ],
  });
}

async function postScalingExecutionFailed(input: ScalingExecutionFailedInput): Promise<void> {
  const env = deploymentEnvironment();
  const herokuError = input.herokuError.trim() || "Unknown Heroku error";
  const text =
    `[${env}] Failed to ${input.action.replace("_", " ")} ${input.processType} dynos on ${input.appName} ` +
    `(${input.fromDynos} → ${input.targetDynos}): ${herokuError}`;

  await sendSlackMessage({
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Failed to scale ${input.processType} dynos`,
          emoji: true,
        },
      },
      mrkdwnSection(
        `*App:* \`${input.appName}\` (\`${input.appSlug}\`)\n` +
          `*Process:* ${input.processType}\n` +
          `*Action:* ${input.action.replace("_", " ")}\n` +
          `*Attempted:* ${input.fromDynos} → ${input.targetDynos}\n` +
          `*Reason:* ${input.reason}`
      ),
      mrkdwnSection(`*Heroku error:*\n\`\`\`${herokuError.slice(0, 500)}\`\`\``),
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `env: \`${env}\`` }],
      },
    ],
  });
}
