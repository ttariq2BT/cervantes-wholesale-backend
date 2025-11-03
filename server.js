const express = require("express");
const crypto = require("crypto");
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();

// ── raw body is required for HMAC verification
app.use("/webhook", express.raw({ type: "*/*" }));
app.use(express.json());

// env from Render
const SHOPIFY_API_KEY       = process.env.SHOPIFY_API_KEY;        // shows in logs, not used here
const SHOPIFY_API_SECRET    = process.env.SHOPIFY_API_SECRET;     // shpss_...
const SHOPIFY_ADMIN_TOKEN   = process.env.SHOPIFY_ADMIN_TOKEN;    // shpat_...
const SHOPIFY_STORE_DOMAIN  = process.env.SHOPIFY_STORE_DOMAIN;   // cervantes-coffee.myshopify.com
const APP_BASE_URL          = process.env.APP_BASE_URL;           // your Render URL

// verify Shopify webhook HMAC
function verifyWebhook(req) {
  const hmacHeader = req.get("X-Shopify-Hmac-SHA256");
  const digest = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(req.body, "utf8")
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader || "", "utf8"));
}

// add tag helper
async function addCustomerTag(customerId, newTag) {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/customers/${customerId}.json`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN
    },
    body: JSON.stringify({ customer: { id: customerId, tags: newTag } })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Shopify update failed ${res.status}: ${t}`);
  }
}

// health
app.get("/", (_req, res) => res.send("OK"));

// webhook endpoint configured in Shopify
app.post("/webhook", async (req, res) => {
  try {
    if (!verifyWebhook(req)) {
      console.error("Invalid HMAC");
      return res.status(401).send("invalid");
    }
    const topic = req.get("X-Shopify-Topic");
    if (topic === "customers/create") {
      const payload = JSON.parse(req.body.toString("utf8"));
      const id = payload?.id;
      const existingTags = (payload?.tags || "").split(",").map(s => s.trim()).filter(Boolean);
      if (id && !existingTags.includes("wholesale_pending") && !existingTags.includes("wholesale")) {
        await addCustomerTag(id, [...existingTags, "wholesale_pending"].join(", "));
        console.log(`Tagged customer ${id} -> wholesale_pending`);
      }
    }
    res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    res.status(500).send("error");
  }
});

// Render requires a PORT env automatically
const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Listening on ${port}`));
