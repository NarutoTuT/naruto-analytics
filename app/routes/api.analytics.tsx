import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { requireSubscription } from "../lib/billing.server";
import {
  fetchAndComputeAnalytics,
  saveSnapshot,
} from "../lib/analytics.server";
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await requireSubscription(request, true);
  return Response.json(await fetchAndComputeAnalytics(admin));
}
export async function action({ request }: ActionFunctionArgs) {
  const { admin, shop } = await requireSubscription(request, true);
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const body = await request.json();
  if (body.action !== "sync")
    return Response.json({ error: "Invalid action" }, { status: 400 });
  return Response.json({
    success: true,
    data: await saveSnapshot(admin, shop.id),
  });
}
