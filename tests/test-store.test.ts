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
  delete process.env.REVIEW_ACCESS_ENABLED;
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
  process.env.DPA_ACCEPTANCE_VERSION = testAgreementVersion(DPA_VERSION);
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
test("published agreement writes only formal version and verified actor", async () => {
  const s = setup();
  process.env.DPA_ACCEPTANCE_VERSION = DPA_VERSION;
  const response = await agreement({
    request: new Request(`https://test.example/app/agreement?shop=${allowed}`, {
      method: "POST",
      headers: { Origin: "https://test.example" },
      body: new URLSearchParams({
        version: DPA_VERSION,
        hash: DPA_SHA256,
        accept: "yes",
        shop: denied,
        actor: "fake",
      }),
    }),
  } as any);
  assert.equal(response.status, 302);
  assert.equal(s.calls.writes.length, 1);
  const row = s.calls.writes[0].create;
  assert.equal(row.version, DPA_VERSION);
  assert.equal(row.shopDomain, allowed);
  assert.equal(row.actorUserId, "synthetic-actor");
  assert.equal(row.documentHash, DPA_SHA256);
  assert.notEqual(row.version, `TEST_ONLY:${DPA_VERSION}`);
});
test("wrong test-only version, missing formal enablement, wrong hash and origin write nothing", async () => {
  const s = setup();
  assert.equal((await consent()).status, 409);
  delete process.env.DPA_ACCEPTANCE_VERSION;
  assert.equal((await consent({ version: DPA_VERSION, testOnly: "" })).status, 409);
  process.env.DPA_ACCEPTANCE_VERSION = DPA_VERSION;
  assert.equal((await consent({ version: DPA_VERSION, testOnly: "", hash: "old" })).status, 409);
  assert.equal((await consent({ version: DPA_VERSION, testOnly: "" }, "https://attacker.test")).status, 403);
  assert.equal(s.calls.writes.length, 0);
});
test("published page uses formal version and does not expose TEST_ONLY mode", async () => {
  setup();
  process.env.DPA_ACCEPTANCE_VERSION = DPA_VERSION;
  const page = await agreementPage({
    request: request(allowed, "/app/agreement"),
  } as any);
  assert.equal(page.enabled, true);
  assert.equal(page.testMode, false);
  assert.equal(page.version, DPA_VERSION);
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
test("real Shopify SDK rejects forged JWTs for both original and fresh review stores", async () => {
  reviewSetup();
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
    for (const sdkShop of [allowed, "fresh-review.myshopify.com"])
      await rejected(
        official.authenticate.admin(
          new Request("https://test.example/api/analytics", {
            headers: { Authorization: `Bearer ${token(sdkShop)}` },
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
    analyticsEvent: noop,
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

test("unconfigured draft cannot accept rehearsal or business consent", async () => {
  const s = setup();
  delete process.env.DPA_ACCEPTANCE_VERSION;
  assert.equal((await consent()).status, 409);
  assert.equal(s.calls.writes.length, 0);
  const page = await agreementPage({
    request: request(allowed, "/app/agreement"),
  } as any);
  assert.equal(page.testMode, false);
});

import { createHash } from "node:crypto";
import {
  reviewConfig,
  readGrant,
  encodeGrant,
  reviewKey,
} from "../app/lib/review-policy.server";
import {
  admitReviewShop,
  hasReviewAdmission,
  revokeReviewShop,
} from "../app/lib/review-admission.server";
import {
  hasStoreAdmission,
  admittedShops,
} from "../app/lib/test-store-policy.server";
import {
  action as reviewAction,
  loader as reviewPage,
} from "../app/routes/app.review";
import { action as revokeAction } from "../app/routes/api.review-access";
import { admittedPricingUrl } from "../app/lib/billing.server";
const reviewCode = "a".repeat(64);
function reviewSetup() {
  const s = setup();
  s.shop.myshopifyDomain = "fresh-review.myshopify.com";
  Object.assign(process.env, {
    REVIEW_ACCESS_ENABLED: "true",
    REVIEW_CAMPAIGN: "fixture_campaign",
    REVIEW_CODE_SHA256: createHash("sha256").update(reviewCode).digest("hex"),
    REVIEW_SIGNING_KEY: "fixture-signing-key-never-use-live-0000",
    REVIEW_START_AT: new Date(Date.now() - 1000).toISOString(),
    REVIEW_END_AT: new Date(Date.now() + 6 * 86400000).toISOString(),
  });
  const rows = new Map<string, any>();
  s.db.analyticsEvent.findUnique = async (a: any) =>
    rows.get(a.where.dedupeKey) || null;
  s.db.analyticsEvent.create = async (a: any) => {
    if (rows.has(a.data.dedupeKey))
      throw Object.assign(new Error("duplicate"), { code: "P2002" });
    rows.set(a.data.dedupeKey, { ...a.data });
    return a.data;
  };
  s.db.analyticsEvent.findMany = async (a: any) =>
    [...rows.values()].filter((x) => x.event === a.where.event);
  s.db.analyticsEvent.upsert = async (a: any) => {
    const row = rows.has(a.where.dedupeKey)
      ? { ...rows.get(a.where.dedupeKey), ...a.update }
      : a.create;
    rows.set(a.where.dedupeKey, row);
    return row;
  };
  return { ...s, rows };
}
function submitReview(
  shop: string,
  values: Record<string, string> = {},
  origin = "https://test.example",
) {
  return reviewAction({
    request: new Request(`https://test.example/app/review?shop=${shop}`, {
      method: "POST",
      headers: { Origin: origin },
      body: new URLSearchParams({
        code: reviewCode,
        synthetic: "yes",
        ...values,
      }),
    }),
  } as any);
}
test("review configuration is closed when disabled, incomplete, too long or expired", () => {
  reviewSetup();
  assert.ok(reviewConfig());
  for (const [key, value] of [
    ["REVIEW_ACCESS_ENABLED", "false"],
    ["REVIEW_CODE_SHA256", "bad"],
    ["REVIEW_SIGNING_KEY", "short"],
    ["REVIEW_START_AT", "invalid"],
    ["REVIEW_END_AT", new Date(Date.now() + 9 * 86400000).toISOString()],
    ["REVIEW_END_AT", new Date(Date.now() - 2000).toISOString()],
  ]) {
    const old = process.env[key];
    process.env[key] = value;
    assert.equal(reviewConfig(), null);
    process.env[key] = old;
  }
});
test("new review store can authenticate to admission only; APIs deny before orders", async () => {
  const s = reviewSetup();
  const page = await reviewPage({
    request: request(s.shop.myshopifyDomain, "/app/review"),
  } as any);
  assert.equal(page.enabled, true);
  assert.equal(page.admitted, false);
  assert.equal(s.calls.orders, 0);
  await rejected(
    s.guarded.authenticate.admin(
      request(s.shop.myshopifyDomain, "/api/analytics"),
    ),
  );
  await assert.rejects(
    s.guarded.authenticate.admin(request(s.shop.myshopifyDomain, "/app")),
    (e: any) => e.status === 302 && e.headers.get("Location") === "/app/review",
  );
  assert.equal(s.calls.orders, 0);
});
test("review mode preserves SDK failure and non-development denial", async () => {
  let s = reviewSetup();
  s.sdk.authenticate.admin = async () => {
    throw new Response(null, { status: 401 });
  };
  await rejected(submitReview(s.shop.myshopifyDomain), 401);
  assert.equal(s.calls.graphql, 0);
  s = reviewSetup();
  s.shop.plan.partnerDevelopment = false;
  await rejected(submitReview(s.shop.myshopifyDomain));
  assert.equal(s.rows.size, 0);
  assert.equal(s.calls.orders, 0);
});
test("review form rejects foreign origin, invalid code and missing synthetic acknowledgement", async () => {
  const s = reviewSetup();
  for (const [values, origin] of [
    [{}, "https://attacker.test"],
    [{ code: "b".repeat(64) }, "https://test.example"],
    [{ synthetic: "" }, "https://test.example"],
  ] as [Record<string, string>, string][]) {
    const res = await submitReview(s.shop.myshopifyDomain, values, origin);
    assert.equal((res as any).init.status, 403);
  }
  assert.equal(s.rows.size, 0);
});
test("admission binds verified store and actor, lasts at most 48h, and is not a legal record", async () => {
  const s = reviewSetup();
  const response = await submitReview(s.shop.myshopifyDomain, {
    shop: denied,
    actor: "fake",
  });
  assert.equal((response as Response).status, 302);
  assert.equal(await hasReviewAdmission(s.shop.myshopifyDomain), true);
  const row = s.rows.get(reviewKey(s.shop.myshopifyDomain));
  const grant = readGrant(row.data, s.shop.myshopifyDomain)!;
  assert.equal(grant.actor, "synthetic-actor");
  assert.equal(grant.expires - grant.issued, 48 * 3600000);
  assert.equal(s.calls.writes.length, 0);
  assert.equal(s.calls.orders, 0);
});
test("admitted store proceeds through authenticated business and offline paths", async () => {
  const s = reviewSetup();
  await submitReview(s.shop.myshopifyDomain);
  await s.guarded.authenticate.admin(request(s.shop.myshopifyDomain, "/app"));
  await s.guarded.unauthenticated.admin(s.shop.myshopifyDomain);
  await fetchAndComputeAnalytics(s.admin);
  assert.equal(s.calls.orders, 1);
  process.env.SHOPIFY_APP_HANDLE = "naruto-analytics-2";
  assert.match(
    await admittedPricingUrl(s.shop.myshopifyDomain),
    /fresh-review/,
  );
  assert.ok((await admittedShops()).includes(s.shop.myshopifyDomain));
});
test("grant rejects cross-shop, tampering, wrong campaign and exact expiry", async () => {
  const s = reviewSetup();
  await submitReview(s.shop.myshopifyDomain);
  const row = s.rows.get(reviewKey(s.shop.myshopifyDomain));
  const grant = readGrant(row.data, s.shop.myshopifyDomain)!;
  assert.equal(readGrant(row.data, denied), null);
  assert.equal(readGrant(row.data + "x", s.shop.myshopifyDomain), null);
  assert.equal(
    readGrant(row.data, s.shop.myshopifyDomain, grant.expires),
    null,
  );
  process.env.REVIEW_CAMPAIGN = "changed_campaign";
  assert.equal(await hasReviewAdmission(s.shop.myshopifyDomain), false);
});
test("resubmitting cannot extend grant or renew an expired grant", async () => {
  const s = reviewSetup();
  await submitReview(s.shop.myshopifyDomain);
  const row = s.rows.get(reviewKey(s.shop.myshopifyDomain));
  const before = row.data;
  await submitReview(s.shop.myshopifyDomain);
  assert.equal(row.data, before);
  const c = reviewConfig()!;
  row.data = encodeGrant(
    {
      shop: s.shop.myshopifyDomain,
      campaign: c.campaign,
      actor: "actor",
      issued: c.start,
      expires: Date.now() - 1,
    },
    c.key,
  );
  assert.equal(
    await admitReviewShop(s.shop.myshopifyDomain, "actor", reviewCode),
    false,
  );
});
test("revocation blocks API, orders, history, billing, email and offline auth; keeps original store", async () => {
  const s = reviewSetup();
  await submitReview(s.shop.myshopifyDomain);
  await revokeReviewShop(s.shop.myshopifyDomain);
  await rejected(
    s.guarded.authenticate.admin(
      request(s.shop.myshopifyDomain, "/api/analytics"),
    ),
  );
  await rejected(fetchAndComputeAnalytics(s.admin));
  await rejected(getSnapshotHistory(s.shop.id));
  await rejected(getSubscription(s.shop.id));
  await rejected(admittedPricingUrl(s.shop.myshopifyDomain));
  await rejected(
    sendDailyBrief({ storeDomain: s.shop.myshopifyDomain } as any),
  );
  await rejected(s.guarded.unauthenticated.admin(s.shop.myshopifyDomain));
  assert.equal(s.calls.offline, 0);
  assert.equal(s.calls.orders, 0);
  assert.equal(await hasStoreAdmission(allowed), true);
  assert.deepEqual(await admittedShops(), [allowed]);
  assert.equal(
    await admitReviewShop(s.shop.myshopifyDomain, "actor", reviewCode),
    false,
  );
});
test("revoke before first admission leaves a tombstone that prevents entry", async () => {
  const s = reviewSetup();
  await revokeReviewShop(s.shop.myshopifyDomain);
  assert.equal(
    await admitReviewShop(s.shop.myshopifyDomain, "actor", reviewCode),
    false,
  );
});
test("global disable revokes review access but not original development store", async () => {
  const s = reviewSetup();
  await submitReview(s.shop.myshopifyDomain);
  process.env.REVIEW_ACCESS_ENABLED = "false";
  assert.equal(await hasStoreAdmission(s.shop.myshopifyDomain), false);
  assert.equal(await hasStoreAdmission(allowed), true);
  await rejected(s.guarded.unauthenticated.admin(s.shop.myshopifyDomain));
  assert.equal(s.calls.offline, 0);
});
test("revocation API requires internal authentication and cannot be invoked by reviewer code", async () => {
  const s = reviewSetup();
  process.env.INTERNAL_ADMIN_SECRET = "fixture-internal-secret";
  await rejected(
    revokeAction({
      request: new Request("https://test.example/api/review-access", {
        method: "POST",
        headers: { Authorization: `Bearer ${reviewCode}` },
        body: JSON.stringify({ shop: s.shop.myshopifyDomain }),
      }),
    } as any),
    401,
  );
  assert.equal(s.rows.size, 0);
  const res = await revokeAction({
    request: new Request("https://test.example/api/review-access", {
      method: "POST",
      headers: { Authorization: "Bearer fixture-internal-secret" },
      body: JSON.stringify({ shop: s.shop.myshopifyDomain }),
    }),
  } as any);
  assert.equal(res.status, 200);
});

test("shop erasure includes all campaign review records even before business onboarding", async () => {
  const s = reviewSetup();
  await submitReview(s.shop.myshopifyDomain);
  s.db.shop.findUnique = async () => null;
  s.db.legalAcceptance.deleteMany = async () => ({ count: 0 });
  let deleted: any;
  s.db.analyticsEvent.deleteMany = async (a: any) => {
    deleted = a;
    return { count: 1 };
  };
  await eraseShopData(s.db, s.shop.myshopifyDomain);
  assert.deepEqual(deleted.where, {
    shopId: s.shop.myshopifyDomain,
    event: { in: ["review_admission", "review_revoked"] },
  });
  assert.deepEqual(s.calls.privacy[0].where.fulfilledAt, { not: null });
});
test("cron selects admitted review stores and rechecks revocation before offline auth", async () => {
  const s = reviewSetup();
  await submitReview(s.shop.myshopifyDomain);
  let selected = false;
  s.db.shop.findMany = async (a: any) => {
    assert.ok(a.where.myshopifyDomain.in.includes(s.shop.myshopifyDomain));
    selected = true;
    return [{ id: s.shop.id }];
  };
  s.db.notificationPreference.findMany = async () => {
    await revokeReviewShop(s.shop.myshopifyDomain);
    return [
      { id: 1, shopId: s.shop.id, timezone: "UTC", deliveryTime: "00:00" },
    ];
  };
  process.env.CRON_SECRET = "fixture-cron";
  await cron({
    request: new Request("https://test.example/api/cron/daily-brief", {
      headers: { Authorization: "Bearer fixture-cron" },
    }),
  } as any);
  assert.equal(selected, true);
  assert.equal(s.calls.offline, 0);
  assert.equal(s.calls.orders, 0);
});
test("new campaign permits explicit re-admission, old grants remain invalid", async () => {
  const s = reviewSetup();
  await submitReview(s.shop.myshopifyDomain);
  await revokeReviewShop(s.shop.myshopifyDomain);
  process.env.REVIEW_CAMPAIGN = "new_explicit_campaign";
  assert.equal(await hasReviewAdmission(s.shop.myshopifyDomain), false);
  assert.equal(
    await admitReviewShop(s.shop.myshopifyDomain, "actor", reviewCode),
    true,
  );
});

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import ReviewScreen from "../app/routes/app.review";
test("review screen renders closed, credential and admitted states without exposing code", () => {
  for (const state of [
    { enabled: false, admitted: false },
    { enabled: true, admitted: false },
    { enabled: true, admitted: true },
  ]) {
    const router = createMemoryRouter(
      [
        {
          id: "review",
          path: "/",
          element: createElement(ReviewScreen),
          loader: () => state,
        },
      ],
      { hydrationData: { loaderData: { review: state } } },
    );
    const html = renderToString(createElement(RouterProvider, { router }));
    router.dispose();
    if (!state.enabled) assert.match(html, /currently closed/);
    else if (state.admitted) assert.match(html, /Continue to the agreement/);
    else {
      assert.match(html, /type="password"/);
      assert.match(html, /synthetic test data only/);
      assert.doesNotMatch(html, new RegExp(reviewCode));
    }
  }
});
