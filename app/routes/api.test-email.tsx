import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchAndComputeAnalytics } from "../lib/analytics.server";
import { sendDailyBrief } from "../lib/email.server";
import { getPreferences } from "../lib/preferences.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });

  const { admin, session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { myshopifyDomain: session.shop } });
  if (!shop) return data({ error: "Shop not found" }, { status: 404 });

  const pref = await getPreferences(shop.id);
  const email = pref?.email || shop.email;
  if (!email) return data({ error: "No email configured" }, { status: 400 });

  const analyticsData = await fetchAndComputeAnalytics(admin);

  const activeIssues = analyticsData.prioritizedIssues;
  const highPriority = activeIssues.filter(i => i.priority === "high");
  const medPriority = activeIssues.filter(i => i.priority === "medium");

  const status = highPriority.length > 0 ? "action-required"
    : medPriority.length > 0 ? "needs-attention"
    : "all-clear";

  const topIssue = activeIssues.length > 0 ? activeIssues[0] : null;

  const result = await sendDailyBrief({
    to: email,
    storeName: shop.name || session.shop,
    storeDomain: session.shop,
    data: analyticsData,
    status,
    topIssue,
    appUrl: process.env.SHOPIFY_APP_URL || "",
  });

  return data(result);
};
