import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { requireSubscription } from "../lib/billing.server";
import { fetchAndComputeAnalytics } from "../lib/analytics.server";
import { sendDailyBrief } from "../lib/email.server";
import { getPreferences } from "../lib/preferences.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });

  const { admin, session } = await requireSubscription(request, true);
  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });
  if (!shop) return data({ error: "Shop not found" }, { status: 404 });

  const pref = await getPreferences(shop.id);
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return data({ error: "Invalid request" }, { status: 400 });
  }
  const email = pref?.email;
  if (
    !email ||
    !body ||
    typeof body.email !== "string" ||
    body.email.trim() !== email.trim()
  )
    return data(
      { error: "Save your email settings before sending a test." },
      { status: 409 },
    );

  // One attempt per shop per five-minute UTC window, persisted across instances.
  // A provider timeout consumes the slot too; never retry with a new send key.
  const window = Math.floor(Date.now() / 300000);
  const id = `test-email:${shop.id}:${window}`;
  try {
    await prisma.briefDelivery.create({
      data: { id, shopId: shop.id, date: `test:${window}`, status: "sending" },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      return data(
        {
          error:
            "A test was already attempted. Try again in the next five-minute window.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(300 - (Math.floor(Date.now() / 1000) % 300)),
          },
        },
      );
    throw error;
  }
  try {
    const analyticsData = await fetchAndComputeAnalytics(admin);

    const activeIssues = analyticsData.prioritizedIssues;
    const highPriority = activeIssues.filter((i) => i.priority === "high");
    const medPriority = activeIssues.filter((i) => i.priority === "medium");

    const status =
      highPriority.length > 0
        ? "action-required"
        : medPriority.length > 0
          ? "needs-attention"
          : "all-clear";

    const topIssue = activeIssues.length > 0 ? activeIssues[0] : null;

    const result = await sendDailyBrief({
      to: email,
      storeName: shop.name || session.shop,
      storeDomain: session.shop,
      data: analyticsData,
      status,
      topIssue,
      idempotencyKey: id,
    });

    await prisma.briefDelivery.update({
      where: { id },
      data: {
        status: result.success ? "sent" : "failed",
        ...(result.success ? { sentAt: new Date() } : {}),
      },
    });
    return data(result, { status: result.success ? 200 : 502 });
  } catch {
    // Keep the claimed slot on uncertain outcomes to prevent duplicate mail.
    return data(
      {
        error:
          "Test email could not be confirmed. Check delivery status before trying again.",
      },
      { status: 503 },
    );
  }
};
