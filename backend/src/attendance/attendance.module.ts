import {
  Module,
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";

import { PrismaService } from "../prisma.service";

import { JwtGuard, Roles, RolesGuard } from "../common/auth";

import { WorkMode, AttendanceStatus, EventType, Role } from "@prisma/client";

import {
  dayKeyInTimeZone,
  atTimeInTimeZone,
  weekdayInTimeZone,
  sumIntervals,
  mins,
} from "../common/time";

import { IsEnum } from "class-validator";

class CheckInDto {
  @IsEnum(WorkMode)
  workMode!: WorkMode;
}

@Controller("attendance")
@UseGuards(JwtGuard, RolesGuard)
export class AttendanceController {
  constructor(private p: PrismaService) {}

  /**
   * Get company settings.
   */
  private settings() {
    return this.p.companySetting.findFirst();
  }

  /**
   * Get employee belonging to the logged-in user.
   */
  private emp(r: any) {
    return this.p.employee.findUnique({
      where: {
        userId: r.user.id,
      },
    });
  }

  /**
   * Recalculate attendance values.
   *
   * Core calculation:
   *
   * Logged In Time
   *      ↓
   * - Break Time
   * - Idle Time
   *      ↓
   * Active Working Time
   *
   * Shortage = Required - Active
   * Overtime = Active - Required
   */
  private async recalc(attId: string) {
    const a = await this.p.attendance.findUnique({
      where: {
        id: attId,
      },
      include: {
        workSessions: true,
        breaks: true,
        idleSessions: true,
      },
    });

    if (!a) {
      return;
    }

    const now = new Date();

    const logged = a.loginTime
      ? mins((a.logoutTime ?? now).getTime() - a.loginTime.getTime())
      : 0;

    const br = sumIntervals(a.breaks, now);

    const idle = sumIntervals(a.idleSessions, now);

    const active = Math.max(0, logged - br - idle);

    /**
     * Calculate total task timer minutes
     * belonging to this attendance period.
     */
    const taskRows = await this.p.taskTimerSession.findMany({
      where: {
        employeeId: a.employeeId,
        startedAt: {
          gte: a.loginTime ?? a.createdAt,

          lte: a.logoutTime ?? now,
        },
      },
    });

    const task = taskRows.reduce(
      (total, session) =>
        total +
        mins((session.endedAt ?? now).getTime() - session.startedAt.getTime()),
      0,
    );

    const shortage = Math.max(0, a.requiredMinutes - active);

    const overtime = Math.max(0, active - a.requiredMinutes);

    /**
     * Preserve existing attendance status behavior.
     */
    const status = !a.loginTime
      ? "INCOMPLETE"
      : a.logoutTime
        ? shortage > 0
          ? active > 0
            ? "PRESENT_WITH_INSUFFICIENT_HOURS"
            : "EARLY_LOGOUT"
          : a.status
        : a.status;

    return this.p.attendance.update({
      where: {
        id: attId,
      },
      data: {
        loggedInMinutes: logged,
        breakMinutes: br,
        idleMinutes: idle,
        activeMinutes: active,
        taskMinutes: task,
        shortageMinutes: shortage,
        overtimeMinutes: overtime,
        status: status as AttendanceStatus,
      },
    });
  }

  /**
   * Employee check-in.
   *
   * Step 1 requirements:
   *
   * 1. Employee must exist.
   * 2. Work mode must be allowed.
   * 3. Current company-local weekday must be a working day.
   * 4. Attendance date must use company timezone.
   * 5. Scheduled start/end must use company timezone.
   * 6. Grace period determines LATE status.
   * 7. End time does NOT automatically force checkout.
   */
  @Post("check-in")
  async checkIn(@Req() r: any, @Body() b: CheckInDto) {
    const e = await this.emp(r);

    if (!e) {
      throw new ForbiddenException();
    }

    const s = await this.settings();

    /**
     * Company timezone.
     *
     * Database/default setting is Asia/Kolkata.
     */
    const timeZone = s?.timezone || "Asia/Kolkata";

    const now = new Date();

    /**
     * --------------------------------------------------
     * 1. WORKING DAY VALIDATION
     * --------------------------------------------------
     *
     * Example:
     *
     * Settings:
     * Monday-Friday
     *
     * Saturday:
     * check-in rejected.
     */
    const workingDays = Array.isArray(s?.workingDays)
      ? s.workingDays.map(String)
      : [];

    const todayName = weekdayInTimeZone(now, timeZone);

    if (!workingDays.includes(todayName)) {
      throw new ForbiddenException(
        `${todayName} is a weekly off. Check-in is not allowed today.`,
      );
    }

    /**
     * --------------------------------------------------
     * 2. WORK MODE VALIDATION
     * --------------------------------------------------
     */
    if (b.workMode === "WFH" && !s?.allowWFH) {
      throw new ForbiddenException("Selected work mode is disabled");
    }

    if (b.workMode === "WFO" && !s?.allowWFO) {
      throw new ForbiddenException("Selected work mode is disabled");
    }

    /**
     * --------------------------------------------------
     * 3. COMPANY-LOCAL ATTENDANCE DATE
     * --------------------------------------------------
     *
     * Important:
     * This no longer depends on the backend
     * server's local timezone.
     */
    const d = dayKeyInTimeZone(now, timeZone);

    const existing = await this.p.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: e.id,
          date: d,
        },
      },
    });

    /**
     * Do not allow duplicate check-in.
     */
    if (existing?.loginTime) {
      throw new ForbiddenException("Already checked in today");
    }

    /**
     * --------------------------------------------------
     * 4. WORKING HOURS
     * --------------------------------------------------
     */
    const start = atTimeInTimeZone(now, s?.startTime || "09:30", timeZone);

    const end = atTimeInTimeZone(now, s?.endTime || "18:30", timeZone);

    /**
     * Prevent invalid company configuration.
     *
     * Example:
     *
     * Start = 18:30
     * End   = 09:30
     *
     * This is not treated as an overnight
     * working shift in this Step 1 implementation.
     */
    if (end.getTime() <= start.getTime()) {
      throw new ForbiddenException(
        "Company working hours are invalid. End time must be after start time.",
      );
    }

    /**
     * --------------------------------------------------
     * 5. GRACE PERIOD / LATE STATUS
     * --------------------------------------------------
     */
    const graceMinutes = Math.max(0, Number(s?.gracePeriodMinutes ?? 10));

    const late = now.getTime() > start.getTime() + graceMinutes * 60000;

    /**
     * --------------------------------------------------
     * 6. REQUIRED WORKING MINUTES
     * --------------------------------------------------
     */
    const requiredMinutes = Math.max(1, Number(s?.requiredMinutes ?? 480));

    /**
     * --------------------------------------------------
     * 7. CREATE / RESTORE ATTENDANCE
     * --------------------------------------------------
     *
     * If an incomplete attendance row already exists,
     * restore it with today's current company schedule.
     */
    const a = existing
      ? await this.p.attendance.update({
          where: {
            id: existing.id,
          },

          data: {
            workMode: b.workMode,

            scheduledStart: start,

            scheduledEnd: end,

            requiredMinutes,

            loginTime: now,

            status: late ? "LATE" : "PRESENT",
          },
        })
      : await this.p.attendance.create({
          data: {
            employeeId: e.id,

            date: d,

            workMode: b.workMode,

            scheduledStart: start,

            scheduledEnd: end,

            loginTime: now,

            requiredMinutes,

            status: late ? "LATE" : "PRESENT",
          },
        });

    /**
     * --------------------------------------------------
     * 8. START WORK SESSION
     * --------------------------------------------------
     */
    await this.p.workSession.create({
      data: {
        employeeId: e.id,

        attendanceId: a.id,

        startedAt: now,
      },
    });

    /**
     * --------------------------------------------------
     * 9. LOGIN EVENT
     * --------------------------------------------------
     */
    await this.p.workEvent.create({
      data: {
        employeeId: e.id,

        attendanceId: a.id,

        type: EventType.LOGIN,

        occurredAt: now,
      },
    });

    /**
     * --------------------------------------------------
     * 10. RECALCULATE
     * --------------------------------------------------
     */
    return this.recalc(a.id);
  }

  /**
   * Employee check-out.
   *
   * End time does NOT force checkout.
   * Employee can work beyond scheduledEnd and
   * the additional active time can become overtime.
   */
  @Post("check-out")
  async checkOut(@Req() r: any) {
    const e = await this.emp(r);

    if (!e) {
      throw new ForbiddenException();
    }

    const s = await this.settings();

    const timeZone = s?.timezone || "Asia/Kolkata";

    const d = dayKeyInTimeZone(new Date(), timeZone);

    const a = await this.p.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: e.id,
          date: d,
        },
      },
    });

    if (!a?.loginTime || a.logoutTime) {
      throw new ForbiddenException("No active attendance");
    }

    /**
     * Employee cannot check out
     * while a task timer is running.
     */
    const activeTask = await this.p.taskTimerSession.findFirst({
      where: {
        employeeId: e.id,
        endedAt: null,
      },
    });

    if (activeTask) {
      throw new ForbiddenException(
        "Please complete or stop the active task before checking out.",
      );
    }

    /**
     * Employee cannot check out
     * while a break is running.
     */
    const activeBreak = await this.p.breakSession.findFirst({
      where: {
        employeeId: e.id,
        attendanceId: a.id,
        endedAt: null,
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    if (activeBreak) {
      throw new ForbiddenException(
        "Please end your active break before checking out.",
      );
    }

    const now = new Date();

    /**
     * Close open work sessions.
     */
    await this.p.workSession.updateMany({
      where: {
        employeeId: e.id,
        attendanceId: a.id,
        endedAt: null,
      },

      data: {
        endedAt: now,
      },
    });

    /**
     * Close open idle sessions.
     */
    await this.p.idleSession.updateMany({
      where: {
        employeeId: e.id,
        attendanceId: a.id,
        endedAt: null,
      },

      data: {
        endedAt: now,
      },
    });

    /**
     * Create logout event.
     */
    await this.p.workEvent.create({
      data: {
        employeeId: e.id,

        attendanceId: a.id,

        type: EventType.LOGOUT,

        occurredAt: now,
      },
    });

    /**
     * Set logout time.
     */
    await this.p.attendance.update({
      where: {
        id: a.id,
      },

      data: {
        logoutTime: now,

        status: "PRESENT",
      },
    });

    /**
     * Final recalculation.
     */
    return this.recalc(a.id);
  }

  /**
   * Get today's attendance.
   */
  @Get("today")
  async today(@Req() r: any) {
    const e = await this.emp(r);

    if (!e) {
      return null;
    }

    const s = await this.settings();

    const timeZone = s?.timezone || "Asia/Kolkata";

    const d = dayKeyInTimeZone(new Date(), timeZone);

    const a = await this.p.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: e.id,

          date: d,
        },
      },

      include: {
        employee: {
          select: {
            fullName: true,
          },
        },

        workSessions: true,

        breaks: true,

        idleSessions: true,

        workEvents: {
          orderBy: {
            occurredAt: "asc",
          },
        },
      },
    });

    if (!a) return null;

    // Refresh today's schedule and required minutes so a same-day admin
    // schedule edit also updates the employee and manager dashboard cards.
    const startTime = s?.startTime || "09:30";
    const endTime = s?.endTime || "18:30";
    const start = atTimeInTimeZone(new Date(), startTime, timeZone);
    const end = atTimeInTimeZone(new Date(), endTime, timeZone);
    const requiredMinutes = Math.max(1, Number(s?.requiredMinutes ?? 480));

    if (
      a.scheduledStart.getTime() !== start.getTime() ||
      a.scheduledEnd.getTime() !== end.getTime() ||
      a.requiredMinutes !== requiredMinutes
    ) {
      await this.p.attendance.update({
        where: { id: a.id },
        data: { scheduledStart: start, scheduledEnd: end, requiredMinutes },
      });
    }

    return this.recalc(a.id);
  }

  /**
   * Employee attendance history.
   */
  @Get("history")
  async history(@Req() r: any) {
    const e = await this.emp(r);

    if (!e) {
      return [];
    }

    return this.p.attendance.findMany({
      where: {
        employeeId: e.id,
      },

      orderBy: {
        date: "desc",
      },

      take: 100,
    });
  }

  /**
   * Company attendance.
   *
   * ADMIN:
   * sees all attendance.
   *
   * MANAGER:
   * sees direct-report attendance.
   */
  @Get("company")
  @Roles(Role.ADMIN, Role.MANAGER)
  async company(@Req() r: any) {
    const me = await this.emp(r);

    return this.p.attendance.findMany({
      where:
        r.user.role === "MANAGER"
          ? {
              employee: {
                managerId: me?.id,
              },
            }
          : {},

      orderBy: {
        date: "desc",
      },

      take: 500,

      include: {
        employee: {
          select: {
            employeeId: true,

            fullName: true,

            department: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  }
}

@Module({
  controllers: [AttendanceController],

  providers: [PrismaService],
})
export class AttendanceModule {}
