import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { json } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchAndComputeAnalytics, saveSnapshot, getSnapshotHistory } from "../lib/analytics.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  let shopRecord = await prisma.shop.findUnique({ where: { myshopifyDomain: shop } });
  if (!shopRecord) {
    const shopRes = await admin.graphql(`#graphql query { shop { id name email myshopifyDomain createdAt } }`);
    const shopJson = await shopRes.json();
    const s = shopJson.data.shop;
    shopRecord = await prisma.shop.create({
      data: { id: s.id, myshopifyDomain: s.myshopifyDomain, name: s.name, email: s.email, createdAt: new Date(s.createdAt) },
    });
  }

  const data = await fetchAndComputeAnalytics(admin);
  const history = await getSnapshotHistory(shopRecord.id);
  data.snapshotHistory = history;

  return json(data);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const body = await request.json();
  const { action: actionType } = body;

  let shopRecord = await prisma.shop.findUnique({ where: { myshopifyDomain: shop } });
  if (!shopRecord) {
    const shopRes = await admin.graphql(`#graphql query { shop { id name email myshopifyDomain createdAt } }`);
    const shopJson = await shopRes.json();
    const s = shopJson.data.shop;
    shopRecord = await prisma.shop.create({
      data: { id: s.id, myshopifyDomain: s.myshopifyDomain, name: s.name, email: s.email, createdAt: new Date(s.createdAt) },
    });
  }

  if (actionType === "sync") {
    const data = await saveSnapshot(admin, shopRecord.id);
    return json({ success: true, message: "Data synced successfully", data });
  }

  return json({ success: false, message: "Unknown action" }, { status: 400 });
};
