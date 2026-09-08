import prisma from "../db.server";
import {
  computeAnalytics,
  localDate,
  shiftDate,
  type Order,
} from "./analytics-core";
export type {
  AnalyticsData,
  PrioritizedIssue,
  TrendData,
} from "./analytics-types";
export type Admin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};
export const ORDERS_QUERY = `query BriefOrders($after: String, $query: String!) {
  orders(first: 20, after: $after, query: $query, sortKey: CREATED_AT) {
    nodes { id name createdAt test cancelledAt displayFinancialStatus totalPriceSet { shopMoney { amount } }
      lineItems(first: 20) { nodes { name sku quantity originalTotalSet { shopMoney { amount } } } pageInfo { hasNextPage endCursor } }
    } pageInfo { hasNextPage endCursor }
  }
}`;
export const ITEMS_QUERY = `query BriefItems($id: ID!, $after: String!) {
  order(id: $id) { lineItems(first: 100, after: $after) { nodes { name sku quantity originalTotalSet { shopMoney { amount } } } pageInfo { hasNextPage endCursor } } }
}`;
export const SHOP_QUERY = `query BriefShop { shop { id name email myshopifyDomain createdAt currencyCode ianaTimezone } }`;
export async function graphqlData(
  admin: Admin,
  query: string,
  variables?: Record<string, unknown>,
) {
  const response = await admin.graphql(query, { variables });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data)
    throw new Error("Shopify data is temporarily unavailable. Please retry.");
  return result.data;
}
export async function ensureShop(admin: Admin) {
  const { shop } = await graphqlData(admin, SHOP_QUERY);
  return prisma.shop.upsert({
    where: { id: shop.id },
    create: {
      id: shop.id,
      name: shop.name,
      email: shop.email,
      myshopifyDomain: shop.myshopifyDomain,
      createdAt: new Date(shop.createdAt),
      currencyCode: shop.currencyCode,
      timezone: shop.ianaTimezone,
    },
    update: {
      name: shop.name,
      email: shop.email,
      currencyCode: shop.currencyCode,
      timezone: shop.ianaTimezone,
    },
  });
}
export async function fetchAndComputeAnalytics(admin: Admin) {
  const { shop } = await graphqlData(admin, SHOP_QUERY);
  const now = new Date();
  const today = localDate(now, shop.ianaTimezone);
  // Pad UTC boundaries, then filter exact shop-local calendar dates in the pure calculation.
  const query = `created_at:>=${shiftDate(today, -15)} created_at:<${shiftDate(today, 1)}`;
  const orders: Order[] = [];
  let after: string | null = null;
  do {
    const result = await graphqlData(admin, ORDERS_QUERY, { after, query });
    for (const order of result.orders.nodes) {
      let page = order.lineItems.pageInfo;
      while (page.hasNextPage) {
        if (!page.endCursor) throw new Error("Incomplete line item pagination");
        const more = await graphqlData(admin, ITEMS_QUERY, {
          id: order.id,
          after: page.endCursor,
        });
        if (
          more.order.lineItems.pageInfo.hasNextPage &&
          more.order.lineItems.pageInfo.endCursor === page.endCursor
        )
          throw new Error("Incomplete line item pagination");
        order.lineItems.nodes.push(...more.order.lineItems.nodes);
        page = more.order.lineItems.pageInfo;
      }
      orders.push(order);
    }
    const page = result.orders.pageInfo;
    if (page.hasNextPage && (!page.endCursor || page.endCursor === after))
      throw new Error("Incomplete order pagination");
    after = page.hasNextPage ? page.endCursor : null;
  } while (after);
  return computeAnalytics(orders, shop.currencyCode, shop.ianaTimezone, now);
}
export async function saveSnapshot(admin: Admin, shopId: string) {
  const data = await fetchAndComputeAnalytics(admin);
  // Store aggregate data only; never persist customer names, emails or raw order payloads.
  await prisma.analyticsSnapshot.create({
    data: {
      shopId,
      totalGMV: data.gmv,
      totalOrders: data.totalOrders,
      aov: data.aov,
      topSkuJson: JSON.stringify(data.topSkuRevenue),
      dailyOrdersJson: JSON.stringify(data.dailyGmv),
    },
  });
  return data;
}
export async function getSnapshotHistory(shopId: string) {
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: { shopId },
    orderBy: { snapshotDate: "desc" },
    take: 30,
  });
  return snapshots.map((s) => ({
    date: s.snapshotDate.toISOString().slice(0, 10),
    gmv: s.totalGMV,
    orders: s.totalOrders,
    aov: s.aov,
  }));
}
