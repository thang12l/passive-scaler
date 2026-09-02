# Passive Scaler

Push-based auto-scaling service. A target app POSTs metrics to a Vercel webhook; this service decides whether to scale Heroku web dynos and persists state in Postgres.

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in env vars, then:
npm run db:push
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

## Endpoints

### POST `/api/webhooks/heroku-metrics`

Receives metrics and runs the scaling decision engine.

**Auth:** `Authorization: Bearer <WEBHOOK_SECRET>` (or `secret_token` in body)

```bash
curl -X POST http://localhost:3000/api/webhooks/heroku-metrics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-webhook-secret" \
  -d '{
    "app_name": "your-laravel-app",
    "avg_response_time": 150.5,
    "memory_percent": 72.3,
    "requests_per_minute": 45,
    "timestamp": "2026-05-27T10:30:45Z"
  }'
```

### GET `/api/status`

Returns current scaling state. Requires `Authorization: Bearer <WEBHOOK_SECRET>`.

## Environment Variables

See `.env.example` for all required variables.

## Architecture

- **Webhook** — validates metrics, updates state, calls Heroku API when needed
- **Scaling engine** — pure decision logic with cooldowns and thresholds
- **Postgres** — tracks dyno count, last scale time, and event history
