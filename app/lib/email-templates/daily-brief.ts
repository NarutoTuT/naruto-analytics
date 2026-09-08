import type { AnalyticsData, PrioritizedIssue } from "../analytics-types";
import { money, escapeHtml } from "../format";
export function embeddedBriefUrl(shop: string, appHandle: string) {
  if (
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ||
    !/^[a-z0-9-]+$/.test(appHandle)
  )
    throw new Error("Invalid Shopify email destination");
  return `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/apps/${appHandle}/app`;
}
export function buildSubject(storeName: string) {
  return `${storeName} — Daily Brief`;
}
export function buildDailyBriefHtml(
  storeName: string,
  data: AnalyticsData,
  _status: string,
  topIssue: PrioritizedIssue | null,
  appUrl: string,
): string {
  const e = escapeHtml;
  const url = new URL(appUrl);
  url.searchParams.set("source", "email");
  return `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;max-width:600px;margin:32px auto;padding:20px;color:#202223"><h1>${e(storeName)} — Daily Brief</h1><p>${e(data.periodStart)} – ${e(data.periodEnd)} (${e(data.timezone)})</p><p>Last 7 complete days compared with ${e(data.comparisonStart)} – ${e(data.comparisonEnd)}.</p><h2>${e(money(data.gmv, data.currencyCode))}</h2><p>Paid order value · ${data.totalOrders} paid orders · ${e(money(data.aov, data.currencyCode))} average order value</p><p>Includes tax and shipping. Excludes test, cancelled and refunded/partially refunded orders. This is an order-cohort summary, not net sales or profit.</p>${topIssue ? `<h2>${e(topIssue.title)}</h2><p>${e(topIssue.detail)}</p><p>${e(topIssue.action)}</p>` : "<h2>No review rule triggered</h2><p>This does not confirm overall store health. Review the supporting data and your business context.</p>"}<h2>Top products</h2><p>Gross merchandise value before discounts, tax and shipping.</p><ul>${data.topSkuRevenue
    .slice(0, 3)
    .map(
      (p) => `<li>${e(p.name)}: ${e(money(p.revenue, data.currencyCode))}</li>`,
    )
    .join(
      "",
    )}</ul><p><a href="${e(url.href)}">View full brief</a></p><p><a href="${e(new URL(appUrl).href)}">Manage email preferences or stop daily emails</a></p></body></html>`;
}
