// POST /api/trigger-run
// Starts the n8n workflow with a client-generated run ID.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const runId = body.run_id;
  if (typeof runId !== "string" || !runId.trim()) {
    return res.status(400).json({ error: "run_id is required" });
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({
      error: "Missing N8N_WEBHOOK_URL environment variable in Vercel."
    });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId })
    });

    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { response: responseText };
    }

    return res.status(200).json(responseBody);
  } catch (err) {
    return res.status(500).json({
      error: "Failed to trigger n8n workflow",
      details: err.message
    });
  }
}
