# Passive Scaler

Push-based auto-scaling service. Target apps POST metrics to a Vercel webhook; Passive Scaler decides whether to scale Heroku web dynos and persists state in Postgres.

## Setup

### Docker (recommended for local)

```bash
cp .env.docker.example .env.docker
docker compose up --build
npm run db:push   # if needed
npm run db:seed   # optional legacy import
```

App runs at http://localhost:3001 (set `PORT` to change). Postgres is published on `DB_PORT` (default `5433`).

### Manual

```bash
npm install
cp .env.example .env.local
npm run db:push
npm run db:seed   # optional
npm run dev
```

### Vercel + Neon

```bash
vercel link
vercel integration add neon --scope <team>
vercel env pull .env.local --yes
npm run db:push
vercel --prod
```

Set `ADMIN_SECRET` in Vercel env vars before using the dashboard.

## Dashboard

Open `/apps` and sign in with `ADMIN_SECRET`.

- Add apps with per-app scaling thresholds
- Enable **dry run** per app (decisions logged, no Heroku calls)
- Copy webhook URL and per-app secret on create

## Webhook

### POST `/api/webhooks/metrics`

Canonical metrics endpoint. Legacy alias: `/api/webhooks/heroku-metrics`.

**Auth:** `Authorization: Bearer <per-app-webhook-secret>`

```bash
curl -X POST http://localhost:3001/api/webhooks/metrics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <app-webhook-secret>" \
  -d '{
    "app_name": "cartmagician",
    "process_type": "web",
    "avg_response_time": 150.5,
    "memory_percent": 72.3,
    "requests_per_minute": 45,
    "timestamp": "2026-09-02T05:38:00Z"
  }'
```

### GET `/api/status?app=<slug>`

Returns current scaling state for an app. Requires that app's webhook secret.

## Admin API

All routes require `Authorization: Bearer <ADMIN_SECRET>`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/apps` | List apps |
| POST | `/api/apps` | Create app (returns webhook secret once) |
| GET | `/api/apps/:slug` | Get app + state |
| PATCH | `/api/apps/:slug` | Update app settings |
| DELETE | `/api/apps/:slug` | Delete app |
| GET | `/api/apps/:slug/events` | Paginated scaling history |
| POST | `/api/apps/:slug/regenerate-secret` | Rotate webhook secret |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_SECRET` | Yes | Protects dashboard and admin API |
| `DATABASE_URL` | Yes | Postgres connection string |
| `PORT` | No | Listen port (default `3001`). For Docker: `PORT=3002 docker compose up` |
| `DB_PORT` | No | Host port for Docker Postgres (default `5433`). The app still connects to `db:5432` on the compose network. |
| `HEROKU_API_KEY` | No | Platform-wide Heroku key (apps can override) |
| `APP_BASE_URL` | No | Public URL for webhook links in dashboard |
| `SLACK_TOKEN` | No | Slack bot token (`xoxb-…`). Missing token or channel disables Slack |
| `SLACK_CHANNEL` | No | Slack channel ID (`C…`) for ops alerts |
| `LOG_LEVEL` | No | `debug` \| `info` \| `warn` \| `error` (default `info`) |
| `WEBHOOK_DEBUG` | No | `true` to log unsuccessful webhook requests (also on when `LOG_LEVEL=debug`) |

### Per-app settings (in database)

**Web formation** (`process_type: "web"`)
- `scaling_enabled`, min/max dynos, response time & memory thresholds, cooldowns

**Worker formation** (`process_type: "worker"`)
- `worker_scaling_enabled`, min/max worker dynos, cooldowns
- `worker_queue_size_threshold` — jobs per dyno. Target dynos = ceil(queue size / ratio), clamped to min/max. Example: 10 means queue > 10 → 2 dynos, queue > 20 → 3.

- Optional per-app Heroku API key (falls back to platform `HEROKU_API_KEY`)
- `app_name` — used in webhook payloads and as the Heroku app identifier

### Legacy seed

If migrating from single-app env vars, set `TARGET_HEROKU_APP` and `WEBHOOK_SECRET` then run:

```bash
npm run db:seed
```

## Architecture

- **Apps table** — per-app web & worker config, webhook secret hash
- **Formation state** — independent dyno count, cooldowns, and last metrics per web/worker
- **Webhook** — routes by `process_type`, scales matching Heroku formation
- **Scaling engine** — pure decision logic with cooldowns and thresholds
- **Slack ops alerts** — optional fire-and-forget notices when a process hits min/max or a live Heroku scale fails
- **Postgres** — tracks dyno count, last scale time, and event history
