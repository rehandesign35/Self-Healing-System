export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;

  if (body === undefined) {
    try {
      const chunks = [];

      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const rawBody = Buffer.concat(chunks).toString("utf8");

      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch (err) {
          body = rawBody;
        }
      } else {
        body = {};
      }
    } catch (err) {
      body = {};
    }
  }

  console.log("Mock CRM received lead:", body);

  const timestamp = Date.now();
  const receivedAt = new Date().toISOString();

  return res.status(200).json({
    status: "received",
    crm_id: `mock_${timestamp}`,
    received_at: receivedAt
  });
}
