-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('ONLINE', 'OFFLINE', 'ACTIVE', 'RESERVED', 'ERROR', 'LOCKED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FINISHED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "TariffType" AS ENUM ('HOURLY', 'PACKAGE', 'NIGHT', 'BONUS');

-- CreateEnum
CREATE TYPE "OperatorLogType" AS ENUM ('TOP_UP', 'SESSION_START', 'SESSION_EXTEND', 'SESSION_STOP', 'LOCK', 'UNLOCK', 'REBOOT');

-- CreateTable
CREATE TABLE "Computer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "status" "MachineStatus" NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "zone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Computer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonusMinutes" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TariffType" NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "startHour" INTEGER,
    "endHour" INTEGER,
    "zone" TEXT,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "computerId" TEXT NOT NULL,
    "accountId" TEXT,
    "tariffId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "localRevision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorLog" (
    "id" TEXT NOT NULL,
    "type" "OperatorLogType" NOT NULL,
    "operatorId" TEXT,
    "accountId" TEXT,
    "sessionId" TEXT,
    "amount" DECIMAL(12,2),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "bonusPercent" INTEGER,
    "bonusMinutes" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientEvent" (
    "id" TEXT NOT NULL,
    "computerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "syncState" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HardwareSnapshot" (
    "id" TEXT NOT NULL,
    "computerId" TEXT NOT NULL,
    "cpuUsage" DOUBLE PRECISION,
    "cpuTemp" DOUBLE PRECISION,
    "gpuTemp" DOUBLE PRECISION,
    "ramUsage" DOUBLE PRECISION,
    "diskUsage" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HardwareSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "maxComputers" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Computer_status_idx" ON "Computer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Computer_ip_key" ON "Computer"("ip");

-- CreateIndex
CREATE UNIQUE INDEX "Computer_mac_key" ON "Computer"("mac");

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- CreateIndex
CREATE INDEX "Tariff_type_idx" ON "Tariff"("type");

-- CreateIndex
CREATE INDEX "Tariff_zone_idx" ON "Tariff"("zone");

-- CreateIndex
CREATE INDEX "Session_computerId_idx" ON "Session"("computerId");

-- CreateIndex
CREATE INDEX "Session_accountId_idx" ON "Session"("accountId");

-- CreateIndex
CREATE INDEX "Session_tariffId_idx" ON "Session"("tariffId");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "Session_startedAt_idx" ON "Session"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_username_key" ON "Operator"("username");

-- CreateIndex
CREATE INDEX "Operator_role_idx" ON "Operator"("role");

-- CreateIndex
CREATE INDEX "OperatorLog_type_idx" ON "OperatorLog"("type");

-- CreateIndex
CREATE INDEX "OperatorLog_operatorId_idx" ON "OperatorLog"("operatorId");

-- CreateIndex
CREATE INDEX "OperatorLog_accountId_idx" ON "OperatorLog"("accountId");

-- CreateIndex
CREATE INDEX "OperatorLog_sessionId_idx" ON "OperatorLog"("sessionId");

-- CreateIndex
CREATE INDEX "OperatorLog_createdAt_idx" ON "OperatorLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "ClientEvent_computerId_idx" ON "ClientEvent"("computerId");

-- CreateIndex
CREATE INDEX "ClientEvent_type_idx" ON "ClientEvent"("type");

-- CreateIndex
CREATE INDEX "ClientEvent_createdAt_idx" ON "ClientEvent"("createdAt");

-- CreateIndex
CREATE INDEX "HardwareSnapshot_computerId_idx" ON "HardwareSnapshot"("computerId");

-- CreateIndex
CREATE INDEX "HardwareSnapshot_createdAt_idx" ON "HardwareSnapshot"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_computerId_fkey" FOREIGN KEY ("computerId") REFERENCES "Computer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLog" ADD CONSTRAINT "OperatorLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLog" ADD CONSTRAINT "OperatorLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorLog" ADD CONSTRAINT "OperatorLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientEvent" ADD CONSTRAINT "ClientEvent_computerId_fkey" FOREIGN KEY ("computerId") REFERENCES "Computer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HardwareSnapshot" ADD CONSTRAINT "HardwareSnapshot_computerId_fkey" FOREIGN KEY ("computerId") REFERENCES "Computer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
