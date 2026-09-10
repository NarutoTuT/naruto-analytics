import type { ActionFunctionArgs } from "react-router";
import { authenticateSessionlessWebhook } from "../lib/shopify-webhook-auth.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticateSessionlessWebhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const record = await db.shop.findUnique({ where: { myshopifyDomain: shop } });
  await db.$transaction([
    db.session.deleteMany({ where: { shop } }),
    db.legalAcceptance.updateMany({
      where: { shopDomain: shop },
      data: { revokedAt: new Date() },
    }),
    ...(record
      ? [
          db.notificationPreference.updateMany({
            where: { shopId: record.id },
            data: { dailyBrief: false },
          }),
        ]
      : []),
  ]);

  return new Response();
};
