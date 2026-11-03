-- CreateTable
CREATE TABLE "RefillEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT,
    "bucket" TEXT,
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RefillReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "runOutOn" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "RefillEvent_shop_createdAt_idx" ON "RefillEvent"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefillReminder_shop_customerId_species_runOutOn_key" ON "RefillReminder"("shop", "customerId", "species", "runOutOn");
