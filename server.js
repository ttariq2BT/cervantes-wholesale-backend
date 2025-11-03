import express from "express";
const app = express();

app.use(express.json({ type: "*/*" })); // accept JSON from Shopify

app.get("/", (_req, res) => res.status(200).send("OK")); // health check

app.post("/webhook", (req, res) => {
  console.log("✅ Webhook received:", new Date().toISOString(), req.headers["x-shopify-topic"]);
  res.status(200).send("ok"); // acknowledge receipt for now
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`Listening on ${port}`));
