import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { PrismaService } from "../prisma.service";

import { JwtGuard, Roles, RolesGuard } from "../common/auth";

import { ProjectStatus, Role } from "@prisma/client";

@Controller("projects")
@UseGuards(JwtGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly p: PrismaService) {}

  // =========================================================
  // LIST PROJECTS
  // =========================================================

  @Get()
  async list() {
    return this.p.project.findMany({
      include: {
        manager: {
          select: {
            fullName: true,
          },
        },

        department: {
          select: {
            name: true,
          },
        },

        _count: {
          select: {
            tasks: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });
  }

  // =========================================================
  // CREATE PROJECT
  // =========================================================

  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  async create(@Body() b: any, @Req() r: any) {
    const name = typeof b.name === "string" ? b.name.trim() : "";

    if (!name) {
      throw new BadRequestException("Project name is required");
    }

    const description =
      typeof b.description === "string" ? b.description.trim() : undefined;

    const status = b.status || "ACTIVE";

    if (!Object.values(ProjectStatus).includes(status as ProjectStatus)) {
      throw new BadRequestException("Invalid project status");
    }

    const startDate = b.startDate ? new Date(b.startDate) : undefined;

    const endDate = b.endDate ? new Date(b.endDate) : undefined;

    if (startDate && Number.isNaN(startDate.getTime())) {
      throw new BadRequestException("Invalid project start date");
    }

    if (endDate && Number.isNaN(endDate.getTime())) {
      throw new BadRequestException("Invalid project end date");
    }

    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException(
        "Project end date cannot be earlier than start date",
      );
    }

    if (!b.departmentId) {
      throw new BadRequestException("Department is required");
    }

    if (!b.managerId) {
      throw new BadRequestException("Manager is required");
    }

    // ---------------------------------------------------------
    // Verify department exists
    // ---------------------------------------------------------

    const department = await this.p.department.findUnique({
      where: {
        id: b.departmentId,
      },
    });

    if (!department) {
      throw new BadRequestException("Selected department does not exist");
    }

    // ---------------------------------------------------------
    // Verify manager exists
    // ---------------------------------------------------------

    const manager = await this.p.employee.findUnique({
      where: {
        id: b.managerId,
      },
    });

    if (!manager) {
      throw new BadRequestException("Selected manager does not exist");
    }

    // ---------------------------------------------------------
    // Manager restriction
    //
    // Admin can create any project.
    //
    // Manager can create a project only for themselves.
    // This prevents a manager from assigning another manager
    // as the project manager.
    // ---------------------------------------------------------

    if (r.user.role === "MANAGER") {
      const currentEmployee = await this.p.employee.findUnique({
        where: {
          userId: r.user.id,
        },
      });

      if (!currentEmployee || currentEmployee.id !== b.managerId) {
        throw new BadRequestException(
          "Managers can create projects only for themselves",
        );
      }
    }

    return this.p.project.create({
      data: {
        name,

        description,

        status: status as ProjectStatus,

        managerId: b.managerId,

        departmentId: b.departmentId,

        startDate,

        endDate,
      },

      include: {
        manager: {
          select: {
            fullName: true,
          },
        },

        department: {
          select: {
            name: true,
          },
        },

        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });
  }

  // =========================================================
  // UPDATE PROJECT
  // =========================================================

  @Patch(":id")
  @Roles(Role.ADMIN, Role.MANAGER)
  async update(@Param("id") id: string, @Body() b: any, @Req() r: any) {
    if (!id) {
      throw new BadRequestException("Project id is required");
    }

    // ---------------------------------------------------------
    // Find existing project
    // ---------------------------------------------------------

    const existing = await this.p.project.findUnique({
      where: {
        id,
      },
    });

    if (!existing) {
      throw new BadRequestException("Project not found");
    }

    // ---------------------------------------------------------
    // Manager restriction
    //
    // A manager can update only projects managed by them.
    // ---------------------------------------------------------

    if (r.user.role === "MANAGER") {
      const currentEmployee = await this.p.employee.findUnique({
        where: {
          userId: r.user.id,
        },
      });

      if (!currentEmployee || existing.managerId !== currentEmployee.id) {
        throw new BadRequestException("You can update only your own projects");
      }

      // A manager must not transfer the project
      // to another manager.
      if (b.managerId !== undefined && b.managerId !== currentEmployee.id) {
        throw new BadRequestException(
          "Managers cannot assign the project to another manager",
        );
      }
    }

    // ---------------------------------------------------------
    // Validate name
    // ---------------------------------------------------------

    let name: string | undefined;

    if (b.name !== undefined) {
      if (typeof b.name !== "string" || !b.name.trim()) {
        throw new BadRequestException("Project name cannot be empty");
      }

      name = b.name.trim();
    }

    // ---------------------------------------------------------
    // Validate description
    // ---------------------------------------------------------

    let description: string | undefined;

    if (b.description !== undefined) {
      description =
        typeof b.description === "string" ? b.description.trim() : "";
    }

    // ---------------------------------------------------------
    // Validate status
    // ---------------------------------------------------------

    let status: ProjectStatus | undefined;

    if (b.status !== undefined) {
      if (!Object.values(ProjectStatus).includes(b.status as ProjectStatus)) {
        throw new BadRequestException("Invalid project status");
      }

      status = b.status as ProjectStatus;
    }

    // ---------------------------------------------------------
    // Validate department
    // ---------------------------------------------------------

    let departmentId: string | undefined;

    if (b.departmentId !== undefined) {
      if (!b.departmentId) {
        throw new BadRequestException("Department cannot be empty");
      }

      const department = await this.p.department.findUnique({
        where: {
          id: b.departmentId,
        },
      });

      if (!department) {
        throw new BadRequestException("Selected department does not exist");
      }

      departmentId = b.departmentId;
    }

    // ---------------------------------------------------------
    // Validate manager
    // ---------------------------------------------------------

    let managerId: string | undefined;

    if (b.managerId !== undefined) {
      if (!b.managerId) {
        throw new BadRequestException("Manager cannot be empty");
      }

      const manager = await this.p.employee.findUnique({
        where: {
          id: b.managerId,
        },
      });

      if (!manager) {
        throw new BadRequestException("Selected manager does not exist");
      }

      managerId = b.managerId;
    }

    // ---------------------------------------------------------
    // Validate dates
    // ---------------------------------------------------------

    let startDate: Date | null | undefined;

    let endDate: Date | null | undefined;

    if (b.startDate !== undefined) {
      if (b.startDate === null || b.startDate === "") {
        startDate = null;
      } else {
        const parsed = new Date(b.startDate);

        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException("Invalid project start date");
        }

        startDate = parsed;
      }
    }

    if (b.endDate !== undefined) {
      if (b.endDate === null || b.endDate === "") {
        endDate = null;
      } else {
        const parsed = new Date(b.endDate);

        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException("Invalid project end date");
        }

        endDate = parsed;
      }
    }

    // ---------------------------------------------------------
    // Compare final dates
    //
    // If only one date is supplied during update, use the
    // existing value for comparison.
    // ---------------------------------------------------------

    const finalStartDate =
      startDate !== undefined ? startDate : existing.startDate;

    const finalEndDate = endDate !== undefined ? endDate : existing.endDate;

    if (finalStartDate && finalEndDate && finalEndDate < finalStartDate) {
      throw new BadRequestException(
        "Project end date cannot be earlier than start date",
      );
    }

    // ---------------------------------------------------------
    // Build controlled update object
    //
    // IMPORTANT:
    // Do NOT use ...b here.
    // Only approved project fields are updated.
    // ---------------------------------------------------------

    const data: any = {};

    if (name !== undefined) {
      data.name = name;
    }

    if (description !== undefined) {
      data.description = description;
    }

    if (status !== undefined) {
      data.status = status;
    }

    if (departmentId !== undefined) {
      data.departmentId = departmentId;
    }

    if (managerId !== undefined) {
      data.managerId = managerId;
    }

    if (startDate !== undefined) {
      data.startDate = startDate;
    }

    if (endDate !== undefined) {
      data.endDate = endDate;
    }

    // ---------------------------------------------------------
    // Update project
    // ---------------------------------------------------------

    return this.p.project.update({
      where: {
        id,
      },

      data,

      include: {
        manager: {
          select: {
            fullName: true,
          },
        },

        department: {
          select: {
            name: true,
          },
        },

        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });
  }

  @Delete(":id")
  @Roles(Role.ADMIN)
  async remove(@Param("id") id: string) {
    const project = await this.p.project.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    if (!project) {
      throw new BadRequestException("Project not found");
    }

    if (project._count.tasks > 0) {
      throw new BadRequestException(
        "Cannot delete this project because tasks are linked to it.",
      );
    }

    await this.p.project.delete({
      where: { id },
    });

    return { message: "Project deleted successfully." };
  }
}

// =============================================================
// MODULE
// =============================================================

@Module({
  controllers: [ProjectsController],

  providers: [PrismaService],
})
export class ProjectsModule {}
