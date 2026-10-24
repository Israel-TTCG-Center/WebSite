import { NextResponse } from "next/server";
import { getDb, getPremiumClassesFromDb } from "@/lib/mongodb";
import {
  hasAdminPrivilege,
  recordAdminAuditLog,
  resolveAdminSessionFromRequest,
} from "@/lib/admin";
import {
  calculateLoyaltyStatus,
  nowUtcIso,
  type PremiumClass,
} from "@/lib/premium";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email") || "guest@local";

  const db = await getDb();
  const classes = await getPremiumClassesFromDb();

  if (!db) {
    const loyalty = calculateLoyaltyStatus([], classes, null);
    return NextResponse.json({ classes, loyalty, users: [] });
  }

  const session = await resolveAdminSessionFromRequest(request, db);
  const isAdmin = Boolean(session);

  const userDoc = await db.collection("users").findOne({ email });
  const assignedClassId = userDoc?.assignedClassId || null;

  const userOrders = await db
    .collection("orders")
    .find({ "customer.email": email })
    .toArray();

  const loyalty = calculateLoyaltyStatus(
    userOrders as any[],
    classes,
    assignedClassId
  );

  let usersList: any[] = [];
  if (isAdmin) {
    const allUsers = await db.collection("users").find({}).toArray();
    usersList = allUsers.map((u) => ({
      email: u.email,
      name: u.name || u.email,
      assignedClassId: u.assignedClassId || null,
    }));
  }

  return NextResponse.json({ classes, loyalty, users: usersList });
}

export async function POST(request: Request) {
  const db = await getDb();
  const session = await resolveAdminSessionFromRequest(request, db);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }
  if (!hasAdminPrivilege(session, "metadata")) {
    return NextResponse.json(
      { error: "Forbidden: Missing 'metadata' admin privilege" },
      { status: 403 }
    );
  }

  const body = await request.json();
  if (!body.id || !body.name) {
    return NextResponse.json(
      { error: "id and name are required" },
      { status: 400 }
    );
  }

  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const existingBefore = await db
    .collection("premium_classes")
    .findOne({ id: String(body.id).trim() });

  const isPointsReachable =
    body.isPointsReachable !== undefined
      ? Boolean(body.isPointsReachable)
      : true;
  const minPoints =
    isPointsReachable &&
    body.minPoints !== undefined &&
    body.minPoints !== "" &&
    body.minPoints !== null &&
    Number(body.minPoints) > 0
      ? Number(body.minPoints)
      : null;

  const cls: PremiumClass = {
    id: String(body.id).trim(),
    name: String(body.name).trim(),
    name_he: String(body.name_he || body.name).trim(),
    minPoints,
    discountPercent: Math.max(0, Math.min(100, Number(body.discountPercent ?? 0))),
    isPointsReachable,
    updatedAtUtc: nowUtcIso(),
  };

  await db
    .collection("premium_classes")
    .updateOne({ id: cls.id }, { $set: cls }, { upsert: true });

  await recordAdminAuditLog(db, {
    session,
    entityType: "premium_class",
    entityId: cls.id,
    action: existingBefore ? "update" : "create",
    summary: `${existingBefore ? "Updated" : "Created"} premium class '${cls.name}' (${cls.discountPercent}% discount)`,
    before: existingBefore,
    after: cls,
  });

  const classes = await getPremiumClassesFromDb();
  return NextResponse.json({ ok: true, class: cls, classes });
}

export async function DELETE(request: Request) {
  const db = await getDb();
  const session = await resolveAdminSessionFromRequest(request, db);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }
  if (!hasAdminPrivilege(session, "metadata")) {
    return NextResponse.json(
      { error: "Forbidden: Missing 'metadata' admin privilege" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const existingBefore = await db.collection("premium_classes").findOne({ id });
  await db.collection("premium_classes").deleteOne({ id });

  await recordAdminAuditLog(db, {
    session,
    entityType: "premium_class",
    entityId: id,
    action: "delete",
    summary: `Deleted premium class '${id}'`,
    before: existingBefore,
    after: null,
  });

  const classes = await getPremiumClassesFromDb();
  return NextResponse.json({ ok: true, classes });
}

export async function PATCH(request: Request) {
  const db = await getDb();
  const session = await resolveAdminSessionFromRequest(request, db);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }
  if (!hasAdminPrivilege(session, "metadata")) {
    return NextResponse.json(
      { error: "Forbidden: Missing 'metadata' admin privilege" },
      { status: 403 }
    );
  }

  const { email, assignedClassId } = await request.json();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const existingUser = await db.collection("users").findOne({ email });
  const normalizedClassId =
    assignedClassId && String(assignedClassId).trim() !== ""
      ? String(assignedClassId).trim()
      : null;

  await db.collection("users").updateOne(
    { email },
    {
      $set: {
        email,
        assignedClassId: normalizedClassId,
        updatedAtUtc: nowUtcIso(),
      },
      $setOnInsert: {
        name: email.split("@")[0],
        createdAtUtc: nowUtcIso(),
      },
    },
    { upsert: true }
  );

  await recordAdminAuditLog(db, {
    session,
    entityType: "user_premium_assignment",
    entityId: email,
    action: "update",
    summary: `Updated special/affiliate class assignment for '${email}' to '${normalizedClassId || "none"}'`,
    before: {
      email,
      assignedClassId: existingUser?.assignedClassId || null,
    },
    after: {
      email,
      assignedClassId: normalizedClassId,
    },
  });

  return NextResponse.json({
    ok: true,
    email,
    assignedClassId: normalizedClassId,
  });
}
