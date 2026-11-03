-- CreateTable
CREATE TABLE "RefillPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "kcal" REAL NOT NULL,
    "processedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RefillForecast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "daysOfFood" INTEGER NOT NULL,
    "lastOrderOn" TEXT NOT NULL,
    "runOutOn" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "RefillPurchase_shop_customerId_idx" ON "RefillPurchase"("shop", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RefillPurchase_shop_orderId_species_key" ON "RefillPurchase"("shop", "orderId", "species");

-- CreateIndex
CREATE INDEX "RefillForecast_shop_runOutOn_idx" ON "RefillForecast"("shop", "runOutOn");

-- CreateIndex
CREATE UNIQUE INDEX "RefillForecast_shop_customerId_species_key" ON "RefillForecast"("shop", "customerId", "species");
