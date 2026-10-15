-- ============================================================
-- Employee Work Management
-- Migration: Reconcile existing schema + Phase 2 tracking
-- ============================================================

-- ------------------------------------------------------------
-- 1. Task.assignedById
-- ------------------------------------------------------------
-- Old migration had a foreign key from assignedById -> Employee.
-- Current schema keeps the column but no longer has that relation.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Task_assignedById_fkey'
    ) THEN
        ALTER TABLE "Task"
        DROP CONSTRAINT "Task_assignedById_fkey";
    END IF;
END $$;


-- ------------------------------------------------------------
-- 2. Task.assignedByUserId
-- ------------------------------------------------------------
ALTER TABLE "Task"
ADD COLUMN IF NOT EXISTS "assignedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Task_assignedByUserId_idx"
ON "Task"("assignedByUserId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'Task_assignedByUserId_fkey'
    ) THEN
        ALTER TABLE "Task"
        ADD CONSTRAINT "Task_assignedByUserId_fkey"
        FOREIGN KEY ("assignedByUserId")
        REFERENCES "User"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE;
    END IF;
END $$;


-- ------------------------------------------------------------
-- 3. User additional fields
-- ------------------------------------------------------------
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "fullName" TEXT;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "phone" TEXT;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "designation" TEXT;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "dateOfJoining" TIMESTAMP(3);


-- ------------------------------------------------------------
-- 4. Software master
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Software" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "processName" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Software_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Software_processName_key"
ON "Software"("processName");

CREATE INDEX IF NOT EXISTS "Software_enabled_idx"
ON "Software"("enabled");


-- ------------------------------------------------------------
-- 5. BreakType master
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "BreakType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "timeLimitMinutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreakType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BreakType_name_key"
ON "BreakType"("name");

CREATE INDEX IF NOT EXISTS "BreakType_enabled_idx"
ON "BreakType"("enabled");


-- ------------------------------------------------------------
-- 6. BreakSession.breakTypeId
-- ------------------------------------------------------------
ALTER TABLE "BreakSession"
ADD COLUMN IF NOT EXISTS "breakTypeId" TEXT;

-- Existing database currently has 0 BreakSession rows,
-- therefore we can safely make this required.
ALTER TABLE "BreakSession"
ALTER COLUMN "breakTypeId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "BreakSession_breakTypeId_idx"
ON "BreakSession"("breakTypeId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'BreakSession_breakTypeId_fkey'
    ) THEN
        ALTER TABLE "BreakSession"
        ADD CONSTRAINT "BreakSession_breakTypeId_fkey"
        FOREIGN KEY ("breakTypeId")
        REFERENCES "BreakType"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;


-- ------------------------------------------------------------
-- 7. ApplicationActivity
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ApplicationActivity" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "softwareId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ApplicationActivity_employeeId_startedAt_idx"
ON "ApplicationActivity"("employeeId", "startedAt");

CREATE INDEX IF NOT EXISTS "ApplicationActivity_attendanceId_startedAt_idx"
ON "ApplicationActivity"("attendanceId", "startedAt");

CREATE INDEX IF NOT EXISTS "ApplicationActivity_softwareId_startedAt_idx"
ON "ApplicationActivity"("softwareId", "startedAt");


-- ------------------------------------------------------------
-- 8. ApplicationActivity foreign keys
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ApplicationActivity_employeeId_fkey'
    ) THEN
        ALTER TABLE "ApplicationActivity"
        ADD CONSTRAINT "ApplicationActivity_employeeId_fkey"
        FOREIGN KEY ("employeeId")
        REFERENCES "Employee"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ApplicationActivity_attendanceId_fkey'
    ) THEN
        ALTER TABLE "ApplicationActivity"
        ADD CONSTRAINT "ApplicationActivity_attendanceId_fkey"
        FOREIGN KEY ("attendanceId")
        REFERENCES "Attendance"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ApplicationActivity_softwareId_fkey'
    ) THEN
        ALTER TABLE "ApplicationActivity"
        ADD CONSTRAINT "ApplicationActivity_softwareId_fkey"
        FOREIGN KEY ("softwareId")
        REFERENCES "Software"("id")
        ON DELETE RESTRICT
        ON UPDATE CASCADE;
    END IF;
END $$;