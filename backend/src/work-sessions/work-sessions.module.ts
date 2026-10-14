import {
  Module,
  Controller,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";

import { PrismaService } from "../prisma.service";

import { JwtGuard } from "../common/auth";

import { dayKeyInTimeZone } from "../common/time";

@Controller("work-sessions")
@UseGuards(JwtGuard)
export class WorkSessionsController {
  constructor(private p: PrismaService) {}

  /**
   * Get the currently logged-in employee
   * and today's attendance.
   *
   * Attendance date is determined using the
   * company-configured timezone.
   */
  private async context(r: any) {
    const e = await this.p.employee.findUnique({
      where: {
        userId: r.user.id,
      },
    });

    if (!e) {
      throw new ForbiddenException();
    }

    const s = await this.p.companySetting.findFirst();

    const timeZone = s?.timezone || "Asia/Kolkata";

    const date = dayKeyInTimeZone(new Date(), timeZone);

    const a = await this.p.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: e.id,
          date,
        },
      },
    });

    if (!a) {
      throw new ForbiddenException("Check in first");
    }

    return {
      e,
      a,
    };
  }

  /**
   * Start a work session.
   *
   * The employee must already be checked in.
   *
   * If an active work session already exists,
   * return that session instead of creating
   * another one.
   */
  @Post("start")
  async start(@Req() r: any) {
    const { e, a } = await this.context(r);

    /**
     * Attendance must be active.
     */
    if (!a.loginTime || a.logoutTime) {
      throw new ForbiddenException("Check in first");
    }

    /**
     * Check whether a work session is already open
     * for THIS attendance record.
     */
    const open = await this.p.workSession.findFirst({
      where: {
        employeeId: e.id,

        attendanceId: a.id,

        endedAt: null,
      },
    });

    /**
     * Do not create duplicate sessions.
     */
    if (open) {
      return open;
    }

    /**
     * Start a new work session.
     */
    return this.p.workSession.create({
      data: {
        employeeId: e.id,

        attendanceId: a.id,

        startedAt: new Date(),
      },
    });
  }

  /**
   * End the current work session.
   */
  @Post("end")
  async end(@Req() r: any) {
    const { e, a } = await this.context(r);

    /**
     * Attendance has already been checked out.
     * Do not create/modify another session.
     */
    if (a.logoutTime) {
      throw new ForbiddenException("Attendance is already checked out");
    }

    /**
     * End only the open session belonging
     * to the current attendance record.
     */
    return this.p.workSession.updateMany({
      where: {
        employeeId: e.id,

        attendanceId: a.id,

        endedAt: null,
      },

      data: {
        endedAt: new Date(),
      },
    });
  }
}

@Module({
  controllers: [WorkSessionsController],

  providers: [PrismaService],
})
export class WorkSessionsModule {}
