import {
  Controller,
  Post,
  Get,
  Req,
  Body,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";

import { PrismaService } from "../prisma.service";
import { JwtGuard } from "../common/auth";
import { EventType } from "@prisma/client";
import { dayKeyInTimeZone, sumIntervals } from "../common/time";
import { IsBoolean } from "class-validator";

class HeartbeatDto {
  @IsBoolean()
  active!: boolean;
}

@Controller("idle")
@UseGuards(JwtGuard)
export class IdleController {
  constructor(private readonly p: PrismaService) {}

  private async ctx(r: any) {
    const employee = await this.p.employee.findUnique({
      where: { userId: r.user.id },
    });

    if (!employee) {
      throw new ForbiddenException("Employee not found");
    }

    const settings = await this.p.companySetting.findFirst();
    const timeZone = settings?.timezone || "Asia/Kolkata";
    const date = dayKeyInTimeZone(new Date(), timeZone);

    const attendance = await this.p.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date,
        },
      },
    });

    if (!attendance) {
      throw new ForbiddenException("Check in first");
    }

    if (!attendance.loginTime || attendance.logoutTime) {
      throw new ForbiddenException("Attendance is not active");
    }

    return { employee, attendance };
  }

  private async closeOpenIdle(employeeId: string, attendanceId: string) {
    const now = new Date();

    const openSessions = await this.p.idleSession.findMany({
      where: {
        employeeId,
        attendanceId,
        endedAt: null,
      },
      select: { id: true },
    });

    if (openSessions.length === 0) {
      return;
    }

    await this.p.$transaction(async (tx) => {
      await tx.idleSession.updateMany({
        where: {
          id: { in: openSessions.map((session) => session.id) },
          endedAt: null,
        },
        data: { endedAt: now },
      });

      await tx.workEvent.create({
        data: {
          employeeId,
          attendanceId,
          type: EventType.IDLE_END,
          occurredAt: now,
        },
      });
    });
  }

  @Post("heartbeat")
  async heartbeat(@Req() r: any, @Body() body: HeartbeatDto) {
    const { employee, attendance } = await this.ctx(r);

    // Never count idle time while an employee is on break.
    const activeBreak = await this.p.breakSession.findFirst({
      where: {
        employeeId: employee.id,
        attendanceId: attendance.id,
        endedAt: null,
      },
      select: { id: true },
    });

    if (activeBreak) {
      await this.closeOpenIdle(employee.id, attendance.id);
      return { status: "ON_BREAK" };
    }

    const openIdle = await this.p.idleSession.findFirst({
      where: {
        employeeId: employee.id,
        attendanceId: attendance.id,
        endedAt: null,
      },
    });

    if (body.active) {
      await this.closeOpenIdle(employee.id, attendance.id);
      return { status: "ACTIVE" };
    }

    if (openIdle) {
      return { status: "IDLE" };
    }

    const now = new Date();

    await this.p.$transaction(async (tx) => {
      await tx.idleSession.create({
        data: {
          employeeId: employee.id,
          attendanceId: attendance.id,
          startedAt: now,
        },
      });

      await tx.workEvent.create({
        data: {
          employeeId: employee.id,
          attendanceId: attendance.id,
          type: EventType.IDLE_START,
          occurredAt: now,
        },
      });
    });

    return { status: "IDLE" };
  }

  @Get("today")
  async today(@Req() r: any) {
    const { employee, attendance } = await this.ctx(r);

    const rows = await this.p.idleSession.findMany({
      where: {
        employeeId: employee.id,
        attendanceId: attendance.id,
      },
      orderBy: { startedAt: "asc" },
    });

    return {
      rows,
      totalMinutes: sumIntervals(rows),
    };
  }
}
