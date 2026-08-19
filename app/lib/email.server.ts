import { Resend } from "resend";
import { buildDailyBriefHtml, buildSubject } from "./email-templates/daily-brief";
import type { AnalyticsData, PrioritizedIssue } from "./analytics.server";

export type DailyBriefStatus = "all-clear" | "needs-attention" | "action-required";

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
  appUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { success: false, error: "RESEND_API_KEY not configured" };

  const subject = buildSubject(params.storeName, params.status);
  const html = buildDailyBriefHtml(
    params.storeName,
    params.data,
    params.status,
    params.topIssue,
    params.appUrl,
  );

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "Naruto AI <onboarding@resend.dev>",
      to: params.to,
      subject,
      html,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to send daily brief email:", message);
    return { success: false, error: message };
  }
}
