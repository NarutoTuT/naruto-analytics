import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireInternal } from "../lib/internal-auth.server";
import db from "../db.server";
export async function loader({ request }: LoaderFunctionArgs) {
  requireInternal(request, "INTERNAL_ADMIN_SECRET");
  const id = new URL(request.url).searchParams.get("id");
  if (!id)
    return Response.json(
      {
        requests: await db.privacyRequest.findMany({
          where: { fulfilledAt: null },
          orderBy: { createdAt: "asc" },
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  const item = await db.privacyRequest.findUnique({ where: { id } });
  if (!item) throw new Response(null, { status: 404 });
  const shop = await db.shop.findUnique({
    where: { myshopifyDomain: item.shopDomain },
  });
  const orders = shop
    ? await db.orderSnapshot.findMany({
        where: {
          shopId: shop.id,
          OR: [
            ...(item.customerId
              ? [{ customerId: `gid://shopify/Customer/${item.customerId}` }]
              : []),
            { shopifyOrderId: { in: JSON.parse(item.orderIdsJson) } },
          ],
        },
      })
    : [];
  return Response.json(
    {
      request: item,
      orders,
      note: "Provide this export through a verified secure channel. New briefs do not retain customer-level records.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function action({ request }: ActionFunctionArgs) {
  requireInternal(request, "INTERNAL_ADMIN_SECRET");
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const { id, delivered } = await request.json();
  if (typeof id !== "string" || delivered !== true)
    return new Response("Confirm secure delivery before marking fulfilled", {
      status: 400,
    });
  await db.privacyRequest.update({
    where: { id },
    data: { fulfilledAt: new Date() },
  });
  return Response.json({ success: true });
}
