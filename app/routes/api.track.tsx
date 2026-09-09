import { requireDpa } from "../lib/dpa.server";
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const { session } = await authenticate.admin(request);
  await requireDpa(session.shop, true);
  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });
  if (!shop) return new Response(null, { status: 404 });
  const { event, data = {} } = await request.json();
  if (!["app_open", "view_details", "feedback", "email_click"].includes(event))
    return new Response("Invalid event", { status: 400 });
  if (event === "feedback" && typeof data.useful !== "boolean")
    return new Response("Invalid feedback", { status: 400 });
  if (
    ["app_open", "email_click"].includes(event) &&
    (typeof data.sessionId !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(data.sessionId))
  )
    return new Response("Session required", { status: 400 });
  const safe = {
    sessionId: data.sessionId,
    language: data.language === "zh-CN" ? "zh-CN" : "en",
    source: data.source === "email" ? "email" : "direct",
    useful: typeof data.useful === "boolean" ? data.useful : undefined,
    briefStatus: ["needs-attention", "all-clear"].includes(data.briefStatus)
      ? data.briefStatus
      : undefined,
  };
  const dedupeKey = ["app_open", "email_click"].includes(event)
    ? `${shop.id}:${event}:${data.sessionId}`
    : null;
  if (dedupeKey)
    await prisma.analyticsEvent.upsert({
      where: { dedupeKey },
      create: { shopId: shop.id, event, data: JSON.stringify(safe), dedupeKey },
      update: {},
    });
  else
    await prisma.analyticsEvent.create({
      data: { shopId: shop.id, event, data: JSON.stringify(safe) },
    });
  return Response.json({ success: true });
}
