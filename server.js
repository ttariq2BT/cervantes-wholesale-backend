// server.js
// Minimal Shopify webhook -> add "wholesale" tag to new customers

const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 10000;

/* ========= ENV VARS (Render) =========
  SHOPIFY_API_KEY        (not used here, fine if present)
  SHOPIFY_API_SECRET     shpss_...
  SHOPIFY_ADMIN_TOKEN    shpat_...
  SHOPIFY_STORE_DOMAIN   cervantes-coffee.myshopify.com
====================================== */

const {
  SHOPIFY_API_SECRET,
  SHOPIFY_ADMIN_TOKEN,
  SHOPIFY_STORE_DOMAIN,
} = process.env;

// Use a stable Admin API version (don't point at “latest” or a future version)
const ADMIN_API_VERSION = '2024-10';

// Capture raw body for HMAC verification, while still parsing JSON for use
app.use(
  express.json({
    type: '*/*',
    verify: (req, _res, buf) => {
      req.rawBody = buf; // keep the exact payload bytes
    },
  })
);

// Health check
app.get('/health', (_req, res) => res.status(200).send('OK'));

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    // 1) Verify HMAC
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256') || '';
    const digest = crypto
      .createHmac('sha256', SHOPIFY_API_SECRET)
      .update(req.rawBody) // MUST be the raw bytes
      .digest('base64');

    if (!timingSafeEqual(digest, hmacHeader)) {
      console.error('HMAC verification FAILED');
      return res.sendStatus(401);
    }

    console.log('Verified webhook');

    // 2) Only handle customers/create
    const topic = req.get('X-Shopify-Topic');
    if (topic !== 'customers/create') {
      console.log('Ignoring topic:', topic);
      return res.sendStatus(200);
    }

    const customerId = req.body?.id;
    if (!customerId) {
      console.error('No customer id in payload');
      return res.sendStatus(400);
    }

    // 3) Add the "wholesale" tag
    await addTag(customerId, 'wholesale');
    console.log(`Tag added for customer ${customerId}`);

    return res.sendStatus(200);
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.sendStatus(500);
  }
});

// Helper: constant-time compare
function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// Helper: add one tag without overwriting others
async function addTag(customerId, tag) {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/customers/${customerId}/tags.json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ tags: tag }), // correct payload shape
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Tag API error', res.status, text);
    throw new Error(`Tag API failed: ${res.status}`);
  }
}

app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
  console.log('Your service is live 🎉');
});
