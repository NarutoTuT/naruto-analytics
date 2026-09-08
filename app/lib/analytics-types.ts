export interface TrendData {
  change: number;
  direction: "up" | "down" | "flat";
}

export interface IssueData {
  repRate?: number;
  top3Pct?: number;
  aov?: number;
  targetRepRate?: number;
}

export interface PrioritizedIssue {
  type: "problem" | "insight";
  issueType: "revenue_decline" | "revenue_concentration";
  title: string;
  detail: string;
  action: string;
  priority: "high" | "medium" | "low";
  revenueImpact: number;
  issueData?: IssueData;
}

export interface AnalyticsData {
  currencyCode: string;
  timezone: string;
  periodStart: string;
  periodEnd: string;
  comparisonStart: string;
  comparisonEnd: string;
  gmv: number;
  totalOrders: number;
  aov: number;
  totalCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  refundedOrders: number;
  refundAmount: number;
  topSkuRevenue: {
    sku: string;
    name: string;
    revenue: number;
    qty: number;
    orders: number;
  }[];
  categoryRevenue: {
    category: string;
    revenue: number;
    pct: number;
    count: number;
  }[];
  dailyGmv: { date: string; gmv: number; orders: number }[];
  orderValueBuckets: { label: string; count: number; pct: number }[];
  recentOrders: {
    name: string;
    date: string;
    total: number;
    status: string;
    customer: string;
    items: string[];
  }[];
  snapshotHistory: { date: string; gmv: number; orders: number; aov: number }[];
  issues: { type: "problem" | "insight"; title: string; detail: string }[];
  recommendations: string[];
  trends: { gmv: TrendData; orders: TrendData; aov: TrendData };
  prioritizedIssues: PrioritizedIssue[];
}
