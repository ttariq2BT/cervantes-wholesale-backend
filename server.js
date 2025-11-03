const express = require("express");
const crypto = require("crypto");

const app = express();

// ------------ ENV ------------
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY; // not used, but fine
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET; // shpss_...
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN; // shpat_...
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // e.g., cervantes-coffee.myshopify.com

const PORT = process.env.PORT || 10000;

// ---------- HEALTH ----------
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

// For HMAC verification we need the **raw body** for this route
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      // 1) Verify HMAC
      const hmacHeader =
        req.headers["x-shopify-hmac-sha256"] ||
        req.headers["X-Shopify-Hmac-Sha256"];
      if (!hmacHeader) {
        return res.status(401).send("Missing HMAC");
      }

      const digest = crypto
        .createHmac("sha256", SHOPIFY_API_SECRET)
        .update(req.body, "utf8")
        .digest("base64");

      const isValid = crypto.timingSafeEqual(
        Buffer.from(digest, "utf8"),
        Buffer.from(hmacHeader, "utf8")
      );

      if (!isValid) {
        return res.status(401).send("Invalid HMAC");
      }

      // 2) Parse payload
      const payload = JSON.parse(req.body.toString("utf8"));
      // Webhook: customers/create  (payload will have customer.id, tags, etc.)
      const customerId = payload?.id;
      if (!customerId) {
        // Not the expected payload, but still 200 so Shopify stops retrying.
        return res.status(200).send("No customer id");
      }

      // 3) Add the 'wholesale' tag (simple approach: set tags to "wholesale" only)
      // If you prefer to append while preserving existing tags, you’d need to read the customer first.
      const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/customers/${customerId}.json`;

      const body = {
        customer: {
          id: customerId,
          tags: "wholesale"
        }
      };

      const resp = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN
        },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error("Failed to update customer:", resp.status, txt);
        // Still reply 200 so Shopify doesn't retry forever, but log error
      } else {
        console.log(`Tagged customer ${customerId} with 'wholesale'`);
      }

      // 4) Acknowledge webhook
      return res.status(200).send("OK");
    } catch (err) {
      console.error("Webhook handler error:", err);
      // Reply 200 to avoid retries, but keep logs
      return res.status(200).send("OK");
    }
  }
);

// Any other JSON endpoints can use the normal parser
app.use(express.json());

// ------------- START -------------
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
