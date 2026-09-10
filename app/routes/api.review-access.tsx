import type { ActionFunctionArgs } from "react-router";
import { requireInternal } from "../lib/internal-auth.server";
import { revokeReviewShop } from "../lib/review-admission.server";
export async function action({ request }: ActionFunctionArgs) {
  requireInternal(request, "INTERNAL_ADMIN_SECRET");
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const body = await request.json();
  await revokeReviewShop(body.shop);
  return Response.json(
    { revoked: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
