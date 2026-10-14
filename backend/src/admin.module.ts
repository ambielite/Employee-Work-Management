import {
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  Res,
  UseGuards,
  Param,
  ForbiddenException,
  Delete,
  BadRequestException,
} from "@nestjs/common";

import { PrismaService } from "./prisma.service";

import { JwtGuard, Roles, RolesGuard } from "./common/auth";

import { Role, TaskStatus, LeaveStatus } from "@prisma/client";

import * as bcrypt from "bcryptjs";

@Controller("employees")
@UseGuards(JwtGuard, RolesGuard)
export class EmployeesController {
  constructor(private p: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MANAGER)
  async list(@Req() r: any) {
    const me = await this.p.employee.findUnique({
      where: { userId: r.user.id },
    });

    const where: any = r.user.role === "MANAGER" ? { managerId: me?.id } : {};

    return this.p.employee.findMany({
      where,

      include: {
        department: true,

        manager: { select: { fullName: true } },

        user: { select: { email: true } },
      },

      orderBy: { fullName: "asc" },
    });
  }

  @Get(":id")
  async one(@Req() r: any, @Param("id") id: string) {
    const e = await this.p.employee.findUnique({
      where: { id },

      include: {
        department: true,

        manager: { select: { fullName: true } },

        user: { select: { email: true } },
      },
    });

    if (r.user.role === "EMPLOYEE" && e?.userId !== r.user.id) {
      throw new ForbiddenException();
    }

    return e;
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() b: any) {
    const hash = await bcrypt.hash(b.password || "REMOVED_DEMO_PASSWORD", 12);

    return this.p.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: b.email.toLowerCase(),

          passwordHash: hash,

          role: b.role || "EMPLOYEE",
        },
      });

      return tx.employee.create({
        data: {
          userId: u.id,

          employeeId: b.employeeId,

          fullName: b.fullName,

          phone: b.phone,

          dateOfJoining: new Date(b.dateOfJoining),

          designation: b.designation,

          departmentId: b.departmentId,

          managerId: b.managerId || null,
        },
      });
    });
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() b: any) {
    return this.p.employee.update({
      where: { id },

      data: b,
    });
  }
}

@Controller("departments")
@UseGuards(JwtGuard, RolesGuard)
export class DepartmentsController {
  constructor(private p: PrismaService) {}

  @Get()
  list() {
    return this.p.department.findMany({
      include: { _count: { select: { employees: true } } },

      orderBy: { name: "asc" },
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() b: any) {
    return this.p.department.create({
      data: { name: b.name, description: b.description },
    });
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() b: any) {
    return this.p.department.update({
      where: { id },
      data: {
        name: b.name,
        description: b.description,
      },
    });
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  async remove(@Param("id") id: string) {
    const department = await this.p.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            employees: true,
            projects: true,
          },
        },
      },
    });

    if (!department) {
      throw new BadRequestException("Department not found.");
    }

    if (department._count.employees > 0 || department._count.projects > 0) {
      throw new BadRequestException(
        "Cannot delete this department because employees or projects are linked to it.",
      );
    }

    await this.p.department.delete({
      where: { id },
    });

    return {
      message: "Department deleted successfully.",
    };
  }
}

@Controller("leave-types")
@UseGuards(JwtGuard, RolesGuard)
export class LeaveTypesController {
  constructor(private p: PrismaService) {}

  @Get()
  list() {
    return this.p.leaveType.findMany({
      orderBy: { name: "asc" },
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() b: any) {
    return this.p.leaveType.create({
      data: {
        name: b.name,

        description: b.description,
      },
    });
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() b: any) {
    return this.p.leaveType.update({
      where: { id },
      data: {
        name: b.name,
        description: b.description,
      },
    });
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  async remove(@Param("id") id: string) {
    const leaveType = await this.p.leaveType.findUnique({
      where: { id },
      include: { _count: { select: { leaveRequests: true } } },
    });
    if (!leaveType) throw new BadRequestException("Leave type not found.");
    if (leaveType._count.leaveRequests > 0) {
      throw new BadRequestException(
        "This leave type is used by leave requests and cannot be deleted.",
      );
    }
    await this.p.leaveType.delete({ where: { id } });
    return { message: "Leave type deleted successfully." };
  }
}

@Controller("holidays")
@UseGuards(JwtGuard, RolesGuard)
export class HolidaysController {
  constructor(private p: PrismaService) {}

  @Get()
  list() {
    return this.p.holiday.findMany({
      orderBy: { date: "asc" },
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() b: any) {
    return this.p.holiday.create({
      data: {
        name: b.name,

        date: new Date(b.date),

        description: b.description,
      },
    });
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() b: any) {
    return this.p.holiday.update({
      where: { id },

      data: {
        name: b.name,

        date: b.date ? new Date(b.date) : undefined,

        description: b.description,
      },
    });
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  async remove(@Param("id") id: string) {
    const holiday = await this.p.holiday.findUnique({ where: { id } });
    if (!holiday) throw new BadRequestException("Holiday not found.");
    await this.p.holiday.delete({ where: { id } });
    return { message: "Holiday deleted successfully." };
  }
}

@Controller("break-types")
@UseGuards(JwtGuard, RolesGuard)
export class BreakTypesController {
  constructor(private readonly p: PrismaService) {}

  @Get()
  list() {
    return this.p.breakType.findMany({ orderBy: { name: "asc" } });
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() body: any) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const minutes = Number(body.timeLimitMinutes);
    if (!name) throw new BadRequestException("Break type name is required.");
    if (!Number.isInteger(minutes) || minutes < 1) {
      throw new BadRequestException("Time limit must be at least 1 minute.");
    }
    return this.p.breakType.create({
      data: {
        name,
        description: body.description?.trim() || null,
        timeLimitMinutes: minutes,
      },
    });
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() body: any) {
    const data: any = {};
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw new BadRequestException("Break type name is required.");
      data.name = name;
    }
    if (body.description !== undefined) {
      data.description = String(body.description).trim() || null;
    }
    if (body.timeLimitMinutes !== undefined) {
      const minutes = Number(body.timeLimitMinutes);
      if (!Number.isInteger(minutes) || minutes < 1) {
        throw new BadRequestException("Time limit must be at least 1 minute.");
      }
      data.timeLimitMinutes = minutes;
    }
    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
    return this.p.breakType.update({ where: { id }, data });
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  async remove(@Param("id") id: string) {
    const item = await this.p.breakType.findUnique({
      where: { id },
      include: { _count: { select: { breakSessions: true } } },
    });
    if (!item) throw new BadRequestException("Break type not found.");
    if (item._count.breakSessions > 0) {
      throw new BadRequestException(
        "This break type is used by existing break records. Disable it instead.",
      );
    }
    await this.p.breakType.delete({ where: { id } });
    return { message: "Break type deleted successfully." };
  }
}

@Controller("software")
@UseGuards(JwtGuard, RolesGuard)
export class SoftwareController {
  constructor(private readonly p: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN)
  list() {
    return this.p.software.findMany({ orderBy: { name: "asc" } });
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() body: any) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const processName =
      typeof body.processName === "string" ? body.processName.trim() : "";
    if (!name) throw new BadRequestException("Software name is required.");
    if (!processName) {
      throw new BadRequestException("Process name is required.");
    }
    return this.p.software.create({
      data: {
        name,
        processName,
        description: body.description?.trim() || null,
      },
    });
  }

  @Patch(":id")
  @Roles(Role.ADMIN)
  update(@Param("id") id: string, @Body() body: any) {
    const data: any = {};
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) throw new BadRequestException("Software name is required.");
      data.name = name;
    }
    if (body.processName !== undefined) {
      const processName =
        typeof body.processName === "string" ? body.processName.trim() : "";
      if (!processName) {
        throw new BadRequestException("Process name is required.");
      }
      data.processName = processName;
    }
    if (body.description !== undefined) {
      data.description = String(body.description).trim() || null;
    }
    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
    return this.p.software.update({ where: { id }, data });
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  async remove(@Param("id") id: string) {
    const item = await this.p.software.findUnique({
      where: { id },
      include: { _count: { select: { applicationActivities: true } } },
    });
    if (!item) throw new BadRequestException("Software not found.");
    if (item._count.applicationActivities > 0) {
      throw new BadRequestException(
        "This software is referenced by activity records and cannot be deleted.",
      );
    }
    await this.p.software.delete({ where: { id } });
    return { message: "Software deleted successfully." };
  }
}

@Controller("notifications")
@UseGuards(JwtGuard)
export class NotificationsController {
  constructor(private p: PrismaService) {}

  @Get()
  list(@Req() r: any) {
    return this.p.notification.findMany({
      where: { recipientId: r.user.id },

      orderBy: { createdAt: "desc" },

      take: 100,
    });
  }

  @Patch(":id/read")
  read(@Req() r: any, @Param("id") id: string) {
    return this.p.notification.updateMany({
      where: { id, recipientId: r.user.id },

      data: { read: true },
    });
  }
}

@Controller("settings")
@UseGuards(JwtGuard, RolesGuard)
export class SettingsController {
  constructor(private p: PrismaService) {}

  @Get()
  get() {
    return this.p.companySetting.findFirst();
  }

  @Patch()
  @Roles(Role.ADMIN)
  async update(@Body() b: any) {
    const s = await this.p.companySetting.findFirst();
    const startTime = String(b.startTime ?? s?.startTime ?? "09:30");
    const endTime = String(b.endTime ?? s?.endTime ?? "18:30");
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

    if (!timePattern.test(startTime) || !timePattern.test(endTime)) {
      throw new BadRequestException(
        "Working hours must use valid 24-hour times.",
      );
    }

    const toMinutes = (time: string) => {
      const [hours, minutes] = time.split(":").map(Number);
      return hours * 60 + minutes;
    };
    const startMinutes = toMinutes(startTime);
    const endMinutes = toMinutes(endTime);

    if (endMinutes <= startMinutes) {
      throw new BadRequestException("End time must be later than start time.");
    }

    const data = { ...b, startTime, endTime };
    const scheduleChanged = Boolean(
      s && (startTime !== s.startTime || endTime !== s.endTime),
    );
    const requiredWasExplicitlyChanged =
      b.requiredMinutes !== undefined &&
      Number(b.requiredMinutes) !== Number(s?.requiredMinutes ?? 480);

    // Required active time follows the schedule when an admin changes office
    // hours and leaves the required-time field untouched. The configured
    // break allowance is excluded from the scheduled span.
    if (scheduleChanged && !requiredWasExplicitlyChanged) {
      const breakMinutes = Math.max(
        0,
        Number(b.breakLimitMinutes ?? s?.breakLimitMinutes ?? 60),
      );
      data.requiredMinutes = Math.max(
        1,
        endMinutes - startMinutes - breakMinutes,
      );
    }

    if (!s) {
      return this.p.companySetting.create({ data });
    }

    return this.p.companySetting.update({
      where: { id: s.id },
      data,
    });
  }
}

@Controller("reports")
@UseGuards(JwtGuard, RolesGuard)
export class ReportsController {
  constructor(private p: PrismaService) {}

  private async getEmployeeScope(r: any) {
    const me = await this.p.employee.findUnique({
      where: { userId: r.user.id },
    });

    return r.user.role === "MANAGER" ? { managerId: me?.id } : {};
  }

  private calculateLeaveDays(fromDate: Date, toDate: Date, halfDay: boolean) {
    const start = Date.UTC(
      fromDate.getUTCFullYear(),

      fromDate.getUTCMonth(),

      fromDate.getUTCDate(),
    );

    const end = Date.UTC(
      toDate.getUTCFullYear(),

      toDate.getUTCMonth(),

      toDate.getUTCDate(),
    );

    const calendarDays = Math.max(1, Math.round((end - start) / 86400000) + 1);

    return halfDay ? 0.5 : calendarDays;
  }

  @Get("attendance")
  @Roles(Role.ADMIN, Role.MANAGER)
  async attendance(@Req() r: any) {
    const employeeScope = await this.getEmployeeScope(r);

    return this.p.attendance.findMany({
      where: r.user.role === "MANAGER" ? { employee: employeeScope } : {},

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

      orderBy: { date: "desc" },

      take: 1000,
    });
  }

  @Get("productivity")
  @Roles(Role.ADMIN, Role.MANAGER)
  async productivity(@Req() r: any) {
    const employeeScope = await this.getEmployeeScope(r);

    const emps = await this.p.employee.findMany({
      where: employeeScope,
    });

    return Promise.all(
      emps.map(async (e) => {
        const a = await this.p.attendance.aggregate({
          where: { employeeId: e.id },

          _sum: {
            requiredMinutes: true,

            loggedInMinutes: true,

            activeMinutes: true,

            idleMinutes: true,

            breakMinutes: true,

            taskMinutes: true,

            shortageMinutes: true,

            overtimeMinutes: true,
          },
        });

        const tasks = await this.p.task.groupBy({
          by: ["status"],

          where: { assignedToId: e.id },

          _count: { _all: true },
        });

        return {
          employee: e,

          summary: a._sum,

          tasks,
        };
      }),
    );
  }

  @Get("tasks")
  @Roles(Role.ADMIN, Role.MANAGER)
  async tasks(@Req() r: any) {
    const employeeScope = await this.getEmployeeScope(r);

    const employees = await this.p.employee.findMany({
      where: employeeScope,

      include: {
        department: {
          select: { name: true },
        },
      },

      orderBy: { fullName: "asc" },
    });

    const now = new Date();

    return Promise.all(
      employees.map(async (employee) => {
        const tasks = await this.p.task.findMany({
          where: {
            assignedToId: employee.id,
          },

          select: {
            id: true,

            taskNumber: true,

            title: true,

            priority: true,

            status: true,

            startDate: true,

            dueDate: true,

            estimatedMinutes: true,

            actualMinutes: true,

            completedAt: true,

            createdAt: true,
          },

          orderBy: { createdAt: "desc" },
        });

        const total = tasks.length;

        const completed = tasks.filter(
          (task) => task.status === TaskStatus.COMPLETED,
        ).length;

        const cancelled = tasks.filter(
          (task) => task.status === TaskStatus.CANCELLED,
        ).length;

        const pending = tasks.filter(
          (task) =>
            task.status !== TaskStatus.COMPLETED &&
            task.status !== TaskStatus.CANCELLED,
        ).length;

        const overdue = tasks.filter((task) => {
          if (!task.dueDate) return false;

          return (
            task.dueDate < now &&
            task.status !== TaskStatus.COMPLETED &&
            task.status !== TaskStatus.CANCELLED
          );
        }).length;

        const trackedMinutes = tasks.reduce(
          (sum, task) => sum + (task.actualMinutes || 0),

          0,
        );

        const completionBase = total - cancelled;

        const completionRate =
          completionBase > 0
            ? Math.round((completed / completionBase) * 100)
            : 0;

        return {
          employee: {
            id: employee.id,

            employeeId: employee.employeeId,

            fullName: employee.fullName,

            department: employee.department,
          },

          summary: {
            total,

            completed,

            pending,

            cancelled,

            overdue,

            trackedMinutes,

            completionRate,
          },

          tasks,
        };
      }),
    );
  }

  @Get("leaves")
  @Roles(Role.ADMIN, Role.MANAGER)
  async leaves(@Req() r: any) {
    const employeeScope = await this.getEmployeeScope(r);

    const employees = await this.p.employee.findMany({
      where: employeeScope,

      include: {
        department: {
          select: { name: true },
        },

        leaveRequests: {
          include: {
            leaveType: {
              select: {
                id: true,

                name: true,
              },
            },
          },

          orderBy: { fromDate: "desc" },
        },
      },

      orderBy: { fullName: "asc" },
    });

    return employees.map((employee) => {
      const requests = employee.leaveRequests;

      const approved = requests.filter(
        (leave) => leave.status === LeaveStatus.APPROVED,
      ).length;

      const pending = requests.filter(
        (leave) => leave.status === LeaveStatus.PENDING,
      ).length;

      const rejected = requests.filter(
        (leave) => leave.status === LeaveStatus.REJECTED,
      ).length;

      const cancelled = requests.filter(
        (leave) => leave.status === LeaveStatus.CANCELLED,
      ).length;

      const approvedDays = requests

        .filter((leave) => leave.status === LeaveStatus.APPROVED)

        .reduce(
          (sum, leave) =>
            sum +
            this.calculateLeaveDays(
              leave.fromDate,

              leave.toDate,

              leave.halfDay,
            ),

          0,
        );

      return {
        employee: {
          id: employee.id,

          employeeId: employee.employeeId,

          fullName: employee.fullName,

          department: employee.department,
        },

        summary: {
          totalRequests: requests.length,

          approved,

          pending,

          rejected,

          cancelled,

          approvedDays,
        },

        leaves: requests.map((leave) => ({
          id: leave.id,

          leaveType: leave.leaveType,

          fromDate: leave.fromDate,

          toDate: leave.toDate,

          reason: leave.reason,

          halfDay: leave.halfDay,

          status: leave.status,

          reviewedAt: leave.reviewedAt,

          reviewComment: leave.reviewComment,

          days: this.calculateLeaveDays(
            leave.fromDate,

            leave.toDate,

            leave.halfDay,
          ),
        })),
      };
    });
  }

  @Get("attendance.csv")
  @Roles(Role.ADMIN, Role.MANAGER)
  async csv(@Req() r: any, @Res() res: any) {
    const employeeScope = await this.getEmployeeScope(r);

    const rows = await this.p.attendance.findMany({
      where: r.user.role === "MANAGER" ? { employee: employeeScope } : {},

      include: { employee: true },

      orderBy: { date: "desc" },

      take: 5000,
    });

    const esc = (v: any) => `"${String(v ?? "").replaceAll('"', '""')}"`;

    const csv = [
      "Employee,Date,Mode,Status,Login,Logout,LoggedIn,Active,Idle,Break,Task,Shortage,Overtime",

      ...rows.map((x) =>
        [
          x.employee.fullName,

          x.date.toISOString().slice(0, 10),

          x.workMode,

          x.status,

          x.loginTime?.toISOString() || "",

          x.logoutTime?.toISOString() || "",

          x.loggedInMinutes,

          x.activeMinutes,

          x.idleMinutes,

          x.breakMinutes,

          x.taskMinutes,

          x.shortageMinutes,

          x.overtimeMinutes,
        ]

          .map(esc)

          .join(","),
      ),
    ].join("\n");

    res.header("Content-Type", "text/csv");

    res.attachment("attendance.csv");

    res.send(csv);
  }
}

@Controller("audit-logs")
@UseGuards(JwtGuard, RolesGuard)
export class AuditLogsController {
  constructor(private p: PrismaService) {}

  @Get()
  @Roles(Role.ADMIN)
  list() {
    return this.p.auditLog.findMany({
      include: {
        actor: {
          select: {
            email: true,

            role: true,
          },
        },
      },

      orderBy: { timestamp: "desc" },

      take: 500,
    });
  }
}

@Module({
  controllers: [
    DepartmentsController,

    LeaveTypesController,

    HolidaysController,

    BreakTypesController,

    SoftwareController,

    NotificationsController,

    SettingsController,

    ReportsController,

    AuditLogsController,
  ],

  providers: [PrismaService],
})
export class AdminModule {}
