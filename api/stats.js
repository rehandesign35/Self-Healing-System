// GET /api/stats
// Pulls the most recent pipeline runs from Supabase and computes the
// aggregate reliability numbers shown on the dashboard: success rate,
// retry rate, dead-letter rate, cost/run, and p50/p95 latency.
// Also returns the raw recent-runs list and the dead-letter queue itself,
// since a dead-letter queue that isn't actually visible isn't useful.

const RUN_LIMIT = 200; // how many recent runs to pull for aggregate stats

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return null;
  const idx = Math.floor(p * (sortedArr.length - 1));
  return sortedArr[idx];
}

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables in Vercel."
    });
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/pipeline_runs?select=*&order=created_at.desc&limit=${RUN_LIMIT}`;

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: "Supabase query failed", details: errText });
    }

    const runs = await response.json();

    const totalRuns = runs.length;
    const successRuns = runs.filter(r => r.status === "success");
    const deadLetterRuns = runs.filter(r => r.status === "dead_lettered");

    const firstTrySuccesses = successRuns.filter(r => (r.retry_count || 0) === 0);
    const retriedSuccesses = successRuns.filter(r => (r.retry_count || 0) > 0);
    const runsThatRetried = runs.filter(r => (r.retry_count || 0) > 0);

    const avgRetriesToSuccess = retriedSuccesses.length > 0
      ? retriedSuccesses.reduce((sum, r) => sum + (r.retry_count || 0), 0) / retriedSuccesses.length
      : 0;

    const totalCost = runs.reduce((sum, r) => sum + (Number(r.cost_estimate_usd) || 0), 0);
    const avgCostPerRun = totalRuns > 0 ? totalCost / totalRuns : 0;

    const durations = runs
      .map(r => r.duration_ms)
      .filter(d => typeof d === "number")
      .sort((a, b) => a - b);

    const stats = {
      window: totalRuns,
      success_rate: totalRuns > 0 ? successRuns.length / totalRuns : 0,
      first_try_success_rate: totalRuns > 0 ? firstTrySuccesses.length / totalRuns : 0,
      retry_rate: totalRuns > 0 ? runsThatRetried.length / totalRuns : 0,
      dead_letter_rate: totalRuns > 0 ? deadLetterRuns.length / totalRuns : 0,
      avg_retries_to_success: Number(avgRetriesToSuccess.toFixed(2)),
      avg_cost_per_run_usd: Number(avgCostPerRun.toFixed(4)),
      total_cost_usd: Number(totalCost.toFixed(4)),
      latency_p50_ms: percentile(durations, 0.5),
      latency_p95_ms: percentile(durations, 0.95),
      total_runs: totalRuns,
      success_count: successRuns.length,
      dead_letter_count: deadLetterRuns.length
    };

    const recentRuns = runs.slice(0, 25).map(r => ({
      run_id: r.run_id,
      status: r.status,
      retry_count: r.retry_count,
      duration_ms: r.duration_ms,
      cost_estimate_usd: r.cost_estimate_usd,
      lead_email: r.lead_email,
      created_at: r.created_at
    }));

    const deadLetterQueue = deadLetterRuns.map(r => ({
      run_id: r.run_id,
      lead_email: r.lead_email,
      retry_count: r.retry_count,
      failure_category: r.failure_category,
      cost_estimate_usd: r.cost_estimate_usd,
      created_at: r.created_at
    }));

    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
    return res.status(200).json({ stats, recent_runs: recentRuns, dead_letter_queue: deadLetterQueue });

  } catch (err) {
    return res.status(500).json({ error: "Unexpected error", details: err.message });
  }
}
