-- CreateTable: PlatformSettings (singleton for platform-wide configuration)
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "paywallEnforced" BOOLEAN NOT NULL DEFAULT true,
    "paywallBypassUntil" TIMESTAMP(3),
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Unique key for singleton pattern
CREATE UNIQUE INDEX "PlatformSettings_key_key" ON "PlatformSettings"("key");
