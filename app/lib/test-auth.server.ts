import {
  requireTestRequest,
  requireTestShop,
  requireDevelopmentShop,
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
  requireDevelopmentShop(body.data.shop);
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
        requireTestShop(context.session.shop);
        await verifyDevelopment(context.admin, context.session.shop);
        return context;
      },
    },
    unauthenticated: {
      ...sdk.unauthenticated,
      admin: async (shop: string) => {
        requireTestShop(shop);
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
