import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionlessWebhookContext<Topic extends string = string> = {
  shop: string;
  topic: Topic;
  payload: any;
  webhookId?: string;
  apiVersion?: string;
  triggeredAt?: string;
};

const REQUIRED_HEADERS = {
  topic: "x-shopify-topic",
  shop: "x-shopify-shop-domain",
  hmac: "x-shopify-hmac-sha256",
};

function normalizeTopic(topic: string) {
  return topic.replace(/\//g, "_").toUpperCase();
}

function safeEqualBase64(a: string, b: string) {
  const left = Buffer.from(a, "base64");
  const right = Buffer.from(b, "base64");
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyWebhookHmac(
  rawBody: string,
  hmacHeader: string,
  secret: string,
) {
  const digest = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  return safeEqualBase64(digest, hmacHeader);
}

export async function authenticateSessionlessWebhook<
  Topic extends string = string,
>(request: Request): Promise<SessionlessWebhookContext<Topic>> {
  if (request.method !== "POST")
    throw new Response(null, { status: 405, statusText: "Method Not Allowed" });

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret)
    throw new Response(null, {
      status: 500,
      statusText: "Webhook secret unavailable",
    });

  const topic = request.headers.get(REQUIRED_HEADERS.topic);
  const shop = request.headers.get(REQUIRED_HEADERS.shop);
  const hmac = request.headers.get(REQUIRED_HEADERS.hmac);
  if (!topic || !shop || !hmac)
    throw new Response(null, { status: 400, statusText: "Bad Request" });

  const rawBody = await request.text();
  if (!verifyWebhookHmac(rawBody, hmac, secret))
    throw new Response(null, { status: 401, statusText: "Unauthorized" });

  let payload: any;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new Response(null, { status: 400, statusText: "Bad Request" });
  }

  return {
    shop,
    topic: normalizeTopic(topic) as Topic,
    payload,
    webhookId: request.headers.get("x-shopify-webhook-id") || undefined,
    apiVersion: request.headers.get("x-shopify-api-version") || undefined,
    triggeredAt: request.headers.get("x-shopify-triggered-at") || undefined,
  };
}
