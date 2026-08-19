import prisma from "../db.server";

export async function getPreferences(shopId: string) {
  return prisma.notificationPreference.findUnique({
    where: { shopId },
  });
}

export async function upsertPreferences(
  shopId: string,
  data: { email: string; dailyBrief?: boolean; deliveryTime?: string; timezone?: string }
) {
  return prisma.notificationPreference.upsert({
    where: { shopId },
    create: { shopId, ...data },
    update: data,
  });
}

export async function getAllActivePreferences() {
  return prisma.notificationPreference.findMany({
    where: { dailyBrief: true },
  });
}

export async function updateLastDailyAt(shopId: string) {
  return prisma.notificationPreference.update({
    where: { shopId },
    data: { lastDailyAt: new Date() },
  });
}
