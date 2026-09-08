import type { AnalyticsData, TrendData } from "./analytics-types";
export type Money = { shopMoney: { amount: string } };
export type Order = {
  id: string;
  name: string;
  createdAt: string;
  test: boolean;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  totalPriceSet: Money;
  lineItems: {
    nodes: {
      name: string;
      sku: string | null;
      quantity: number;
      originalTotalSet: Money;
    }[];
  };
};
export function localDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function trend(current: number, previous: number): TrendData {
  if (previous === 0) return { change: 0, direction: "flat" }; // No meaningful percentage baseline.
  const change = Math.round(((current - previous) / previous) * 100);
  return {
    change: Math.abs(change),
    direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
  };
}
export function computeAnalytics(
  orders: Order[],
  currencyCode: string,
  timezone: string,
  now = new Date(),
): AnalyticsData {
  const today = localDate(now, timezone),
    start = shiftDate(today, -7),
    priorStart = shiftDate(today, -14);
  const eligible = orders.filter(
    (o) => !o.test && !o.cancelledAt && o.displayFinancialStatus === "PAID",
  );
  const day = (o: Order) => localDate(new Date(o.createdAt), timezone);
  const current = eligible.filter((o) => day(o) >= start && day(o) < today);
  const previous = eligible.filter(
    (o) => day(o) >= priorStart && day(o) < start,
  );
  const sum = (os: Order[]) =>
    os.reduce(
      (s, o) => s + Math.round(Number(o.totalPriceSet.shopMoney.amount) * 100),
      0,
    ) / 100;
  const gmv = sum(current),
    prevGmv = sum(previous),
    aov = current.length ? gmv / current.length : 0;
  const products = new Map<
    string,
    {
      sku: string;
      name: string;
      revenue: number;
      qty: number;
      orders: Set<string>;
    }
  >();
  for (const order of current)
    for (const item of order.lineItems.nodes) {
      const key = item.sku || item.name;
      const p = products.get(key) || {
        sku: key,
        name: item.name,
        revenue: 0,
        qty: 0,
        orders: new Set<string>(),
      };
      // originalTotalSet already includes quantity. This is gross merchandise value before discounts.
      p.revenue += Math.round(
        Number(item.originalTotalSet.shopMoney.amount) * 100,
      );
      p.qty += item.quantity;
      p.orders.add(order.id);
      products.set(key, p);
    }
  const topSkuRevenue = [...products.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((p) => ({ ...p, revenue: p.revenue / 100, orders: p.orders.size }));
  const trends = {
    gmv: trend(gmv, prevGmv),
    orders: trend(current.length, previous.length),
    aov: trend(aov, previous.length ? prevGmv / previous.length : 0),
  };
  const prioritizedIssues: AnalyticsData["prioritizedIssues"] = [];
  if (
    previous.length >= 10 &&
    trends.gmv.direction === "down" &&
    trends.gmv.change >= 20
  )
    prioritizedIssues.push({
      type: "problem",
      issueType: "revenue_decline",
      title: "Paid order value declined",
      detail: `Paid order value fell ${trends.gmv.change}% compared with the previous 7 complete days. The 20% threshold is a review rule, not a forecast.`,
      action:
        "Compare order volume and average order value, then review recent promotions and stock availability.",
      priority: "medium",
      revenueImpact: 0,
    });
  const totalProductValue = topSkuRevenue.reduce((s, p) => s + p.revenue, 0);
  const share = totalProductValue
    ? Math.round(
        (topSkuRevenue.slice(0, 3).reduce((s, p) => s + p.revenue, 0) /
          totalProductValue) *
          100,
      )
    : 0;
  if (current.length >= 10 && topSkuRevenue.length > 3 && share > 70)
    prioritizedIssues.push({
      type: "insight",
      issueType: "revenue_concentration",
      title: "Sales are concentrated in three products",
      detail: `The top three products account for ${share}% of gross merchandise value before discounts. This describes concentration; it does not predict lost revenue.`,
      action:
        "Check availability for these products before planning your next promotion.",
      priority: "medium",
      revenueImpact: 0,
      issueData: { top3Pct: share },
    });
  return {
    currencyCode,
    timezone,
    periodStart: start,
    periodEnd: shiftDate(today, -1),
    comparisonStart: priorStart,
    comparisonEnd: shiftDate(start, -1),
    gmv,
    aov: Math.round(aov * 100) / 100,
    totalOrders: current.length,
    totalCustomers: 0,
    newCustomers: 0,
    repeatCustomers: 0,
    refundedOrders: 0,
    refundAmount: 0,
    topSkuRevenue,
    categoryRevenue: [],
    dailyGmv: Array.from({ length: 14 }, (_, i) => {
      const date = shiftDate(priorStart, i);
      const os = eligible.filter((o) => day(o) === date);
      return { date, gmv: sum(os), orders: os.length };
    }),
    orderValueBuckets: [],
    recentOrders: [],
    snapshotHistory: [],
    issues: [],
    recommendations: [],
    trends,
    prioritizedIssues,
  };
}
