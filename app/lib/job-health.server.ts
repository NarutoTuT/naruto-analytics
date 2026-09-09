import type { PrismaClient } from '@prisma/client';
export async function recordJobSuccess(db: PrismaClient, now = new Date()) {
 await db.analyticsEvent.upsert({where:{dedupeKey:'ops:daily-brief'},
 create:{shopId:'__naruto_ops__',event:'ops_heartbeat',dedupeKey:'ops:daily-brief',createdAt:now},
 update:{createdAt:now}});
}
