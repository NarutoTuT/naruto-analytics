import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, data } from "react-router";
import { useEffect, useState, useMemo } from "react";
import { authenticate } from "../shopify.server";
import { fetchAndComputeAnalytics, getSnapshotHistory } from "../lib/analytics.server";
import prisma from "../db.server";
import type { AnalyticsData, PrioritizedIssue, TrendData } from "../lib/analytics.server";
import {
  Card, Text, BlockStack, InlineStack, Badge, Banner, Button,
  SkeletonBodyText, EmptyState, Page, Collapsible
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    let shopRecord = await prisma.shop.findUnique({ where: { myshopifyDomain: session.shop } });
    if (!shopRecord) {
      const r = await admin.graphql("query { shop { id name email myshopifyDomain createdAt } }");
      const j = await r.json();
      const s = j.data.shop;
      shopRecord = await prisma.shop.create({ data: { id: s.id, myshopifyDomain: s.myshopifyDomain, name: s.name, email: s.email, createdAt: new Date(s.createdAt) } });
    }
    const analyticsData = await fetchAndComputeAnalytics(admin);
    analyticsData.snapshotHistory = await getSnapshotHistory(shopRecord.id);
    return data(analyticsData);
  } catch (err) {
    console.error("Loader error:", err);
    return data({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
};

function formatCurrency(amount: number): string {
  return "$" + amount.toLocaleString();
}

function TrendBadge({ trend }: { trend: TrendData }) {
  if (trend.direction === "flat") return null;
  const isUp = trend.direction === "up";
  return (
    <Text as="span" variant="bodyXs" tone={isUp ? "success" : "critical"}>
      {isUp ? "\u2191" : "\u2193"}{trend.change}%
    </Text>
  );
}

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const tone = priority === "high" ? "critical" : priority === "medium" ? "attention" : "success";
  const label = priority === "high" ? "TOP PRIORITY" : priority === "medium" ? "REVIEW TODAY" : "FOR YOUR INFO";
  return <Badge tone={tone}>{label}</Badge>;
}

function MetricsSection({ data: d }: { data: AnalyticsData }) {
  const metrics = [
    { label: "Revenue", value: formatCurrency(d.gmv), trend: d.trends.gmv },
    { label: "Orders", value: d.totalOrders.toString(), trend: d.trends.orders },
    { label: "AOV", value: formatCurrency(d.aov), trend: d.trends.aov },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
      {metrics.map(m => (
        <Card key={m.label} padding="300">
          <BlockStack gap="100">
            <Text as="span" variant="bodyXs" tone="subdued">{m.label}</Text>
            <Text as="span" variant="headingXl" fontWeight="bold">{m.value}</Text>
            {m.trend && <TrendBadge trend={m.trend} />}
          </BlockStack>
        </Card>
      ))}
    </div>
  );
}

function SignalCard({ issue }: { issue: PrioritizedIssue }) {
  const dotColor = issue.priority === "medium" ? "#B98900" : "#008060";
  return (
    <div style={{ border: "1px solid #E1E3E5", borderRadius: "8px", padding: "14px 16px", marginBottom: "8px" }}>
      <BlockStack gap="100">
        <InlineStack gap="200" align="start">
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: dotColor, marginTop: "6px", flexShrink: 0 }} />
          <BlockStack gap="050">
            <Text as="span" variant="bodySm" fontWeight="semibold">{issue.title}</Text>
            <Text as="span" variant="bodySm" tone="subdued">{issue.detail}</Text>
          </BlockStack>
        </InlineStack>
        <div style={{ paddingLeft: "16px" }}>
          <Text as="span" variant="bodyXs" tone="success">{issue.action}</Text>
        </div>
      </BlockStack>
    </div>
  );
}

function SupportingData({ data: d }: { data: AnalyticsData }) {
  if (d.topSkuRevenue.length === 0) return null;
  const top3 = d.topSkuRevenue.slice(0, 3);

  return (
    <Card padding="300">
      <BlockStack gap="200">
        <div style={{ display: "flex", gap: "4px", height: "48px", alignItems: "flex-end" }}>
          {d.dailyGmv.slice(-7).map((day, i) => (
            <div key={i} style={{
              flex: 1, borderRadius: "2px 2px 0 0", minHeight: "4px",
              height: Math.max((day.gmv / Math.max(...d.dailyGmv.slice(-7).map(x => x.gmv), 1)) * 48, 4),
              background: "#5C6AC4", opacity: 0.7
            }} />
          ))}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#6D7175", fontSize: "12px", borderBottom: "1px solid #F1F2F3" }}>Product</th>
              <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: "#6D7175", fontSize: "12px", borderBottom: "1px solid #F1F2F3" }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {top3.map((sku, i) => (
              <tr key={i}>
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #F1F2F3" }}>{sku.name.length > 30 ? sku.name.slice(0, 30) + "\u2026" : sku.name}</td>
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #F1F2F3", textAlign: "right", fontWeight: 600 }}>{formatCurrency(sku.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </BlockStack>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <BlockStack gap="300">
      <div style={{ background: "#F6F6F7", borderRadius: "10px", padding: "20px" }}>
        <SkeletonBodyText lines={2} />
      </div>
      <SkeletonBodyText lines={4} />
    </BlockStack>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Page title="Today Operating Brief">
      <Banner title="Unable to prepare your briefing" tone="critical">
        <p>{message}</p>
        <p>We'll retry automatically. You can also sync manually.</p>
        <Button variant="primary" onClick={() => window.location.reload()}>Retry Now</Button>
      </Banner>
    </Page>
  );
}

function EmptyStateView() {
  return (
    <Page title="Today Operating Brief">
      <EmptyState
        heading="Welcome to your Operating Brief"
        action={{ content: "Sync Store Data Now", onAction: () => {} }}
        image={""}
      >
        <p>Sync your store and tomorrow morning you'll receive your first daily briefing.</p>
      </EmptyState>
    </Page>
  );
}

export default function Dashboard() {
  const fetcher = useFetcher();
  const [syncing, setSyncing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reviewedTitles, setReviewedTitles] = useState<Set<string>>(new Set());

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const loaderData = useLoaderData() as (AnalyticsData & { error?: string }) | undefined;

  useEffect(() => { setLoaded(true); }, []);

  useEffect(() => {
    if (!loaderData) return;
    if ("error" in loaderData && loaderData.error) {
      setHasError(true);
      setErrorMsg(loaderData.error);
    }
  }, [loaderData]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      setSyncing(false);
      window.location.reload();
    }
  }, [fetcher.state]);

  const hSync = () => {
    setSyncing(true);
    fetcher.submit({ action: "sync" }, { method: "POST", encType: "application/json" });
  };

  const handleViewDetails = () => setDetailsOpen(!detailsOpen);

  const handleMarkReviewed = () => {
    if (topIssue) {
      setReviewedTitles(prev => new Set(prev).add(topIssue.title));
    }
  };

  if (hasError) {
    return <ErrorState message={errorMsg} />;
  }

  if (!loaded || !loaderData || "error" in (loaderData || {})) {
    return (
      <Page title="Today Operating Brief">
        <LoadingSkeleton />
      </Page>
    );
  }

  const d = loaderData as AnalyticsData;

  if (d.gmv === 0 && d.totalOrders === 0 && d.totalCustomers === 0) {
    return <EmptyStateView />;
  }

  // Compute active issues (excluding reviewed ones)
  const activeIssues = d.prioritizedIssues.filter(i => !reviewedTitles.has(i.title));
  const highPriority = activeIssues.filter(i => i.priority === "high");
  const medPriority = activeIssues.filter(i => i.priority === "medium");
  const lowIssues = activeIssues.filter(i => i.priority === "low");

  const status: "all-clear" | "needs-attention" | "action-required" =
    highPriority.length > 0 ? "action-required"
    : medPriority.length > 0 ? "needs-attention"
    : "all-clear";

  const topIssue = activeIssues.length > 0 ? activeIssues[0] : null;
  const totalRevenueImpact = activeIssues.reduce((sum, i) => sum + i.revenueImpact, 0);
  const top3Pct = d.totalOrders > 0 && d.topSkuRevenue.length > 0
    ? Math.round(d.topSkuRevenue.slice(0, 3).reduce((s, sku) => s + sku.revenue, 0) / d.gmv * 100) : 0;

  const statusConfig = {
    "all-clear": { dot: "\uD83D\uDFE2", color: "#008060", text: "Everything looks healthy today. No action required." },
    "needs-attention": { dot: "\uD83D\uDFE1", color: "#B98900", text: `${activeIssues.length} issue${activeIssues.length > 1 ? 's' : ''} should be reviewed today.` },
    "action-required": { dot: "\uD83D\uDD34", color: "#D82C0D", text: `Action required today. Estimated revenue at risk: ${formatCurrency(totalRevenueImpact)}.` },
  };
  const cfg = statusConfig[status];

  const otherIssues = [...medPriority.slice(topIssue?.priority === "medium" ? 1 : 0), ...lowIssues.slice(topIssue?.priority === "low" ? 1 : 0)];

  return (
    <Page
      title=""
      subtitle=""
      primaryAction={
        <Button variant="primary" icon={RefreshIcon} onClick={hSync} loading={syncing}>
          {syncing ? "Syncing\u2026" : "Sync Data"}
        </Button>
      }
    >
      <BlockStack gap="300">

        {/* Compact Status Line */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0" }}>
          <span style={{ fontSize: "16px", lineHeight: "20px" }}>{cfg.dot}</span>
          <Text as="p" variant="bodyMd" fontWeight="medium">{cfg.text}</Text>
        </div>

        {/* Daily Decision Card */}
        {topIssue ? (
          <div style={{ border: "1px solid #E1E3E5", borderRadius: "10px", padding: "20px", position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, width: "4px", height: "100%",
              background: topIssue.priority === "high" ? "#D82C0D" : topIssue.priority === "medium" ? "#B98900" : "#008060",
              borderRadius: "2px"
            }} />
            <BlockStack gap="200">
              <Badge tone={topIssue.priority === "high" ? "critical" : topIssue.priority === "medium" ? "attention" : "success"}>
                {topIssue.priority === "high" ? "TOP PRIORITY" : topIssue.priority === "medium" ? "REVIEW TODAY" : "FOR YOUR INFO"}
              </Badge>
              <Text as="h3" variant="headingMd" fontWeight="semibold">{topIssue.title}</Text>
              <Text as="p" variant="bodyMd" tone="subdued">{topIssue.detail}</Text>
              {topIssue.revenueImpact > 0 && (
                <Text as="p" variant="bodyMd" fontWeight="bold">
                  Estimated revenue at risk: {formatCurrency(topIssue.revenueImpact)}
                </Text>
              )}
              <div style={{ background: "#F6F6F7", borderRadius: "8px", padding: "12px 16px" }}>
                <InlineStack gap="200" align="start">
                  <span style={{ fontSize: "14px", lineHeight: "20px" }}>\uD83D\uDCA1</span>
                  <Text as="p" variant="bodySm">{topIssue.action}</Text>
                </InlineStack>
              </div>
              <InlineStack gap="200">
                <Button variant="primary" onClick={handleViewDetails}>
                  {detailsOpen ? "Hide details" : "View details"}
                </Button>
                <Button variant="secondary" onClick={handleMarkReviewed}>
                  Mark as reviewed
                </Button>
              </InlineStack>
            </BlockStack>
          </div>
        ) : (
          /* All Clear */
          <Card padding="400">
            <BlockStack gap="300">
              <InlineStack gap="300" align="start">
                <span style={{ fontSize: "24px", lineHeight: "28px" }}>\uD83D\uDFE2</span>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg" fontWeight="semibold" tone="success">
                    Everything looks healthy today.
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Revenue {formatCurrency(d.gmv)} and {d.totalOrders} order{d.totalOrders !== 1 ? 's' : ''} are within your recent baseline.
                  </Text>
                  {top3Pct > 0 && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      Top products generated {top3Pct}% of revenue — consistent with recent trends.
                    </Text>
                  )}
                </BlockStack>
              </InlineStack>
              <InlineStack gap="200">
                <Button variant="primary">Carry on</Button>
                <Button variant="secondary" onClick={handleViewDetails}>
                  {detailsOpen ? "Hide details" : "View details"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* View / Hide supporting details button */}
        {!topIssue && (
          <div style={{ textAlign: "center", marginTop: "-8px" }}>
            <Button variant="plain" onClick={handleViewDetails}>
              {detailsOpen ? "Hide supporting details" : "View supporting details"}
            </Button>
          </div>
        )}

        {/* Collapsed Details */}
        <Collapsible open={detailsOpen} id="supporting-details">
          <div style={{ paddingTop: "16px" }}><BlockStack gap="300">

            {/* Metrics */}
            <MetricsSection data={d} />

            {/* Other Signals (only show when details are open) */}
            {otherIssues.length > 0 && (
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm" fontWeight="semibold" tone="subdued">OTHER SIGNALS</Text>
                {otherIssues.map((issue, i) => (
                  <SignalCard key={i} issue={issue} />
                ))}
              </BlockStack>
            )}

            {/* Supporting Data */}
            <SupportingData data={d} />

          </BlockStack>
          </div>
        </Collapsible>

      </BlockStack>
    </Page>
  );
}
