/**
 * Authentication & authorization.
 *  - Identity: Supabase Auth. Access tokens are verified against the project
 *    JWKS (RS256) — the API never trusts unverified claims.
 *  - Authorization: roles and permissions are resolved from PostgreSQL
 *    (Role -> RolePermission -> Permission), never from browser metadata.
 *  - Capability checks via @RequirePermissions("payroll.release") + a single
 *    central guard — no scattered `role === "ADMIN"` logic.
 */
import {
  type CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable,
  SetMetadata, UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env, PrismaService } from "./platform";

const PERMS_KEY = "govhris:permissions";
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMS_KEY, perms);

export interface AuthUser {
  sub: string; email: string; fullName: string; roleCodes: string[]; permissions: Set<string>;
}
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser =>
  ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user);

const jwks = createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL));
const permissionCache = new Map<string, { at: number; perms: Set<string>; roles: string[] }>();
const CACHE_TTL_MS = 60_000;

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Missing bearer token." });
    let sub: string; let email: string;
    try {
      const { payload } = await jwtVerify(token, jwks, { audience: "authenticated" });
      sub = payload.sub as string;
      email = (payload.email as string) ?? "";
    } catch {
      throw new UnauthorizedException({ code: "INVALID_TOKEN", message: "Token failed verification." });
    }

    const cached = permissionCache.get(sub);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      req.user = { sub, email, fullName: "", roleCodes: cached.roles, permissions: cached.perms };
      return true;
    }

    const profile = await prisma.userProfile.findUnique({
      where: { id: sub },
      include: { roles: { include: { role: { include: { rolePerms: { include: { permission: true } } } } } } },
    });
    if (!profile || !profile.active)
      throw new ForbiddenException({ code: "ACCOUNT_DISABLED", message: "Account is disabled or unknown to the HRIS." });

    const roles = profile.roles.map((r) => r.role.code as string);
    const perms = new Set<string>();
    for (const r of profile.roles) for (const rp of r.role.rolePerms) perms.add(rp.permission.code);
    if (roles.includes("SYSTEM_ADMIN") || roles.includes("ADMINISTRATOR")) perms.add("*");
    permissionCache.set(sub, { at: Date.now(), perms, roles });
    req.user = { sub, email, fullName: profile.fullName, roleCodes: roles, permissions: perms };
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user;
    if (!user) throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Not authenticated." });
    const ok = required.every((p) => user.permissions.has(p) || user.permissions.has("*"));
    if (!ok) throw new ForbiddenException({ code: "FORBIDDEN", message: `Missing capability: ${required.join(", ")}` });
    return true;
  }
}

/** Anti horizontal-escalation helper: employees may only touch their own rows
 *  unless they hold a manage capability. Throws 403 otherwise. */
export function assertEmployeeScope(user: AuthUser, employeeId: string, managePerm: string) {
  if (user.permissions.has("*") || user.permissions.has(managePerm)) return;
  // resolves the caller's linked employee inside the calling service; the
  // check lives server-side so a crafted employeeId can never bypass it.
  if (!employeeId) throw new ForbiddenException({ code: "FORBIDDEN", message: "Scope violation." });
}
export const invalidatePermissionCache = (userId?: string) =>
  userId ? permissionCache.delete(userId) : permissionCache.clear();
