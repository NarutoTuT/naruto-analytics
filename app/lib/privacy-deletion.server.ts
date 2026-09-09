import type { PrismaClient } from "@prisma/client";
// Also used after an isolated restore, before reopening processing.
export async function eraseShopData(db: PrismaClient, shopDomain: string) {
  const record = await db.shop.findUnique({
    where: { myshopifyDomain: shopDomain },
  });
  await db.$transaction([
    db.session.deleteMany({ where: { shop: shopDomain } }),
    db.legalAcceptance.deleteMany({ where: { shopDomain } }),
    // Keep unresolved request records for follow-up; erasure is not fulfillment.
    db.privacyRequest.deleteMany({
      where: { shopDomain, fulfilledAt: { not: null } },
    }),
    ...(record
      ? [
          db.briefDelivery.deleteMany({ where: { shopId: record.id } }),
          db.analyticsEvent.deleteMany({ where: { shopId: record.id } }),
          db.notificationPreference.deleteMany({
            where: { shopId: record.id },
          }),
          db.analyticsReport.deleteMany({ where: { shopId: record.id } }),
          db.analyticsSnapshot.deleteMany({ where: { shopId: record.id } }),
          db.orderSnapshot.deleteMany({ where: { shopId: record.id } }),
          db.productSnapshot.deleteMany({ where: { shopId: record.id } }),
          db.shop.delete({ where: { id: record.id } }),
        ]
      : []),
  ]);
}
