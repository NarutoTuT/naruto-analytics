import type { AnalyticsData, PrioritizedIssue } from "../analytics.server";

function formatCurrency(amount: number): string {
  return "$" + amount.toLocaleString();
}

function statusEmoji(status: "all-clear" | "needs-attention" | "action-required"): string {
  return status === "all-clear" ? "\u{1F7E2}" : status === "needs-attention" ? "\u{1F7E1}" : "\u{1F534}";
}

export function buildSubject(storeName: string, status: "all-clear" | "needs-attention" | "action-required"): string {
  const emoji = statusEmoji(status);
  const label =
    status === "all-clear" ? "Running smoothly"
    : status === "needs-attention" ? "Something to review"
    : "Action needed";
  return `${emoji} ${storeName} \u2014 ${label}`;
}

export function buildDailyBriefHtml(
  storeName: string,
  data: AnalyticsData,
  status: "all-clear" | "needs-attention" | "action-required",
  topIssue: PrioritizedIssue | null,
  appUrl: string,
): string {
  const statusText =
    status === "all-clear" ? "Good morning. Your store is running smoothly."
    : status === "needs-attention" ? "There\u2019s something you may want to look at today."
    : `One item needs your attention today. Potential impact: ${formatCurrency(topIssue?.revenueImpact || 0)}.`;

  const emoji = statusEmoji(status);

  const orderLabel = `${data.totalOrders} ${data.totalOrders === 1 ? "order" : "orders"}`;
  const gmvUp = data.trends.gmv.direction === "up";
  const orderUp = data.trends.orders.direction === "up";
  const aovUp = data.trends.aov.direction === "up";

  const section = (label: string, value: string, trendUp: boolean, trendDown: boolean, pct: number) => `
    <td style="padding:12px;width:33%;text-align:center;border-right:1px solid #f0f0f0;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">${label}</div>
      <div style="font-size:20px;font-weight:700;color:#111827;">${value}</div>
      ${trendUp || trendDown ? `<div style="font-size:12px;margin-top:2px;color:${trendUp ? '#059669' : '#dc2626'};">${trendUp ? '\u2191' : '\u2193'}${pct}% vs 7-day avg</div>` : ""}
    </td>`;

  const priorityHtml = topIssue ? `
    <table style="width:100%;border-collapse:collapse;margin-top:20px;">
      <tr>
        <td style="padding:16px;background:#f9fafb;border-radius:8px;border-left:4px solid ${topIssue.priority === 'high' ? '#dc2626' : topIssue.priority === 'medium' ? '#d97706' : '#059669'};">
          <table style="width:100%;">
            <tr>
              <td style="padding-bottom:8px;">
                <span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:${topIssue.priority === 'high' ? '#fef2f2' : topIssue.priority === 'medium' ? '#fffbeb' : '#f0fdf4'};color:${topIssue.priority === 'high' ? '#dc2626' : topIssue.priority === 'medium' ? '#d97706' : '#059669'};">
                  ${topIssue.priority === 'high' ? "Today\u2019s focus" : topIssue.priority === 'medium' ? "Worth a look" : "Just so you know"}
                </span>
              </td>
            </tr>
            <tr>
              <td style="font-size:16px;font-weight:700;color:#111827;padding-bottom:8px;">${topIssue.title}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#4b5563;padding-bottom:8px;line-height:1.5;">${topIssue.detail}</td>
            </tr>
            ${topIssue.revenueImpact > 0 ? `
            <tr>
              <td style="font-size:14px;font-weight:700;color:#111827;padding-bottom:8px;">Potential impact: up to ${formatCurrency(topIssue.revenueImpact)}</td>
            </tr>` : ""}
            <tr>
              <td style="font-size:13px;color:#059669;padding:10px 12px;background:#f0fdf4;border-radius:6px;line-height:1.5;">
                <strong style="font-size:11px;color:#6b7280;display:block;margin-bottom:2px;">Recommended action</strong>
                ${topIssue.action}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>` : `
    <table style="width:100%;border-collapse:collapse;margin-top:20px;">
      <tr>
        <td style="padding:20px;background:#f0fdf4;border-radius:8px;text-align:center;">
          <div style="font-size:18px;margin-bottom:4px;">\u2705</div>
          <div style="font-size:16px;font-weight:600;color:#059669;">Everything looks healthy today.</div>
          <div style="font-size:14px;color:#6b7280;margin-top:4px;">Revenue and order activity are within your recent baseline.</div>
        </td>
      </tr>
    </table>`;

  const otherSignalsHtml = data.prioritizedIssues.length > 1 ? `
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <tr>
        <td style="font-size:13px;font-weight:600;color:#6b7280;padding-bottom:8px;">For your awareness</td>
      </tr>
      ${data.prioritizedIssues.slice(1).map(issue => `
      <tr>
        <td style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:6px;display:block;">
          <div style="font-size:14px;font-weight:600;color:#111827;">${issue.title}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:2px;">${issue.detail}</div>
          <div style="font-size:12px;color:#059669;margin-top:4px;">${issue.action}</div>
        </td>
      </tr>`).join("")}
    </table>` : "";

  const topProductsHtml = data.topSkuRevenue.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <tr>
        <td style="font-size:13px;font-weight:600;color:#6b7280;padding-bottom:8px;">Top products</td>
      </tr>
      ${data.topSkuRevenue.slice(0, 3).map((sku, i) => `
      <tr>
        <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">
          <table style="width:100%;">
            <tr>
              <td style="font-size:13px;color:#374151;">${sku.name.length > 30 ? sku.name.slice(0, 30) + "\u2026" : sku.name}</td>
              <td style="font-size:13px;font-weight:600;color:#111827;text-align:right;">${formatCurrency(sku.revenue)}</td>
            </tr>
          </table>
        </td>
      </tr>`).join("")}
    </table>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Naruto AI Daily Brief</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table style="width:100%;max-width:600px;margin:0 auto;background:#ffffff;" cellpadding="0" cellspacing="0">
    <!-- Header -->
    <tr>
      <td style="padding:24px 24px 0;">
        <table style="width:100%;">
          <tr>
            <td style="font-size:16px;font-weight:700;color:#111827;">Naruto AI</td>
            <td style="text-align:right;font-size:12px;color:#6b7280;">Daily Brief</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr><td style="padding:0 24px;"><hr style="border:none;border-top:1px solid #e5e7eb;"></td></tr>

    <!-- Status -->
    <tr>
      <td style="padding:16px 24px 0;">
        <div style="display:inline-block;padding:6px 12px;border-radius:20px;font-size:13px;font-weight:500;background:${status === 'all-clear' ? '#f0fdf4' : status === 'needs-attention' ? '#fffbeb' : '#fef2f2'};color:${status === 'all-clear' ? '#059669' : status === 'needs-attention' ? '#d97706' : '#dc2626'};">
          ${emoji} ${statusText}
        </div>
      </td>
    </tr>

    <!-- Metrics -->
    <tr>
      <td style="padding:16px 24px 0;">
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;">
          <tr>
            ${section("Revenue", formatCurrency(data.gmv), gmvUp, !gmvUp && data.trends.gmv.direction === "down", data.trends.gmv.change)}
            ${section("Orders", String(data.totalOrders), orderUp, !orderUp && data.trends.orders.direction === "down", data.trends.orders.change)}
            ${section("Avg Order", formatCurrency(data.aov), aovUp, !aovUp && data.trends.aov.direction === "down", data.trends.aov.change)}
          </tr>
        </table>
      </td>
    </tr>

    <!-- Priority / All Clear -->
    <tr>
      <td style="padding:8px 24px 0;">
        ${priorityHtml}
      </td>
    </tr>

    <!-- Other signals -->
    ${otherSignalsHtml ? `
    <tr>
      <td style="padding:8px 24px 0;">
        ${otherSignalsHtml}
      </td>
    </tr>` : ""}

    <!-- Top products -->
    ${topProductsHtml ? `
    <tr>
      <td style="padding:8px 24px 0;">
        ${topProductsHtml}
      </td>
    </tr>` : ""}

    <!-- CTA -->
    <tr>
      <td style="padding:20px 24px;">
        <table style="width:100%;">
          <tr>
            <td style="text-align:center;">
              <a href="${appUrl}/app" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;background:#1e3a8a;border-radius:6px;text-decoration:none;">
                View full brief \u2192
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding:16px 24px;background:#f9fafb;">
        <table style="width:100%;">
          <tr>
            <td style="font-size:11px;color:#9ca3af;">
              ${storeName} \u2022 Naruto AI
            </td>
            <td style="text-align:right;">
              <a href="${appUrl}/app" style="font-size:11px;color:#6b7280;text-decoration:none;">Manage preferences</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
