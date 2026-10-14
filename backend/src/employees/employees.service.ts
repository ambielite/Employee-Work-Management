import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../prisma.service";
import * as bcrypt from "bcryptjs";
import { AccountStatus, Role } from "@prisma/client";

import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(role: Role, userId: string) {
    let where: any = {};

    // Managers can see only their direct reports.
    if (role === Role.MANAGER) {
      const manager = await this.prisma.employee.findUnique({
        where: { userId },
        select: { id: true },
      });

      where = {
        managerId: manager?.id ?? "__NO_MANAGER_FOUND__",
      };
    }

    return this.prisma.employee.findMany({
      where,
      include: {
        department: true,
        manager: {
          select: {
            id: true,
            fullName: true,
            employeeId: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            accountStatus: true,
          },
        },
      },
      orderBy: {
        fullName: "asc",
      },
    });
  }

  async findOne(id: string, role: Role, userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        manager: {
          select: {
            id: true,
            fullName: true,
            employeeId: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            accountStatus: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    // Managers can view only their direct reports.
    if (role === Role.MANAGER) {
      const manager = await this.prisma.employee.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!manager || employee.managerId !== manager.id) {
        throw new NotFoundException("Employee not found");
      }
    }

    // Employees can view only their own profile.
    if (role === Role.EMPLOYEE && employee.userId !== userId) {
      throw new NotFoundException("Employee not found");
    }

    return employee;
  }

  private validateEmployeeRole(role?: Role) {
    if (role !== undefined && role !== Role.EMPLOYEE && role !== Role.MANAGER) {
      throw new BadRequestException(
        "Only EMPLOYEE and MANAGER roles are allowed for employee profiles",
      );
    }
  }

  private async validateDepartment(departmentId: string) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });

    if (!department) {
      throw new BadRequestException("Selected department not found");
    }
  }

  private async validateManager(
    managerId: string | null | undefined,
    employeeId?: string,
  ) {
    // A null or empty managerId means no manager is assigned.
    if (!managerId) {
      return;
    }

    if (employeeId && managerId === employeeId) {
      throw new BadRequestException("An employee cannot be their own manager");
    }

    const manager = await this.prisma.employee.findUnique({
      where: { id: managerId },
      include: {
        user: {
          select: {
            role: true,
            accountStatus: true,
          },
        },
      },
    });

    if (!manager) {
      throw new BadRequestException("Selected manager not found");
    }

    if (
      manager.user.role !== Role.MANAGER ||
      manager.accountStatus !== AccountStatus.ACTIVE ||
      manager.user.accountStatus !== AccountStatus.ACTIVE
    ) {
      throw new BadRequestException(
        "Selected manager must have an active Manager account",
      );
    }

    // Prevent reporting cycles when changing an existing employee's manager.
    if (employeeId) {
      let currentManagerId: string | null = manager.id;
      const visited = new Set<string>();

      while (currentManagerId) {
        if (currentManagerId === employeeId) {
          throw new BadRequestException(
            "This manager assignment would create a reporting cycle",
          );
        }

        if (visited.has(currentManagerId)) {
          throw new BadRequestException(
            "An existing reporting cycle was detected",
          );
        }

        visited.add(currentManagerId);

        const currentManager: { managerId: string | null } | null =
          await this.prisma.employee.findUnique({
            where: { id: currentManagerId },
            select: { managerId: true },
          });

        currentManagerId = currentManager?.managerId ?? null;
      }
    }
  }

  async create(dto: CreateEmployeeDto) {
    this.validateEmployeeRole(dto.role);

    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException("Email already exists");
    }

    const existingEmployee = await this.prisma.employee.findUnique({
      where: { employeeId: dto.employeeId },
    });

    if (existingEmployee) {
      throw new ConflictException("Employee ID already exists");
    }

    await this.validateDepartment(dto.departmentId);
    await this.validateManager(dto.managerId);

    const passwordHash = await bcrypt.hash(dto.password || "REMOVED_DEMO_PASSWORD", 12);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: dto.role ?? Role.EMPLOYEE,
          accountStatus: AccountStatus.ACTIVE,
          fullName: dto.fullName.trim(),
          phone: dto.phone?.trim() || null,
          designation: dto.designation.trim(),
          dateOfJoining: new Date(dto.dateOfJoining),
        },
      });

      return tx.employee.create({
        data: {
          userId: user.id,
          employeeId: dto.employeeId.trim(),
          fullName: dto.fullName.trim(),
          phone: dto.phone?.trim() || null,
          dateOfJoining: new Date(dto.dateOfJoining),
          designation: dto.designation.trim(),
          departmentId: dto.departmentId,
          managerId: dto.managerId || null,
          accountStatus: AccountStatus.ACTIVE,
        },
        include: {
          department: true,
          manager: {
            select: {
              id: true,
              fullName: true,
              employeeId: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              accountStatus: true,
            },
          },
        },
      });
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            role: true,
            accountStatus: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException("Employee not found");
    }

    this.validateEmployeeRole(dto.role);

    // Check duplicate Employee ID.
    if (dto.employeeId !== undefined) {
      const existingEmployee = await this.prisma.employee.findFirst({
        where: {
          employeeId: dto.employeeId.trim(),
          NOT: { id },
        },
      });

      if (existingEmployee) {
        throw new ConflictException("Employee ID already exists");
      }
    }

    // Check duplicate email.
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();

      const existingUser = await this.prisma.user.findFirst({
        where: {
          email,
          NOT: { id: employee.userId },
        },
      });

      if (existingUser) {
        throw new ConflictException("Email already exists");
      }
    }

    // Validate a changed department.
    if (dto.departmentId !== undefined) {
      await this.validateDepartment(dto.departmentId);
    }

    // Validate manager assignment and prevent reporting cycles.
    if (dto.managerId !== undefined) {
      await this.validateManager(dto.managerId, id);
    }

    // A Manager cannot become an Employee while direct reports remain.
    if (employee.user.role === Role.MANAGER && dto.role === Role.EMPLOYEE) {
      const directReports = await this.prisma.employee.count({
        where: { managerId: id },
      });

      if (directReports > 0) {
        throw new BadRequestException(
          `Cannot change this Manager to Employee while ${directReports} direct report(s) remain. Reassign all direct reports first.`,
        );
      }
    }

    // Keep Employee and User account status synchronized.
    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          ...(dto.employeeId !== undefined && {
            employeeId: dto.employeeId.trim(),
          }),
          ...(dto.fullName !== undefined && {
            fullName: dto.fullName.trim(),
          }),
          ...(dto.phone !== undefined && {
            phone: dto.phone?.trim() || null,
          }),
          ...(dto.dateOfJoining !== undefined && {
            dateOfJoining: new Date(dto.dateOfJoining),
          }),
          ...(dto.designation !== undefined && {
            designation: dto.designation.trim(),
          }),
          ...(dto.departmentId !== undefined && {
            departmentId: dto.departmentId,
          }),
          ...(dto.managerId !== undefined && {
            managerId: dto.managerId || null,
          }),
          ...(dto.accountStatus !== undefined && {
            accountStatus: dto.accountStatus,
          }),
        },
      });

      if (
        dto.email !== undefined ||
        dto.role !== undefined ||
        dto.accountStatus !== undefined ||
        dto.fullName !== undefined ||
        dto.phone !== undefined ||
        dto.designation !== undefined ||
        dto.dateOfJoining !== undefined
      ) {
        await tx.user.update({
          where: { id: employee.userId },
          data: {
            ...(dto.email !== undefined && {
              email: dto.email.trim().toLowerCase(),
            }),
            ...(dto.role !== undefined && {
              role: dto.role,
            }),
            ...(dto.accountStatus !== undefined && {
              accountStatus: dto.accountStatus,
            }),
            ...(dto.fullName !== undefined && {
              fullName: dto.fullName.trim(),
            }),
            ...(dto.phone !== undefined && {
              phone: dto.phone.trim() || null,
            }),
            ...(dto.designation !== undefined && {
              designation: dto.designation.trim(),
            }),
            ...(dto.dateOfJoining !== undefined && {
              dateOfJoining: new Date(dto.dateOfJoining),
            }),
          },
        });
      }
    });

    return this.findOne(id, Role.ADMIN, "");
  }
}
