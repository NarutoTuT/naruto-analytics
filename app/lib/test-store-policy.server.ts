import { hasReviewAdmission, reviewShops } from "./review-admission.server";
import { canonicalShop, reviewConfig } from "./review-policy.server";
// Temporary synthetic-data acceptance scope. Expanding this list requires a reviewed release.
// This is an application tenant restriction, not a Shopify installation-region setting.
export const TEST_SHOPS = Object.freeze(["naruto-dev-ts8dqzla.myshopify.com"]);
export function isTestShop(shop: unknown): shop is string {
  return typeof shop === "string" && TEST_SHOPS.includes(shop);
}
export function requireTestShop(shop: unknown): asserts shop is string {
  if (!isTestShop(shop))
    throw Response.json(
      {
        code: "TEST_STORE_ONLY",
        error:
          "Naruto Analytics is limited to an approved development store for synthetic-data testing.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
}
export async function requireDevelopmentShop(shop: {
  myshopifyDomain?: string;
  plan?: { partnerDevelopment?: boolean };
}) {
  await requireStoreAdmission(shop?.myshopifyDomain);
  if (shop.plan?.partnerDevelopment !== true)
    throw Response.json(
      {
        code: "DEVELOPMENT_STORE_REQUIRED",
        error: "A verified development store is required.",
      },
      { status: 403 },
    );
}
// Decode only for early rejection. This never authenticates a token: the official SDK
// still verifies signature, audience and lifetime before exchanging it or granting access.
export async function requireTestRequest(request: Request) {
  const url = new URL(request.url);
  const shops = url.searchParams.getAll("shop");
  for (const shop of shops) requireAdmissionContext(shop);
  let context = shops.length > 0;
  const tokens = [...url.searchParams.getAll("id_token")];
  const authorization = request.headers.get("authorization");
  if (authorization) tokens.push(authorization.replace(/^Bearer /, ""));
  for (const token of tokens) {
    let shop: string | undefined;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error();
      const dest = new URL(
        JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).dest,
      );
      if (
        dest.protocol !== "https:" ||
        dest.port ||
        dest.username ||
        dest.password ||
        dest.search ||
        dest.hash ||
        dest.pathname !== "/"
      )
        throw new Error();
      shop = dest.hostname;
    } catch {
      throw new Response("Invalid session context", { status: 401 });
    }
    requireAdmissionContext(shop);
    context = true;
  }
  if (request.method === "POST" && url.pathname === "/auth/login") {
    const form = await request.clone().formData();
    for (const shop of form.getAll("shop")) {
      requireAdmissionContext(shop);
      context = true;
    }
  }
  if (!context)
    throw new Response("Open the approved development store from Shopify.", {
      status: 403,
    });
}
export const TEST_AGREEMENT_PREFIX = "TEST_ONLY:";
export function testAgreementVersion(version: string) {
  return TEST_AGREEMENT_PREFIX + version;
}

export async function hasStoreAdmission(shop: unknown) {
  return isTestShop(shop) || (await hasReviewAdmission(shop));
}
export async function requireStoreAdmission(shop: unknown) {
  if (!(await hasStoreAdmission(shop)))
    throw Response.json(
      {
        code: "REVIEW_ACCESS_REQUIRED",
        error: "Approved test access is required.",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
}
export async function admittedShops() {
  return [...new Set([...TEST_SHOPS, ...(await reviewShops())])];
}
function requireAdmissionContext(shop: unknown) {
  // This permits authentication only, never orders, reports, email or billing.
  if (reviewConfig() && canonicalShop(shop)) return;
  requireTestShop(shop);
}
