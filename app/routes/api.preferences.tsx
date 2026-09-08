import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import { getPreferences, upsertPreferences } from "../lib/preferences.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });
  const pref = shop ? await getPreferences(shop.id) : null;
  return data({
    preferences: pref,
    shopEmail: shop?.email || "",
    shopName: shop?.name || session.shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (request.method !== "POST")
    return data({ error: "Method not allowed" }, { status: 405 });

  const shop = await prisma.shop.findUnique({
    where: { myshopifyDomain: session.shop },
  });
  if (!shop) return data({ error: "Shop not found" }, { status: 404 });

  const body = await request.json();
  const { email, dailyBrief, deliveryTime, timezone } = body;

  if (!email || typeof email !== "string") {
    return data({ error: "Email is required" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return data({ error: "Valid email required" }, { status: 400 });
  if (
    deliveryTime !== undefined &&
    (typeof deliveryTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(deliveryTime))
  )
    return data({ error: "Invalid delivery time" }, { status: 400 });
  if (timezone !== undefined) {
    if (typeof timezone !== "string" || !timezone)
      return data({ error: "Invalid timezone" }, { status: 400 });
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    } catch {
      return data({ error: "Invalid timezone" }, { status: 400 });
    }
  }
  const pref = await upsertPreferences(shop.id, {
    email,
    dailyBrief: dailyBrief === true,
    deliveryTime: deliveryTime || "08:00",
    timezone: timezone || shop.timezone || "UTC",
  });

  return data({ preferences: pref, success: true });
};
