CREATE TABLE "LegalAcceptance" (
 "id" TEXT NOT NULL, "shopDomain" TEXT NOT NULL, "version" TEXT NOT NULL,
 "documentHash" TEXT NOT NULL, "actorUserId" TEXT NOT NULL,
 "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" TIMESTAMP(3),
 CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LegalAcceptance_shopDomain_version_key" ON "LegalAcceptance"("shopDomain", "version");
