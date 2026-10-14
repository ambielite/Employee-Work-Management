import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Query,
  BadRequestException,
  Module,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { JwtGuard, Roles, RolesGuard } from "../common/auth";
import { LeaveStatus, Role } from "@prisma/client";

@Controller("leaves")
@UseGuards(JwtGuard, RolesGuard)
export class LeavesController {
  constructor(private p: PrismaService) {}

  private async emp(r: any) {
    return this.p.employee.findUnique({
      where: { userId: r.user.id },
    });
  }

  private async attachReviewers(rows: any[]) {
    const reviewerIds = Array.from(
      new Set(
        rows
          .map((row) => row.reviewedById)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (reviewerIds.length === 0) {
      return rows.map((row) => ({
        ...row,
        reviewedBy: null,
      }));
    }

    const reviewers = await this.p.user.findMany({
      where: {
        id: {
          in: reviewerIds,
        },
      },
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
    });

    const reviewerMap = new Map(
      reviewers.map((reviewer) => [reviewer.id, reviewer]),
    );

    return rows.map((row) => ({
      ...row,
      reviewedBy: row.reviewedById
        ? reviewerMap.get(row.reviewedById) || null
        : null,
    }));
  }

  /**
   * Get leaves visible to the logged-in user.
   *
   * ADMIN    -> all leave requests
   * MANAGER  -> leave requests of direct reports
   * EMPLOYEE -> own leave requests
   */
  @Get()
  async list(@Req() r: any, @Query("scope") requestedScope?: string) {
    const e = await this.emp(r);
    const scope = String(requestedScope || "").trim().toUpperCase();

    if (r.user.role === Role.MANAGER && !e) {
      throw new ForbiddenException("Employee profile not found.");
    }

    if (
      r.user.role === Role.MANAGER &&
      scope &&
      scope !== "OWN" &&
      scope !== "TEAM"
    ) {
      throw new BadRequestException("Scope must be OWN or TEAM.");
    }

    // Preserve the existing unscoped behavior while allowing managers to
    // request their own leave separately from requests made by direct reports.
    const where: any =
      r.user.role === Role.ADMIN
        ? {}
        : r.user.role === Role.MANAGER
          ? scope === "OWN"
            ? { employeeId: e!.id }
            : { employee: { managerId: e!.id } }
          : { employeeId: e?.id ?? "__missing_employee__" };
    const rows = await this.p.leaveRequest.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            fullName: true,
            managerId: true,
          },
        },
        leaveType: true,
      },
      orderBy: { fromDate: "desc" },
    });

    return this.attachReviewers(rows);
  }

  /**
   * Employee submits a new leave request.
   *
   * After creation:
   * - The employee's reporting manager receives a notification.
   * - All ADMIN users receive a notification.
   */
  @Post()
  async create(@Req() r: any, @Body() b: any) {
    const e = await this.emp(r);

    if (!e) {
      throw new ForbiddenException("Employee profile not found.");
    }

    if (!b.leaveTypeId) {
      throw new ForbiddenException("Leave type is required.");
    }

    if (!b.fromDate || !b.toDate) {
      throw new ForbiddenException("Leave dates are required.");
    }

    if (!b.reason || !String(b.reason).trim()) {
      throw new ForbiddenException("Leave reason is required.");
    }

    const fromDate = new Date(b.fromDate);
    const toDate = new Date(b.toDate);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new ForbiddenException("Invalid leave date.");
    }

    if (toDate < fromDate) {
      throw new ForbiddenException(
        "The end date cannot be before the start date.",
      );
    }

    const leave = await this.p.leaveRequest.create({
      data: {
        employeeId: e.id,
        leaveTypeId: b.leaveTypeId,
        fromDate,
        toDate,
        reason: String(b.reason).trim(),
        halfDay: !!b.halfDay,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            fullName: true,
            managerId: true,
          },
        },
        leaveType: true,
      },
    });

    const recipients = new Set<string>();

    // Notify the employee's reporting manager.
    if (e.managerId) {
      const manager = await this.p.employee.findUnique({
        where: { id: e.managerId },
        select: { userId: true },
      });

      if (manager?.userId) {
        recipients.add(manager.userId);
      }
    }

    // Notify all administrators.
    const admins = await this.p.user.findMany({
      where: {
        role: Role.ADMIN,
      },
      select: {
        id: true,
      },
    });

    for (const admin of admins) {
      recipients.add(admin.id);
    }

    if (recipients.size > 0) {
      await this.p.notification.createMany({
        data: Array.from(recipients).map((recipientId) => ({
          recipientId,
          type: "LEAVE_REQUEST_SUBMITTED",
          title: "New Leave Request",
          message: `${e.fullName} submitted a ${leave.leaveType.name} leave request from ${this.formatDate(fromDate)} to ${this.formatDate(toDate)}. [Leave: ${leave.id}]`,
        })),
      });
    }

    return leave;
  }

  @Patch(":id/approve")
  @Roles(Role.ADMIN, Role.MANAGER)
  async approve(@Req() r: any, @Param("id") id: string, @Body() b: any) {
    return this.review(r, id, "APPROVED", b?.reviewComment);
  }

  @Patch(":id/reject")
  @Roles(Role.ADMIN, Role.MANAGER)
  async reject(@Req() r: any, @Param("id") id: string, @Body() b: any) {
    return this.review(r, id, "REJECTED", b?.reviewComment);
  }

  /**
   * Approve/reject a leave request.
   *
   * MANAGER can review only direct reports.
   * ADMIN can review any employee leave.
   *
   * After review, the employee receives a notification.
   */
  private async review(
    r: any,
    id: string,
    status: LeaveStatus,
    reviewComment?: string,
  ) {
    const reviewer = await this.emp(r);

    const leave = await this.p.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            userId: true,
            employeeId: true,
            fullName: true,
            managerId: true,
          },
        },
        leaveType: true,
      },
    });

    if (!leave) {
      throw new ForbiddenException("Leave request not found.");
    }

    if (
      r.user.role === "MANAGER" &&
      leave.employee.managerId !== reviewer?.id
    ) {
      throw new ForbiddenException(
        "You can review only leave requests from your direct reports.",
      );
    }

    // Do not review the same request again once it has already been processed.
    if (leave.status !== LeaveStatus.PENDING) {
      throw new ForbiddenException(
        `This leave request is already ${leave.status.toLowerCase()}.`,
      );
    }

    const cleanReviewComment =
      typeof reviewComment === "string" && reviewComment.trim()
        ? reviewComment.trim()
        : null;

    const updatedLeave = await this.p.leaveRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: r.user.id,
        reviewedAt: new Date(),
        reviewComment: cleanReviewComment,
      },
      include: {
        employee: {
          select: {
            id: true,
            userId: true,
            employeeId: true,
            fullName: true,
          },
        },
        leaveType: true,
      },
    });

    const statusText =
      status === LeaveStatus.APPROVED ? "approved" : "rejected";

    let message = `Your ${updatedLeave.leaveType.name} leave request from ${this.formatDate(updatedLeave.fromDate)} to ${this.formatDate(updatedLeave.toDate)} has been ${statusText}. [Leave: ${updatedLeave.id}]`;

    if (cleanReviewComment) {
      message += ` Review comment: ${cleanReviewComment}`;
    }

    // Notify every relevant person about the final review.
    // Employee + reporting manager + all admins + reviewer receive the same decision.
    const recipients = new Set<string>();
    recipients.add(updatedLeave.employee.userId);
    recipients.add(r.user.id);

    const employeeWithManager = await this.p.employee.findUnique({
      where: { id: updatedLeave.employee.id },
      select: { managerId: true },
    });

    if (employeeWithManager?.managerId) {
      const manager = await this.p.employee.findUnique({
        where: { id: employeeWithManager.managerId },
        select: { userId: true },
      });
      if (manager?.userId) recipients.add(manager.userId);
    }

    const admins = await this.p.user.findMany({
      where: { role: Role.ADMIN },
      select: { id: true },
    });
    for (const admin of admins) recipients.add(admin.id);

    await this.p.notification.createMany({
      data: Array.from(recipients).map((recipientId) => ({
        recipientId,
        type:
          status === LeaveStatus.APPROVED
            ? "LEAVE_REQUEST_APPROVED"
            : "LEAVE_REQUEST_REJECTED",
        title:
          status === LeaveStatus.APPROVED
            ? "Leave Request Approved"
            : "Leave Request Rejected",
        message,
      })),
    });

    return updatedLeave;
  }

  private formatDate(value: Date) {
    return value.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
}

@Module({
  controllers: [LeavesController],
  providers: [PrismaService],
})
export class LeavesModule {}
