import {
  hasStoreAdmission,
  admittedShops,
} from "../lib/test-store-policy.server";
import { recordJobSuccess } from "../lib/job-health.server";
import { hasDpaAcceptance } from "../lib/dpa.server";
import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { fetchAndComputeAnalytics } from "../lib/analytics.server";
import { getSubscription } from "../lib/billing.server";
import { requireInternal } from "../lib/internal-auth.server";
import { sendDailyBrief } from "../lib/email.server";
import { localDate } from "../lib/analytics-core";
import { dueDate } from "../lib/delivery";
export async function loader({ request }: LoaderFunctionArgs) {
  requireInternal(request, "CRON_SECRET");
  const now = new Date();
  await prisma.$transaction([
    prisma.analyticsSnapshot.deleteMany({
      where: { snapshotDate: { lt: new Date(now.getTime() - 90 * 86400000) } },
    }),
    prisma.analyticsEvent.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 90 * 86400000) } },
    }),
    prisma.briefDelivery.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
    }),
    prisma.privacyRequest.deleteMany({
      where: { fulfilledAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
    }),
  ]);
  const allowedShops = await prisma.shop.findMany({
    where: { myshopifyDomain: { in: await admittedShops() } },
    select: { id: true },
  });
  let cursor: number | undefined;
  let processed = 0,
    failed = 0;
  // Bounded pages; pending shops are retried on the next invocation if execution times out.
  do {
    const prefs = await prisma.notificationPreference.findMany({
      where: {
        dailyBrief: true,
        shopId: { in: allowedShops.map((shop) => shop.id) },
      },
      take: 25,
      orderBy: { id: "asc" },
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const pref of prefs) {
      try {
        const date = dueDate(now, pref.timezone, pref.deliveryTime);
        if (!date) continue;
        if (
          pref.lastDailyAt &&
          localDate(pref.lastDailyAt, pref.timezone) === date
        )
          continue;
        const shop = await prisma.shop.findUnique({
          where: { id: pref.shopId },
        });
        if (!shop || !(await hasStoreAdmission(shop.myshopifyDomain))) continue;
        // Check current development status even when retrying a frozen payload.
        const { admin } = await unauthenticated.admin(shop.myshopifyDomain);
        if (!(await getSubscription(shop.id)).active) continue;
        // Recheck consent on every attempt, including retries with a saved payload.
        if (!(await hasDpaAcceptance(shop.myshopifyDomain))) continue;
        const id = `${shop.id}:${date}`;
        const delivery = await prisma.briefDelivery.upsert({
          where: { id },
          create: { id, shopId: shop.id, date, status: "pending" },
          update: {},
        });
        if (delivery.status === "sent") continue;
        // Do not retry beyond the provider's idempotency retention window.
        if (now.getTime() - delivery.createdAt.getTime() > 23 * 3600000)
          continue;
        const claim = await prisma.briefDelivery.updateMany({
          where: {
            id,
            OR: [
              { status: "pending" },
              {
                status: "sending",
                claimedAt: { lt: new Date(now.getTime() - 10 * 60000) },
              },
            ],
          },
          data: { status: "sending", claimedAt: now },
        });
        if (!claim.count) continue;
        let params: Parameters<typeof sendDailyBrief>[0];
        if (delivery.payloadJson) {
          params = JSON.parse(delivery.payloadJson);
          if (params.storeDomain !== shop.myshopifyDomain) continue;
        } else {
          const analytics = await fetchAndComputeAnalytics(admin);
          params = {
            to: pref.email,
            storeName: shop.name || shop.myshopifyDomain,
            storeDomain: shop.myshopifyDomain,
            data: analytics,
            status: analytics.prioritizedIssues.length
              ? "needs-attention"
              : "all-clear",
            topIssue: analytics.prioritizedIssues[0] || null,
            idempotencyKey: `daily-brief/${id}`,
          };
          // Freeze the payload before sending: retries must use identical content.
          await prisma.briefDelivery.update({
            where: { id },
            data: { payloadJson: JSON.stringify(params) },
          });
        }
        const enabled = await prisma.notificationPreference.findUnique({
          where: { shopId: shop.id },
        });
        if (!enabled?.dailyBrief || enabled.email !== params.to) {
          await prisma.briefDelivery.update({
            where: { id },
            data: { status: "cancelled" },
          });
          continue;
        }
        if (!(await getSubscription(shop.id)).active) continue;
        if (!(await hasDpaAcceptance(shop.myshopifyDomain))) continue;
        const result = await sendDailyBrief(params);
        if (!result.success) {
          failed++;
          continue;
        }
        await prisma.$transaction([
          prisma.briefDelivery.update({
            where: { id },
            data: { status: "sent", sentAt: new Date() },
          }),
          prisma.notificationPreference.update({
            where: { shopId: shop.id },
            data: { lastDailyAt: new Date() },
          }),
        ]);
        processed++;
      } catch {
        console.error("Daily brief job failed", { shopId: pref.shopId });
        failed++;
      }
    }
    cursor = prefs.length === 25 ? prefs[prefs.length - 1].id : undefined;
  } while (cursor);
  if (!failed) await recordJobSuccess(prisma);
  return Response.json({ processed, failed }, { status: failed ? 503 : 200 });
}
