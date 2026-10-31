-- DropIndex
DROP INDEX "BulkJob_shop_createdAt_idx";

-- AlterTable
ALTER TABLE "BulkJob" ADD COLUMN "processedAt" DATETIME;

-- CreateTable
CREATE TABLE "ProductHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "results" TEXT NOT NULL,
    "auditJobId" TEXT NOT NULL,
    "auditedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ProductHealth_shop_score_idx" ON "ProductHealth"("shop", "score");

-- CreateIndex
CREATE UNIQUE INDEX "ProductHealth_shop_productId_key" ON "ProductHealth"("shop", "productId");

-- CreateIndex
CREATE INDEX "BulkJob_shop_kind_createdAt_idx" ON "BulkJob"("shop", "kind", "createdAt");
