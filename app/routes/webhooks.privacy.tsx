import { eraseShopData } from "../lib/privacy-deletion.server";
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
export async function action({ request }: ActionFunctionArgs) {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const record = await db.shop.findUnique({ where: { myshopifyDomain: shop } });
  if (topic === "CUSTOMERS_DATA_REQUEST") {
    const id = payload.data_request?.id;
    if (id === undefined)
      return new Response("Missing request id", { status: 400 });
    await db.privacyRequest.upsert({
      where: { id: `${shop}:${id}` },
      update: {},
      create: {
        id: `${shop}:${id}`,
        shopDomain: shop,
        customerId: payload.customer?.id ? String(payload.customer.id) : null,
        orderIdsJson: JSON.stringify(
          (payload.orders_requested || []).map(String),
        ),
      },
    });
  } else if (topic === "CUSTOMERS_REDACT") {
    if (record) {
      const customerId = payload.customer?.id
        ? `gid://shopify/Customer/${payload.customer.id}`
        : null;
      const orders = (payload.orders_to_redact || []).map(String);
      await db.orderSnapshot.deleteMany({
        where: {
          shopId: record.id,
          OR: [
            ...(customerId ? [{ customerId }] : []),
            { shopifyOrderId: { in: orders } },
          ],
        },
      });
      // Legacy raw aggregates may contain customer data. Remove them conservatively.
      await db.analyticsSnapshot.deleteMany({
        where: { shopId: record.id, rawData: { not: null } },
      });
      if (payload.customer?.id)
        await db.privacyRequest.deleteMany({
          where: {
            shopDomain: shop,
            customerId: String(payload.customer.id),
            fulfilledAt: { not: null },
          },
        });
    }
  } else if (topic === "SHOP_REDACT") {
    await eraseShopData(db, shop);
  } else return new Response("Unsupported topic", { status: 400 });
  return new Response(null, { status: 200 });
}
