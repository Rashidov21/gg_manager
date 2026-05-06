-- AlterTable
ALTER TABLE "Computer" ADD COLUMN     "warnCpuTemp" INTEGER,
ADD COLUMN     "warnDiskUsage" INTEGER,
ADD COLUMN     "warnGpuTemp" INTEGER,
ADD COLUMN     "warnRamUsage" INTEGER;
