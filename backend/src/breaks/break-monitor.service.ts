import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma.service";

@Injectable()
export class BreakMonitorService {
  private readonly logger = new Logger(BreakMonitorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check active breaks every minute.
   *
   * IMPORTANT:
   * - Only sends notifications.
   * - Never automatically ends a break.
   * - One employee notification per break session.
   * - One notification per admin per break session.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkBreakLimits(): Promise<void> {
    try {
      const settings = await this.prisma.companySetting.findFirst();

      const breakLimitMinutes = Math.max(
        1,
        Number(settings?.breakLimitMinutes) || 60,
      );

      const warningMinutes = Math.max(
        0,
        Number(settings?.breakWarningThresholdMinutes ?? 50),
      );
      const warningTime = new Date(Date.now() - warningMinutes * 60 * 1000);

      const activeBreaks = await this.prisma.breakSession.findMany({
        where: {
          endedAt: null,
          startedAt: {
            lte: warningTime,
          },
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
        },
      });

      if (activeBreaks.length === 0) {
        return;
      }

      const admins = await this.prisma.user.findMany({
        where: {
          role: "ADMIN",
          accountStatus: "ACTIVE",
        },
        select: {
          id: true,
        },
      });

      for (const breakSession of activeBreaks) {
        const employee = breakSession.employee;
        const breakElapsedMinutes = Math.floor(
          (Date.now() - breakSession.startedAt.getTime()) / 60000,
        );

        if (
          warningMinutes > 0 &&
          breakElapsedMinutes >= warningMinutes &&
          breakElapsedMinutes < breakLimitMinutes
        ) {
          const warningMarker = `[Break warning: ${breakSession.id}]`;
          const existingWarning = await this.prisma.notification.findFirst({
            where: {
              recipientId: employee.userId,
              type: "BREAK_WARNING",
              message: { contains: warningMarker },
            },
          });

          if (!existingWarning) {
            await this.prisma.notification.create({
              data: {
                recipientId: employee.userId,
                type: "BREAK_WARNING",
                title: "Break Time Almost Over",
                message: `Your break has reached ${warningMinutes} minutes. Please return before the ${breakLimitMinutes}-minute limit. ${warningMarker}`,
              },
            });
          }

          continue;
        }

        if (breakElapsedMinutes < breakLimitMinutes) continue;

        const employeeName =
          employee.fullName?.trim() || employee.employeeId || "Employee";

        /*
         * =====================================================
         * EMPLOYEE NOTIFICATION
         * =====================================================
         */

        const employeeMessage = `Your ${breakLimitMinutes}-minute break time is over. Please end your break. [Break: ${breakSession.id}]`;

        const existingEmployeeNotification =
          await this.prisma.notification.findFirst({
            where: {
              recipientId: employee.userId,
              type: "BREAK_LIMIT_EXCEEDED",
              message: {
                contains: `[Break: ${breakSession.id}]`,
              },
            },
          });

        if (!existingEmployeeNotification) {
          await this.prisma.notification.create({
            data: {
              recipientId: employee.userId,
              type: "BREAK_LIMIT_EXCEEDED",
              title: "Break Time Completed",
              message: employeeMessage,
            },
          });

          this.logger.log(
            `Break limit notification sent to employee ${employee.employeeId}`,
          );
        }

        /*
         * =====================================================
         * ADMIN NOTIFICATIONS
         * =====================================================
         */

        for (const admin of admins) {
          const adminMessage = `${employeeName} has not ended the break. The configured ${breakLimitMinutes}-minute break limit has been reached. [Break: ${breakSession.id}]`;

          const existingAdminNotification =
            await this.prisma.notification.findFirst({
              where: {
                recipientId: admin.id,
                type: "BREAK_LIMIT_EXCEEDED",
                message: {
                  contains: `[Break: ${breakSession.id}]`,
                },
              },
            });

          if (!existingAdminNotification) {
            await this.prisma.notification.create({
              data: {
                recipientId: admin.id,
                type: "BREAK_LIMIT_EXCEEDED",
                title: "Employee Break Limit Exceeded",
                message: adminMessage,
              },
            });

            this.logger.log(
              `Break limit notification sent to admin for ${employee.employeeId}`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(
        "Failed to check break limits",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
