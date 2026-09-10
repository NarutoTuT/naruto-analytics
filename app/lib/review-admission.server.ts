import db from "../db.server";
import {
  canonicalShop,
  reviewConfig,
  codeMatches,
  readGrant,
  encodeGrant,
  reviewKey,
  REVIEW_EVENT,
} from "./review-policy.server";
export async function hasReviewAdmission(shop: unknown) {
  if (!canonicalShop(shop) || !reviewConfig()) return false;
  const row = await db.analyticsEvent.findUnique({
    where: { dedupeKey: reviewKey(shop) },
  });
  return row?.event === REVIEW_EVENT && !!readGrant(row.data, shop);
}
export async function reviewShops() {
  if (!reviewConfig()) return [];
  const rows = await db.analyticsEvent.findMany({
    where: { event: REVIEW_EVENT },
    select: { shopId: true, data: true },
  });
  return rows
    .filter((row) => readGrant(row.data, row.shopId))
    .map((row) => row.shopId);
}
// Called only after official SDK authentication and live development-plan verification.
export async function admitReviewShop(
  shop: string,
  actor: string,
  code: unknown,
) {
  const c = reviewConfig();
  if (!c || !canonicalShop(shop) || !actor || !codeMatches(code, c.codeHash))
    return false;
  const key = reviewKey(shop),
    now = Date.now();
  const old = await db.analyticsEvent.findUnique({ where: { dedupeKey: key } });
  if (old) {
    // Revocation and expiry never renew through resubmitting the same review code.
    return old.event === REVIEW_EVENT && !!readGrant(old.data, shop);
  }
  const data = encodeGrant(
    {
      shop,
      actor,
      campaign: c.campaign,
      issued: now,
      expires: Math.min(now + 48 * 3600000, c.end),
    },
    c.key,
  );
  try {
    await db.analyticsEvent.create({
      data: { shopId: shop, event: REVIEW_EVENT, dedupeKey: key, data },
    });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    return hasReviewAdmission(shop);
  }
}
export async function revokeReviewShop(shop: string) {
  if (!reviewConfig())
    throw new Response("Review window closed", { status: 503 });
  if (!canonicalShop(shop)) throw new Response("Invalid shop", { status: 400 });
  // An absent record also gets a tombstone, so revocation wins a concurrent first admission.
  await db.analyticsEvent.upsert({
    where: { dedupeKey: reviewKey(shop) },
    create: {
      shopId: shop,
      event: "review_revoked",
      dedupeKey: reviewKey(shop),
    },
    update: { event: "review_revoked", data: null },
  });
}
