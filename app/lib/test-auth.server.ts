import { reviewConfig } from "./review-policy.server";
import {
  requireTestRequest,
  requireTestShop,
  requireStoreAdmission,
  hasStoreAdmission,
} from "./test-store-policy.server";
const DEVELOPMENT_QUERY =
  "query TestStoreEligibility { shop { myshopifyDomain plan { partnerDevelopment } } }";
async function verifyDevelopment(
  admin: { graphql: (query: string) => Promise<Response> },
  expected: string,
) {
  const response = await admin.graphql(DEVELOPMENT_QUERY);
  const body = await response.json();
  if (
    !response.ok ||
    body.errors?.length ||
    body.data?.shop?.myshopifyDomain !== expected
  )
    throw new Response("Development store verification unavailable", {
      status: 503,
    });
  if (body.data.shop.plan?.partnerDevelopment !== true)
    throw new Response("A verified development store is required", {
      status: 403,
    });
}
// Keep the factory independent of SDK initialization so denial-before-side-effect can be tested.
export function restrictShopify<
  T extends {
    authenticate: { admin: (request: Request) => Promise<any> };
    unauthenticated: { admin: (shop: string) => Promise<any> };
    login: (request: Request) => Promise<any>;
  },
>(sdk: T): T {
  return {
    ...sdk,
    authenticate: {
      ...sdk.authenticate,
      admin: async (request: Request) => {
        await requireTestRequest(request);
        const context = await sdk.authenticate.admin(request);
        if (!reviewConfig()) requireTestShop(context.session.shop);
        await verifyDevelopment(context.admin, context.session.shop);
        const path = new URL(request.url).pathname;
        if (
          !/^\/app\/review(?:\.data)?$/.test(path) &&
          !(await hasStoreAdmission(context.session.shop))
        ) {
          if (path.startsWith("/api/"))
            await requireStoreAdmission(context.session.shop);
          throw await context.redirect("/app/review");
        }
        return context;
      },
    },
    unauthenticated: {
      ...sdk.unauthenticated,
      admin: async (shop: string) => {
        await requireStoreAdmission(shop);
        const context = await sdk.unauthenticated.admin(shop);
        await verifyDevelopment(context.admin, shop);
        return context;
      },
    },
    login: async (request: Request) => {
      await requireTestRequest(request);
      return sdk.login(request);
    },
  };
}
