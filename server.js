const express = require("express");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;

// From Render env
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;         // shpss_...
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;       // shpat_...
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;     // cervantes-coffee.myshopify.com

// --- helpers ---
function verifyHmac(hmacHeader, rawBody) {
  const digest = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET || "")
    .update(rawBody, "utf8")
    .digest("base64");
  if (!hmacHeader) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

async function addTag(customerId, tag) {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/customers/${customerId}/tags.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ tags: tag })
  });

  const text = await res.text();
  console.log("Tag API:", res.status, text);
  if (!res.ok) throw new Error(`Tag API failed: ${res.status}`);
}

// --- app ---
const app = express();

// Health check
app.get("/", (_req, res) => res.status(200).send("OK"));

// Webhook endpoint
app.post(
  "/webhook",
  // raw body is REQUIRED for HMAC verification
  express.raw({ type: "application/json" }),
  async (req, res) => {
    console.log("Webhook hit", new Date().toISOString());
    const hmac = req.get("X-Shopify-Hmac-Sha256");
    const topic = req.get("X-Shopify-Topic");
    const shop = req.get("X-Shopify-Shop-Domain");
    const raw = req.body.toString("utf8");

    if (!verifyHmac(hmac, raw)) {
      console.log("HMAC verification FAILED");
      return res.status(401).send("bad hmac");
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      console.error("JSON parse error:", e);
      return res.status(400).send("bad json");
    }

    console.log("Verified webhook:", topic, "from", shop);

    // Always respond fast so Shopify stops retrying
    res.status(200).send("ok");

    // Do work after acknowledging to Shopify
    if (topic === "customers/create") {
      try {
        const id = payload.customer?.id || payload.id;
        await addTag(id, "wholesale"); // <-- tag you want to add
        console.log("Tag added for customer", id);
      } catch (e) {
        console.error("Tag add error:", e);
      }
    }
  }
);

// Error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("error");
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
