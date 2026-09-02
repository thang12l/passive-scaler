# Passive Scaler — Metrics Webhook Spec

For a target app (or its metrics reporter) that POSTs load metrics to Passive Scaler. Passive Scaler records the sample, decides whether to scale the matching Heroku formation (`web` or `worker`), and returns the decision.

This is the only endpoint a target app needs to implement against.

---

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/api/webhooks/metrics` |
| **Legacy alias** | `/api/webhooks/heroku-metrics` (same handler; do not use for new apps) |
| **URL** | `{SCALER_BASE_URL}/api/webhooks/metrics` |
| **Content-Type** | `application/json` |
| **Body** | JSON object (not an array, not empty) |

`GET` on the same path returns endpoint metadata only (no auth). It is not used for reporting.

### Prerequisites (scaler side)

1. The app must already exist in Passive Scaler’s dashboard (`/apps`).
2. `app_name` in the payload must match the configured app name (case-insensitive; stored lowercase).
3. The reporter must use that app’s **webhook secret** (shown once on create; rotatable from the dashboard).

---

## Authentication

Every `POST` must authenticate as the app named in `app_name`. The secret is a 64-character hex string (32 random bytes). Only the SHA-256 hash is stored; the plaintext secret is shown once.

**Preferred (use this):**

```
Authorization: Bearer <webhook-secret>
```

**Fallback (legacy):** include `secret_token` in the JSON body. Header wins if both are present.

Do **not** use the platform `ADMIN_SECRET`. That is for the dashboard/admin API only.

### Auth failure

If the header/body secret is missing, malformed, or does not match the app resolved from `app_name`:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{"success":false,"error":"Unauthorized"}
```

---

## Request payload

JSON object. Extra keys are ignored. Numeric fields accept numbers or numeric strings.

### Required

| Field | Type | Rules |
|---|---|---|
| `app_name` | string | Non-empty. Must match a configured scaler app (lookup is lowercased). |
| `timestamp` | string \| number | Parseable as a date. ISO-8601 UTC string recommended (`2026-09-03T10:00:00Z`). A Unix **millisecond** epoch number is also accepted (`Date` parsing). Invalid values → `400`. |

### Optional

| Field | Type | Rules | Used for |
|---|---|---|---|
| `process_type` | `"web"` \| `"worker"` | Only these two values. **Omit or anything other than `"worker"` is treated as `"web"`** after validation — invalid strings fail validation. | Routes the sample to the web or worker formation. |
| `dyno` | string | Echoed in the response; not used for the scale decision. | Debugging / which instance reported. |
| `avg_response_time` | number ≥ 0 | Milliseconds. | **Web scale-up/down.** |
| `avg_queue_time` | number ≥ 0 | Milliseconds. | Web fallback if `avg_response_time` is omitted. |
| `memory_percent` | number 0–100 | Percent. Missing → `0`. | **Web scale-up/down.** |
| `requests_per_minute` | number ≥ 0 | Recorded; not used in the current decision. | Observability. |
| `sample_count` | integer ≥ 0 | Recorded; not used in the current decision. | Observability. |
| `queue_size` | number ≥ 0 | Missing → `0` for worker decisions. | **Worker scale** (jobs / dyno ratio). |
| `queue_depths` | object of numbers | e.g. `{ "default": 12, "mailers": 3 }`. Accepted and stored on the metrics object; **not used in the current decision**. | Future / logging. |
| `queue_latencies` | object of numbers | Milliseconds per queue. | Web fallback: max value used as response time if `avg_response_time` and `avg_queue_time` are omitted. Also stored as last queue latency. |
| `secret_token` | string | Non-empty if present. | Legacy auth only. Prefer the Bearer header. |

### How web response time is derived

```
avg_response_time
  ?? avg_queue_time
  ?? max(queue_latencies values)
  ?? 0
```

### Web vs worker — what to send

Send **separate POSTs** per process type. One request updates one formation.

**Web reporter** (scales on latency + memory):

- Always send `process_type: "web"`.
- Always send `avg_response_time` (ms) and `memory_percent`.
- `requests_per_minute` / `sample_count` / `dyno` are optional.

**Worker reporter** (scales on queue depth):

- Always send `process_type: "worker"`.
- Always send `queue_size` (total jobs waiting). Target dynos = `ceil(queue_size / jobs_per_dyno)`, clamped to that app’s min/max worker dynos.
- `queue_latencies` / `memory_percent` are optional (recorded; worker decision currently uses `queue_size` only).

---

## Examples

### Web metrics (recommended)

```http
POST /api/webhooks/metrics HTTP/1.1
Host: scaler.example.com
Content-Type: application/json
Authorization: Bearer <webhook-secret>

{
  "app_name": "my-heroku-app",
  "process_type": "web",
  "dyno": "web.1",
  "avg_response_time": 150.5,
  "memory_percent": 72.3,
  "requests_per_minute": 45,
  "sample_count": 120,
  "timestamp": "2026-09-03T10:00:00Z"
}
```

### Worker metrics (recommended)

```http
POST /api/webhooks/metrics HTTP/1.1
Host: scaler.example.com
Content-Type: application/json
Authorization: Bearer <webhook-secret>

{
  "app_name": "my-heroku-app",
  "process_type": "worker",
  "queue_size": 27,
  "queue_depths": { "default": 20, "mailers": 7 },
  "queue_latencies": { "default": 1200, "mailers": 400 },
  "timestamp": "2026-09-03T10:00:00Z"
}
```

### curl

```bash
curl -X POST "$SCALER_BASE_URL/api/webhooks/metrics" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WEBHOOK_SECRET" \
  -d '{
    "app_name": "my-heroku-app",
    "process_type": "web",
    "avg_response_time": 150.5,
    "memory_percent": 72.3,
    "timestamp": "2026-09-03T10:00:00Z"
  }'
```

---

## Success response

`200 OK` — the sample was accepted and a decision was computed. **`200` does not mean dynos changed.** Check `scaled` and `decision`.

```json
{
  "success": true,
  "scaling_enabled": true,
  "scaled": false,
  "live_scaling": true,
  "received": {
    "app_name": "my-heroku-app",
    "process_type": "web",
    "dyno": "web.1",
    "timestamp": "2026-09-03T10:00:00.000Z"
  },
  "config": {
    "scaling_enabled": true,
    "worker_scaling_enabled": false,
    "app_name": "my-heroku-app",
    "live_scaling": true,
    "web": {
      "enabled": true,
      "live": true,
      "min_dynos": 1,
      "max_dynos": 10,
      "thresholds": {
        "response_time_ms": 2000,
        "memory_percent": 85
      },
      "cooldowns": {
        "scale_up_seconds": 300,
        "scale_down_seconds": 600
      }
    },
    "worker": {
      "enabled": false,
      "live": false,
      "min_dynos": 1,
      "max_dynos": 5,
      "thresholds": {
        "jobs_per_dyno": 10,
        "queue_size": 10,
        "queue_latency_ms": 5000,
        "memory_percent": 85
      },
      "cooldowns": {
        "scale_up_seconds": 300,
        "scale_down_seconds": 600
      }
    }
  },
  "decision": {
    "process_type": "web",
    "should_scale": false,
    "action": null,
    "current_dynos": 2,
    "target_dynos": 2,
    "reason": "Web metrics are healthy"
  }
}
```

### Top-level fields

| Field | Type | Meaning |
|---|---|---|
| `success` | `true` | Request parsed, app found, auth passed, decision computed. |
| `scaling_enabled` | boolean | Whether scaling is enabled **for the process type in this request**. If `false`, metrics were stored but no scale was attempted (`reason` explains). |
| `scaled` | boolean | `true` only if Heroku formation quantity was actually changed on this request. |
| `live_scaling` | boolean | `true` if **either** web or worker can live-scale (enabled + Heroku API key present). Not specific to this request’s process type. |
| `received` | object | Echo of resolved `app_name`, `process_type`, `dyno`, `timestamp` (ISO). |
| `config` | object | Public copy of the app’s web/worker thresholds. Safe to log; no secrets. |
| `decision` | object | Scale decision for this sample. |

### `decision`

| Field | Type | Meaning |
|---|---|---|
| `process_type` | `"web"` \| `"worker"` | Formation this request applied to. |
| `should_scale` | boolean | Engine wants a scale. May still be `scaled: false` (cooldown, lock, missing API key, etc.). |
| `action` | `"scale_up"` \| `"scale_down"` \| `null` | Intended action. `null` when not scaling. |
| `current_dynos` | number | Dyno count used for the decision (live Heroku read when an API key exists, else cached). |
| `target_dynos` | number | Desired count. Equals `current_dynos` when not scaling. |
| `reason` | string | Human-readable explanation (healthy, cooldown, disabled, scaled, etc.). |
| `execution_status` | `"not_executed"` \| `"failed"` \| `"succeeded"` \| `null` | Set when a scale was decided. `null` when no scale was attempted. `not_executed` = no Heroku API key; `failed` = Heroku call failed or returned a different quantity; `succeeded` = Heroku confirmed the target formation. |

Treat `success: true` as “reporter job succeeded.” Do not retry `200` responses. Use `scaled` / `decision.reason` / `decision.execution_status` for diagnostics only. A missing API key or failed Heroku call still returns `200` and writes a scaling event.

---

## Error responses

All errors are JSON: `{ "success": false, "error": string, ... }`.

| Status | `error` | When | Extra fields |
|---|---|---|---|
| `400` | `Request body must be valid JSON` | Body is not parseable JSON | — |
| `400` | `Request body must be a JSON object` | Body is an array, null, or primitive | — |
| `400` | `Invalid payload` | Schema failure (missing `app_name`/`timestamp`, bad `process_type`, out-of-range numbers, bad timestamp) | `details` — Zod formatted errors |
| `404` | `Unknown app` | No scaler app with that `app_name` | `app_name`, `hint` |
| `401` | `Unauthorized` | Secret missing or wrong for that app | — |
| `500` | `Internal server error` | Unexpected failure (database, etc.). Heroku scale failures are recorded as events and return `200` with `execution_status: "failed"`. | — |

### Example 400

```json
{
  "success": false,
  "error": "Invalid payload",
  "details": {
    "_errors": [],
    "timestamp": { "_errors": ["Invalid timestamp"] }
  }
}
```

### Example 404

```json
{
  "success": false,
  "error": "Unknown app",
  "app_name": "not-registered",
  "hint": "Create this app in the dashboard at /apps or ensure app_name matches the configured app name."
}
```

### Reporter retry guidance

| Status | Retry? |
|---|---|
| `200` | No |
| `400` | No — fix the payload |
| `401` | No — fix the secret / header |
| `404` | No — register the app or fix `app_name` |
| `500` | Yes — transient; use bounded backoff |
| Network / timeout | Yes — bounded backoff |

There is no idempotency key. Duplicate POSTs are processed independently. Scale-up/down cooldowns (per app, per process type) prevent flapping; they do not reject the request.

---

## Suggested reporter behavior

1. Run on a timer (e.g. every 30–60s). Cooldowns are typically minutes; more frequent reports still update last-seen metrics.
2. Set `Content-Type: application/json` and `Authorization: Bearer <secret>`.
3. Send one POST per process type you care about (`web` and/or `worker`).
4. Use UTC ISO-8601 for `timestamp` (time the sample was taken, not send time if they differ).
5. Treat HTTP `200` as success even when `scaled` is `false`.
6. Log `decision.reason` on your side; do not parse it for control flow.
7. Keep the webhook secret out of logs and source control.

---

## Out of scope for the target app

The target app does **not** call Heroku, compute dyno counts, or hit the admin API. Scaling config (min/max, thresholds, cooldowns, enable/disable, dry-run vs live) lives in the Passive Scaler dashboard.

Optional read-only check (same webhook secret):

```
GET {SCALER_BASE_URL}/api/status?app={app_name}
Authorization: Bearer <webhook-secret>
```

Returns formations, public config, and recent events. Not required to report metrics.
