import test from "node:test";
import assert from "node:assert/strict";
import { action } from "../app/routes/api.test-email";
import { loader as cron } from "../app/routes/api.cron.daily-brief";
const shop = {
  id: "shop-test",
  myshopifyDomain: "naruto-dev-ts8dqzla.myshopify.com",
  name: "Test",
};
const analytics = { prioritizedIssues: [] };
function setup() {
  const records = new Map<string, any>();
  let pref: any = {
    id: 1,
    shopId: shop.id,
    email: "saved@example.com",
    dailyBrief: true,
    timezone: "UTC",
    deliveryTime: "00:00",
    lastDailyAt: null,
  };
  const sent: any[] = [];
  const flow: any = {
    requireSubscription: async () => ({
      admin: {},
      session: { shop: shop.myshopifyDomain },
    }),
    getSubscription: async () => ({ active: true }),
    hasDpaAcceptance: async () => true,
    admin: async () => ({ admin: {} }),
    fetchAndComputeAnalytics: async () => analytics,
    sendDailyBrief: async (p: any) => {
      sent.push(p);
      return { success: true };
    },
    db: {
      shop: { findUnique: async () => shop, findMany: async () => [{id:shop.id}] },
      notificationPreference: {
        findUnique: async () => pref,
        findMany: async () => (pref.dailyBrief ? [pref] : []),
        update: async ({ data }: any) => Object.assign(pref, data),
      },
      briefDelivery: {
        create: async ({ data }: any) => {
          if (records.has(data.id)) throw { code: "P2002" };
          records.set(data.id, {
            ...data,
            createdAt: new Date(),
            claimedAt: new Date(),
          });
          return records.get(data.id);
        },
        upsert: async ({ where, create }: any) => {
          if (!records.has(where.id))
            records.set(where.id, {
              ...create,
              createdAt: new Date(),
              claimedAt: new Date(),
            });
          return records.get(where.id);
        },
        update: async ({ where, data }: any) =>
          Object.assign(records.get(where.id), data),
        updateMany: async ({ where, data }: any) => {
          const r = records.get(where.id);
          const expired = r?.claimedAt < where.OR[1].claimedAt.lt;
          if (
            !r ||
            !(r.status === "pending" || (r.status === "sending" && expired))
          )
            return { count: 0 };
          Object.assign(r, data);
          return { count: 1 };
        },
        deleteMany: async () => ({ count: 0 }),
      },
      analyticsSnapshot: { deleteMany: async () => ({ count: 0 }) },
      analyticsEvent: { deleteMany: async () => ({ count: 0 }) },
      privacyRequest: { deleteMany: async () => ({ count: 0 }) },
      $transaction: async (p: any) => Promise.all(p),
    },
  };
  (globalThis as any).flow = flow;
  return {
    flow,
    records,
    sent,
    get pref() {
      return pref;
    },
  };
}
function send(email = "saved@example.com") {
  return action({
    request: new Request("https://test.example/api/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  } as any);
}
function runCron() {
  process.env.CRON_SECRET = "test-only";
  return cron({
    request: new Request("https://test.example/api/cron/daily-brief", {
      headers: { Authorization: "Bearer test-only" },
    }),
  } as any);
}
test("edited unsaved recipient is rejected before analytics or sending", async () => {
  const f = setup();
  const r: any = await send("different@example.com");
  assert.equal(r.init.status, 409);
  assert.equal(f.sent.length, 0);
  assert.equal(f.records.size, 0);
});
test("concurrent test clicks produce one send with a durable idempotency key", async () => {
  const f = setup();
  const results: any[] = await Promise.all([send(), send(), send()]);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].to, "saved@example.com");
  assert.match(f.sent[0].idempotencyKey, /^test-email:shop-test:/);
  assert.equal(results.filter((x) => x.init.status === 429).length, 2);
});
test("uncertain provider failure keeps slot claimed and does not resend", async () => {
  const f = setup();
  let calls = 0;
  f.flow.sendDailyBrief = async () => {
    calls++;
    throw Error("timeout");
  };
  const first: any = await send();
  const second: any = await send();
  assert.equal(first.init.status, 503);
  assert.equal(second.init.status, 429);
  assert.equal(calls, 1);
});
test("cron sends once per day across repeated invocations", async () => {
  const f = setup();
  await runCron();
  await runCron();
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0].idempotencyKey, /^daily-brief\//);
});
test("cron does not send before scheduled time", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-08T07:00:00Z"),
  });
  const f = setup();
  f.pref.timezone = "UTC";
  f.pref.deliveryTime = "08:00";
  await runCron();
  assert.equal(f.sent.length, 0);
});
test("opt-out during analytics fetch prevents cron delivery", async () => {
  const f = setup();
  f.flow.fetchAndComputeAnalytics = async () => {
    f.pref.dailyBrief = false;
    return analytics;
  };
  await runCron();
  assert.equal(f.sent.length, 0);
});
test("subscription ending during analytics fetch prevents cron delivery", async () => {
  const f = setup();
  let active = true;
  f.flow.getSubscription = async () => ({ active });
  f.flow.fetchAndComputeAnalytics = async () => {
    active = false;
    return analytics;
  };
  await runCron();
  assert.equal(f.sent.length, 0);
});
test("failed cron delivery retries only after lease timeout with same key", async () => {
  const f = setup();
  f.flow.sendDailyBrief = async (p: any) => {
    f.sent.push(p);
    return { success: false };
  };
  await runCron();
  await runCron();
  assert.equal(f.sent.length, 1);
  for (const r of f.records.values())
    r.claimedAt = new Date(Date.now() - 11 * 60000);
  await runCron();
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[0].idempotencyKey, f.sent[1].idempotencyKey);
  assert.equal(f.pref.lastDailyAt, null);
});

test("retry freezes report data and cancels when recipient changes", async () => {
  const f = setup();
  let reads = 0;
  f.flow.fetchAndComputeAnalytics = async () => {
    reads++;
    return analytics;
  };
  f.flow.sendDailyBrief = async (p: any) => {
    f.sent.push(p);
    return { success: false };
  };
  await runCron();
  for (const r of f.records.values())
    r.claimedAt = new Date(Date.now() - 11 * 60000);
  await runCron();
  assert.equal(reads, 1);
  assert.deepEqual(f.sent[0], f.sent[1]);
  f.pref.email = "new@example.com";
  for (const r of f.records.values())
    r.claimedAt = new Date(Date.now() - 11 * 60000);
  await runCron();
  assert.equal(f.sent.length, 2);
  assert.equal([...f.records.values()][0].status, "cancelled");
});

test("authentication or subscription rejection cannot send or claim a slot", async () => {
  for (const status of [401, 402, 503]) {
    const f = setup();
    f.flow.requireSubscription = async () => {
      throw new Response(null, { status });
    };
    await assert.rejects(send(), (e: any) => e.status === status);
    assert.equal(f.sent.length, 0);
    assert.equal(f.records.size, 0);
  }
});


test("revoked agreement blocks a cached delivery retry", async () => {
  const f = setup();
  f.flow.sendDailyBrief = async (p: any) => {
    f.sent.push(p);
    return { success: false };
  };
  await runCron();
  assert.equal(f.sent.length, 1);
  for (const r of f.records.values()) {
    assert.ok(r.payloadJson);
    r.claimedAt = new Date(Date.now() - 11 * 60000);
  }
  f.flow.hasDpaAcceptance = async () => false;
  await runCron();
  assert.equal(f.sent.length, 1);
});

test("agreement revoked during analytics retrieval prevents sending", async () => {
  const f = setup();
  f.flow.fetchAndComputeAnalytics = async () => {
    f.flow.hasDpaAcceptance = async () => false;
    return analytics;
  };
  await runCron();
  assert.equal(f.sent.length, 0);
});
