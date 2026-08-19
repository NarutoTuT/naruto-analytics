import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const VALID_EVENTS = ["app_open", "view_details", "feedback", "email_click"];

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return data({ error: "POST required" }, { status: 405 });

  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { myshopifyDomain: session.shop } });
  if (!shop) return data({ error: "Shop not found" }, { status: 404 });

  const body = await request.json();
  const { event, data: eventData } = body;

  if (!VALID_EVENTS.includes(event)) {
    return data({ error: `Invalid event: ${event}` }, { status: 400 });
  }

  await prisma.analyticsEvent.create({
    data: {
      shopId: shop.id,
      event,
      data: eventData ? JSON.stringify(eventData) : null,
    },
  });

  return data({ success: true });
};
