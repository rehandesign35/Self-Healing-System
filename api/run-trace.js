// GET /api/run-trace?run_id=...
// Reads the live execution trace for one pipeline run from Supabase.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const runId = req.query?.run_id;
  if (typeof runId !== "string" || !runId.trim()) {
    return res.status(400).json({ error: "run_id is required" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(502).json({
      error: "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables in Vercel."
    });
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const query = new URLSearchParams({
      run_id: `eq.${runId}`,
      select: "*",
      order: "created_at.asc"
    });
    const response = await fetch(`${supabaseUrl}/rest/v1/run_trace?${query}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(502).json({ error: "Supabase query failed", details });
    }

    const trace = await response.json();
    return res.status(200).json({ trace });
  } catch (err) {
    return res.status(502).json({
      error: "Supabase trace query failed",
      details: err.message
    });
  }
}
