import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { fetchAndComputeAnalytics } from "../lib/analytics.server";
import { sendDailyBrief } from "../lib/email.server";
import { getAllActivePreferences, updateLastDailyAt } from "../lib/preferences.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Verify cron secret
  const auth = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const prefs = await getAllActivePreferences();
  const results: { shopId: string; success: boolean; error?: string; skipped?: boolean }[] = [];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  for (const pref of prefs) {
    // Skip if already sent today
    if (pref.lastDailyAt && pref.lastDailyAt > yesterday) {
      results.push({ shopId: pref.shopId, success: true, skipped: true });
      continue;
    }

    try {
      // Find shop record to get domain
      const shop = await prisma.shop.findUnique({ where: { id: pref.shopId } });
      if (!shop?.myshopifyDomain) {
        results.push({ shopId: pref.shopId, success: false, error: "Shop not found" });
        continue;
      }

      // Use unauthenticated admin to fetch analytics
      const { admin } = await unauthenticated.admin(shop.myshopifyDomain);
      const analyticsData = await fetchAndComputeAnalytics(admin);

      const activeIssues = analyticsData.prioritizedIssues;
      const highPriority = activeIssues.filter(i => i.priority === "high");
      const medPriority = activeIssues.filter(i => i.priority === "medium");
      const status = highPriority.length > 0 ? "action-required"
        : medPriority.length > 0 ? "needs-attention" : "all-clear";
      const topIssue = activeIssues.length > 0 ? activeIssues[0] : null;

      const result = await sendDailyBrief({
        to: pref.email,
        storeName: shop.name || shop.myshopifyDomain,
        storeDomain: shop.myshopifyDomain,
        data: analyticsData,
        status,
        topIssue,
        appUrl: process.env.SHOPIFY_APP_URL || "",
      });

      if (result.success) {
        await updateLastDailyAt(pref.shopId);
      }

      results.push({ shopId: pref.shopId, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Cron error for shop ${pref.shopId}:`, message);
      results.push({ shopId: pref.shopId, success: false, error: message });
    }
  }

  return data({ processed: results.length, results });
};
