import { logger } from "./logger";

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text: string }>;
}

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

function slackConfig(): { token: string; channel: string } | null {
  const token = process.env.SLACK_TOKEN?.trim() ?? "";
  const channel = process.env.SLACK_CHANNEL?.trim() ?? "";
  if (!token || !channel) return null;
  return { token, channel };
}

export async function sendSlackMessage(message: SlackMessage): Promise<void> {
  const text = message.text.trim();
  if (!text) return;

  const config = slackConfig();
  if (!config) return;

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: config.channel,
        text,
        blocks: message.blocks,
      }),
    });

    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!payload.ok) {
      logger.error("Slack API error", {
        error: payload.error ?? `HTTP ${response.status}`,
      });
    }
  } catch (error) {
    logger.error("Slack send failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
