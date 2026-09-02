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

App runs at http://localhost:3000.

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
curl -X POST http://localhost:3000/api/webhooks/metrics \
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
| POST | `/api/apps/:slug/regenerate-secret` | Rotate webhook secret |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_SECRET` | Yes | Protects dashboard and admin API |
| `DATABASE_URL` | Yes | Postgres connection string |
| `HEROKU_API_KEY` | No | Platform-wide Heroku key (apps can override) |
| `APP_BASE_URL` | No | Public URL for webhook links in dashboard |

### Per-app settings (in database)

- `scaling_enabled` — master on/off
- `dry_run` — run engine but never call Heroku
- Thresholds, cooldowns, min/max dynos
- Optional per-app Heroku API key

### Legacy seed

If migrating from single-app env vars, set `TARGET_HEROKU_APP` and `WEBHOOK_SECRET` then run:

```bash
npm run db:seed
```

## Architecture

- **Apps table** — per-app config, webhook secret hash, dry-run flag
- **Webhook** — lookup app by slug, verify per-app secret, scale if live
- **Scaling engine** — pure decision logic with cooldowns and thresholds
- **Postgres** — tracks dyno count, last scale time, and event history
