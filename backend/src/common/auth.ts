import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";

import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma.service";
import { Role } from "@prisma/client";

export const Roles = (...roles: Role[]) => SetMetadata("roles", roles);

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Authentication required");
    }

    const token = authorization.slice(7);

    try {
      const payload = this.jwt.verify(token);

      const user = await this.prisma.user.findUnique({
        where: {
          id: payload.id,
        },
        select: {
          id: true,
          email: true,
          role: true,
          accountStatus: true,
          employee: {
            select: {
              id: true,
              employeeId: true,
              accountStatus: true,
            },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      /*
       * User and Employee account status are kept synchronized.
       *
       * If either account is inactive, immediately block access.
       * This also handles employees who were already logged in
       * before an administrator deactivated them.
       */
      if (
        user.accountStatus === "INACTIVE" ||
        user.employee?.accountStatus === "INACTIVE"
      ) {
        throw new ForbiddenException("Your account has been deactivated");
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employee?.id,
      };

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>("roles", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!roles?.length) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest();

    if (!roles.includes(req.user?.role)) {
      throw new ForbiddenException("Access denied");
    }

    return true;
  }
}

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  employeeId?: string;
};
