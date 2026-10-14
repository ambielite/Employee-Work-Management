import {
  Module,
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Req,
  UseGuards,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";

import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma.service";
import { JwtGuard } from "../common/auth";
import * as bcrypt from "bcryptjs";

import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class UpdateMyProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  dateOfJoining?: string;
}

@Controller("auth")
export class AuthController {
  constructor(
    private p: PrismaService,
    private jwt: JwtService,
  ) {}

  @Post("login")
  async login(@Body() b: LoginDto) {
    const u = await this.p.user.findUnique({
      where: { email: b.email.toLowerCase() },
      include: { employee: true },
    });

    if (
      !u ||
      u.accountStatus === "INACTIVE" ||
      !(await bcrypt.compare(b.password, u.passwordHash))
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.p.user.update({
      where: { id: u.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = {
      id: u.id,
      email: u.email,
      role: u.role,
      employeeId: u.employee?.id,
    };

    const companySettings = await this.p.companySetting.findFirst({
      select: { maximumSessionDurationMinutes: true },
    });
    const maxSessionSeconds = Math.max(
      60,
      Number(companySettings?.maximumSessionDurationMinutes ?? 720) * 60,
    );

    return {
      accessToken: this.jwt.sign(payload, { expiresIn: maxSessionSeconds }),
      user: {
        id: u.id,
        email: u.email,
        role: u.role,
        employee: u.employee,
      },
    };
  }

  @UseGuards(JwtGuard)
  @Post("logout")
  logout() {
    return { ok: true };
  }

  @UseGuards(JwtGuard)
  @Get("me")
  async me(@Req() r: any) {
    return this.p.user.findUnique({
      where: { id: r.user.id },
      include: {
        employee: {
          include: {
            department: true,
          },
        },
      },
    });
  }

  /*
   * Update the currently logged-in user's own profile.
   *
   * This endpoint is intentionally separate from /employees/:id
   * so an Admin does not need an Employee record just to edit
   * their own profile.
   */
  @UseGuards(JwtGuard)
  @Patch("me")
  async updateMyProfile(@Req() r: any, @Body() b: UpdateMyProfileDto) {
    const userId = r.user.id;

    const currentUser = await this.p.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!currentUser) {
      throw new UnauthorizedException("User not found");
    }

    const email = b.email?.trim().toLowerCase();

    if (email && email !== currentUser.email) {
      const existingUser = await this.p.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException("Email address is already in use");
      }
    }

    let dateOfJoining: Date | null | undefined = undefined;

    if (b.dateOfJoining !== undefined) {
      if (!b.dateOfJoining.trim()) {
        dateOfJoining = null;
      } else {
        const parsedDate = new Date(b.dateOfJoining);

        if (Number.isNaN(parsedDate.getTime())) {
          throw new BadRequestException("Invalid date of joining");
        }

        dateOfJoining = parsedDate;
      }
    }

    const updatedUser = await this.p.user.update({
      where: { id: userId },
      data: {
        fullName: b.fullName !== undefined ? b.fullName.trim() : undefined,

        email: email || undefined,

        phone: b.phone !== undefined ? b.phone.trim() || null : undefined,

        designation:
          b.designation !== undefined
            ? b.designation.trim() || null
            : undefined,

        dateOfJoining,
      },
      include: {
        employee: {
          include: {
            department: true,
          },
        },
      },
    });

    return updatedUser;
  }
}

@Module({
  controllers: [AuthController],
  providers: [PrismaService],
})
export class AuthModule {}
