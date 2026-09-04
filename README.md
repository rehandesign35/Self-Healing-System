# Lead Recovery Pipeline Dashboard

A small reliability dashboard for a self-healing lead-recovery automation pipeline. The browser UI shows delivery success, retries, dead-lettered runs, cost, latency, recent runs, and a live execution trace for manually triggered runs.

## Architecture

- `public/index.html` - zero-build dashboard UI. It refreshes aggregate data every 10 seconds and polls a trace while a run is active.
- `api/stats.js` - Vercel serverless endpoint that reads recent `pipeline_runs` rows from Supabase and computes reliability metrics.
- `api/run-trace.js` - Vercel serverless endpoint that reads ordered trace rows from Supabase for one run.
- `api/trigger-run.js` - Vercel serverless endpoint that starts the configured n8n webhook.
- `api/mock-crm.js` - mock CRM intake endpoint for accepting a lead payload during workflow testing.

The n8n workflow is external to this repository. It should use the same `run_id` passed by the dashboard, write pipeline results to Supabase, and write trace events to `run_trace` while the run progresses.

## Requirements

- Node.js 18 or newer
- npm
- Vercel CLI (`npm install --global vercel`)
- A Supabase project with the pipeline tables used by the workflow
- An n8n webhook that accepts `{ "run_id": "..." }`

## Configuration

Create a local `.env.local` file. Never commit `.env` or `.env.local`.

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
N8N_WEBHOOK_URL=https://your-n8n-host.example/webhook/lead-recovery
```

`SUPABASE_SERVICE_KEY` is a server-side service-role credential. Keep it in Vercel environment variables and never expose it in browser code, logs, screenshots, or the repository. If a service key has been shared or committed, rotate it in Supabase before using the project in production.

## Local development

```bash
npm install
npm run dev
```

Vercel will print the local URL, normally `http://localhost:3000`. Open that URL rather than opening `public/index.html` directly, because the dashboard calls the serverless API routes.

## API routes

### `GET /api/stats`

Returns aggregate metrics over the latest 200 `pipeline_runs` rows, plus up to 25 recent runs and the dead-letter queue.

### `GET /api/run-trace?run_id=<id>`

Returns the ordered `run_trace` rows for a single pipeline run. The endpoint requires a non-empty `run_id`.

### `POST /api/trigger-run`

Starts the n8n workflow with a JSON body containing a non-empty `run_id`:

```json
{ "run_id": "run_timestamp_random" }
```

### `POST /api/mock-crm`

Accepts a lead payload and returns a generated mock CRM identifier. This is intended for workflow testing, not production CRM ingestion.

## Supabase data expectations

The workflow should provide the fields consumed by the API:

- `pipeline_runs`: `run_id`, `status`, `retry_count`, `duration_ms`, `cost_estimate_usd`, `lead_email`, `failure_category`, `created_at`
- `run_trace`: `run_id`, `step_name`, `status`, `detail`, `created_at`

The service-role key is used only by serverless functions to query Supabase REST. Apply appropriate database policies and restrict production credentials separately from local development.

## Deployment

1. Import the repository into Vercel, or run `vercel` from the project root.
2. Add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `N8N_WEBHOOK_URL` to the Vercel project environment for the required deployments.
3. Deploy with `vercel --prod`.
4. Confirm `/api/stats` returns data and use **Run it now** to verify the n8n trigger and live trace.

## Security checklist

- Rotate any Supabase service-role key that has been exposed.
- Keep `.env` and `.env.local` untracked.
- Store secrets in Vercel environment variables or a secret manager.
- Do not put the service key in `public/` or client-side JavaScript.
- Protect the n8n webhook and add authentication/rate limiting before exposing the trigger publicly.
