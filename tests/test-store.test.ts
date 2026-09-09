import test from "node:test";
import assert from "node:assert/strict";
import { restrictShopify } from "../app/lib/test-auth.server";
import {
  TEST_SHOPS,
  requireTestRequest,
  testAgreementVersion,
} from "../app/lib/test-store-policy.server";
import {
  fetchAndComputeAnalytics,
  getSnapshotHistory,
} from "../app/lib/analytics.server";
import { getSubscription, pricingUrl } from "../app/lib/billing.server";
import { sendDailyBrief } from "../app/lib/email.server";
import { loader as cron } from "../app/routes/api.cron.daily-brief";
import { loader as interview } from "../app/routes/api.interview-queue";
import {
  action as agreement,
  loader as agreementPage,
} from "../app/routes/app.agreement";
import { action as uninstall } from "../app/routes/webhooks.app.uninstalled";
import { action as privacy } from "../app/routes/webhooks.privacy";
import { DPA_VERSION, DPA_STATUS, DPA_SHA256 } from "../app/lib/dpa";
const allowed = TEST_SHOPS[0],
  denied = "unapproved.myshopify.com";
const token = (shop: string) =>
  "e30." +
  Buffer.from(JSON.stringify({ dest: `https://${shop}` })).toString(
    "base64url",
  ) +
  ".not-a-real-signature";
const request = (shop = allowed, path = "/app", bearer?: string) =>
  new Request(`https://test.example${path}?shop=${shop}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
const rejected = (p: Promise<unknown>, status = 403) =>
  assert.rejects(p, (e: any) => e instanceof Response && e.status === status);
function setup() {
  const calls: any = {
    auth: 0,
    login: 0,
    offline: 0,
    orders: 0,
    writes: [],
    privacy: [],
    deleted: [],
    graphql: 0,
  };
  const shop = {
    id: "synthetic-shop",
    myshopifyDomain: allowed,
    name: "Synthetic",
    currencyCode: "USD",
    ianaTimezone: "UTC",
    plan: { partnerDevelopment: true },
  };
  const admin = {
    graphql: async (q: string) => {
      calls.graphql++;
      if (q.includes("BriefOrders")) {
        calls.orders++;
        return Response.json({
          data: { orders: { nodes: [], pageInfo: { hasNextPage: false } } },
        });
      }
      return Response.json({ data: { shop } });
    },
  };
  const sdk: any = {
    authenticate: {
      admin: async () => {
        calls.auth++;
        return {
          admin,
          session: { shop: shop.myshopifyDomain },
          sessionToken: { sub: "synthetic-actor" },
          redirect: (url: string) =>
            new Response(null, { status: 302, headers: { Location: url } }),
        };
      },
      webhook: async () => ({
        shop: denied,
        topic: "CUSTOMERS_DATA_REQUEST",
        payload: { data_request: { id: 98765 }, orders_requested: [] },
      }),
    },
    unauthenticated: {
      admin: async () => {
        calls.offline++;
        return { admin };
      },
    },
    login: async () => {
      calls.login++;
    },
  };
  const db: any = {
    shop: {
      findUnique: async () => shop,
      findMany: async (args: any) => {
        calls.shopQuery = args;
        return [{ id: shop.id }];
      },
    },
    legalAcceptance: {
      upsert: async (args: any) => calls.writes.push(args),
      findUnique: async () => null,
      updateMany: async (args: any) => (calls.revoked = args),
    },
    session: { deleteMany: async (args: any) => calls.deleted.push(args) },
    notificationPreference: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    analyticsSnapshot: {
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => [],
    },
    analyticsEvent: {
      deleteMany: async () => ({ count: 0 }),
      upsert: async () => ({}),
      findMany: async (args: any) => {
        calls.eventQuery = args;
        return [];
      },
    },
    briefDelivery: { deleteMany: async () => ({ count: 0 }) },
    privacyRequest: {
      deleteMany: async (args: any) => {
        calls.privacy.push(args);
        return { count: 0 };
      },
      upsert: async (args: any) => calls.privacy.push(args),
    },
    $transaction: async (a: any) => Promise.all(a),
  };
  const guarded = restrictShopify(sdk);
  (globalThis as any).scope = { calls, shop, admin, sdk, guarded, db };
  process.env.SHOPIFY_APP_URL = "https://test.example";
  delete process.env.DPA_ACCEPTANCE_VERSION;
  return { calls, shop, admin, sdk, guarded, db };
}
for (const path of [
  "/auth/callback",
  "/app",
  "/app/billing",
  "/api/analytics",
  "/api/preferences",
  "/api/test-email",
  "/api/track",
])
  test(`unapproved ${path} rejected before SDK/exchange`, async () => {
    const s = setup();
    await rejected(s.guarded.authenticate.admin(request(denied, path)));
    assert.equal(s.calls.auth, 0);
    assert.equal(s.calls.graphql, 0);
  });
test("OAuth login POST cannot hide a denied shop behind allowed query", async () => {
  const s = setup();
  await rejected(
    s.guarded.login(
      new Request(`https://test.example/auth/login?shop=${allowed}`, {
        method: "POST",
        body: new URLSearchParams({ shop: denied }),
      }),
    ),
  );
  assert.equal(s.calls.login, 0);
});
test("OAuth approved context delegates to official login", async () => {
  const s = setup();
  await s.guarded.login(request(allowed, "/auth/login"));
  assert.equal(s.calls.login, 1);
});
test("token exchange checks destination despite allowlisted query", async () => {
  const s = setup();
  await rejected(
    s.guarded.authenticate.admin(
      request(allowed, "/api/analytics", token(denied)),
    ),
  );
  assert.equal(s.calls.auth, 0);
});
test("token-only context supports embedded API authentication", async () => {
  const s = setup();
  await s.guarded.authenticate.admin(
    new Request("https://test.example/api/analytics", {
      headers: { Authorization: `Bearer ${token(allowed)}` },
    }),
  );
  assert.equal(s.calls.auth, 1);
});
test("query id_token and duplicate shop cannot bypass rejection", async () => {
  setup();
  await rejected(
    requireTestRequest(
      new Request(
        `https://test.example/auth?shop=${allowed}&id_token=${token(denied)}`,
      ),
    ),
  );
  await rejected(
    requireTestRequest(
      new Request(`https://test.example/auth?shop=${allowed}&shop=${denied}`),
    ),
  );
});
test("missing, malformed and lookalike contexts fail closed", async () => {
  setup();
  await rejected(requireTestRequest(new Request("https://test.example/app")));
  await rejected(requireTestRequest(request(allowed, "/app", "broken")), 401);
  await rejected(requireTestRequest(request(allowed + ".attacker.test")));
});
test("unverified JWT never bypasses SDK authentication failure", async () => {
  const s = setup();
  s.sdk.authenticate.admin = async () => {
    throw new Response(null, { status: 401 });
  };
  await rejected(
    s.guarded.authenticate.admin(request(allowed, "/app", token(allowed))),
    401,
  );
  assert.equal(s.calls.graphql, 0);
});
test("returned session tenant rechecked before metadata or business access", async () => {
  const s = setup();
  s.shop.myshopifyDomain = denied;
  await rejected(s.guarded.authenticate.admin(request()));
  assert.equal(s.calls.graphql, 0);
});
test("transferred/non-development or unknown plan cannot reach business code", async () => {
  const s = setup();
  s.shop.plan.partnerDevelopment = false;
  await rejected(s.guarded.authenticate.admin(request()));
  assert.equal(s.calls.orders, 0);
});
test("offline nonallowlisted shop rejected before token lookup/refresh", async () => {
  const s = setup();
  await rejected(s.guarded.unauthenticated.admin(denied));
  assert.equal(s.calls.offline, 0);
});
test("approved offline shop validates current development status", async () => {
  const s = setup();
  await s.guarded.unauthenticated.admin(allowed);
  assert.equal(s.calls.offline, 1);
  assert.equal(s.calls.graphql, 1);
});
test("direct analytics denial occurs before orders; allowed synthetic report works", async () => {
  const s = setup();
  s.shop.myshopifyDomain = denied;
  await rejected(fetchAndComputeAnalytics(s.admin));
  assert.equal(s.calls.orders, 0);
  s.shop.myshopifyDomain = allowed;
  const report = await fetchAndComputeAnalytics(s.admin);
  assert.equal(report.totalOrders, 0);
  assert.equal(s.calls.orders, 1);
});
test("direct billing and historical report reject denied tenant before external calls", async () => {
  const s = setup();
  s.shop.myshopifyDomain = denied;
  await rejected(getSubscription(s.shop.id));
  await rejected(getSnapshotHistory(s.shop.id));
  assert.throws(
    () => pricingUrl(denied),
    (e: any) => e.status === 403,
  );
});
test("email rejects denied tenant before provider initialization", async () => {
  setup();
  await rejected(sendDailyBrief({ storeDomain: denied } as any));
});
test("cron skips denied shops before auth, subscriptions, delivery or orders; keeps pending privacy requests", async () => {
  const s = setup();
  s.shop.myshopifyDomain = denied;
  s.db.notificationPreference.findMany = async (args: any) => {
    assert.deepEqual(args.where.shopId.in, [s.shop.id]);
    return [
      { id: 1, shopId: s.shop.id, timezone: "UTC", deliveryTime: "00:00" },
    ];
  };
  process.env.CRON_SECRET = "synthetic-internal";
  const response = await cron({
    request: new Request("https://test.example/api/cron/daily-brief", {
      headers: { Authorization: "Bearer synthetic-internal" },
    }),
  } as any);
  assert.equal(response.status, 200);
  assert.equal(s.calls.offline, 0);
  assert.equal(s.calls.orders, 0);
  assert.equal(s.calls.privacy.length, 1);
  assert.ok(s.calls.privacy[0].where.fulfilledAt.lt);
});
test("internal reports constrain tenant IDs before event reads", async () => {
  const s = setup();
  process.env.INTERNAL_ADMIN_SECRET = "synthetic-internal";
  await interview({
    request: new Request("https://test.example/api/interview-queue", {
      headers: { Authorization: "Bearer synthetic-internal" },
    }),
  } as any);
  assert.deepEqual(s.calls.shopQuery.where.myshopifyDomain.in, [allowed]);
  assert.deepEqual(s.calls.eventQuery.where.shopId.in, [s.shop.id]);
});
function consent(
  values: Record<string, string> = {},
  origin = "https://test.example",
) {
  return agreement({
    request: new Request(`https://test.example/app/agreement?shop=${allowed}`, {
      method: "POST",
      headers: { Origin: origin },
      body: new URLSearchParams({
        version: testAgreementVersion(DPA_VERSION),
        hash: DPA_SHA256,
        accept: "yes",
        testOnly: "yes",
        ...values,
      }),
    }),
  } as any);
}
test("draft rehearsal writes only TEST_ONLY version and verified actor", async () => {
  const s = setup();
  assert.equal(DPA_STATUS, "draft");
  const response = await consent({ shop: denied, actor: "fake" });
  assert.equal(response.status, 302);
  assert.equal(s.calls.writes.length, 1);
  const row = s.calls.writes[0].create;
  assert.equal(row.version, `TEST_ONLY:${DPA_VERSION}`);
  assert.equal(row.shopDomain, allowed);
  assert.equal(row.actorUserId, "synthetic-actor");
  assert.equal(row.documentHash, DPA_SHA256);
  assert.notEqual(row.version, DPA_VERSION);
});
test("draft formal version, missing test acknowledgement, wrong hash and origin write nothing", async () => {
  const s = setup();
  assert.equal((await consent({ version: DPA_VERSION })).status, 409);
  assert.equal((await consent({ testOnly: "" })).status, 400);
  assert.equal((await consent({ hash: "old" })).status, 409);
  assert.equal((await consent({}, "https://attacker.test")).status, 403);
  assert.equal(s.calls.writes.length, 0);
});
test("draft page explicitly identifies test mode and namespaced record", async () => {
  setup();
  const page = await agreementPage({
    request: request(allowed, "/app/agreement"),
  } as any);
  assert.equal(page.enabled, false);
  assert.equal(page.testMode, true);
  assert.equal(page.version, testAgreementVersion(DPA_VERSION));
});
test("nonallowed uninstall still revokes sessions and acceptance without deleting requests", async () => {
  const s = setup();
  await uninstall({
    request: new Request("https://test.example/webhooks/app/uninstalled", {
      method: "POST",
    }),
  } as any);
  assert.deepEqual(s.calls.deleted, [{ where: { shop: denied } }]);
  assert.equal(s.calls.revoked.where.shopDomain, denied);
  assert.equal(s.calls.privacy.length, 0);
});
test("nonallowed privacy webhook remains handled after SDK signature verification", async () => {
  const s = setup();
  await privacy({
    request: new Request("https://test.example/webhooks/privacy", {
      method: "POST",
    }),
  } as any);
  assert.equal(s.calls.auth, 0);
  assert.equal(s.calls.privacy.length, 1);
});
test("invalid privacy webhook still fails authentication", async () => {
  const s = setup();
  s.sdk.authenticate.webhook = async () => {
    throw new Response(null, { status: 401 });
  };
  await rejected(
    privacy({
      request: new Request("https://test.example/webhooks/privacy", {
        method: "POST",
      }),
    } as any),
    401,
  );
  assert.equal(s.calls.privacy.length, 0);
});

import "@shopify/shopify-app-react-router/adapters/node";
import {
  shopifyApp,
  AppDistribution,
  ApiVersion,
} from "@shopify/shopify-app-react-router/server";
test("real Shopify SDK rejects forged allowed-shop JWT without token exchange", async () => {
  const original = globalThis.fetch;
  let network = 0;
  const official = restrictShopify(
    shopifyApp({
      apiKey: "synthetic-app-key",
      apiSecretKey: "synthetic-test-secret-not-a-live-credential",
      apiVersion: ApiVersion.April26,
      appUrl: "https://test.example",
      distribution: AppDistribution.AppStore,
      sessionStorage: {
        storeSession: async () => true,
        loadSession: async () => undefined,
        deleteSession: async () => true,
        deleteSessions: async () => true,
        findSessionsByShop: async () => [],
      },
      logger: { level: 0 },
    }),
  );
  globalThis.fetch = async () => {
    network++;
    throw new Error("Network disabled in test");
  };
  try {
    await rejected(
      official.authenticate.admin(
        new Request("https://test.example/api/analytics", {
          headers: { Authorization: `Bearer ${token(allowed)}` },
        }),
      ),
      401,
    );
    assert.equal(network, 0);
  } finally {
    globalThis.fetch = original;
  }
});

import { eraseShopData } from "../app/lib/privacy-deletion.server";
test("shop erasure deletes business data but preserves unresolved request IDs and deadlines", async () => {
  const requests = [
    {
      id: "pending",
      shopDomain: denied,
      fulfilledAt: null,
      createdAt: new Date("2026-09-08T00:00:00Z"),
    },
    {
      id: "done",
      shopDomain: denied,
      fulfilledAt: new Date(),
      createdAt: new Date(),
    },
  ];
  const untouched = JSON.stringify(requests[0]);
  let removed = 0;
  const noop = { deleteMany: async () => ({ count: 0 }) };
  const db: any = {
    shop: { findUnique: async () => null },
    session: noop,
    legalAcceptance: noop,
    privacyRequest: {
      deleteMany: async ({ where }: any) => {
        assert.equal(where.shopDomain, denied);
        assert.deepEqual(where.fulfilledAt, { not: null });
        for (let i = requests.length - 1; i >= 0; i--)
          if (requests[i].fulfilledAt !== null) {
            requests.splice(i, 1);
            removed++;
          }
        return { count: removed };
      },
    },
    $transaction: async (a: any) => Promise.all(a),
  };
  await eraseShopData(db, denied);
  assert.equal(removed, 1);
  assert.equal(requests.length, 1);
  assert.equal(JSON.stringify(requests[0]), untouched);
});
test("customer erasure preserves pending privacy requests while keeping erasure handlers", async () => {
  const s = setup();
  s.sdk.authenticate.webhook = async () => ({
    shop: denied,
    topic: "CUSTOMERS_REDACT",
    payload: { customer: { id: 456 }, orders_to_redact: [] },
  });
  s.db.orderSnapshot = { deleteMany: async () => ({ count: 0 }) };
  await privacy({
    request: new Request("https://test.example/webhooks/privacy", {
      method: "POST",
    }),
  } as any);
  assert.deepEqual(s.calls.privacy[0].where.fulfilledAt, { not: null });
});
