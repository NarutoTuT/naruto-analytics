import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Collapsible,
  TextField,
  Checkbox,
  Banner,
} from "@shopify/polaris";
import { requireSubscription } from "../lib/billing.server";
import { fetchAndComputeAnalytics } from "../lib/analytics.server";
import { getPreferences } from "../lib/preferences.server";
import { money } from "../lib/format";
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, shop } = await requireSubscription(request);
  return {
    analytics: await fetchAndComputeAnalytics(admin),
    preferences: await getPreferences(shop.id),
    shopEmail: shop.email || "",
  };
}
export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await requireSubscription(request);
  return { analytics: await fetchAndComputeAnalytics(admin) };
}
export default function Today() {
  const {
    analytics: d,
    preferences,
    shopEmail,
  } = useLoaderData<typeof loader>();
  const sync = useFetcher();
  const prefs = useFetcher<{ success?: boolean; error?: string }>();
  const test = useFetcher<{ success?: boolean; error?: string }>();
  const { i18n } = useTranslation();
  const zh = i18n.language === "zh-CN";
  const tx = (en: string, cn: string) => (zh ? cn : en);
  const [open, setOpen] = useState(false),
    [feedback, setFeedback] = useState(false),
    [done, setDone] = useState(false);
  const [email, setEmail] = useState(preferences?.email || shopEmail),
    [enabled, setEnabled] = useState(preferences?.dailyBrief ?? false),
    [time, setTime] = useState(preferences?.deliveryTime || "08:00"),
    [zone, setZone] = useState(preferences?.timezone || d.timezone);
  useEffect(() => {
    let id = sessionStorage.getItem("naruto-session");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("naruto-session", id);
    }
    const source =
      new URLSearchParams(window.location.search).get("source") === "email"
        ? "email"
        : "direct";
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "app_open",
        data: {
          sessionId: id,
          source,
          language: i18n.language,
          briefStatus: d.prioritizedIssues.length
            ? "needs-attention"
            : "all-clear",
        },
      }),
    });
    if (source === "email")
      void fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "email_click", data: { sessionId: id } }),
      });
    const timer = setTimeout(() => setFeedback(true), 15000);
    return () => clearTimeout(timer);
  }, [d.prioritizedIssues.length, i18n.language]);
  const toggle = () => {
    setOpen(!open);
    if (!open) {
      setFeedback(true);
      void fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "view_details" }),
      });
    }
  };
  const vote = async (useful: boolean) => {
    const r = await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "feedback", data: { useful } }),
    });
    if (r.ok) setDone(true);
  };
  const issue = d.prioritizedIssues[0];
  return (
    <Page
      title={tx("Daily Brief", "每日经营简报")}
      primaryAction={{
        content: tx("Refresh", "刷新"),
        loading: sync.state !== "idle",
        onAction: () => sync.submit({}, { method: "post" }),
      }}
    >
      <BlockStack gap="400">
        <Text as="p">
          {d.periodStart} – {d.periodEnd} · {d.timezone}
        </Text>
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              {issue
                ? tx(
                    issue.title,
                    issue.issueType === "revenue_decline"
                      ? "已付款订单金额下降"
                      : "销售集中于三款商品",
                  )
                : tx("No review rule triggered", "当前未触发关注规则")}
            </Text>
            <Text as="p">
              {issue
                ? tx(
                    issue.detail,
                    issue.issueType === "revenue_decline"
                      ? `相比前 7 个完整日，已付款订单金额下降 ${d.trends.gmv.change}%。20% 是提醒阈值，不是预测。`
                      : `前三款商品占商品原价总额的 ${issue.issueData?.top3Pct}%。这是集中度描述，不代表损失预测。`,
                  )
                : tx(
                    "This does not confirm overall store health. Check the data and your business context.",
                    "这不代表店铺整体健康。请结合支撑数据和经营背景判断。",
                  )}
            </Text>
            {issue && (
              <Text as="p">
                {tx(
                  issue.action,
                  issue.issueType === "revenue_decline"
                    ? "先比较订单量和客单价，再检查近期促销及库存。"
                    : "规划下次促销前，检查这些商品的可售库存。",
                )}
              </Text>
            )}
            <Button onClick={toggle}>
              {open
                ? tx("Hide details", "收起详情")
                : tx("View details", "查看详情")}
            </Button>
          </BlockStack>
        </Card>
        <Collapsible open={open} id="brief-details">
          <Card>
            <BlockStack gap="300">
              <Text as="p">
                {tx("Compared with", "对比周期")} {d.comparisonStart} –{" "}
                {d.comparisonEnd}
              </Text>
              <InlineStack gap="600" wrap>
                {[
                  {
                    label: tx("Paid order value", "已付款订单金额"),
                    value: money(d.gmv, d.currencyCode, i18n.language),
                    trend: d.trends.gmv,
                  },
                  {
                    label: tx("Paid orders", "已付款订单"),
                    value: d.totalOrders,
                    trend: d.trends.orders,
                  },
                  {
                    label: tx("Average order value", "客单价"),
                    value: money(d.aov, d.currencyCode, i18n.language),
                    trend: d.trends.aov,
                  },
                ].map((m) => (
                  <BlockStack key={m.label} gap="100">
                    <Text as="p">{m.label}</Text>
                    <Text as="p" variant="headingLg">
                      {m.value}
                    </Text>
                    {m.trend.direction !== "flat" && (
                      <Text as="p">
                        {m.trend.direction === "up" ? "↑" : "↓"}{" "}
                        {m.trend.change}%
                      </Text>
                    )}
                  </BlockStack>
                ))}
              </InlineStack>
              <Text as="p" tone="subdued">
                {tx(
                  "Includes tax and shipping. Excludes test, cancelled, refunded and partially refunded orders. Not net sales or profit. Percentage changes are omitted when the previous value is zero.",
                  "包含税费与运费；排除测试、取消、退款及部分退款订单。不代表净销售额或利润。前期值为零时不显示变化百分比。",
                )}
              </Text>
              <Text as="h3" variant="headingMd">
                {tx(
                  "Top products — gross value before discounts",
                  "头部商品——折扣前商品总额",
                )}
              </Text>
              {d.topSkuRevenue.slice(0, 3).map((p) => (
                <InlineStack key={p.sku} align="space-between" wrap>
                  <Text as="p">{p.name}</Text>
                  <Text as="p">
                    {money(p.revenue, d.currencyCode, i18n.language)}
                  </Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        </Collapsible>
        {feedback && !done && (
          <Card>
            <BlockStack gap="200">
              <Text as="p">
                {tx("Was this brief useful?", "这份简报有帮助吗？")}
              </Text>
              <InlineStack gap="200">
                <Button onClick={() => void vote(true)}>
                  {tx("Useful", "有帮助")}
                </Button>
                <Button onClick={() => void vote(false)}>
                  {tx("Not useful", "没帮助")}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              {tx("Daily email", "每日邮件")}
            </Text>
            <Text as="p">
              {tx(
                "Emails are currently delivered in English.",
                "邮件目前使用英语发送。",
              )}
            </Text>
            <TextField
              label={tx("Email address", "邮箱")}
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
            <Checkbox
              label={tx("Send a daily brief", "发送每日简报")}
              checked={enabled}
              onChange={setEnabled}
            />
            <TextField
              label={tx("Delivery time (HH:MM)", "发送时间（HH:MM）")}
              value={time}
              onChange={setTime}
              autoComplete="off"
            />
            <TextField
              label={tx(
                "Timezone (e.g. Asia/Shanghai)",
                "时区（如 Asia/Shanghai）",
              )}
              value={zone}
              onChange={setZone}
              autoComplete="off"
            />
            <InlineStack gap="200">
              <Button
                loading={prefs.state !== "idle"}
                onClick={() =>
                  prefs.submit(
                    {
                      email,
                      dailyBrief: enabled,
                      deliveryTime: time,
                      timezone: zone,
                    },
                    {
                      method: "post",
                      action: "/api/preferences",
                      encType: "application/json",
                    },
                  )
                }
              >
                {tx("Save preferences", "保存设置")}
              </Button>
              <Button
                loading={test.state !== "idle"}
                disabled={
                  prefs.state !== "idle" ||
                  !preferences?.email ||
                  email.trim() !== preferences.email.trim()
                }
                onClick={() =>
                  test.submit(
                    { email },
                    {
                      method: "post",
                      action: "/api/test-email",
                      encType: "application/json",
                    },
                  )
                }
              >
                {tx("Send test email", "发送测试邮件")}
              </Button>
            </InlineStack>
            <Text as="p" tone="subdued">
              {tx(
                "Save your email address before sending a test. One test attempt per five-minute window.",
                "请先保存收件邮箱，再发送测试邮件。每个 5 分钟时段最多尝试一次。",
              )}
            </Text>
            {prefs.data && (
              <Banner tone={prefs.data.success ? "success" : "critical"}>
                <p>
                  {prefs.data.success
                    ? tx("Saved", "已保存")
                    : prefs.data.error}
                </p>
              </Banner>
            )}
            {test.data && (
              <Banner tone={test.data.success ? "success" : "critical"}>
                <p>
                  {test.data.success
                    ? tx("Email accepted for delivery", "邮件已提交发送")
                    : test.data.error}
                </p>
              </Banner>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
