import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { PrismaService } from "../prisma.service";

import { JwtGuard, Roles, RolesGuard } from "../common/auth";

import { Role, TaskPriority, TaskStatus, EventType } from "@prisma/client";

import { mins } from "../common/time";

import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

/* =========================================================
   CREATE TASK DTO
   ========================================================= */

class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  assignedToId!: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;
}

/* =========================================================
   UPDATE TASK STATUS DTO
   ========================================================= */

class StatusDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
}

/* =========================================================
   TASK CONTROLLER
   ========================================================= */

@Controller("tasks")
@UseGuards(JwtGuard, RolesGuard)
export class TasksController {
  constructor(private readonly p: PrismaService) {}

  /* =======================================================
     GET EMPLOYEE PROFILE FROM CURRENT USER
     ======================================================= */

  async employee(req: any) {
    return this.p.employee.findUnique({
      where: {
        userId: req.user.id,
      },
    });
  }

  private serializeTask(task: any) {
    const assignedByUser = task?.assignedByUser;

    return {
      ...task,

      // Keep the existing frontend response shape while the database
      // stores the creator against User, which works for Admin and Manager.
      assignedBy: assignedByUser
        ? {
            id: assignedByUser.id,
            email: assignedByUser.email,
            role: assignedByUser.role,
            employeeId: assignedByUser.employee?.employeeId ?? undefined,
            fullName:
              assignedByUser.employee?.fullName ||
              assignedByUser.email ||
              "Administrator",
          }
        : null,
    };
  }

  /* =======================================================
     GET TASK LIST

     ADMIN
     - Can see all tasks.

     MANAGER
     - Can see tasks assigned to their team.

     EMPLOYEE
     - Can see only their own tasks.
     ======================================================= */

  @Get()
  async list(
    @Req() req: any,
    @Query("status") status?: TaskStatus,
    @Query("assignedToId") assignedToId?: string,
    @Query("scope") scope?: "OWN" | "TEAM",
  ) {
    const employee = await this.employee(req);

    const where: any = {
      ...(status
        ? {
            status,
          }
        : {}),

      ...(req.user.role === "EMPLOYEE"
        ? {
            assignedToId: employee?.id,
          }
        : assignedToId
          ? {
              assignedToId,
            }
          : {}),
    };

    /* -------------------------------------------------------
       MANAGER

       Manager can see only tasks assigned to employees
       whose managerId is the current manager.
       ------------------------------------------------------- */

    if (req.user.role === "MANAGER") {
      if (!employee) {
        throw new ForbiddenException("Manager employee profile not found");
      }

      if (scope === "OWN") {
        // Manager's personal dashboard: tasks assigned directly to the manager.
        where.assignedToId = employee.id;
        delete where.assignedTo;
      } else {
        // Default manager task scope: direct-report/team tasks.
        where.assignedTo = {
          managerId: employee.id,
        };
        delete where.assignedToId;
      }
    }

    const tasks = await this.p.task.findMany({
      where,

      include: {
        project: true,

        assignedTo: {
          select: {
            id: true,
            employeeId: true,
            fullName: true,
          },
        },

        assignedByUser: {
          select: {
            id: true,
            email: true,
            role: true,
            employee: {
              select: {
                id: true,
                employeeId: true,
                fullName: true,
              },
            },
          },
        },

        timers: true,

        comments: {
          include: {
            author: {
              select: {
                fullName: true,
              },
            },
          },

          orderBy: {
            createdAt: "desc",
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    return tasks.map((task) => this.serializeTask(task));
  }

  /* =======================================================
     CREATE TASK

     ADMIN
     - Can create a task for any employee.
     - Admin does not need an Employee record.

     MANAGER
     - Must have an Employee record.
     - Can assign only to their own team.

     EMPLOYEE
     - Blocked by @Roles().
     ======================================================= */

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  async create(@Req() req: any, @Body() body: CreateTaskDto) {
    /* -------------------------------------------------------
       Find Employee record.

       ADMIN:
       creator will be null because Admin is only a User.

       MANAGER:
       creator must exist.
       ------------------------------------------------------- */

    const creator = await this.employee(req);

    /* -------------------------------------------------------
       Manager must have an Employee profile.
       Admin is intentionally allowed without one.
       ------------------------------------------------------- */

    if (req.user.role === Role.MANAGER && !creator) {
      throw new ForbiddenException("Manager employee profile not found");
    }

    /* -------------------------------------------------------
       Find assigned employee.
       ------------------------------------------------------- */

    const target = await this.p.employee.findUnique({
      where: {
        id: body.assignedToId,
      },
    });

    if (!target) {
      throw new ForbiddenException("Assigned employee not found");
    }

    /* -------------------------------------------------------
       MANAGER TEAM VALIDATION

       Manager can only assign tasks to employees
       whose managerId matches the manager's employee ID.
       ------------------------------------------------------- */

    if (req.user.role === Role.MANAGER) {
      if (!creator || target.managerId !== creator.id) {
        throw new ForbiddenException("Can only assign to your team");
      }
    }

    /* -------------------------------------------------------
       PROJECT VALIDATION

       If projectId is supplied, make sure the project exists.
       ------------------------------------------------------- */

    if (body.projectId) {
      const project = await this.p.project.findUnique({
        where: {
          id: body.projectId,
        },
      });

      if (!project) {
        throw new ForbiddenException("Selected project not found");
      }

      /* -----------------------------------------------------
         Manager can only use projects they manage.
         ----------------------------------------------------- */

      if (
        req.user.role === Role.MANAGER &&
        creator &&
        project.managerId !== creator.id
      ) {
        throw new ForbiddenException(
          "Can only assign tasks to your managed projects",
        );
      }
    }

    /* -------------------------------------------------------
       Generate task number.

       Existing format is preserved:

       TASK-00001
       TASK-00002
       TASK-00003
       ------------------------------------------------------- */

    const count = await this.p.task.count();

    const taskNumber = `TASK-${String(count + 1).padStart(5, "0")}`;

    /* -------------------------------------------------------
       CREATE TASK

       IMPORTANT:

       Admin:
         assignedByUserId = current Admin User ID

       Manager:
         assignedByUserId = current Manager User ID
       ------------------------------------------------------- */

    const task = await this.p.task.create({
      data: {
        taskNumber,

        title: body.title.trim(),

        description: body.description?.trim() || undefined,

        assignedToId: target.id,

        assignedByUserId: req.user.id,

        projectId: body.projectId || undefined,

        priority: body.priority ?? TaskPriority.MEDIUM,

        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,

        estimatedMinutes: body.estimatedMinutes,
      },

      include: {
        project: true,

        assignedTo: {
          select: {
            id: true,
            employeeId: true,
            fullName: true,
          },
        },

        assignedByUser: {
          select: {
            id: true,
            email: true,
            role: true,
            employee: {
              select: {
                id: true,
                employeeId: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    return this.serializeTask(task);
  }

  /* =======================================================
     UPDATE TASK STATUS

     ADMIN
     - Can update any task.

     MANAGER
     - Can update tasks belonging to their team.

     EMPLOYEE
     - Can update their own task only.
     ======================================================= */

  @Patch(":id")
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() body: StatusDto,
  ) {
    const employee = await this.employee(req);

    const task = await this.p.task.findUnique({
      where: {
        id,
      },
    });

    if (!task) {
      throw new ForbiddenException("Task not found");
    }

    /* -------------------------------------------------------
       EMPLOYEE
       ------------------------------------------------------- */

    if (req.user.role === Role.EMPLOYEE && task.assignedToId !== employee?.id) {
      throw new ForbiddenException("You can only update your own tasks");
    }

    if (req.user.role === Role.EMPLOYEE && body.priority !== undefined) {
      throw new ForbiddenException("Only managers can change task priority");
    }

    /* -------------------------------------------------------
       MANAGER
       ------------------------------------------------------- */

    if (req.user.role === Role.MANAGER) {
      if (!employee) {
        throw new ForbiddenException("Manager employee profile not found");
      }

      // A manager may update:
      // 1. their own tasks assigned by Admin/another authorized user, or
      // 2. tasks assigned to their direct reports.
      if (task.assignedToId !== employee.id) {
        const target = await this.p.employee.findUnique({
          where: {
            id: task.assignedToId,
          },
        });

        if (!target || target.managerId !== employee.id) {
          throw new ForbiddenException(
            "You can only update your own tasks or tasks belonging to your team",
          );
        }
      }
    }

    /* -------------------------------------------------------
       VALIDATE UPDATE
       ------------------------------------------------------- */

    if (body.status === undefined && body.priority === undefined) {
      throw new BadRequestException("Provide a status or priority to update");
    }

    // Do not let a task be marked completed/cancelled while its timer is
    // still running. The UI normally stops it first; this also protects API use.
    if (
      body.status === TaskStatus.COMPLETED ||
      body.status === TaskStatus.CANCELLED
    ) {
      const activeTimer = await this.p.taskTimerSession.findFirst({
        where: { taskId: id, endedAt: null },
      });

      if (activeTimer) {
        throw new ForbiddenException(
          "Stop the active task timer before completing or cancelling this task",
        );
      }
    }

    /* -------------------------------------------------------
       UPDATE STATUS
       ------------------------------------------------------- */

    return this.p.task.update({
      where: { id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.status === TaskStatus.COMPLETED
          ? { completedAt: new Date() }
          : body.status !== undefined
            ? { completedAt: null }
            : {}),
      },
    });
  }

  /* =======================================================
     DELETE TASK

     ADMIN
     - Can delete any task.

     MANAGER
     - Can delete only their team's tasks.
     ======================================================= */

  @Delete(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  async del(@Req() req: any, @Param("id") id: string) {
    const task = await this.p.task.findUnique({
      where: {
        id,
      },
    });

    if (!task) {
      throw new ForbiddenException("Task not found");
    }

    /* -------------------------------------------------------
       Manager team validation
       ------------------------------------------------------- */

    if (req.user.role === Role.MANAGER) {
      const employee = await this.employee(req);

      if (!employee) {
        throw new ForbiddenException("Manager employee profile not found");
      }

      const target = await this.p.employee.findUnique({
        where: {
          id: task.assignedToId,
        },
      });

      if (!target || target.managerId !== employee.id) {
        throw new ForbiddenException(
          "You can only delete tasks belonging to your team",
        );
      }
    }

    return this.p.task.delete({
      where: {
        id,
      },
    });
  }

  /* =======================================================
     START TASK TIMER

     Only the employee assigned to the task can
     start its timer.
     ======================================================= */

  @Post(":id/timer/start")
  async timerStart(@Req() req: any, @Param("id") id: string) {
    const employee = await this.employee(req);

    if (!employee) {
      throw new ForbiddenException("Employee profile not found");
    }

    const task = await this.p.task.findUnique({
      where: {
        id,
      },
    });

    if (!task) {
      throw new ForbiddenException("Task not found");
    }

    if (task.assignedToId !== employee.id) {
      throw new ForbiddenException(
        "You can only start the timer for your own task",
      );
    }

    if (
      task.status === TaskStatus.COMPLETED ||
      task.status === TaskStatus.CANCELLED
    ) {
      throw new ForbiddenException(
        "A completed or cancelled task cannot have its timer started",
      );
    }

    /* -------------------------------------------------------
       Check for another active timer.
       ------------------------------------------------------- */

    const open = await this.p.taskTimerSession.findFirst({
      where: {
        employeeId: employee.id,
        endedAt: null,
      },
    });

    if (open) {
      throw new ForbiddenException("Another task timer is already active");
    }

    const now = new Date();

    /* -------------------------------------------------------
       Create timer session.
       ------------------------------------------------------- */

    const session = await this.p.taskTimerSession.create({
      data: {
        taskId: id,
        employeeId: employee.id,
        startedAt: now,
      },
    });

    /* -------------------------------------------------------
       Find active attendance.
       ------------------------------------------------------- */

    const attendance = await this.p.attendance.findFirst({
      where: {
        employeeId: employee.id,
        loginTime: {
          not: null,
        },
        logoutTime: null,
      },
    });

    /* -------------------------------------------------------
       Create TASK_START event.
       ------------------------------------------------------- */

    if (attendance) {
      await this.p.workEvent.create({
        data: {
          employeeId: employee.id,
          attendanceId: attendance.id,
          type: EventType.TASK_START,
          occurredAt: now,
          metadata: {
            taskId: id,
          },
        },
      });
    }

    return session;
  }

  /* =======================================================
     STOP TASK TIMER
     ======================================================= */

  @Post(":id/timer/stop")
  async timerStop(@Req() req: any, @Param("id") id: string) {
    const employee = await this.employee(req);

    if (!employee) {
      throw new ForbiddenException("Employee profile not found");
    }

    const session = await this.p.taskTimerSession.findFirst({
      where: {
        taskId: id,
        employeeId: employee.id,
        endedAt: null,
      },
    });

    if (!session) {
      throw new ForbiddenException("No active timer");
    }

    const now = new Date();

    /* -------------------------------------------------------
       Calculate actual minutes and persist all stop-side effects
       in one transaction so a partial failure cannot leave the timer
       closed without updating actual minutes / the work event.
       ------------------------------------------------------- */

    const actual = mins(now.getTime() - session.startedAt.getTime());

    return this.p.$transaction(async (tx) => {
      // Conditional update prevents two near-simultaneous stop requests
      // from both accounting the same session.
      const closed = await tx.taskTimerSession.updateMany({
        where: { id: session.id, endedAt: null },
        data: { endedAt: now },
      });

      if (closed.count !== 1) {
        throw new ForbiddenException(
          "This task timer has already been stopped",
        );
      }

      const output = await tx.taskTimerSession.findUnique({
        where: { id: session.id },
      });

      await tx.task.update({
        where: { id },
        data: { actualMinutes: { increment: actual } },
      });

      const attendance = await tx.attendance.findFirst({
        where: {
          employeeId: employee.id,
          loginTime: { not: null },
          logoutTime: null,
        },
      });

      if (attendance) {
        await tx.workEvent.create({
          data: {
            employeeId: employee.id,
            attendanceId: attendance.id,
            type: EventType.TASK_STOP,
            occurredAt: now,
            metadata: { taskId: id, actualMinutes: actual },
          },
        });
      }

      return output;
    });
  }

  /* =======================================================
     PAUSE TIMER

     Existing behavior is preserved:
     pause = stop current timer.
     ======================================================= */

  @Post(":id/timer/pause")
  async pause(@Req() req: any, @Param("id") id: string) {
    return this.timerStop(req, id);
  }

  /* =======================================================
     RESUME TIMER

     Existing behavior is preserved:
     resume = start timer again.
     ======================================================= */

  @Post(":id/timer/resume")
  async resume(@Req() req: any, @Param("id") id: string) {
    return this.timerStart(req, id);
  }
}

/* =========================================================
   TASK MODULE
   ========================================================= */

@Module({
  controllers: [TasksController],
  providers: [PrismaService],
})
export class TasksModule {}
