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

function FocusBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const tone = priority === "high" ? "critical" : priority === "medium" ? "attention" : "success";
  const label = priority === "high" ? "Today\u2019s focus" : priority === "medium" ? "Worth a look" : "Just so you know";
  return <Badge tone={tone}>{label}</Badge>;
}

function MetricsSection({ data: d }: { data: AnalyticsData }) {
  const metrics = [
    { label: "Revenue", value: formatCurrency(d.gmv), trend: d.trends.gmv },
    { label: "Orders", value: d.totalOrders.toString(), trend: d.trends.orders },
    { label: "Average order", value: formatCurrency(d.aov), trend: d.trends.aov },
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
        <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">Revenue trend & top products</Text>
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
    <Page title="Today\u2019s Overview">
      <BlockStack gap="300">
        <Text as="p" variant="bodyMd" tone="subdued">Just a moment \u2014 pulling together today\u2019s overview.</Text>
        <div style={{ background: "#F6F6F7", borderRadius: "10px", padding: "20px" }}>
          <SkeletonBodyText lines={2} />
        </div>
        <SkeletonBodyText lines={4} />
      </BlockStack>
    </Page>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Page title="Today\u2019s Overview">
      <Banner title="We weren\u2019t able to prepare your overview right now" tone="critical">
        <p>Don\u2019t worry \u2014 we\u2019ll try again shortly. You can also sync manually.</p>
        <Button variant="primary" onClick={() => window.location.reload()}>Try again</Button>
      </Banner>
    </Page>
  );
}

function EmptyStateView() {
  return (
    <Page title="Today\u2019s Overview">
      <EmptyState
        heading="Welcome to your daily business overview"
        action={{ content: "Connect my store", onAction: () => {} }}
        image={""}
      >
        <p>Connect your store to start receiving personalized daily briefings about your business.</p>
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

  const toggleDetails = () => setDetailsOpen(!detailsOpen);

  const handleMarkReviewed = () => {
    if (topIssue) {
      setReviewedTitles(prev => new Set(prev).add(topIssue.title));
    }
  };

  if (hasError) {
    return <ErrorState message={errorMsg} />;
  }

  if (!loaded || !loaderData || "error" in (loaderData || {})) {
    return <LoadingSkeleton />;
  }

  const d = loaderData as AnalyticsData;

  if (d.gmv === 0 && d.totalOrders === 0 && d.totalCustomers === 0) {
    return <EmptyStateView />;
  }

  const activeIssues = d.prioritizedIssues.filter(i => !reviewedTitles.has(i.title));
  const highPriority = activeIssues.filter(i => i.priority === "high");
  const medPriority = activeIssues.filter(i => i.priority === "medium");

  const status: "all-clear" | "needs-attention" | "action-required" =
    highPriority.length > 0 ? "action-required"
    : medPriority.length > 0 ? "needs-attention"
    : "all-clear";

  const topIssue = activeIssues.length > 0 ? activeIssues[0] : null;
  const totalRevenueImpact = activeIssues.reduce((sum, i) => sum + i.revenueImpact, 0);

  const statusText = status === "all-clear"
    ? "Good morning. Your store is running smoothly."
    : status === "needs-attention"
      ? "There\u2019s something you may want to look at today."
      : `One item needs your attention today. Potential impact: ${formatCurrency(totalRevenueImpact)}.`;

  const otherIssues = [...medPriority.slice(topIssue?.priority === "medium" ? 1 : 0)];

  return (
    <Page
      title=""
      subtitle=""
      primaryAction={
        <Button variant="primary" icon={RefreshIcon} onClick={hSync} loading={syncing}>
          {syncing ? "Updating\u2026" : "Update"}
        </Button>
      }
    >
      <BlockStack gap="300">

        {/* Status line */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "0" }}>
          <span style={{
            fontSize: "14px", lineHeight: "18px",
            color: status === "all-clear" ? "#008060" : status === "needs-attention" ? "#B98900" : "#D82C0D"
          }}>
            {status === "all-clear" ? "\u25CF" : "\u25CF"}
          </span>
          <Text as="p" variant="bodyMd" fontWeight="medium">{statusText}</Text>
        </div>

        {/* Decision card */}
        {topIssue ? (
          <div style={{ border: "1px solid #E1E3E5", borderRadius: "10px", padding: "20px", position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", left: 0, top: 0, width: "4px", height: "100%",
              background: topIssue.priority === "high" ? "#D82C0D" : topIssue.priority === "medium" ? "#B98900" : "#008060",
              borderRadius: "2px"
            }} />
            <BlockStack gap="200">
              <FocusBadge priority={topIssue.priority} />
              <Text as="h2" variant="headingMd" fontWeight="semibold">{topIssue.title}</Text>
              <Text as="p" variant="bodyMd" tone="subdued">{topIssue.detail}</Text>
              {topIssue.revenueImpact > 0 && (
                <Text as="p" variant="bodyMd" fontWeight="bold">
                  Potential impact: up to {formatCurrency(topIssue.revenueImpact)}
                </Text>
              )}
              <div style={{ background: "#F6F6F7", borderRadius: "8px", padding: "12px 16px" }}>
                <BlockStack gap="050">
                  <Text as="span" variant="bodyXs" tone="subdued" fontWeight="semibold">Your move</Text>
                  <Text as="p" variant="bodySm">{topIssue.action}</Text>
                </BlockStack>
              </div>
              <InlineStack gap="200">
                <Button variant="primary" onClick={toggleDetails}>
                  {detailsOpen ? "Hide the numbers" : "See what\u2019s behind this"}
                </Button>
                <Button variant="secondary" onClick={handleMarkReviewed}>
                  I\u2019ve got this
                </Button>
              </InlineStack>
            </BlockStack>
          </div>
        ) : (
          /* All Clear */
          <Card padding="400">
            <BlockStack gap="300">
              <InlineStack gap="300" align="start">
                <span style={{ fontSize: "24px", lineHeight: "28px", color: "#008060" }}>\u2713</span>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg" fontWeight="semibold" tone="success">
                    Good morning. Your store is running smoothly.
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Yesterday brought in {formatCurrency(d.gmv)} from {d.totalOrders} order{d.totalOrders !== 1 ? 's' : ''} \u2014 consistent with your recent performance.
                  </Text>
                  {d.totalCustomers > 0 && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      You have {d.totalCustomers} customer{d.totalCustomers !== 1 ? 's' : ''} ({d.newCustomers} new in the last month). {d.repeatCustomers > 0 ? `${d.repeatCustomers} have ordered more than once.` : ''}
                    </Text>
                  )}
                </BlockStack>
              </InlineStack>
              <InlineStack gap="200">
                <Button variant="primary">Start your day</Button>
                <Button variant="secondary" onClick={toggleDetails}>
                  {detailsOpen ? "Hide the numbers" : "See the details"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* View / Hide supporting details */}
        {!topIssue && (
          <div style={{ textAlign: "center", marginTop: "-8px" }}>
            <Button variant="plain" onClick={toggleDetails}>
              {detailsOpen ? "Hide the numbers" : "See the numbers behind this"}
            </Button>
          </div>
        )}

        {/* Collapsed details */}
        <Collapsible open={detailsOpen} id="supporting-details">
          <div style={{ paddingTop: "16px" }}>
          <BlockStack gap="300">

            <MetricsSection data={d} />

            {otherIssues.length > 0 && (
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm" fontWeight="semibold" tone="subdued">For your awareness</Text>
                {otherIssues.map((issue, i) => (
                  <SignalCard key={i} issue={issue} />
                ))}
              </BlockStack>
            )}

            <SupportingData data={d} />

          </BlockStack>
          </div>
        </Collapsible>

      </BlockStack>
    </Page>
  );
}
