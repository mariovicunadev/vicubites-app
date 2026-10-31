-- CreateTable
CREATE TABLE "BulkJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "objectCount" INTEGER NOT NULL DEFAULT 0,
    "rootObjectCount" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "partialDataUrl" TEXT,
    "urlExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "BulkJob_operationId_key" ON "BulkJob"("operationId");

-- CreateIndex
CREATE INDEX "BulkJob_shop_createdAt_idx" ON "BulkJob"("shop", "createdAt");
