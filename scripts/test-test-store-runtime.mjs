// Run after npm run build. No production credentials, database or network are used.
import assert from "node:assert/strict";
import { createRequestHandler } from "react-router";
process.env.SHOPIFY_API_KEY = "synthetic-app-key";
process.env.SHOPIFY_API_SECRET = "synthetic-test-secret-not-a-live-credential";
process.env.SHOPIFY_APP_URL = "https://test.example";
process.env.NODE_ENV = "test";
let network = 0,
  dbAccess = 0;
globalThis.fetch = async () => {
  network++;
  throw new Error("External network is disabled in runtime verification");
};
globalThis.prismaGlobal = new Proxy(
  { session: { count: async () => 0 } },
  {
    get: (target, key) =>
      key in target
        ? target[key]
        : new Proxy(
            {},
            {
              get: () => () => {
                dbAccess++;
                throw new Error(
                  "Business database access denied in runtime verification",
                );
              },
            },
          ),
  },
);
const build = await import("../build/server/index.js");
const handler = createRequestHandler(build, "production");
const denied = "unapproved.myshopify.com",
  allowed = "naruto-dev-ts8dqzla.myshopify.com";
const token = (shop) =>
  "e30." +
  Buffer.from(JSON.stringify({ dest: `https://${shop}` })).toString(
    "base64url",
  ) +
  ".invalid";
const results = [];
for (const [path, method] of [
  ["/auth/callback", "GET"],
  ["/auth/login", "GET"],
  ["/auth/login", "POST"],
  ["/app", "GET"],
  ["/app/billing", "POST"],
  ["/app/agreement", "POST"],
  ["/api/analytics", "GET"],
  ["/api/analytics", "POST"],
  ["/api/preferences", "GET"],
  ["/api/preferences", "POST"],
  ["/api/test-email", "POST"],
  ["/api/track", "POST"],
]) {
  const req = new Request(`https://test.example${path}?shop=${denied}`, {
    method,
    ...(method === "POST"
      ? { body: new URLSearchParams({ shop: denied }) }
      : {}),
  });
  const response = await handler(req);
  assert.equal(response.status, 403, `${method} ${path}`);
  results.push({ path, method, status: response.status });
}
for (const [shop, expected] of [
  [denied, 403],
  [allowed, 401],
]) {
  const response = await handler(
    new Request(`https://test.example/api/analytics?shop=${allowed}`, {
      headers: { Authorization: `Bearer ${token(shop)}` },
    }),
  );
  assert.equal(response.status, expected);
  results.push({
    path: "/api/analytics",
    context: shop === denied ? "denied-token" : "forged-allowed-token",
    status: response.status,
  });
}
assert.equal(network, 0);
assert.equal(dbAccess, 0);
console.log(
  JSON.stringify(
    {
      checks: results.length,
      passed: true,
      externalRequests: network,
      businessDatabaseCalls: dbAccess,
      results,
    },
    null,
    2,
  ),
);
