import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const record = await db.shop.findUnique({ where: { myshopifyDomain: shop } });
  await db.$transaction([
    db.session.deleteMany({ where: { shop } }),
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
