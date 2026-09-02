/**
 * Cross-cutting infrastructure: Supabase JWT authentication, capability-based
 * authorization (PermissionsGuard + @RequirePermissions), audit interceptor,
 * and the safe error envelope. No `role === 'X'` checks in controllers.
 */
import {
  CallHandler, CanActivate, Catch, ExecutionContext, ForbiddenException, HttpException,
  Injectable, NestInterceptor, SetMetadata, UnauthorizedException, UseInterceptors,
  applyDecorators,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import * as jwt from "jsonwebtoken";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import type { Permission, Role } from "@gov-hris/contracts";
import { ROLE_PERMISSIONS } from "@gov-hris/contracts";
import { config } from "./config";
import { PrismaService } from "./prisma/prisma.service";

export interface AuthUser { sub: string; email: string; role: Role; permissions: Permission[]; employeeId?: string; }
export const PERMS_KEY = "govhris:permissions";
export const RequirePermissions = (...perms: Permission[]) => applyDecorators(SetMetadata(PERMS_KEY, perms));

/** Verifies the Supabase access token (HS256 with the Supabase JWT secret). */
export function verifySupabaseToken(token: string): { sub: string; email: string } {
  const secret = (config as { SUPABASE_JWT_SECRET?: string }).SUPABASE_JWT_SECRET;
  if (!secret) throw new UnauthorizedException("Auth is not configured (preview mode has no API identity).");
  const payload = jwt.verify(token, secret, {
    issuer: `${(config as { SUPABASE_URL?: string }).SUPABASE_URL?.replace("https://", "")}/auth/v1`.replace("//auth", "/auth"),
    algorithms: ["HS256"],
  }) as { sub: string; email?: string };
  if (!payload.sub) throw new UnauthorizedException("Invalid token payload.");
  return { sub: payload.sub, email: payload.email ?? "" };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string>; user?: AuthUser }>();
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) throw new UnauthorizedException("Missing bearer token.");
    const claims = verifySupabaseToken(auth.slice(7));
    // Roles & permissions come from the APPLICATION DATABASE — never from the JWT.
    const profile = await this.prisma.userProfile.findUnique({ where: { supabaseId: claims.sub } });
    if (!profile || !profile.active) throw new UnauthorizedException("Account disabled or unknown.");
    const perms = ROLE_PERMISSIONS[profile.role];
    req.user = {
      sub: claims.sub, email: profile.email, role: profile.role,
      permissions: perms === "ALL" ? ([] as Permission[]) : perms,
      employeeId: profile.employeeId ?? undefined,
    };
    (req as { userRole?: Role }).userRole = profile.role;
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true; // public or auth-only route
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser; userRole?: Role }>();
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    const rolePerms = ROLE_PERMISSIONS[req.userRole ?? "APPLICANT"];
    const ok = rolePerms === "ALL" || required.every((p) => rolePerms.includes(p));
    if (!ok) throw new ForbiddenException({ code: "FORBIDDEN", message: `Missing permission: ${required.join(", ")}` });
    return true;
  }
}

/** Appends an immutable audit entry for mutating handlers marked @Audited(). */
export const AUDIT_KEY = "govhris:audit";
export const Audited = (action: string, entity: string) => applyDecorators(SetMetadata(AUDIT_KEY, { action, entity }), UseInterceptors(AuditInterceptor));

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<{ action: string; entity: string } | undefined>(AUDIT_KEY, ctx.getHandler());
    if (!meta) return next.handle();
    return next.handle().pipe(
      tap((result) => {
        const req = ctx.switchToHttp().getRequest<{ user?: AuthUser; correlationId?: string; body?: unknown }>();
        const entityId = (result as { id?: string })?.id ?? req.body && (req.body as { id?: string }).id ?? "—";
        void this.prisma.auditLog.create({
          data: {
            actorId: req.user?.sub ?? "system", actorName: req.user?.email ?? "system",
            action: meta.action, entity: meta.entity, entityId: String(entityId),
            after: meta.action.includes("delete") ? null : (typeof result === "object" ? JSON.parse(JSON.stringify(result)) : null),
            requestId: req.correlationId ?? "—",
          },
        }).catch((e) => console.error("[audit] failed", e));
      }),
    );
  }
}

/** Safe error envelope — never leaks Prisma/SQL internals or stack traces. */
export interface SafeError { code: string; message: string; details?: unknown; correlationId?: string; }
@Catch()
export class AllExceptionsFilter {
  catch(exception: unknown, host: { switchToHttp: () => { getResponse: () => { status: (s: number) => { json: (b: unknown) => void }; setHeader?: (k: string, v: string) => void }; getRequest: () => { correlationId?: string } } }) {
    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();
    let status = 500;
    let body: SafeError = { code: "INTERNAL", message: "Unexpected server error.", correlationId: req.correlationId };
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      body = {
        code: typeof r === "string" ? r : ((r as { code?: string }).code ?? `HTTP_${status}`),
        message: typeof r === "string" ? r : ((r as { message?: string | string[] }).message?.toString() ?? "Request failed."),
        correlationId: req.correlationId,
      };
    } else {
      console.error("[gov-hris/api] unhandled:", exception); // Sentry hook captures in production
    }
    res.status(status).json(body);
  }
}
