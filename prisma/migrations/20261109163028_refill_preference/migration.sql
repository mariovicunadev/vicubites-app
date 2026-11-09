-- CreateTable
CREATE TABLE "RefillPreference" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "reminders" BOOLEAN NOT NULL,
    "orderId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefillPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefillPreference_shop_customerId_key" ON "RefillPreference"("shop", "customerId");
