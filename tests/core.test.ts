import test from "node:test";
import assert from "node:assert/strict";
import {
  computeAnalytics,
  trend,
  localDate,
  type Order,
} from "../app/lib/analytics-core";
import { fetchAndComputeAnalytics } from "../app/lib/analytics.server";
import {
  hasEntitlement,
  getSubscription,
  pricingUrl,
} from "../app/lib/billing.server";
import { requireInternal } from "../app/lib/internal-auth.server";
import { dueDate } from "../app/lib/delivery";
import {
  buildDailyBriefHtml,
  embeddedBriefUrl,
} from "../app/lib/email-templates/daily-brief";
const order = (id: string, date: string, amount: number): Order => ({
  id,
  name: id,
  createdAt: date,
  test: false,
  cancelledAt: null,
  displayFinancialStatus: "PAID",
  totalPriceSet: { shopMoney: { amount: String(amount) } },
  lineItems: {
    nodes: [
      {
        name: "Product",
        sku: "SKU",
        quantity: 3,
        originalTotalSet: { shopMoney: { amount: "60" } },
      },
    ],
  },
});
const now = new Date("2026-09-08T12:00:00Z");
test("like-for-like weekly trends and line totals are not multiplied by quantity", () => {
  const d = computeAnalytics(
    [
      order("old", "2026-08-27T12:00:00Z", 100),
      order("new", "2026-09-03T12:00:00Z", 200),
    ],
    "EUR",
    "UTC",
    now,
  );
  assert.equal(d.gmv, 200);
  assert.equal(d.aov, 200);
  assert.equal(d.trends.orders.change, 0);
  assert.equal(d.trends.gmv.change, 100);
  assert.equal(d.trends.aov.change, 100);
  assert.equal(d.topSkuRevenue[0].revenue, 60);
  assert.equal(d.topSkuRevenue[0].qty, 3);
});
test("shop timezone boundaries exclude current partial day and ineligible orders", () => {
  const items = [
    order("include", "2026-09-07T15:59:00Z", 10),
    order("today", "2026-09-07T16:00:00Z", 20),
    { ...order("test", "2026-09-03T12:00:00Z", 30), test: true },
    {
      ...order("refund", "2026-09-03T12:00:00Z", 40),
      displayFinancialStatus: "PARTIALLY_REFUNDED",
    },
  ];
  const d = computeAnalytics(items, "CNY", "Asia/Shanghai", now);
  assert.equal(d.totalOrders, 1);
  assert.equal(d.gmv, 10);
  assert.equal(d.periodEnd, "2026-09-07");
  assert.equal(d.dailyGmv.length, 14);
});
test("empty baseline does not create infinite trends or unsupported health claims", () => {
  assert.deepEqual(trend(10, 0), { change: 0, direction: "flat" });
  assert.equal(
    computeAnalytics([], "USD", "UTC", now).prioritizedIssues.length,
    0,
  );
});
test("gross product concentration uses gross product denominator", () => {
  const os = Array.from({ length: 10 }, (_, i) =>
    order(String(i), "2026-09-02T12:00:00Z", 100),
  );
  const d = computeAnalytics(os, "USD", "UTC", now);
  assert.equal(d.prioritizedIssues.length, 0);
});
test("order and nested item pagination continue instead of silently truncating", async () => {
  let orderPages = 0,
    itemPages = 0;
  const current = new Date();
  current.setUTCDate(current.getUTCDate() - 2);
  const admin = {
    async graphql(query: string) {
      if (query.includes("BriefShop"))
        return Response.json({
          data: { shop: { currencyCode: "USD", ianaTimezone: "UTC" } },
        });
      if (query.includes("BriefItems")) {
        itemPages++;
        return Response.json({
          data: {
            order: {
              lineItems: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        });
      }
      orderPages++;
      return Response.json({
        data: {
          orders: {
            nodes: [
              {
                ...order(String(orderPages), current.toISOString(), 50),
                lineItems: {
                  nodes: [],
                  pageInfo: {
                    hasNextPage: orderPages === 1,
                    endCursor: "items",
                  },
                },
              },
            ],
            pageInfo: { hasNextPage: orderPages === 1, endCursor: "next" },
          },
        },
      });
    },
  };
  const d = await fetchAndComputeAnalytics(admin);
  assert.equal(orderPages, 2);
  assert.equal(itemPages, 1);
  assert.equal(d.totalOrders, 2);
});
test("GraphQL errors fail instead of producing a partial report", async () => {
  await assert.rejects(
    fetchAndComputeAnalytics({
      graphql: async () => Response.json({ errors: [{ message: "denied" }] }),
    }),
    /unavailable/,
  );
});
test("entitlement requires a live matching contract, including retired catalog and dev-test prices", () => {
  const c = {
    billingPeriod: "EVERY_30_DAYS",
    trialEndsAt: "2026-09-10T00:00:00Z",
    cancelAtEndOfCycle: true,
    currentBillingCycle: null,
    items: [{ handle: "daily-brief", price: { active: true } }],
  };
  assert.equal(hasEntitlement(c, "daily-brief"), true);
  assert.equal(hasEntitlement(c, "other"), false);
  assert.equal(hasEntitlement(null, "daily-brief"), false);
  assert.equal(
    hasEntitlement(
      { ...c, items: [{ handle: "daily-brief", price: { active: false } }] },
      "daily-brief",
    ),
    true,
  );
  assert.equal(hasEntitlement({ ...c, items: [] }, "daily-brief"), false);
});
test("billing missing configuration fails closed", async () => {
  const old = process.env.SHOPIFY_PARTNER_API_TOKEN;
  delete process.env.SHOPIFY_PARTNER_API_TOKEN;
  try {
    await assert.rejects(
      getSubscription("gid://shopify/Shop/1"),
      (e) => e instanceof Response && e.status === 503,
    );
  } finally {
    if (old) process.env.SHOPIFY_PARTNER_API_TOKEN = old;
  }
});
test("hosted billing URL accepts only Shopify shop domains", () => {
  process.env.SHOPIFY_APP_HANDLE = "naruto-ai";
  assert.match(
    pricingUrl("demo.myshopify.com"),
    /^https:\/\/admin.shopify.com\/store\/demo\/charges\/naruto-ai\/pricing_plans$/,
  );
  assert.throws(() => pricingUrl("evil.com"));
});
test("internal endpoints reject absent configuration and invalid authorization", () => {
  delete process.env.INTERNAL_ADMIN_SECRET;
  assert.throws(
    () =>
      requireInternal(
        new Request("https://example.com"),
        "INTERNAL_ADMIN_SECRET",
      ),
    (e) => e instanceof Response && e.status === 503,
  );
  process.env.INTERNAL_ADMIN_SECRET = "test-secret";
  assert.throws(
    () =>
      requireInternal(
        new Request("https://example.com"),
        "INTERNAL_ADMIN_SECRET",
      ),
    (e) => e instanceof Response && e.status === 401,
  );
  requireInternal(
    new Request("https://example.com", {
      headers: { authorization: "Bearer test-secret" },
    }),
    "INTERNAL_ADMIN_SECRET",
  );
});
test("delivery honors local calendar including DST", () => {
  assert.equal(
    dueDate(new Date("2026-09-08T00:01:00Z"), "Asia/Shanghai", "08:00"),
    "2026-09-08",
  );
  assert.equal(
    dueDate(new Date("2026-09-07T23:59:00Z"), "Asia/Shanghai", "08:00"),
    null,
  );
  assert.equal(
    localDate(new Date("2026-03-08T04:30:00Z"), "America/New_York"),
    "2026-03-07",
  );
});
test("email escapes untrusted product/store text and labels its period and currency", () => {
  const d = computeAnalytics(
    [order("1", "2026-09-03T12:00:00Z", 50)],
    "EUR",
    "UTC",
    now,
  );
  d.topSkuRevenue[0].name = "<img src=x onerror=alert(1)>";
  const html = buildDailyBriefHtml(
    "<script>x</script>",
    d,
    "all-clear",
    null,
    "https://example.com",
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("€"));
  assert.ok(html.includes("source=email"));
  assert.ok(!html.includes("running smoothly"));
});

test("Partner response is checked server-side: active, no contract and GraphQL denial", async () => {
  const keys = [
    "SHOPIFY_PARTNER_ORG_ID",
    "SHOPIFY_PARTNER_API_TOKEN",
    "SHOPIFY_APP_GID",
    "SHOPIFY_PRICING_ITEM_HANDLE",
  ];
  const previous = keys.map((k) => process.env[k]);
  const originalFetch = globalThis.fetch;
  process.env.SHOPIFY_PARTNER_ORG_ID = "123";
  process.env.SHOPIFY_PARTNER_API_TOKEN = "unit-test-only";
  process.env.SHOPIFY_APP_GID = "gid://shopify/App/1";
  process.env.SHOPIFY_PRICING_ITEM_HANDLE = "daily-brief";
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(
        url,
        "https://partners.shopify.com/123/api/2026-07/graphql.json",
      );
      assert.equal(
        JSON.parse(String(init?.body)).variables.shopId,
        "gid://shopify/Shop/2",
      );
      return Response.json({
        data: {
          activeSubscription: {
            items: [{ handle: "daily-brief", price: { active: true } }],
          },
        },
      });
    };
    assert.equal((await getSubscription("gid://shopify/Shop/2")).active, true);
    globalThis.fetch = async () =>
      Response.json({ data: { activeSubscription: null } });
    assert.equal((await getSubscription("gid://shopify/Shop/2")).active, false);
    globalThis.fetch = async () =>
      Response.json({ errors: [{ message: "Access denied" }] });
    await assert.rejects(
      getSubscription("gid://shopify/Shop/2"),
      (e) => e instanceof Response && e.status === 503,
    );
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((k, i) => {
      if (previous[i] === undefined) delete process.env[k];
      else process.env[k] = previous[i];
    });
  }
});

test("email links use the exact Shopify store and app, rejecting foreign destinations", () => {
  const url = embeddedBriefUrl(
    "naruto-dev-ts8dqzla.myshopify.com",
    "naruto-analytics-2",
  );
  assert.equal(
    url,
    "https://admin.shopify.com/store/naruto-dev-ts8dqzla/apps/naruto-analytics-2/app",
  );
  assert.throws(() =>
    embeddedBriefUrl("evil.example.com", "naruto-analytics-2"),
  );
  assert.throws(() => embeddedBriefUrl("test.myshopify.com", "../other"));
  const html = buildDailyBriefHtml(
    "Test",
    computeAnalytics([], "USD", "UTC", now),
    "all-clear",
    null,
    url,
  );
  assert.ok(html.includes(url + "?source=email"));
  assert.ok(html.includes('href="' + url + '"'));
});
