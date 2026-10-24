import type { Db } from "@/lib/db";
import { auth } from "@/auth";
import { nowUtcIso } from "./premium";
import {
  emitOtelLog,
  incrementOtelCounter,
  recordFeatureUsage,
  recordOtelTraceSpan,
} from "./otel";

export type AdminRole = "owner" | "manager" | "editor" | "support";

export type AdminPrivilege =
  | "inventory"
  | "events"
  | "metadata"
  | "blog"
  | "manage_admins";

export interface AdminSession {
  username: string;
  role: AdminRole;
  level: number;
  privileges: AdminPrivilege[];
}

export const ROLE_LEVELS: Record<AdminRole, number> = {
  owner: 100,
  manager: 70,
  editor: 50,
  support: 30,
};

export const DEFAULT_ROLE_PRIVILEGES: Record<AdminRole, AdminPrivilege[]> = {
  owner: ["inventory", "events", "metadata", "blog", "manage_admins"],
  manager: ["inventory", "events", "metadata", "blog"],
  editor: ["inventory", "events", "blog"],
  support: ["events"],
};

export function normalizeAdminRole(rawRole?: string | null): AdminRole {
  if (!rawRole) return "support";
  const lower = rawRole.toLowerCase().trim();
  if (lower === "owner" || lower === "superadmin" || lower === "root") {
    return "owner";
  }
  if (lower === "manager") return "manager";
  if (lower === "editor") return "editor";
  return "support";
}

export function normalizeAdminPrivileges(
  role: AdminRole,
  customPrivileges?: unknown
): AdminPrivilege[] {
  if (role === "owner") {
    return [...DEFAULT_ROLE_PRIVILEGES.owner];
  }
  if (Array.isArray(customPrivileges) && customPrivileges.length > 0) {
    const valid: AdminPrivilege[] = [];
    const allowed: AdminPrivilege[] = [
      "inventory",
      "events",
      "metadata",
      "blog",
    ];
    for (const p of customPrivileges) {
      if (typeof p === "string" && allowed.includes(p as AdminPrivilege)) {
        if (!valid.includes(p as AdminPrivilege)) {
          valid.push(p as AdminPrivilege);
        }
      }
    }
    if (valid.length > 0) return valid;
  }
  return [...DEFAULT_ROLE_PRIVILEGES[role]];
}

export function buildAdminSession(doc: {
  username: string;
  role?: string;
  privileges?: unknown;
}): AdminSession {
  const defaultRootUsername = process.env.ADMIN_USERNAME || "admin";
  const role: AdminRole =
    doc.username === defaultRootUsername
      ? "owner"
      : normalizeAdminRole(doc.role);
  const level = ROLE_LEVELS[role];
  const privileges = normalizeAdminPrivileges(role, doc.privileges);
  return {
    username: doc.username,
    role,
    level,
    privileges,
  };
}

/**
 * Resolves the signed-in admin from the Auth.js session cookie and, when a database
 * connection is available, cross-checks the `admins` table so deleted accounts are
 * rejected and role/privilege updates take effect immediately.
 * Never trusts request headers or URL query parameters (such as `?admin=1`).
 * The `request` argument is kept for call-site compatibility; the session comes from cookies.
 */
export async function resolveAdminSessionFromRequest(
  _request?: Request,
  db?: Db | null
): Promise<AdminSession | null> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.kind !== "admin" || !user.username) return null;
  const username = user.username;
  if (!db) return buildAdminSession({ username });

  const rootUsername = process.env.ADMIN_USERNAME || "admin";
  const adminDoc = await db.collection("admins").findOne({ username });
  if (!adminDoc) {
    if (username === rootUsername) {
      return buildAdminSession({ username: rootUsername, role: "owner" });
    }
    return null;
  }

  return buildAdminSession({
    username: adminDoc.username,
    role: adminDoc.role,
    privileges: adminDoc.privileges,
  });
}

/**
 * Resolves the signed-in customer from the Auth.js session cookie and verifies the
 * account exists in the `users` table. The email always comes from the verified session,
 * never from a header or request body.
 */
export async function resolveCustomerUserFromRequest(
  _request?: Request,
  db?: Db | null
): Promise<{ email: string; name: string } | null> {
  const session = await auth();
  const user = session?.user;
  if (!user || user.kind !== "customer" || !user.email) return null;
  const email = user.email.trim().toLowerCase();

  if (db) {
    const userDoc = await db.collection("users").findOne({ email });
    if (!userDoc) return null;
    return {
      email: String(userDoc.email || email),
      name: String(userDoc.name || email.split("@")[0]),
    };
  }

  return { email, name: email.split("@")[0] || "Customer" };
}

export function hasAdminPrivilege(
  session: AdminSession | null,
  requiredPrivilege?: AdminPrivilege
): boolean {
  if (!session) return false;
  if (session.role === "owner") return true;
  if (!requiredPrivilege) return true;
  return session.privileges.includes(requiredPrivilege);
}

// ============================================================================
// IMMUTABLE ADMIN AUDIT LOGS WITH DEEPLY FROZEN RAW VALUES
// ============================================================================

export type AuditEntityType =
  | "item"
  | "event"
  | "order"
  | "metadata"
  | "premium_class"
  | "user_premium_assignment"
  | "blog_post"
  | "admin_account";

export type AuditActionType = "create" | "update" | "delete" | "bulk-csv";

export interface AdminAuditLogRow {
  id: string;
  createdAtUtc: string;
  adminUsername: string;
  adminRole: AdminRole;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditActionType;
  summary: string;
  frozenData: Readonly<{
    before: unknown;
    after: unknown;
  }>;
}

export function sanitizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key === "_id") continue;
    if (key === "password" || key === "passwordHash") {
      result[key] = "[REDACTED]";
      continue;
    }
    result[key] = sanitizeAuditValue(val);
  }
  return result;
}

export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      deepFreeze(obj[i]);
    }
    return Object.freeze(obj) as unknown as Readonly<T>;
  }
  for (const val of Object.values(obj as Record<string, unknown>)) {
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return Object.freeze(obj);
}

export function createFrozenAuditRow(params: {
  session: AdminSession;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditActionType;
  summary: string;
  before: unknown;
  after: unknown;
  nowUtc?: string;
}): Readonly<AdminAuditLogRow> {
  const createdAtUtc = params.nowUtc || nowUtcIso();
  const sanitizedBefore = sanitizeAuditValue(params.before);
  const sanitizedAfter = sanitizeAuditValue(params.after);

  const row: AdminAuditLogRow = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAtUtc,
    adminUsername: params.session.username,
    adminRole: params.session.role,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    summary: params.summary,
    frozenData: {
      before: sanitizedBefore,
      after: sanitizedAfter,
    },
  };

  return deepFreeze(row);
}

const memoryAuditLogs: Readonly<AdminAuditLogRow>[] = [];

export async function recordAdminAuditLog(
  db: Db | null,
  params: {
    session: AdminSession | null;
    entityType: AuditEntityType;
    entityId: string;
    action: AuditActionType;
    summary: string;
    before: unknown;
    after: unknown;
  }
): Promise<Readonly<AdminAuditLogRow>> {
  const effectiveSession =
    params.session ||
    buildAdminSession({
      username: process.env.ADMIN_USERNAME || "admin",
      role: "owner",
    });

  const frozenRow = createFrozenAuditRow({
    session: effectiveSession,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    summary: params.summary,
    before: params.before,
    after: params.after,
  });

  memoryAuditLogs.unshift(frozenRow);

  if (db) {
    // Store an immutable copy in the admin_audit_logs table
    await db.collection("admin_audit_logs").insertOne({
      id: frozenRow.id,
      createdAtUtc: frozenRow.createdAtUtc,
      adminUsername: frozenRow.adminUsername,
      adminRole: frozenRow.adminRole,
      entityType: frozenRow.entityType,
      entityId: frozenRow.entityId,
      action: frozenRow.action,
      summary: frozenRow.summary,
      frozenData: frozenRow.frozenData,
    });
  }

  // Emit OpenTelemetry Counter, Feature Usage, Trace Span & Structured LogRecord (pushed to Loki & scraped by Prometheus)
  await incrementOtelCounter(db, "dockside_admin_audit_logs_total", 1, {
    entity_type: frozenRow.entityType,
    action: frozenRow.action,
    admin_role: frozenRow.adminRole,
  });
  await recordFeatureUsage(
    db,
    `admin_${frozenRow.entityType}_${frozenRow.action}`,
    {
      adminUsername: frozenRow.adminUsername,
      entityId: frozenRow.entityId,
    }
  );
  await recordOtelTraceSpan(db, {
    operation: `admin.audit.${frozenRow.entityType}.${frozenRow.action}`,
    durationMs: 2,
    status: "OK",
    attributes: {
      auditId: frozenRow.id,
      entityId: frozenRow.entityId,
      adminUsername: frozenRow.adminUsername,
    },
  });
  await emitOtelLog(db, {
    severityText: "INFO",
    category: `admin.audit.${frozenRow.entityType}`,
    body: frozenRow.summary,
    attributes: {
      auditId: frozenRow.id,
      adminUsername: frozenRow.adminUsername,
      adminRole: frozenRow.adminRole,
      entityType: frozenRow.entityType,
      entityId: frozenRow.entityId,
      action: frozenRow.action,
    },
  });

  return frozenRow;
}

export async function getAdminAuditLogs(
  db: Db | null,
  limit = 200
): Promise<Readonly<AdminAuditLogRow>[]> {
  if (db) {
    const docs = await db
      .collection("admin_audit_logs")
      .find({})
      .sort({ createdAtUtc: -1 })
      .limit(limit)
      .toArray();
    return docs.map((d) =>
      deepFreeze({
        id: String(d.id || d._id),
        createdAtUtc: String(d.createdAtUtc || ""),
        adminUsername: String(d.adminUsername || "admin"),
        adminRole: normalizeAdminRole(d.adminRole),
        entityType: (d.entityType as AuditEntityType) || "item",
        entityId: String(d.entityId || ""),
        action: (d.action as AuditActionType) || "update",
        summary: String(d.summary || ""),
        frozenData: {
          before: sanitizeAuditValue(d.frozenData?.before ?? null),
          after: sanitizeAuditValue(d.frozenData?.after ?? null),
        },
      })
    );
  }
  return [...memoryAuditLogs].slice(0, limit);
}
