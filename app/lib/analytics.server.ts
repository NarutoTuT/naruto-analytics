import prisma from "../db.server";

const ORDERS_QUERY = `query GetOrders {
    orders(first: 100, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id name createdAt displayFinancialStatus displayFulfillmentStatus
          totalPriceSet { shopMoney { amount } }
          subtotalPriceSet { shopMoney { amount } }
          totalTaxSet { shopMoney { amount } }
          totalShippingPriceSet { shopMoney { amount } }
          lineItems(first: 20) {
            edges { node { name sku quantity originalTotalSet { shopMoney { amount } } product { id title } } }
          }
          customer { id email displayName createdAt numberOfOrders amountSpent { amount } }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

const CUSTOMERS_QUERY = `query GetCustomers {
    customers(first: 250) {
      edges {
        node { id email displayName createdAt numberOfOrders amountSpent { amount } }
      }
    }
  }`;

function classifySku(sku: string): string {
  const u = sku.toUpperCase();
  if (u.includes("VMAX") || u.includes("V-MAX")) return "V Max Series";
  if (u.includes("S200") || u.includes("S300")) return "S Series";
  if (u.includes("BLADE")) return "Blade Series";
  if (u.includes("TAB") || u.includes("T10") || u.includes("T20") || u.includes("T30") || u.includes("U11") || u.includes("U13") || u.includes("R10") || u.includes("R20")) return "Tablets";
  if (u.includes("ANYWISE") || u.includes("DGARES") || u.includes("W1")) return "Wearables";
  return "Accessories & Other";
}

export interface TrendData {
  change: number;
  direction: "up" | "down" | "flat";
}

export interface PrioritizedIssue {
  type: "problem" | "insight";
  title: string;
  detail: string;
  action: string;
  priority: "high" | "medium" | "low";
  revenueImpact: number;
}

export interface AnalyticsData {
  gmv: number; totalOrders: number; aov: number; totalCustomers: number;
  newCustomers: number; repeatCustomers: number; refundedOrders: number; refundAmount: number;
  topSkuRevenue: { sku: string; name: string; revenue: number; qty: number; orders: number }[];
  categoryRevenue: { category: string; revenue: number; pct: number; count: number }[];
  dailyGmv: { date: string; gmv: number; orders: number }[];
  orderValueBuckets: { label: string; count: number; pct: number }[];
  recentOrders: { name: string; date: string; total: number; status: string; customer: string; items: string[] }[];
  snapshotHistory: { date: string; gmv: number; orders: number; aov: number }[];
  issues: { type: "problem" | "insight"; title: string; detail: string }[];
  recommendations: string[];
  trends: { gmv: TrendData; orders: TrendData; aov: TrendData; };
  prioritizedIssues: PrioritizedIssue[];
}

function computeTrend(current: number, dailyData: { gmv: number; orders: number }[]): TrendData {
  if (dailyData.length < 2) return { change: 0, direction: "flat" };
  const avg = dailyData.reduce((s, d) => s + d.gmv, 0) / dailyData.length;
  if (avg === 0) return { change: 0, direction: "flat" };
  const change = Math.round(((current - avg) / avg) * 100);
  return { change: Math.abs(change), direction: change > 0 ? "up" : change < 0 ? "down" : "flat" };
}

function scoreIssues(data: AnalyticsData, totalGMV: number): PrioritizedIssue[] {
  const issues: PrioritizedIssue[] = [];
  const repRate = data.totalCustomers > 0 ? Math.round(data.repeatCustomers / data.totalCustomers * 100) : 0;
  const top3Pct = totalGMV > 0 && data.topSkuRevenue.length > 0
    ? Math.round(data.topSkuRevenue.slice(0, 3).reduce((s, sku) => s + sku.revenue, 0) / totalGMV * 100) : 0;

  if (repRate < 25) {
    issues.push({
      type: "problem", title: "Repeat purchase rate below target",
      detail: `Only ${repRate}% of customers have re-ordered (target: 25%). You're leaving revenue on the table from existing customers.`,
      action: "Prepare a win-back email campaign targeting customers who haven't re-ordered in 60 days.",
      priority: repRate < 5 ? "high" : "medium",
      revenueImpact: Math.round(data.totalCustomers * data.aov * (25 - repRate) / 100 * 0.05)
    });
  }
  if (top3Pct > 50) {
    issues.push({
      type: "problem", title: "Product concentration risk",
      detail: `Your top 3 products generated ${top3Pct}% of revenue. If one supplier fails, your business could be significantly impacted.`,
      action: "Review inventory for top products and start promoting secondary products this week.",
      priority: top3Pct > 70 ? "high" : "medium",
      revenueImpact: Math.round(totalGMV * top3Pct / 100 * 0.1)
    });
  }
  if (data.aov > 0) {
    issues.push({
      type: "insight", title: "AOV above baseline",
      detail: `Your AOV of $${Math.round(data.aov)} indicates healthy spending. This is a positive signal for your business.`,
      action: "Consider testing a $299 free shipping threshold to further increase average order value.",
      priority: "low",
      revenueImpact: 0
    });
  }
  return issues.sort((a, b) => {
    const p = { high: 3, medium: 2, low: 1 };
    return p[b.priority] - p[a.priority];
  });
}

export async function fetchAndComputeAnalytics(admin: { graphql: Function }): Promise<AnalyticsData> {
  const [ordersRes, customersRes] = await Promise.all([
    admin.graphql(ORDERS_QUERY),
    admin.graphql(CUSTOMERS_QUERY),
  ]);
  const ordersJson = await ordersRes.json();
  const customersJson = await customersRes.json();
  const orders = ordersJson.data.orders.edges.map((e: any) => e.node);
  const customers = customersJson.data.customers.edges.map((e: any) => e.node);

  const paidOrders = orders.filter((o: any) => o.displayFinancialStatus === "PAID");
  const refunded = orders.filter((o: any) => o.displayFinancialStatus === "REFUNDED");
  const totalGMV = paidOrders.reduce((s: number, o: any) => s + parseFloat(o.totalPriceSet.shopMoney.amount), 0);
  const AOV = paidOrders.length > 0 ? totalGMV / paidOrders.length : 0;

  const purchasedCustomers = customers.filter((c: any) => parseInt(c.numberOfOrders) > 0);
  const repeatBuyers = customers.filter((c: any) => parseInt(c.numberOfOrders) >= 2);
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 1);
  const recentNew = customers.filter((c: any) => new Date(c.createdAt) > cutoff && parseInt(c.numberOfOrders) > 0);
  const refundAmount = refunded.reduce((s: number, o: any) => s + parseFloat(o.totalPriceSet.shopMoney.amount), 0);

  // SKU revenue
  const skuMap = new Map<string, { revenue: number; qty: number; orders: Set<string>; name: string }>();
  paidOrders.forEach((o: any) => {
    (o.lineItems?.edges || []).forEach((li: any) => {
      const item = li.node; const sku = item.sku || item.name;
      if (!skuMap.has(sku)) skuMap.set(sku, { revenue: 0, qty: 0, orders: new Set(), name: item.name });
      const e = skuMap.get(sku)!; e.revenue += parseFloat(item.originalTotalSet.shopMoney.amount) * item.quantity;
      e.qty += item.quantity; e.orders.add(o.name);
    });
  });
  const topSkuRevenue = Array.from(skuMap.values())
    .sort((a, b) => b.revenue - a.revenue).slice(0, 20)
    .map(s => ({ sku: s.name, name: s.name, revenue: Math.round(s.revenue * 100) / 100, qty: s.qty, orders: s.orders.size }));

  // Category
  const catMap = new Map<string, { revenue: number; count: number }>();
  paidOrders.forEach((o: any) => {
    (o.lineItems?.edges || []).forEach((li: any) => {
      const item = li.node; const sku = item.sku || ""; const cat = classifySku(sku);
      const rev = parseFloat(item.originalTotalSet.shopMoney.amount) * item.quantity;
      if (!catMap.has(cat)) catMap.set(cat, { revenue: 0, count: 0 });
      const c = catMap.get(cat)!; c.revenue += rev; c.count += item.quantity;
    });
  });
  const totalCatRev = Array.from(catMap.values()).reduce((s, c) => s + c.revenue, 0);
  const categoryRevenue = Array.from(catMap.entries()).sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([category, data]) => ({ category, revenue: Math.round(data.revenue * 100) / 100,
      pct: totalCatRev > 0 ? Math.round(data.revenue / totalCatRev * 1000) / 10 : 0, count: data.count }));

  // Daily GMV
  const dayMap = new Map<string, { gmv: number; orders: number }>();
  paidOrders.forEach((o: any) => {
    const day = o.createdAt.slice(0, 10); const d = dayMap.get(day) || { gmv: 0, orders: 0 };
    d.gmv += parseFloat(o.totalPriceSet.shopMoney.amount); d.orders++; dayMap.set(day, d);
  });
  const dailyGmv = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
    .map(([date, data]) => ({ date, gmv: Math.round(data.gmv * 100) / 100, orders: data.orders }));

  // Buckets
  const buckets: Record<string, number> = { "<$100": 0, "$100-200": 0, "$200-500": 0, "$500-700": 0, "$700+": 0 };
  paidOrders.forEach((o: any) => {
    const t = parseFloat(o.totalPriceSet.shopMoney.amount);
    if (t < 100) buckets["<$100"]++; else if (t < 200) buckets["$100-200"]++; else if (t < 500) buckets["$200-500"]++;
    else if (t < 700) buckets["$500-700"]++; else buckets["$700+"]++;
  });
  const orderValueBuckets = Object.entries(buckets).map(([label, count]) => ({
    label, count, pct: paidOrders.length > 0 ? Math.round(count / paidOrders.length * 1000) / 10 : 0,
  }));

  // Recent orders
  const recentOrders = orders.slice(0, 20).map((o: any) => ({
    name: o.name, date: o.createdAt.slice(0, 10), total: parseFloat(o.totalPriceSet.shopMoney.amount),
    status: o.displayFinancialStatus || "Pending", customer: o.customer?.displayName || "Guest",
    items: (o.lineItems?.edges || []).map((li: any) => li.node.name),
  }));

  const analyticsData: AnalyticsData = {
    gmv: Math.round(totalGMV * 100) / 100, totalOrders: paidOrders.length,
    aov: Math.round(AOV * 100) / 100, totalCustomers: customers.length,
    newCustomers: recentNew.length, repeatCustomers: repeatBuyers.length,
    refundedOrders: refunded.length, refundAmount: Math.round(refundAmount * 100) / 100,
    topSkuRevenue, categoryRevenue, dailyGmv, orderValueBuckets, recentOrders,
    snapshotHistory: [],
    issues: [],
    recommendations: [
      "Target non-purchasing registrants with 72h free shipping",
      "Trigger abandoned cart emails within 72h",
      "Direct ad budget to low-AOV high-conversion products",
      "Enable installment payments to reduce high-price decision barriers",
      "Flag-ship product recommendation 7 days after accessory purchase",
    ],
    trends: {
      gmv: computeTrend(totalGMV, dailyGmv),
      orders: computeTrend(paidOrders.length, dailyGmv),
      aov: computeTrend(AOV, dailyGmv),
    },
    prioritizedIssues: [],
  };

  analyticsData.prioritizedIssues = scoreIssues(analyticsData, totalGMV);
  return analyticsData;
}

export async function saveSnapshot(admin: { graphql: Function }, shopId: string) {
  const data = await fetchAndComputeAnalytics(admin);
  await prisma.analyticsSnapshot.create({
    data: { shopId, totalGMV: data.gmv, totalOrders: data.totalOrders, aov: data.aov,
      totalCustomers: data.totalCustomers, newCustomers: data.newCustomers, repeatCustomers: data.repeatCustomers,
      refundedOrders: data.refundedOrders, refundAmount: data.refundAmount,
      topSkuJson: JSON.stringify(data.topSkuRevenue), categoryJson: JSON.stringify(data.categoryRevenue),
      dailyOrdersJson: JSON.stringify(data.dailyGmv),
    },
  });
  const ordersRes = await admin.graphql(ORDERS_QUERY);
  const oJson = await ordersRes.json();
  const orders = oJson.data.orders.edges.map((e: any) => e.node);
  for (const order of orders) {
    const oid = order.id.split("/").pop() || order.id;
    await prisma.orderSnapshot.upsert({
      where: { shopifyOrderId: oid },
      create: { shopId, shopifyOrderId: oid, orderName: order.name, createdAt: new Date(order.createdAt),
        financialStatus: order.displayFinancialStatus, fulfillmentStatus: order.displayFulfillmentStatus,
        totalPrice: parseFloat(order.totalPriceSet.shopMoney.amount),
        subtotalPrice: parseFloat(order.subtotalPriceSet?.shopMoney?.amount || "0"),
        totalTax: parseFloat(order.totalTaxSet?.shopMoney?.amount || "0"),
        totalShipping: parseFloat(order.totalShippingPriceSet?.shopMoney?.amount || "0"),
        customerId: order.customer?.id, customerEmail: order.customer?.email, customerName: order.customer?.displayName,
        lineItemsJson: JSON.stringify((order.lineItems?.edges || []).map((li: any) => li.node)),
      },
      update: { totalPrice: parseFloat(order.totalPriceSet.shopMoney.amount),
        financialStatus: order.displayFinancialStatus, fulfillmentStatus: order.displayFulfillmentStatus },
    });
  }
  return data;
}

export async function getSnapshotHistory(shopId: string) {
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: { shopId }, orderBy: { snapshotDate: "desc" }, take: 30,
  });
  return snapshots.map(s => ({ date: s.snapshotDate.toISOString().slice(0, 10), gmv: s.totalGMV, orders: s.totalOrders, aov: s.aov }));
}
