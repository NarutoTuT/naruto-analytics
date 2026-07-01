import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, data } from "react-router";
import { useEffect, useState, useMemo } from "react";
import { authenticate } from "../shopify.server";
import { fetchAndComputeAnalytics, getSnapshotHistory } from "../lib/analytics.server";
import prisma from "../db.server";
import type { AnalyticsData, PrioritizedIssue, TrendData } from "../lib/analytics.server";
import {
  Card, Text, BlockStack, InlineStack, Badge, Banner, Button,
  SkeletonBodyText, EmptyState, Page
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
  const tone = priority === "high" ? "critical" : priority === "medium" ? "attention" : "info";
  const label = priority === "high" ? "TOP PRIORITY" : priority === "medium" ? "REVIEW TODAY" : "FOR YOUR INFO";
  return <Badge tone={tone}>{label}</Badge>;
}

function MetricsSection({ data: d }: { data: AnalyticsData }) {
  const metrics = [
    { label: "Revenue", value: "$" + d.gmv.toLocaleString(), trend: d.trends.gmv },
    { label: "Orders", value: d.totalOrders.toString(), trend: d.trends.orders },
    { label: "AOV", value: "$" + d.aov.toFixed(0), trend: d.trends.aov },
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

function StatusBanner({ data: d }: { data: AnalyticsData }) {
  const highCount = d.prioritizedIssues.filter(i => i.priority === "high").length;
  const medCount = d.prioritizedIssues.filter(i => i.priority === "medium").length;
  const totalIssues = d.prioritizedIssues.length;

  let status: "all-clear" | "needs-attention" | "action-required" = "all-clear";
  if (highCount > 0) status = "action-required";
  else if (medCount > 0) status = "needs-attention";

  const statusConfig = {
    "all-clear": { color: "#008060", bg: "#E3F1DF", text: "All Clear" },
    "needs-attention": { color: "#B98900", bg: "#FFF5C2", text: "Needs Attention" },
    "action-required": { color: "#D82C0D", bg: "#FED3D1", text: "Action Required" },
  };

  const cfg = statusConfig[status];

  return (
    <div style={{ background: cfg.bg, borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
      <BlockStack gap="200">
        <Text as="h2" variant="headingLg">Good morning, your store.</Text>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: cfg.color }} />
          <Text as="span" variant="headingSm" fontWeight="semibold" tone={status === "action-required" ? "critical" : "subdued"}>
            {cfg.text}
          </Text>
        </div>
        {totalIssues > 0 && (
          <Text as="p" variant="bodySm" tone="subdued">
            {totalIssues} issue{totalIssues > 1 ? "s" : ""} detected. {highCount > 0 ? highCount + " need" : medCount > 0 ? medCount + " need" : ""} action today.
          </Text>
        )}
      </BlockStack>
    </div>
  );
}

function PriorityCardSection({ issue }: { issue: PrioritizedIssue }) {
  const accentColor = issue.priority === "high" ? "#D82C0D" : issue.priority === "medium" ? "#B98900" : "#008060";
  return (
    <div style={{
      border: "1px solid #E1E3E5", borderRadius: "10px", padding: "20px",
      position: "relative", overflow: "hidden", marginBottom: "12px"
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: "4px", height: "100%", background: accentColor, borderRadius: "2px" }} />
      <BlockStack gap="200">
        <PriorityBadge priority={issue.priority} />
        <Text as="h3" variant="headingMd" fontWeight="semibold">{issue.title}</Text>
        <Text as="p" variant="bodyMd" tone="subdued">{issue.detail}</Text>
        {issue.revenueImpact > 0 && (
          <Text as="p" variant="bodyMd" fontWeight="bold">
            Estimated impact: ${issue.revenueImpact.toLocaleString()}
          </Text>
        )}
        <Text as="p" variant="bodySm">
          <Text as="strong" fontWeight="bold">Action: </Text>{issue.action}
        </Text>
        <InlineStack gap="200">
          <Button variant="primary" size="slim">View Details</Button>
          <Button variant="secondary" size="slim">Mark as Reviewed</Button>
        </InlineStack>
      </BlockStack>
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
        <Text as="h3" variant="headingSm" fontWeight="semibold">\uD83D\uDCCA Supporting Data</Text>
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
                <td style={{ padding: "8px 12px", borderBottom: "1px solid #F1F2F3", textAlign: "right", fontWeight: 600 }}>${sku.revenue.toLocaleString()}</td>
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
        <SkeletonBodyText lines={3} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
        <SkeletonBodyText lines={3} />
        <SkeletonBodyText lines={3} />
        <SkeletonBodyText lines={3} />
      </div>
      <SkeletonBodyText lines={3} />
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
        <p>Sync your store and tomorrow morning you'll receive your first daily briefing — revenue trends, alerts, and prioritized actions.</p>
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

  const highPriority = d.prioritizedIssues.filter(i => i.priority === "high");
  const medPriority = d.prioritizedIssues.filter(i => i.priority === "medium");
  const lowPriority = d.prioritizedIssues.filter(i => i.priority === "low");
  const topIssue = highPriority.length > 0 ? highPriority[0] : medPriority.length > 0 ? medPriority[0] : lowPriority[0];
  const otherIssues = [...highPriority.slice(1), ...medPriority.slice(topIssue?.priority === "medium" ? 1 : 0), ...lowPriority.slice(topIssue?.priority === "low" ? 1 : 0)];

  return (
    <Page
      title=""
      subtitle=""
      primaryAction={
        <Button
          variant="primary"
          icon={RefreshIcon}
          onClick={hSync}
          loading={syncing}
        >
          {syncing ? "Syncing\u2026" : "Sync Data"}
        </Button>
      }
    >
      <BlockStack gap="300">

        {/* Status Banner */}
        <StatusBanner data={d} />

        {/* Metrics Row */}
        <MetricsSection data={d} />

        {/* Top Priority Card */}
        {topIssue && (
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm" fontWeight="semibold" tone="subdued">TOP PRIORITY</Text>
            <PriorityCardSection issue={topIssue} />
          </BlockStack>
        )}

        {/* Other Signals */}
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
    </Page>
  );
}
