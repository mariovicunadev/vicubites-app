-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RefillReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "runOutOn" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'KLAVIYO',
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_RefillReminder" ("customerId", "error", "id", "runOutOn", "sentAt", "shop", "species", "status") SELECT "customerId", "error", "id", "runOutOn", "sentAt", "shop", "species", "status" FROM "RefillReminder";
DROP TABLE "RefillReminder";
ALTER TABLE "new_RefillReminder" RENAME TO "RefillReminder";
CREATE UNIQUE INDEX "RefillReminder_shop_customerId_species_runOutOn_channel_key" ON "RefillReminder"("shop", "customerId", "species", "runOutOn", "channel");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
