# Self-Healing Lead Recovery System

A reliability dashboard and automation pattern for lead-delivery pipelines that cannot afford to fail silently.

When a CRM or downstream integration fails, a normal workflow can stop at the failed node, lose the useful context around the incident, and leave operators unsure whether the lead was delivered, retried, or abandoned. This project makes recovery observable: failed work is retried, permanently unsuccessful work is routed to a dead-letter path, and every run is recorded for inspection.

## Live Links

- **Dashboard:** [Open the deployed dashboard](https://self-healing-system-adovtc0tq-rehandesign35s-projects.vercel.app) *(currently protected by Vercel login)*
- **Repository:** [rehandesign35/Self-Healing-System](https://github.com/rehandesign35/Self-Healing-System)

The dashboard is a production Vercel deployment. The current deployment responds with a Vercel login page until deployment protection is disabled or access is granted. Its live data depends on the configured Supabase environment variables and the external n8n workflow being available.

## What It Solves

The system addresses three failure modes in unattended automation:

1. A transient CRM or API failure silently drops a lead.
2. A workflow retries without leaving a useful record of what happened.
3. A permanently failed item disappears instead of becoming actionable operator work.

The recovery pipeline gives each execution a `run_id`, retries transient failures with increasing delays, records the outcome in Supabase, and routes exhausted failures to a dead-letter state. The dashboard exposes success rate, retry rate, dead-letter rate, cost, latency, recent runs, and the live step trace.

## Architecture

```text
Lead event
    |
    v
n8n workflow
    |
    +--> delivery attempt
    |       |
    |       +--> success --------------------+
    |       |                                |
    |       +--> transient failure           |
    |               |                        |
    |               +--> exponential wait --+
    |               |       retry attempt
    |               |       ...
    |               |
    |               +--> retry limit reached
    |                       |
    |                       v
    |                 dead-letter route
    |
    +--> Supabase: pipeline_runs
    +--> Supabase: run_trace
                 |
                 v
        Vercel serverless API + dashboard
```

### n8n workflow

The external n8n workflow owns orchestration and delivery. It should:

- accept or generate a stable `run_id`;
- attempt delivery to the CRM or downstream service;
- classify transient failures separately from permanent failures;
- retry transient failures with exponential backoff;
- route an exhausted run to the dead-letter path;
- write the final row to `pipeline_runs` with `status = 'success'` or `status = 'dead_lettered'`;
- write step-level progress to `run_trace` so an operator can see where recovery stopped.

A typical exponential schedule is `base_delay * 2^attempt`, with a configured maximum delay and retry count. The exact n8n workflow is external to this repository; this repository contains the dashboard and serverless API layer that triggers and observes it.

### Supabase

The serverless functions query Supabase through its REST API using a server-side service-role key. The dashboard reads:

- `pipeline_runs`: `run_id`, `workflow_name`, `status`, `retry_count`, `duration_ms`, `cost_estimate_usd`, `lead_email`, `failure_category`, `created_at`;
- `run_trace`: `run_id`, `step_name`, `status`, `detail`, `created_at`.

`pipeline_runs.status = 'dead_lettered'` identifies failed or routed items that exhausted recovery and require follow-up.

### Vercel API layer

- `GET /api/stats` reads the latest 200 `pipeline_runs` rows and returns aggregate metrics, recent runs, and the dead-letter queue.
- `GET /api/run-trace?run_id=<id>` returns ordered trace events for one run.
- `POST /api/trigger-run` starts the n8n webhook with `{ "run_id": "..." }`.
- `POST /api/mock-crm` accepts a lead payload and returns a generated mock CRM ID for workflow testing.

## Supabase Stress-Test Results

These figures were calculated from a direct query of the live `pipeline_runs` table on **September 4, 2026**. No values were estimated or reconstructed from the dashboard.

| Metric | Result | Definition |
| --- | ---: | --- |
| Total runs | **233** | All rows returned from `pipeline_runs` |
| Successful runs | **217** | Rows where `status = 'success'` |
| Retried runs | **66** | Rows where `retry_count > 0` |
| Retry success rate | **89.39%** | 59 successful rows with `retry_count > 0` divided by 66 retried rows |
| Dead-lettered runs | **16** | Rows where `status = 'dead_lettered'` |
| Dead-letter rate | **6.87%** | 16 dead-lettered rows divided by 233 total rows |
| Average recovery time | **2,527.64 ms** | Average `duration_ms` for the 59 successful rows that required a retry |

The queried data spans `2026-08-30T21:20:01.502341+00:00` through `2026-09-04T02:08:44.666+00:00`. The table contains 186 `lead-recovery-pipeline` rows plus 47 rows from other workflow names, including synthetic anomaly and sync/reconciliation data. The results above intentionally describe the table as it exists; they are not presented as a lead-only benchmark.

The average recovery-time metric is only available for recovered runs with a recorded duration. It measures total recorded run duration, not wall-clock time between the original failure and operator resolution.

## Honest Limitations

### n8n native retry is not true exponential backoff

n8n's native retry settings use fixed waits. Enabling native retry alone therefore does not implement an exponential schedule. The intended workaround is to model recovery explicitly in the workflow: capture the attempt number, calculate an increasing delay, wait, and loop back to the delivery step until the retry limit is reached. This repository does not include the external n8n workflow JSON, so the exact backoff expression and production retry configuration cannot be independently verified here.

### Other limitations

- Supabase reads use the latest 200 rows for dashboard aggregates, so the UI is a rolling window rather than an all-time report.
- The stress-test table contains multiple workflow names and synthetic rows; there is no repository-side filter that isolates one workload.
- Rows with missing `duration_ms` cannot contribute to average recovery time. The current queried rows happened to have recorded durations, but duration quality depends on the workflow writing them consistently.
- The dashboard exposes a public trigger unless the deployment is protected separately. The n8n webhook should have authentication and rate limiting before production use.
- The mock CRM endpoint acknowledges receipt but does not represent a real CRM transaction.
- The API uses a Supabase service-role key server-side. It must never be placed in client code, committed, or exposed in logs.
- There is no authentication or role-based access control in this repository.

## Local Development

### Requirements

- Node.js 18 or newer
- npm
- Vercel CLI
- A Supabase project with the expected tables
- An n8n webhook for the recovery workflow

### Configure environment variables

Create `.env.local` in the project root. Do not commit `.env` or `.env.local`.

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
N8N_WEBHOOK_URL=https://your-n8n-host.example/webhook/lead-recovery
```

The service-role key is privileged and server-only. If it has been exposed, rotate it in Supabase before continuing.

### Run the dashboard

```bash
npm install
npm run dev
```

Open the local URL printed by Vercel, normally `http://localhost:3000`. Opening `public/index.html` directly will not provide the serverless API routes.

## Deployment

1. Import the repository into Vercel, or run `vercel` from the project root.
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `N8N_WEBHOOK_URL` in the Vercel project environment.
3. Deploy with `vercel --prod`.
4. Verify `GET /api/stats` returns Supabase data.
5. Use **Run it now** and confirm that n8n writes both the trace and final `pipeline_runs` record.

## Security Checklist

- Rotate any service-role key that has been shared or committed.
- Keep `.env` and `.env.local` untracked.
- Keep Supabase credentials in Vercel environment variables or a secret manager.
- Protect the n8n webhook with authentication and rate limiting.
- Add application authentication before exposing run data or the trigger to untrusted users.
