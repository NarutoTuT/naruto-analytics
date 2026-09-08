import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { login } from "../../shopify.server";

// Shopify-initiated authentication still delegates to the official SDK.
// A missing shop context must not prompt merchants to type a store domain.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (new URL(request.url).searchParams.get("shop")) await login(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await login(request);
  return null;
};

export default function Auth() {
  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 24 }}>
      <h1>Open Naruto Analytics from Shopify</h1>
      <p>Open Apps in your Shopify admin, then select Naruto Analytics to sign in.</p>
      <a href="https://admin.shopify.com/">Open Shopify admin</a>
    </main>
  );
}
