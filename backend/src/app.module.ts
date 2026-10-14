import { ScheduleModule } from "@nestjs/schedule";
import { EmployeesModule } from "./employees/employees.module";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaService } from "./prisma.service";
import { AuthModule } from "./auth/auth.module";
import { WorkSessionsModule } from "./work-sessions/work-sessions.module";
import { TaskTimersModule } from "./task-timers/task-timers.module";
import { BreaksModule } from "./breaks/breaks.module";
import { IdleModule } from "./idle-tracking/idle.module";
import { ProjectsModule } from "./projects/projects.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { TasksModule } from "./tasks/tasks.module";
import { LeavesModule } from "./leaves/leaves.module";
import { AdminModule } from "./admin.module";
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    ScheduleModule.forRoot(),

    JwtModule.registerAsync({
      global: true,
      useFactory: (c: ConfigService) => ({
        secret: c.get("JWT_SECRET") || "dev-secret",
        signOptions: { expiresIn: c.get("JWT_EXPIRES_IN") || "8h" },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    AttendanceModule,
    BreaksModule,
    IdleModule,
    WorkSessionsModule,
    TaskTimersModule,
    ProjectsModule,
    TasksModule,
    LeavesModule,
    AdminModule,
    EmployeesModule,
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}
