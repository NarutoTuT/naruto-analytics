import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { requireInternal } from "../lib/internal-auth.server";
import prisma from "../db.server";
import { TEST_SHOPS } from "../lib/test-store-policy.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  requireInternal(request, "INTERNAL_ADMIN_SECRET");
  const allowed = await prisma.shop.findMany({
    where: { myshopifyDomain: { in: [...TEST_SHOPS] } },
    select: { id: true },
  });
  // Restrict internal reporting before reading events.
  const events = await prisma.analyticsEvent.findMany({
    where: {
      shopId: { in: allowed.map((shop) => shop.id) },
      event: { in: ["app_open", "feedback"] },
    },
    orderBy: { createdAt: "desc" },
  });

  // Group by shop and compute metrics
  const shopMap = new Map<
    string,
    { visitDays: Set<string>; useful: boolean }
  >();

  for (const e of events) {
    if (!shopMap.has(e.shopId)) {
      shopMap.set(e.shopId, { visitDays: new Set(), useful: false });
    }
    const s = shopMap.get(e.shopId)!;
    if (e.event === "app_open") {
      s.visitDays.add(e.createdAt.toISOString().slice(0, 10));
    }
    if (e.event === "feedback" && e.data) {
      try {
        const d = JSON.parse(e.data);
        if (d.useful) s.useful = true;
      } catch {
        /* ignore malformed data */
      }
    }
  }

  // Filter: >= 5 visit days + at least one useful feedback
  const candidates = Array.from(shopMap.entries())
    .filter(([, s]) => s.visitDays.size >= 5 && s.useful)
    .map(([shopId, s]) => ({
      shopId,
      visitDays: s.visitDays.size,
    }))
    .sort((a, b) => b.visitDays - a.visitDays);

  // Enrich candidate info from Shop table
  const enriched = await Promise.all(
    candidates.map(async (c) => {
      const shop = await prisma.shop.findUnique({ where: { id: c.shopId } });
      return {
        ...c,
        shopName: shop?.name || null,
        shopEmail: shop?.email || null,
        shopDomain: shop?.myshopifyDomain || null,
      };
    }),
  );

  return data({
    candidates: enriched,
    total: enriched.length,
  });
};
