/**
 * Identity: Supabase Auth issues the token (browser login). This module
 * resolves the application profile + role from PostgreSQL. Roles are NEVER
 * taken from client-submitted metadata.
 */
import { Controller, Get, Module, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, PermissionsGuard } from "../common";
import { PrismaService } from "../prisma/prisma.service";
import { ROLE_PERMISSIONS, type Role, type Permission } from "@gov-hris/contracts";

@Controller("auth")
export class AuthController {
  constructor(private prisma: PrismaService) {}

  /** GET /auth/me — resolve profile, role and capabilities from the DB. */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: { user: { sub: string } }) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { supabaseId: req.user.sub },
      include: { employee: true },
    });
    if (!profile) return { user: null };
    const perms = ROLE_PERMISSIONS[profile.role as Role];
    return {
      user: {
        id: profile.id, email: profile.email, fullName: profile.fullName, role: profile.role,
        employeeId: profile.employeeId,
        permissions: perms === "ALL" ? "ALL" : perms,
        employee: profile.employee ? { id: profile.employee.id, employeeNo: profile.employee.employeeNo, firstName: profile.employee.firstName, lastName: profile.employee.lastName } : null,
      } as { permissions: Permission[] | "ALL" } & Record<string, unknown>,
    };
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  logout() { return { ok: true }; } // Supabase revokes client-side; endpoint exists for audit parity
}

@Module({ controllers: [AuthController], providers: [PrismaService], exports: [PrismaService] })
export class AuthModule {}
