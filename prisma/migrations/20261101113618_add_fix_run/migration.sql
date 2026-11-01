-- CreateTable
CREATE TABLE "FixRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "jobId" TEXT,
    "results" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FixRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BulkJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FixRun_jobId_key" ON "FixRun"("jobId");

-- CreateIndex
CREATE INDEX "FixRun_shop_createdAt_idx" ON "FixRun"("shop", "createdAt");
