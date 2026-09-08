-- AlterTable
ALTER TABLE "NotificationPreference" ALTER COLUMN "dailyBrief" SET DEFAULT false;

-- AlterTable
ALTER TABLE "AnalyticsEvent" ADD COLUMN     "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "customerId" TEXT,
    "orderIdsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" TIMESTAMP(3),

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefDelivery" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "BriefDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivacyRequest_shopDomain_idx" ON "PrivacyRequest"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "BriefDelivery_shopId_date_key" ON "BriefDelivery"("shopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_dedupeKey_key" ON "AnalyticsEvent"("dedupeKey");

