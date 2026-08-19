import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { getPreferences, upsertPreferences } from "../lib/preferences.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { myshopifyDomain: session.shop } });
  const pref = shop ? await getPreferences(shop.id) : null;
  return data({
    preferences: pref,
    shopEmail: shop?.email || "",
    shopName: shop?.name || session.shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  if (request.method !== "POST") return data({ error: "Method not allowed" }, { status: 405 });

  const shop = await prisma.shop.findUnique({ where: { myshopifyDomain: session.shop } });
  if (!shop) return data({ error: "Shop not found" }, { status: 404 });

  const body = await request.json();
  const { email, dailyBrief, deliveryTime, timezone } = body;

  if (!email || typeof email !== "string") {
    return data({ error: "Email is required" }, { status: 400 });
  }

  const pref = await upsertPreferences(shop.id, {
    email,
    dailyBrief: dailyBrief !== false,
    deliveryTime: deliveryTime || "08:00",
    timezone: timezone || "UTC",
  });

  return data({ preferences: pref, success: true });
};
