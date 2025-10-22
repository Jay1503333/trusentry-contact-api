// api/contact.js (Vercel Serverless Function)
import twilio from "twilio";

// helper: safely read a field by either simple or "contact-*" names
const g = (obj, key, alt) => (obj?.[key] ?? obj?.[alt] ?? "").toString().trim();

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Carrd can POST as JSON (recommended) or url-encoded
  let data = {};
  const ct = (req.headers["content-type"] || "").toLowerCase();

  try {
    if (ct.includes("application/json")) {
      data = req.body || {};
    } else {
      // read the raw body for x-www-form-urlencoded
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString("utf8");
      data = Object.fromEntries(new URLSearchParams(text));
    }
  } catch (e) {
    console.error("Body parse error:", e?.message);
    return res.status(400).json({ error: "Invalid body" });
  }

  const name    = g(data, "name", "contact-name");
  const email   = g(data, "email", "contact-email");
  const phone   = g(data, "phone", "contact-phone");
  const message = g(data, "message", "contact-message");
  const source  = g(data, "source", "source");

  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email, and message are required." });
  }

  // --- SMS via Twilio ---
  let smsSent = false;
  let smsError = null;
  try {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, OWNER_PHONE } = process.env;
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM && OWNER_PHONE) {
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      await client.messages.create({
        from: TWILIO_FROM,       // must be a Twilio number in your account
        to:   OWNER_PHONE,       // for trial accounts: must be a Verified Caller ID
        body:
`📩 New TruSentry Quote
Name: ${name}
Email: ${email}
Phone: ${phone || "N/A"}
Message: ${message.length > 240 ? message.slice(0,237) + "..." : message}
${source ? `Source: ${source}` : ""}`
      });
      smsSent = true;
    } else {
      smsError = "Missing Twilio env vars";
    }
  } catch (e) {
    console.error("Twilio SMS failed:", e?.message);
    smsError = e?.message || "Unknown Twilio error";
  }

  return res.status(200).json({ ok: true, sms: smsSent, error: smsError });
}
