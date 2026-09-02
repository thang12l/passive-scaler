# Master Plan: Push-Based Auto-Scaling with Vercel

## Overview

Implement a **push-based auto-scaling system** where your existing Laravel app on Heroku reports metrics to a Vercel serverless app, which then makes scaling decisions. Zero extra infrastructure cost - completely free!

**Architecture:** Target app → Vercel webhook → Heroku API scaling
**Cost:** $0 (Vercel free tier + existing Heroku infrastructure)
**Complexity:** Low (simple webhook + serverless functions)
**Latency:** ~30 seconds between metric collection and scaling decision

---

## Why This Model Works

```
                    Target App (Heroku)
                    ┌─────────────────────┐
                    │ web dyno            │
                    │ └─ Tracks metrics   │
                    │ worker dyno         │
                    │ └─ Every 30s:       │
                    │    Dispatch job     │
                    │    POST metrics     │
                    └─────────────────────┘
                            │
                            │ HTTP POST
                            │ (metrics)
                            ↓
                    Vercel App (FREE!)
                    ┌─────────────────────┐
                    │ Serverless Function │
                    │ ├─ Receive metrics  │
                    │ ├─ Validate token   │
                    │ ├─ Make decision    │
                    │ ├─ Scale if needed  │
                    │ └─ Store state      │
                    └─────────────────────┘
                            │
                            ├─ State → Vercel Postgres (Free)
                            │
                            └─ Scaling → Heroku API
```

**Key Benefits:**
- ✅ Free (no extra Heroku dyno)
- ✅ Uses existing worker infrastructure
- ✅ Event-driven (natural fit for serverless)
- ✅ Simple to understand and maintain
- ✅ Scales with your app (worker can scale without affecting monitoring logic)

---

## System Architecture

### Component 1: Metrics Reporting (Laravel)

**What's already done:**
- Middleware tracking response times
- Cache storing metrics

**What needs to be added:**
- New job: `ReportMetricsJob`
- Schedule it to run every 30 seconds via Laravel scheduler
- Job fetches metrics and POSTs to Vercel webhook

**Flow:**
```
Laravel Scheduler (every 30s)
  ↓
Dispatch ReportMetricsJob
  ↓
Job fetches metrics from cache
  ↓
Job POSTs to Vercel with:
  - avg_response_time
  - memory_percent
  - requests_per_minute
  - timestamp
  - secret_token (for validation)
  ↓
Done (doesn't wait for response)
```

### Component 2: Vercel Webhook Endpoint

**Single serverless function that:**
1. Receives metrics from Laravel app
2. Validates secret token
3. Fetches current state from Vercel Postgres
4. Runs scaling decision engine
5. If scaling needed:
   - Calls Heroku API to scale
   - Updates database state
   - Logs event
6. Returns decision

**Endpoint:** `POST /api/webhooks/heroku-metrics`

**Request Body:**
```json
{
  "app_name": "your-laravel-app",
  "avg_response_time": 150.5,
  "memory_percent": 72.3,
  "requests_per_minute": 45,
  "timestamp": "2026-05-27T10:30:45Z",
  "secret_token": "your-webhook-secret"
}
```

**Response:**
```json
{
  "success": true,
  "decision": {
    "should_scale": false,
    "action": null,
    "current_dynos": 2,
    "reason": "Metrics are healthy"
  }
}
```

### Component 3: State Management (Vercel Postgres)

**Single table to track scaling state:**

```sql
CREATE TABLE scaling_state (
  id SERIAL PRIMARY KEY,
  app_name VARCHAR(255) NOT NULL UNIQUE,
  last_scale_time TIMESTAMP,
  last_action VARCHAR(50),
  current_dynos INTEGER,
  last_response_time DECIMAL,
  last_memory_percent DECIMAL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_app_name ON scaling_state(app_name);
```

**Purpose:**
- Track last scaling action time (for cooldown logic)
- Store current dyno count (cache Heroku API result)
- Optional: Store latest metrics for dashboard

### Component 4: Scaling Decision Engine (Vercel)

**Pure logic module that:**
- Takes current metrics and state
- Compares against thresholds
- Checks if cooldown has passed
- Returns scaling decision

**Logic:**
```
Scale UP if:
  ├─ (response_time > threshold OR memory > threshold)
  ├─ AND current_dynos < max_dynos
  ├─ AND (now - last_scale_time) > scale_up_cooldown
  └─ THEN: recommend scale_up

Scale DOWN if:
  ├─ response_time < (threshold × 0.5)
  ├─ AND memory < (threshold × 0.5)
  ├─ AND current_dynos > min_dynos
  ├─ AND (now - last_scale_time) > scale_down_cooldown
  └─ THEN: recommend scale_down

Otherwise:
  └─ no_scale (keep current state)
```

### Component 5: Heroku API Client (Vercel)

**Methods needed:**
- Get current dyno count (GET /apps/{app}/formation/web)
- Scale web dynos (PATCH /apps/{app}/formation/web with quantity)
- Error handling for API failures

### Component 6: Logging & Events (Optional)

**Log to:**
- Vercel's built-in function logs (see via `vercel logs`)
- Optional: Send to external service (Logtail, LogRocket, etc.)
- Optional: Store in Vercel Postgres for dashboard

**What to log:**
- Metrics received from target app
- Scaling decision made
- Heroku API calls executed
- Errors/warnings
- Cooldown status

### Component 7: Status/Dashboard Endpoint (Optional)

**GET /api/status** - Returns current state for monitoring:
```json
{
  "app_name": "your-laravel-app",
  "current_dynos": 2,
  "last_scale_time": "2026-05-27T10:15:00Z",
  "last_action": "scale_up",
  "last_metrics": {
    "response_time": 150.5,
    "memory_percent": 72.3
  },
  "config": {
    "min_dynos": 1,
    "max_dynos": 10,
    "thresholds": { ... }
  }
}
```

---

## File Structure

```
vercel-autoscaler/
├── api/
│   ├── webhooks/
│   │   └── heroku-metrics.js        # Main webhook endpoint
│   └── status.js                    # Optional status endpoint
├── lib/
│   ├── config.js                    # Load configuration from env
│   ├── herokuClient.js              # Heroku API wrapper
│   ├── scalingEngine.js             # Decision logic
│   ├── database.js                  # Vercel Postgres queries
│   ├── logger.js                    # Logging utility
│   └── validator.js                 # Validate webhook requests
├── db/
│   └── schema.sql                   # Database schema
├── .env.example                     # Environment template
├── .gitignore
├── package.json
├── vercel.json                      # Vercel config (if needed)
└── README.md
```

---

## Environment Variables (.env)

```
# Heroku API
HEROKU_API_KEY=your-heroku-api-key
TARGET_HEROKU_APP=your-laravel-app

# Webhook Security
WEBHOOK_SECRET=generate-a-random-secret-key-here

# Scaling Configuration
MIN_DYNOS=1
MAX_DYNOS=10
RESPONSE_TIME_THRESHOLD_MS=2000
MEMORY_THRESHOLD_PERCENT=85
SCALE_UP_COOLDOWN_SECONDS=300
SCALE_DOWN_COOLDOWN_SECONDS=600

# Vercel Postgres (get connection string from Vercel dashboard)
POSTGRES_URL=postgresql://user:password@host:5432/dbname

# Logging
LOG_LEVEL=info
```

---

## Implementation Steps

### Step 1: Set Up Vercel Project

**Create a new project:**
```bash
git clone your-repo
cd vercel-autoscaler
npm init -y
npm install axios dotenv pg
```

**Create `vercel.json` (optional, for configuration):**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "api"
}
```

### Step 2: Set Up Vercel Postgres

**In Vercel Dashboard:**
1. Go to Storage → Postgres
2. Create new database (free tier)
3. Copy connection string to `.env`

**Create schema:**
```bash
psql $POSTGRES_URL < db/schema.sql
```

### Step 3: Implement Vercel API Endpoint

**File: `api/webhooks/heroku-metrics.js`**

Structure:
1. Validate request (check secret token)
2. Parse metrics from request body
3. Connect to Vercel Postgres
4. Get current scaling state
5. Run scaling decision engine
6. If scaling needed:
   - Call Heroku API
   - Update database
   - Log event
7. Return decision response

### Step 4: Implement Supporting Modules

**`lib/config.js`**
- Load and validate all env vars
- Export configuration object

**`lib/herokuClient.js`**
- Make authenticated requests to Heroku API
- Methods: getFormation(), scaleFormation()
- Error handling for rate limits and failures

**`lib/scalingEngine.js`**
- Pure logic: take metrics + state → return decision
- Testable (no side effects)

**`lib/database.js`**
- Query Vercel Postgres
- Methods: getState(), updateState(), logEvent()

**`lib/validator.js`**
- Verify webhook secret
- Validate metrics format
- Check required fields

**`lib/logger.js`**
- Structured logging
- Works with Vercel's log system

### Step 5: Optional - Status Endpoint

**File: `api/status.js`**

Returns current state for monitoring/debugging:
- Current dyno count
- Last scaling action
- Configuration
- Recent metrics

Useful for building a dashboard later.

### Step 6: Deploy to Vercel

```bash
npm install -g vercel
vercel
# Follow prompts
# Set environment variables in Vercel dashboard
```

### Step 7: Create Laravel Reporting Job

**In your existing Laravel app:**

**File: `app/Jobs/ReportMetricsToVercel.php`**

Structure:
1. Fetch metrics from cache
2. Build payload with app_name, metrics, secret_token
3. POST to Vercel webhook endpoint
4. Handle errors gracefully (don't crash queue)

**Schedule in `routes/console.php`:**
```php
Schedule::job(new ReportMetricsToVercel())
    ->everyThirtySeconds()
    ->withoutOverlapping(5);
```

---

## Data Flow (30-second cycle)

```
[Second 0]
Laravel Scheduler triggers
  ↓
[Second 1-2]
ReportMetricsJob dispatched
  ├─ Fetch metrics from cache
  └─ Queue job
  
[Second 3-5]
Queue worker processes job
  ├─ Build metrics payload
  └─ HTTP POST to Vercel
  
[Second 5-8]
Vercel webhook receives request
  ├─ Validate secret
  ├─ Parse metrics
  ├─ Query Postgres for state
  ├─ Run scaling decision
  ├─ Update Postgres
  ├─ Call Heroku API (if scaling)
  └─ Return response
  
[Second 8-10]
Laravel job completes
  └─ Done (non-blocking)

[Repeat in 20 seconds...]
```

---

## Key Design Decisions

### 1. Push vs Poll
- **Push model:** Target app sends data
- **Pro:** No separate infrastructure, uses existing queue
- **Con:** Depends on target app health
- **Decision:** Push is better for your use case ✅

### 2. State Storage
- **Vercel Postgres:** Free tier, no cost
- **Pro:** Simple, reliable, included with Vercel
- **Con:** Adds dependency on database
- **Decision:** Better than Redis for serverless ✅

### 3. Scaling Decision Location
- **In Vercel function:** Scales with traffic naturally
- **Pro:** Serverless (no server to manage)
- **Con:** None for this use case
- **Decision:** Vercel is perfect ✅

### 4. Error Handling
- **On Vercel side:** Catch all errors, log, return error response
- **On Laravel side:** Fire and forget (don't wait for response)
- **Pro:** Queue not blocked if Vercel is down
- **Decision:** Async reporting is best ✅

### 5. Secret Management
- **Webhook secret:** Validate every request
- **Heroku API key:** Stored in Vercel env vars
- **Pro:** Secure, not exposed in logs
- **Decision:** Standard approach ✅

---

## Configuration

### Scaling Thresholds

These should be tuned based on your app:

```
Response Time Threshold: 2000ms
  - Scale up if avg response time > 2000ms
  - Scale down if avg response time < 1000ms (50% of threshold)

Memory Threshold: 85%
  - Scale up if memory > 85%
  - Scale down if memory < 42.5% (50% of threshold)

Min Dynos: 1
  - Never scale below this

Max Dynos: 10
  - Never scale above this

Scale Up Cooldown: 300 seconds (5 minutes)
  - Wait 5 minutes between scale-up actions
  - Prevents thrashing when load spikes

Scale Down Cooldown: 600 seconds (10 minutes)
  - Wait 10 minutes before scaling down
  - More conservative (don't sacrifice performance)
```

### Tuning Guide

Start conservative:
1. Set high thresholds (e.g., 90% memory, 3000ms response)
2. Run for 1 week, observe scaling patterns
3. Lower thresholds gradually if over-provisioning
4. Increase cooldown if scaling too frequently

---

## Deployment Checklist

- [ ] Create Vercel project
- [ ] Set up Vercel Postgres
- [ ] Create database schema
- [ ] Implement webhook endpoint
- [ ] Implement supporting modules
- [ ] Set environment variables
- [ ] Deploy to Vercel
- [ ] Test webhook with curl
- [ ] Create Laravel ReportMetricsJob
- [ ] Schedule job in Laravel
- [ ] Deploy Laravel changes
- [ ] Monitor logs for 24 hours
- [ ] Verify scaling actions occur
- [ ] Adjust thresholds based on observations

---

## Monitoring & Verification

### Test Webhook (Before full deployment)

```bash
curl -X POST https://your-vercel-app.vercel.app/api/webhooks/heroku-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "app_name": "your-laravel-app",
    "avg_response_time": 2500,
    "memory_percent": 88,
    "requests_per_minute": 50,
    "timestamp": "2026-05-27T10:30:45Z",
    "secret_token": "your-webhook-secret"
  }'
```

Expected response: `{"success": true, "decision": {...}}`

### Monitor Vercel Logs

```bash
vercel logs --tail
# Watch for webhook requests and scaling decisions
```

### Monitor Laravel Logs

```bash
heroku logs --tail --app your-laravel-app | grep "ReportMetrics"
# Watch for job execution and errors
```

### Check Heroku Dyno Count

```bash
heroku ps --app your-laravel-app
# Verify scaling is happening
```

### View Database State

```bash
psql $POSTGRES_URL
SELECT * FROM scaling_state;
```

---

## Troubleshooting

### Webhook Not Being Called
- Check Laravel ReportMetricsJob is scheduled
- Verify `everyThirtySeconds()` is working
- Check queue worker is running
- Verify secret_token in job matches env var

### Webhook Called But No Scaling
- Check thresholds in env vars
- Verify metrics values exceed thresholds
- Check cooldown isn't preventing scaling
- Review Vercel logs for decision reason

### Heroku API Errors
- Verify `HEROKU_API_KEY` is correct
- Check API key has permissions
- Verify `TARGET_HEROKU_APP` name is correct
- Check Heroku API rate limits not exceeded

### Database Errors
- Verify `POSTGRES_URL` is correct
- Check schema was created
- Verify connection string has correct permissions

---

## Security Notes

1. **Webhook Secret**: Generate strong random string
   ```bash
   openssl rand -hex 32
   ```

2. **Environment Variables**: Never commit to git
   - Use `.env.example` for template
   - Set in Vercel dashboard

3. **Heroku API Key**: Should have minimal permissions
   - Only needs to manage formation
   - Rotate periodically

4. **HTTPS Only**: Vercel endpoints are HTTPS by default ✅

---

## What You Get

✅ **Zero cost** - Completely free (Vercel + existing Heroku infra)
✅ **Simple** - Single webhook endpoint, clean logic
✅ **Reliable** - Error handling, logging, state management
✅ **Scalable** - Handles worker dyno scaling automatically
✅ **Observable** - Logs, database, status endpoint
✅ **Flexible** - All thresholds configurable

---

## Next Steps for AI Agent

Your AI agent should:

1. Create Vercel project structure
2. Implement `api/webhooks/heroku-metrics.js` - Main webhook
3. Implement `lib/` modules - Supporting logic
4. Create database schema
5. Set up Vercel Postgres connection
6. Create Laravel `ReportMetricsJob`
7. Schedule the job
8. Deploy to Vercel
9. Test webhook endpoint
10. Monitor and adjust thresholds

The whole thing is simpler than the separate monitoring dyno approach, and completely free!