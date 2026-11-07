-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "objectCount" INTEGER NOT NULL DEFAULT 0,
    "rootObjectCount" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "partialDataUrl" TEXT,
    "urlExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "BulkJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductHealth" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "results" TEXT NOT NULL,
    "auditJobId" TEXT NOT NULL,
    "auditedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixRun" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "jobId" TEXT,
    "results" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefillPurchase" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "kcal" DOUBLE PRECISION NOT NULL,
    "variantId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefillPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefillForecast" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "daysOfFood" INTEGER NOT NULL,
    "lastOrderOn" TEXT NOT NULL,
    "runOutOn" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefillForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefillEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT,
    "bucket" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefillEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefillReminder" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "runOutOn" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'KLAVIYO',
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefillReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSyncRecord" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "hubspotId" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmSyncRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BulkJob_operationId_key" ON "BulkJob"("operationId");

-- CreateIndex
CREATE INDEX "BulkJob_shop_kind_createdAt_idx" ON "BulkJob"("shop", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ProductHealth_shop_score_idx" ON "ProductHealth"("shop", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ProductHealth_shop_productId_key" ON "ProductHealth"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "FixRun_jobId_key" ON "FixRun"("jobId");

-- CreateIndex
CREATE INDEX "FixRun_shop_createdAt_idx" ON "FixRun"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "RefillPurchase_shop_customerId_idx" ON "RefillPurchase"("shop", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RefillPurchase_shop_orderId_species_key" ON "RefillPurchase"("shop", "orderId", "species");

-- CreateIndex
CREATE INDEX "RefillForecast_shop_runOutOn_idx" ON "RefillForecast"("shop", "runOutOn");

-- CreateIndex
CREATE UNIQUE INDEX "RefillForecast_shop_customerId_species_key" ON "RefillForecast"("shop", "customerId", "species");

-- CreateIndex
CREATE INDEX "RefillEvent_shop_createdAt_idx" ON "RefillEvent"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefillReminder_shop_customerId_species_runOutOn_channel_key" ON "RefillReminder"("shop", "customerId", "species", "runOutOn", "channel");

-- CreateIndex
CREATE INDEX "CrmSyncRecord_shop_syncedAt_idx" ON "CrmSyncRecord"("shop", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSyncRecord_shop_objectType_shopifyId_key" ON "CrmSyncRecord"("shop", "objectType", "shopifyId");

-- AddForeignKey
ALTER TABLE "FixRun" ADD CONSTRAINT "FixRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BulkJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
