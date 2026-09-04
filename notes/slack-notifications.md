# Slack Ops Notifications

## Overview

Optional internal Slack notifications for important scaling events.

Requirements:

- Notifications are fire-and-forget (`after()` so they do not delay the webhook response).
- Slack failures must never fail or delay user-facing requests.
- Missing `SLACK_TOKEN` or `SLACK_CHANNEL` results in a silent no-op.
- Slack formatting lives in `src/lib/slack-notifications.ts`.
- Call sites use typed event helpers, not assembled Slack messages.
- Keep PII minimal. Never send passwords, tokens, secrets, or full payment details.
- These are internal ops alerts, not a user-facing Slack integration.

## Setup

1. Create or reuse a Slack app.
2. Add the bot scope `chat:write`.
3. Install the app into the Slack workspace.
4. Invite the bot to the target channel (`/invite @YourBot` in the channel).
5. Store the bot token and channel ID as environment variables.
6. Restart the web/API process after changing environment variables.

## Environment

```env
SLACK_TOKEN=xoxb-your-bot-token
SLACK_CHANNEL=C0123456789
```

Either missing value means Slack is disabled. Set these on the Vercel deployment (and locally in `.env.local` / `.env.docker` when testing).

## Architecture

```text
Scaling outcome (after DB write)
    |
    v
Typed helper in slack-notifications.ts
    |
    v
slack-client.ts (chat.postMessage)
    |
    v
Slack channel
```

The Slack adapter (`src/lib/slack-client.ts`):

- No-ops when token or channel is missing.
- Trims and ignores empty messages.
- Sends a plain-text fallback plus mrkdwn blocks.
- Catches and logs Slack API errors (does not log the token).
- Never throws Slack errors to the scaling path.

The notification service (`src/lib/slack-notifications.ts`):

- Formats messages consistently.
- Includes the deployment environment (`VERCEL_ENV` or `NODE_ENV`).
- Provides one helper per event.
- Avoids business logic and database mutations.

## Wired events

| Event | Helper | Source of truth | Trigger condition |
|---|---|---|---|
| Dyno min/max threshold | `notifyDynoThresholdReached` | `recordScalingDecision` in `src/lib/scaling-service.ts` | Formation change **succeeded**, and the resulting quantity is max after `scale_up` or min after `scale_down` |
| Scaling execution failed | `notifyScalingExecutionFailed` | `recordScalingDecision` in `src/lib/scaling-service.ts` | Heroku API key is set, formation PATCH was attempted, and execution status is `failed` |

Not notified:

- Heroku API key missing (`not_executed`).
- Metrics received with no scale decision.
- Already at min/max (engine returns `shouldScale: false`).
- Scale succeeded to a quantity that is not min or max.

Duplicates: a recorded scale always updates `lastScaleTime`, so cooldown prevents repeating the same scale (and the same alert) until cooldown expires.

## Local testing

1. Set `SLACK_TOKEN` and `SLACK_CHANNEL` in `.env.local` (or `.env.docker`).
2. Invite the bot to the channel.
3. Restart `npm run dev` / `docker compose up`.
4. Threshold alert: enable scaling with a live Heroku key, then send metrics that scale that process to its min or max.
5. Failure alert: use a valid-looking Heroku key that cannot PATCH formation (wrong app, revoked key, Heroku outage). Confirm the Slack message includes the Heroku status/body.
6. Disable Slack by clearing either env var — scaling must still succeed and no Slack error should surface.

## Troubleshooting

| Slack error | Cause | Fix |
|---|---|---|
| `not_in_channel` | Bot is not a member of `SLACK_CHANNEL` | Invite the bot to the channel |
| `invalid_auth` | Token missing, revoked, or wrong workspace | Reinstall the Slack app and update `SLACK_TOKEN` |
| `channel_not_found` | Channel ID is wrong or private without access | Use the channel’s `C…` ID, then invite the bot |
