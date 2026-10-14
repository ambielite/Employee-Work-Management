import {
  Module,
  Controller,
  Post,
  Get,
  Req,
  Body,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";

import { BreakMonitorService } from "./break-monitor.service";
import { PrismaService } from "../prisma.service";
import { JwtGuard } from "../common/auth";
import { EventType } from "@prisma/client";
import { dayKeyInTimeZone, sumIntervals } from "../common/time";

@Controller("breaks")
@UseGuards(JwtGuard)
export class BreaksController {
  constructor(private p: PrismaService) {}

  private async getContext(r: any) {
    const e = await this.p.employee.findUnique({
      where: { userId: r.user.id },
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

    if (!a.loginTime || a.logoutTime) {
      throw new ForbiddenException("Attendance is not active");
    }

    return { e, a };
  }

  @Post("start")
  async start(@Req() r: any, @Body() body: { breakTypeId?: string }) {
    const { e, a } = await this.getContext(r);

    const breakTypeId = String(body?.breakTypeId ?? "").trim();

    if (!breakTypeId) {
      throw new BadRequestException("Break type is required.");
    }

    const breakType = await this.p.breakType.findUnique({
      where: { id: breakTypeId },
    });

    if (!breakType) {
      throw new BadRequestException("Break type not found.");
    }

    if (!breakType.enabled) {
      throw new ForbiddenException("This break type is disabled.");
    }

    const activeBreak = await this.p.breakSession.findFirst({
      where: {
        employeeId: e.id,
        attendanceId: a.id,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
    });

    if (activeBreak) {
      throw new ForbiddenException("Break already active");
    }

    const now = new Date();

    const activeIdle = await this.p.idleSession.findFirst({
      where: {
        employeeId: e.id,
        attendanceId: a.id,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
    });

    if (activeIdle) {
      await this.p.idleSession.update({
        where: { id: activeIdle.id },
        data: { endedAt: now },
      });

      await this.p.workEvent.create({
        data: {
          employeeId: e.id,
          attendanceId: a.id,
          type: EventType.IDLE_END,
          occurredAt: now,
        },
      });
    }

    const br = await this.p.breakSession.create({
      data: {
        employeeId: e.id,
        attendanceId: a.id,
        breakTypeId,
        startedAt: now,
      },
    });

    await this.p.workEvent.create({
      data: {
        employeeId: e.id,
        attendanceId: a.id,
        type: EventType.BREAK_START,
        occurredAt: now,
      },
    });

    return br;
  }

  @Post("end")
  async end(@Req() r: any) {
    const { e, a } = await this.getContext(r);

    const activeBreak = await this.p.breakSession.findFirst({
      where: {
        employeeId: e.id,
        attendanceId: a.id,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
    });

    if (!activeBreak) {
      throw new ForbiddenException("No active break");
    }

    const now = new Date();

    const br = await this.p.breakSession.update({
      where: { id: activeBreak.id },
      data: { endedAt: now },
    });

    await this.p.workEvent.create({
      data: {
        employeeId: e.id,
        attendanceId: a.id,
        type: EventType.BREAK_END,
        occurredAt: now,
      },
    });

    const rows = await this.p.breakSession.findMany({
      where: {
        employeeId: e.id,
        attendanceId: a.id,
      },
    });

    const total = sumIntervals(rows);

    await this.p.attendance.update({
      where: { id: a.id },
      data: { breakMinutes: total },
    });

    return br;
  }

  @Get("today")
  async today(@Req() r: any) {
    const { e, a } = await this.getContext(r);

    const rows = await this.p.breakSession.findMany({
      where: {
        employeeId: e.id,
        attendanceId: a.id,
      },
      orderBy: { startedAt: "asc" },
      include: { breakType: true },
    });

    return {
      rows,
      totalMinutes: sumIntervals(rows),
    };
  }
}

@Module({
  controllers: [BreaksController],
  providers: [PrismaService, BreakMonitorService],
})
export class BreaksModule {}
