import db from "../db.server";
import { requireTestShop } from "./test-store-policy.server";
import { requireDpa } from "./dpa.server";
import { authenticate } from "../shopify.server";
import { ensureShop } from "./analytics.server";
export const PLAN = {
  name: "Daily Brief",
  amount: 19,
  currency: "USD",
  trialDays: 7,
} as const;
export const SUBSCRIPTION_QUERY = `query BriefSubscription($appId: ID!, $shopId: ID!) {
 activeSubscription(appId: $appId, shopId: $shopId) {
  billingPeriod cancelAtEndOfCycle trialEndsAt currentBillingCycle { startTime endTime }
  items { handle price { active } }
 }
}`;
export type Contract = {
  billingPeriod: string;
  cancelAtEndOfCycle: boolean;
  trialEndsAt: string | null;
  currentBillingCycle: { startTime: string; endTime: string } | null;
  items: { handle: string; price: { active: boolean } }[];
};
export function hasEntitlement(
  contract: Contract | null,
  itemHandle: string,
): boolean {
  // activeSubscription is authoritative, including trial/cancellation timing.
  // price.active describes the catalog price, not the merchant's entitlement;
  // existing contracts and development test prices can have active: false.
  return (
    !!contract && contract.items.some((item) => item.handle === itemHandle)
  );
}
export function pricingUrl(shop: string): string {
  requireTestShop(shop);
  const handle = process.env.SHOPIFY_APP_HANDLE;
  if (
    !handle ||
    !/^[a-z0-9-]+$/.test(handle) ||
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)
  )
    throw new Response("Subscription setup is not available yet.", {
      status: 503,
    });
  return `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/charges/${handle}/pricing_plans`;
}
export async function getSubscription(
  shopId: string,
): Promise<{ active: boolean; contract: Contract | null }> {
  const tenant = await db.shop.findUnique({ where: { id: shopId } });
  requireTestShop(tenant?.myshopifyDomain);
  const org = process.env.SHOPIFY_PARTNER_ORG_ID,
    token = process.env.SHOPIFY_PARTNER_API_TOKEN,
    appId = process.env.SHOPIFY_APP_GID,
    item = process.env.SHOPIFY_PRICING_ITEM_HANDLE;
  if (
    !org ||
    !/^\d+$/.test(org) ||
    !token ||
    !appId ||
    !/^gid:\/\/shopify\/App\/\d+$/.test(appId) ||
    !item
  )
    throw new Response(
      "Subscription verification is temporarily unavailable.",
      { status: 503 },
    );
  const response = await fetch(
    `https://partners.shopify.com/${org}/api/2026-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: SUBSCRIPTION_QUERY,
        variables: { appId, shopId },
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const body = await response.json();
  if (
    !response.ok ||
    body.errors?.length ||
    !body.data ||
    !("activeSubscription" in body.data)
  )
    throw new Response(
      "Subscription verification is temporarily unavailable.",
      { status: 503 },
    );
  const contract = body.data.activeSubscription as Contract | null;
  return { active: hasEntitlement(contract, item), contract };
}
export async function requireSubscription(request: Request, api = false) {
  const auth = await authenticate.admin(request);
  await requireDpa(auth.session.shop, api);
  const shop = await ensureShop(auth.admin);
  const subscription = await getSubscription(shop.id);
  if (!subscription.active) {
    if (api)
      throw Response.json(
        {
          error: "An active Daily Brief subscription is required.",
          code: "SUBSCRIPTION_REQUIRED",
        },
        { status: 402 },
      );
    throw auth.redirect("/app/billing");
  }
  return { ...auth, shop, subscription };
}
