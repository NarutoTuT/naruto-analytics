import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export const REVIEW_EVENT = "review_admission";
export function canonicalShop(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)
  );
}
export function reviewConfig(now = Date.now()) {
  const e = process.env,
    start = Date.parse(e.REVIEW_START_AT || ""),
    end = Date.parse(e.REVIEW_END_AT || "");
  if (
    e.REVIEW_ACCESS_ENABLED !== "true" ||
    !/^[a-zA-Z0-9_-]{8,80}$/.test(e.REVIEW_CAMPAIGN || "") ||
    !/^[a-f0-9]{64}$/.test(e.REVIEW_CODE_SHA256 || "") ||
    (e.REVIEW_SIGNING_KEY || "").length < 32 ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 7 * 86400000 ||
    now < start ||
    now >= end
  )
    return null;
  return {
    campaign: e.REVIEW_CAMPAIGN!,
    codeHash: e.REVIEW_CODE_SHA256!,
    key: e.REVIEW_SIGNING_KEY!,
    start,
    end,
  };
}
export function codeMatches(code: unknown, expected: string) {
  if (typeof code !== "string" || !/^[a-f0-9]{64}$/.test(code)) return false;
  return timingSafeEqual(
    Buffer.from(createHash("sha256").update(code).digest("hex")),
    Buffer.from(expected),
  );
}
export type ReviewGrant = {
  shop: string;
  campaign: string;
  actor: string;
  issued: number;
  expires: number;
};
export function encodeGrant(grant: ReviewGrant, key: string) {
  const value = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return value + "." + createHmac("sha256", key).update(value).digest("hex");
}
export function readGrant(
  value: unknown,
  shop: string,
  now = Date.now(),
): ReviewGrant | null {
  const c = reviewConfig(now);
  if (!c || !canonicalShop(shop) || typeof value !== "string") return null;
  try {
    const [payload, mac, ...extra] = value.split(".");
    if (extra.length || !/^[a-f0-9]{64}$/.test(mac)) return null;
    const expected = createHmac("sha256", c.key).update(payload).digest("hex");
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    const g = JSON.parse(Buffer.from(payload, "base64url").toString());
    return g.shop === shop &&
      g.campaign === c.campaign &&
      typeof g.actor === "string" &&
      g.actor.length > 0 &&
      Number.isFinite(g.issued) &&
      Number.isFinite(g.expires) &&
      g.issued >= c.start &&
      g.issued <= now &&
      g.expires > now &&
      g.expires <= c.end &&
      g.expires > g.issued &&
      g.expires - g.issued <= 48 * 3600000
      ? g
      : null;
  } catch {
    return null;
  }
}
export function reviewKey(shop: string) {
  return (
    "review-admission:" + (reviewConfig()?.campaign || "disabled") + ":" + shop
  );
}
