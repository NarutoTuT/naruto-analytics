import { requireStoreAdmission } from "./test-store-policy.server";
import { Resend } from "resend";
import {
  buildDailyBriefHtml,
  buildSubject,
  embeddedBriefUrl,
} from "./email-templates/daily-brief";
import type { AnalyticsData, PrioritizedIssue } from "./analytics.server";

export type DailyBriefStatus =
  "all-clear" | "needs-attention" | "action-required";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendDailyBrief(params: {
  to: string;
  storeName: string;
  storeDomain: string;
  data: AnalyticsData;
  status: DailyBriefStatus;
  topIssue: PrioritizedIssue | null;
  appUrl?: string;
  idempotencyKey?: string;
}): Promise<{ success: boolean; error?: string }> {
  await requireStoreAdmission(params.storeDomain);
  const resend = getResend();
  if (!resend)
    return { success: false, error: "RESEND_API_KEY not configured" };

  try {
    const subject = buildSubject(params.storeName);
    const html = buildDailyBriefHtml(
      params.storeName,
      params.data,
      params.status,
      params.topIssue,
      embeddedBriefUrl(
        params.storeDomain,
        process.env.SHOPIFY_APP_HANDLE || "",
      ),
    );

    const result = await resend.emails.send(
      {
        from:
          process.env.EMAIL_FROM || "Naruto Analytics <onboarding@resend.dev>",
        to: params.to,
        subject,
        html,
      },
      params.idempotencyKey
        ? { idempotencyKey: params.idempotencyKey }
        : undefined,
    );
    if (result.error || !result.data?.id)
      return {
        success: false,
        error: "Email provider did not accept the message.",
      };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to send daily brief email:", message);
    return { success: false, error: message };
  }
}
