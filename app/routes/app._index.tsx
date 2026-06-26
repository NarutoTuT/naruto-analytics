import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, data } from "react-router";
import { useEffect, useState, useMemo } from "react";
import { authenticate } from "../shopify.server";
import { fetchAndComputeAnalytics, getSnapshotHistory } from "../lib/analytics.server";
import prisma from "../db.server";
import type { AnalyticsData } from "../lib/analytics.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  let shopRecord = await prisma.shop.findUnique({ where: { myshopifyDomain: session.shop } });
  if (!shopRecord) {
    const r = await admin.graphql(`#graphql query { shop { id name email myshopifyDomain createdAt } }`);
    const j = await r.json();
    const s = j.data.shop;
    shopRecord = await prisma.shop.create({ data: { id: s.id, myshopifyDomain: s.myshopifyDomain, name: s.name, email: s.email, createdAt: new Date(s.createdAt) } });
  }
  const analyticsData = await fetchAndComputeAnalytics(admin);
  analyticsData.snapshotHistory = await getSnapshotHistory(shopRecord.id);
  return data(analyticsData);
};

export default function Dashboard() {
  const data = useLoaderData<AnalyticsData>();
  const fetcher = useFetcher();
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { if (fetcher.state === "idle" && fetcher.data) { setSyncing(false); window.location.reload(); } }, [fetcher.state]);

  const hSync = () => { setSyncing(true); fetcher.submit({ action: "sync" }, { method: "POST", encType: "application/json" }); };

  const maxGmv = useMemo(() => Math.max(...data.dailyGmv.map(d => d.gmv), 1), [data.dailyGmv]);
  const maxBucket = useMemo(() => Math.max(...data.orderValueBuckets.map(b => b.count), 1), [data.orderValueBuckets]);
  const maxCat = useMemo(() => Math.max(...data.categoryRevenue.map(c => c.revenue), 1), [data.categoryRevenue]);

  return (
    <s-page heading="Naruto Analytics">
      <s-button slot="primary-action" onClick={hSync} {...(syncing ? { loading: "true" } : {})}>
        {syncing ? "Syncing..." : "Sync Data"}
      </s-button>

      <s-grid gap="base" columns="5">
        <s-box padding="base" borderWidth="base" borderRadius="base"><s-text variant="headingXs" tone="subdued">GMV</s-text><s-text variant="headingXl" fontWeight="bold">${data.gmv.toLocaleString()}</s-text></s-box>
        <s-box padding="base" borderWidth="base" borderRadius="base"><s-text variant="headingXs" tone="subdued">Orders</s-text><s-text variant="headingXl" fontWeight="bold">{data.totalOrders}</s-text></s-box>
        <s-box padding="base" borderWidth="base" borderRadius="base"><s-text variant="headingXs" tone="subdued">AOV</s-text><s-text variant="headingXl" fontWeight="bold">${data.aov.toFixed(0)}</s-text></s-box>
        <s-box padding="base" borderWidth="base" borderRadius="base"><s-text variant="headingXs" tone="subdued">Customers</s-text><s-text variant="headingXl" fontWeight="bold">{data.totalCustomers}</s-text></s-box>
        <s-box padding="base" borderWidth="base" borderRadius="base"><s-text variant="headingXs" tone="subdued">Repeat</s-text><s-text variant="headingXl" fontWeight="bold">{data.repeatCustomers}</s-text></s-box>
      </s-grid>

      <s-box padding="base" borderWidth="base" borderRadius="base" marginBlockStart="base">
        <s-text variant="headingMd" fontWeight="bold">Daily GMV (Last 14 Days)</s-text>
        <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:120, marginTop:12 }}>
          {data.dailyGmv.map(d => (
            <div key={d.date} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", height:"100%", justifyContent:"flex-end" }}>
              <s-text variant="headingXs" tone="subdued">${d.gmv.toFixed(0)}</s-text>
              <div style={{ width:"100%", height:Math.max((d.gmv/maxGmv)*100,4), background:"#5c6ac4", borderRadius:4, minHeight:4 }} />
              <s-text variant="bodyXs" tone="subdued">{d.date.slice(5)}</s-text>
            </div>
          ))}
        </div>
      </s-box>

      <s-grid gap="base" marginBlockStart="base" columns="2">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-text variant="headingMd" fontWeight="bold">Revenue by Category</s-text>
          <s-stack direction="block" gap="tight" marginBlockStart="base">
            {data.categoryRevenue.map(c => (
              <div key={c.category} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:100, flexShrink:0 }}><s-text variant="bodySm">{c.category}</s-text></div>
                <div style={{ flex:1, height:24, background:"#f0f0f0", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:(c.revenue/maxCat*100)+"%", background:"#5c6ac4", borderRadius:4, minWidth:4, transition:"width 0.5s" }} />
                </div>
                <s-text variant="bodySm" fontWeight="bold" style={{ width:80, textAlign:"right" }}>${c.revenue.toFixed(0)}</s-text>
                <s-text variant="bodySm" tone="subdued" style={{ width:40, textAlign:"right" }}>{c.pct}%</s-text>
              </div>
            ))}
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-text variant="headingMd" fontWeight="bold">Order Value</s-text>
          <s-stack direction="block" gap="tight" marginBlockStart="base">
            {data.orderValueBuckets.map(b => (
              <div key={b.label} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:70, flexShrink:0 }}><s-text variant="bodySm">{b.label}</s-text></div>
                <div style={{ flex:1, height:24, background:"#f0f0f0", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:(b.count/maxBucket*100)+"%", background:"#47c1bf", borderRadius:4, minWidth:4 }} />
                </div>
                <s-text variant="bodySm" fontWeight="bold" style={{ width:40, textAlign:"right" }}>{b.count}</s-text>
                <s-text variant="bodySm" tone="subdued" style={{ width:40, textAlign:"right" }}>{b.pct}%</s-text>
              </div>
            ))}
          </s-stack>
        </s-box>
      </s-grid>

      <s-box padding="base" borderWidth="base" borderRadius="base" marginBlockStart="base">
        <s-text variant="headingMd" fontWeight="bold">Top SKUs</s-text>
        <s-table><s-thead><s-tr><s-th>#</s-th><s-th>SKU</s-th><s-th>Revenue</s-th><s-th>Qty</s-th><s-th>Orders</s-th></s-tr></s-thead>
          <s-tbody>{data.topSkuRevenue.slice(0,10).map((s,i) => (
            <s-tr key={i}><s-td>{i+1}</s-td><s-td><s-text variant="bodySm" fontWeight="bold">{s.name.length>35?s.name.slice(0,35)+"...":s.name}</s-text></s-td><s-td><s-text fontWeight="bold">${s.revenue.toFixed(2)}</s-text></s-td><s-td>{s.qty}</s-td><s-td>{s.orders}</s-td></s-tr>
          ))}</s-tbody>
        </s-table>
      </s-box>

      {data.issues.length>0 && (
        <s-grid gap="base" marginBlockStart="base" columns={data.issues.length>1?"2":"1"}>
          {data.issues.map((issue,i) => (
            <s-box key={i} padding="base" borderWidth="base" borderRadius="base" background={issue.type==="problem"?"criticalSubdued":"successSubdued"}>
              <s-text variant="headingSm" fontWeight="bold">{issue.type==="problem"?"⚠️":"💡"}{issue.title}</s-text>
              <s-paragraph>{issue.detail}</s-paragraph>
            </s-box>
          ))}
        </s-grid>
      )}

      <s-box padding="base" borderWidth="base" borderRadius="base" marginBlockStart="base">
        <s-text variant="headingMd" fontWeight="bold">Growth Recommendations</s-text>
        <s-unordered-list marginBlockStart="base">
          {data.recommendations.map((r,i) => (<s-list-item key={i}><s-text>{r}</s-text></s-list-item>))}
        </s-unordered-list>
      </s-box>

      {data.snapshotHistory.length>0 && (
        <s-box padding="base" borderWidth="base" borderRadius="base" marginBlockStart="base">
          <s-text variant="headingMd" fontWeight="bold">Snapshot History</s-text>
          <s-table><s-thead><s-tr><s-th>Date</s-th><s-th>GMV</s-th><s-th>Orders</s-th><s-th>AOV</s-th></s-tr></s-thead>
            <s-tbody>{data.snapshotHistory.slice(0,10).map((s,i) => (
              <s-tr key={i}><s-td>{s.date}</s-td><s-td>${s.gmv.toLocaleString()}</s-td><s-td>{s.orders}</s-td><s-td>${s.aov.toFixed(0)}</s-td></s-tr>
            ))}</s-tbody>
          </s-table>
        </s-box>
      )}

      <s-box padding="base" borderWidth="base" borderRadius="base" marginBlockStart="base">
        <s-text variant="headingMd" fontWeight="bold">Recent Orders</s-text>
        <s-table><s-thead><s-tr><s-th>Order</s-th><s-th>Date</s-th><s-th>Amount</s-th><s-th>Status</s-th><s-th>Customer</s-th></s-tr></s-thead>
          <s-tbody>{data.recentOrders.slice(0,10).map((o,i) => (
            <s-tr key={i}><s-td><s-text fontWeight="bold">{o.name}</s-text></s-td><s-td>{o.date}</s-td><s-td>${o.total.toFixed(2)}</s-td><s-td><s-badge tone={o.status==="PAID"?"success":"attention"}>{o.status}</s-badge></s-td><s-td>{o.customer}</s-td></s-tr>
          ))}</s-tbody>
        </s-table>
      </s-box>
    </s-page>
  );
}
