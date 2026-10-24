import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  buildAdminSession,
  getAdminAuditLogs,
  resolveAdminSessionFromRequest,
  hasAdminPrivilege,
  normalizeAdminPrivileges,
  normalizeAdminRole,
  recordAdminAuditLog,
  ROLE_LEVELS,
} from "@/lib/admin";
import { hashPasswordScrypt } from "@/lib/auth-security";
import { nowUtcIso } from "@/lib/premium";

export async function GET(request: Request) {
  const session = await resolveAdminSessionFromRequest(request, await getDb());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }

  const db = await getDb();
  const auditLogs = await getAdminAuditLogs(db, 200);

  let admins: any[] = [];
  if (db) {
    const docs = await db.collection("admins").find({}).toArray();
    admins = docs.map((d) => {
      const built = buildAdminSession({
        username: d.username,
        role: d.role,
        privileges: d.privileges,
      });
      return {
        username: built.username,
        role: built.role,
        level: built.level,
        privileges: built.privileges,
        authProvider: d.authProvider || "auth0",
        auth0Sub: d.auth0Sub || `auth0|admin|${built.username}`,
        createdAtUtc: d.createdAtUtc || nowUtcIso(),
        updatedAtUtc: d.updatedAtUtc || d.createdAtUtc || nowUtcIso(),
      };
    });
  } else {
    admins = [
      {
        ...session,
        authProvider: "auth0",
        auth0Sub: `auth0|admin|${session.username}`,
        createdAtUtc: nowUtcIso(),
        updatedAtUtc: nowUtcIso(),
      },
    ];
  }

  return NextResponse.json({
    ok: true,
    currentAdmin: session,
    admins,
    auditLogs,
  });
}

export async function PUT(request: Request) {
  const session = await resolveAdminSessionFromRequest(request, await getDb());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }
  if (!hasAdminPrivilege(session, "manage_admins")) {
    return NextResponse.json(
      { error: "Forbidden: Only the Owner (root admin) can manage admins" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const targetUsername = String(body.username || "").trim();
  const password = String(body.password || "").trim();
  const rawRole = String(body.role || "support").trim();

  if (!targetUsername) {
    return NextResponse.json(
      { error: "Sub-admin username is required" },
      { status: 400 }
    );
  }

  const rootUsername = process.env.ADMIN_USERNAME || "admin";
  if (targetUsername === rootUsername || rawRole.toLowerCase() === "owner") {
    return NextResponse.json(
      {
        error:
          "Cannot overwrite the root Owner account or assign root Owner role to a sub-admin",
      },
      { status: 400 }
    );
  }

  const role = normalizeAdminRole(rawRole);
  const level = ROLE_LEVELS[role];
  const privileges = normalizeAdminPrivileges(role, body.privileges);
  const nowUtc = nowUtcIso();

  const db = await getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  const existing = await db
    .collection("admins")
    .findOne({ username: targetUsername });

  if (!existing && !password) {
    return NextResponse.json(
      { error: "Password is required when creating a new sub-admin" },
      { status: 400 }
    );
  }

  const updateFields: Record<string, any> = {
    username: targetUsername,
    role,
    level,
    privileges,
    authProvider: "auth0",
    auth0Sub: `auth0|admin|${targetUsername}`,
    updatedAtUtc: nowUtc,
    createdByOwner: session.username,
  };
  if (password) {
    updateFields.passwordHash = hashPasswordScrypt(password);
  }

  await db.collection("admins").updateOne(
    { username: targetUsername },
    {
      $set: updateFields,
      $unset: { password: "" },
      $setOnInsert: { createdAtUtc: nowUtc },
    },
    { upsert: true }
  );

  const afterDoc = await db
    .collection("admins")
    .findOne({ username: targetUsername });

  await recordAdminAuditLog(db, {
    session,
    entityType: "admin_account",
    entityId: targetUsername,
    action: existing ? "update" : "create",
    summary: `${existing ? "Updated" : "Created"} sub-admin '${targetUsername}' via Auth0 with role '${role}' (level ${level}) and privileges [${privileges.join(", ")}]`,
    before: existing,
    after: afterDoc,
  });

  return NextResponse.json({
    ok: true,
    subAdmin: {
      username: targetUsername,
      role,
      level,
      privileges,
      authProvider: "auth0",
      auth0Sub: `auth0|admin|${targetUsername}`,
      updatedAtUtc: nowUtc,
    },
  });
}

export async function DELETE(request: Request) {
  const session = await resolveAdminSessionFromRequest(request, await getDb());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }
  if (!hasAdminPrivilege(session, "manage_admins")) {
    return NextResponse.json(
      { error: "Forbidden: Only the Owner (root admin) can remove admins" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const targetUsername = searchParams.get("username");
  const rootUsername = process.env.ADMIN_USERNAME || "admin";

  if (!targetUsername) {
    return NextResponse.json(
      { error: "Missing username parameter" },
      { status: 400 }
    );
  }

  if (targetUsername === rootUsername || targetUsername === session.username) {
    return NextResponse.json(
      { error: "Cannot delete the root Owner account" },
      { status: 403 }
    );
  }

  const db = await getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  const existing = await db
    .collection("admins")
    .findOne({ username: targetUsername });

  if (existing && normalizeAdminRole(existing.role) === "owner") {
    return NextResponse.json(
      { error: "Cannot delete an Owner account" },
      { status: 403 }
    );
  }

  await db.collection("admins").deleteOne({ username: targetUsername });

  await recordAdminAuditLog(db, {
    session,
    entityType: "admin_account",
    entityId: targetUsername,
    action: "delete",
    summary: `Deleted sub-admin '${targetUsername}'`,
    before: existing,
    after: null,
  });

  return NextResponse.json({ ok: true, deletedUsername: targetUsername });
}
