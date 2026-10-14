import {
  PrismaClient,
  Role,
  TaskStatus,
  TaskPriority,
  ProjectStatus,
} from "@prisma/client";

import * as bcrypt from "bcryptjs";

const p = new PrismaClient();

async function main() {
  const pass = await bcrypt.hash("REMOVED_DEMO_PASSWORD", 12);

  const it = await p.department.upsert({
    where: {
      name: "Technology",
    },
    update: {},
    create: {
      name: "Technology",
    },
  });

  const ops = await p.department.upsert({
    where: {
      name: "Operations",
    },
    update: {},
    create: {
      name: "Operations",
    },
  });

  const admin = await p.user.upsert({
    where: {
      email: "admin@example.com",
    },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash: pass,
      role: Role.ADMIN,
    },
  });

  const managerU = await p.user.upsert({
    where: {
      email: "manager@example.com",
    },
    update: {},
    create: {
      email: "manager@example.com",
      passwordHash: pass,
      role: Role.MANAGER,
    },
  });

  const manager = await p.employee.upsert({
    where: {
      userId: managerU.id,
    },
    update: {},
    create: {
      userId: managerU.id,
      employeeId: "MGR001",
      fullName: "Demo Manager",
      dateOfJoining: new Date("2024-01-01"),
      designation: "Engineering Manager",
      departmentId: it.id,
    },
  });

  await p.user.update({
    where: {
      id: admin.id,
    },
    data: {
      accountStatus: "ACTIVE",
    },
  });

  const names = [
    "Aarav Sharma",
    "Priya Patil",
    "Rahul Joshi",
    "Neha Kulkarni",
    "Vikram Singh",
  ];

  for (let i = 0; i < names.length; i++) {
    const email =
      i === 0 ? "employee@example.com" : `employee${i + 1}@example.com`;

    const u = await p.user.upsert({
      where: {
        email,
      },
      update: {},
      create: {
        email,
        passwordHash: pass,
        role: Role.EMPLOYEE,
      },
    });

    await p.employee.upsert({
      where: {
        userId: u.id,
      },
      update: {},
      create: {
        userId: u.id,
        employeeId: `EMP00${i + 1}`,
        fullName: names[i],
        dateOfJoining: new Date("2025-01-01"),
        designation: i % 2 ? "Developer" : "Executive",
        departmentId: i % 2 ? it.id : ops.id,
        managerId: manager.id,
      },
    });
  }

  const leave = await p.leaveType.upsert({
    where: {
      name: "Casual Leave",
    },
    update: {},
    create: {
      name: "Casual Leave",
    },
  });

  await p.leaveType.upsert({
    where: {
      name: "Sick Leave",
    },
    update: {},
    create: {
      name: "Sick Leave",
    },
  });

  await p.holiday.upsert({
    where: {
      date: new Date("2026-09-14T00:00:00Z"),
    },
    update: {},
    create: {
      name: "Demo Holiday",
      date: new Date("2026-09-14T00:00:00Z"),
      description: "Demo seeded holiday",
    },
  });

  const project = await p.project.upsert({
    where: {
      name: "Internal Operations",
    },
    update: {},
    create: {
      name: "Internal Operations",
      description: "Demo project",
      status: ProjectStatus.ACTIVE,
      managerId: manager.id,
      departmentId: ops.id,
    },
  });

  const emp = await p.employee.findUnique({
    where: {
      employeeId: "EMP001",
    },
  });

  if (emp) {
    await p.task.upsert({
      where: {
        taskNumber: "TASK-00001",
      },
      update: {},
      create: {
        taskNumber: "TASK-00001",
        title: "Complete onboarding checklist",
        description: "Demo task",
        projectId: project.id,
        assignedToId: emp.id,

        // IMPORTANT:
        // Task creator is now linked to User, not Employee.
        assignedByUserId: managerU.id,

        priority: TaskPriority.MEDIUM,
        status: TaskStatus.IN_PROGRESS,
        estimatedMinutes: 120,
      },
    });

    await p.leaveRequest.create({
      data: {
        employeeId: emp.id,
        leaveTypeId: leave.id,
        fromDate: new Date("2026-10-02"),
        toDate: new Date("2026-10-02"),
        reason: "Demo leave request",
      },
    });
  }

  await p.companySetting.upsert({
    where: {
      id: "00000000-0000-0000-0000-000000000001",
    },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      workingDays: [
        "MONDAY",
        "TUESDAY",
        "WEDNESDAY",
        "THURSDAY",
        "FRIDAY",
        "SATURDAY",
      ],
    },
  });

  console.log(
    "Seed complete. Development password for all accounts: REMOVED_DEMO_PASSWORD",
  );
}

main().finally(() => p.$disconnect());
