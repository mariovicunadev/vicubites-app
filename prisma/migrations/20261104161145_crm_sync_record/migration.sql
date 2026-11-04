-- CreateTable
CREATE TABLE "CrmSyncRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "hubspotId" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CrmSyncRecord_shop_syncedAt_idx" ON "CrmSyncRecord"("shop", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSyncRecord_shop_objectType_shopifyId_key" ON "CrmSyncRecord"("shop", "objectType", "shopifyId");
