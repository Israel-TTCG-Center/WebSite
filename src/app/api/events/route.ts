import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPaginatedEvents, normalizeDoc } from "@/lib/store";
import { normalizeMoney } from "@/lib/money";
import {
  hasAdminPrivilege,
  recordAdminAuditLog,
  resolveAdminSessionFromRequest,
} from "@/lib/admin";
import { nowUtcIso } from "@/lib/premium";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const maxPriceRaw = searchParams.get("maxPrice");
  const maxPrice =
    maxPriceRaw !== null && maxPriceRaw !== "" && !Number.isNaN(Number(maxPriceRaw))
      ? Number(maxPriceRaw)
      : undefined;
  const sortParam = searchParams.get("sort");
  const sort =
    sortParam === "newest" ||
    sortParam === "oldest" ||
    sortParam === "price-asc" ||
    sortParam === "price-desc"
      ? sortParam
      : "newest";

  // Verify the logged-in admin entity from headers & DB (never trust URL query params)
  const db = await getDb();
  const session = await resolveAdminSessionFromRequest(request, db);
  const isAdmin = Boolean(session);

  const includeOutOfStock =
    isAdmin || searchParams.get("includeOutOfStock") === "1";
  const includeHidden = isAdmin;

  const page = searchParams.get("page") ? Number(searchParams.get("page")) : 1;
  const pageSize = searchParams.get("pageSize")
    ? Number(searchParams.get("pageSize"))
    : 50;

  const { events, pagination } = await getPaginatedEvents({
    page,
    pageSize,
    search,
    maxPrice,
    includeOutOfStock,
    includeHidden,
    sort,
  });

  return NextResponse.json({ events, items: events, pagination });
}

export async function POST(request: Request) {
  const db = await getDb();
  const session = await resolveAdminSessionFromRequest(request, db);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }
  if (!hasAdminPrivilege(session, "events")) {
    return NextResponse.json(
      { error: "Forbidden: Missing 'events' admin privilege" },
      { status: 403 }
    );
  }
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const body = await request.json();
  if (!body.title || !body.slug) {
    return NextResponse.json(
      { error: "title and slug are required" },
      { status: 400 }
    );
  }

  const money = normalizeMoney(body.money ?? body.price, "ILS");
  const quantity =
    body.quantity !== undefined ? Math.max(0, Number(body.quantity)) : 16;
  const minPlayers =
    body.minPlayers !== undefined &&
    body.minPlayers !== "" &&
    body.minPlayers !== null &&
    Number(body.minPlayers) > 0
      ? Number(body.minPlayers)
      : null;
  const maxPlayers =
    body.maxPlayers !== undefined &&
    body.maxPlayers !== "" &&
    Number(body.maxPlayers) > 0
      ? Number(body.maxPlayers)
      : Math.max(1, quantity);
  const nowUtc = nowUtcIso();

  const existingBefore = await db
    .collection("events")
    .findOne({ slug: body.slug });

  const newEvent: Record<string, any> = {
    slug: body.slug,
    kind: "event",
    type: "ticket",
    category: "Event Tickets",
    title: body.title,
    title_he: body.title_he || body.title,
    money,
    description: body.description || "",
    description_he: body.description_he || body.description || "",
    imageUrl: body.imageUrl || "",
    quantity,
    inStock:
      body.inStock !== undefined
        ? Boolean(body.inStock) && quantity > 0
        : quantity > 0,
    isHidden: Boolean(body.isHidden),
    facebookUrl: body.facebookUrl || "",
    eventDate: body.eventDate || "",
    venue: body.venue || "",
    showRegisteredCount: Boolean(body.showRegisteredCount),
    registeredCount:
      typeof body.registeredCount === "number" ? body.registeredCount : 0,
    minPlayers,
    maxPlayers,
    createdAtUtc: nowUtc,
    updatedAtUtc: nowUtc,
  };

  await db
    .collection("events")
    .updateOne({ slug: newEvent.slug }, { $set: newEvent }, { upsert: true });

  await recordAdminAuditLog(db, {
    session,
    entityType: "event",
    entityId: newEvent.slug,
    action: existingBefore ? "update" : "create",
    summary: `${existingBefore ? "Updated" : "Created"} event '${newEvent.title}' (${newEvent.slug})`,
    before: existingBefore,
    after: newEvent,
  });

  return NextResponse.json({
    ok: true,
    event: normalizeDoc(newEvent),
    item: normalizeDoc(newEvent),
  });
}

export async function PATCH(request: Request) {
  const db = await getDb();
  const session = await resolveAdminSessionFromRequest(request, db);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }
  if (!hasAdminPrivilege(session, "events")) {
    return NextResponse.json(
      { error: "Forbidden: Missing 'events' admin privilege" },
      { status: 403 }
    );
  }
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const {
    slug,
    inStock,
    quantity,
    money,
    imageUrl,
    description,
    description_he,
    isHidden,
    facebookUrl,
    eventDate,
    venue,
    showRegisteredCount,
    minPlayers,
    maxPlayers,
  } = body;

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const existingBefore = await db.collection("events").findOne({ slug });
  const updateFields: Record<string, unknown> = {
    updatedAtUtc: nowUtcIso(),
  };

  if (quantity !== undefined) {
    const numQty = Math.max(0, Number(quantity));
    updateFields.quantity = numQty;
    updateFields.inStock = numQty > 0;
  } else if (inStock !== undefined) {
    const nextInStock = Boolean(inStock);
    updateFields.inStock = nextInStock;
    if (!nextInStock) {
      updateFields.quantity = 0;
    } else if (
      !existingBefore ||
      !existingBefore.quantity ||
      existingBefore.quantity <= 0
    ) {
      updateFields.quantity = 1;
    }
  }

  if (money !== undefined) updateFields.money = normalizeMoney(money, "ILS");
  if (imageUrl !== undefined) updateFields.imageUrl = String(imageUrl);
  if (description !== undefined) updateFields.description = String(description);
  if (description_he !== undefined)
    updateFields.description_he = String(description_he);
  if (isHidden !== undefined) updateFields.isHidden = Boolean(isHidden);
  if (facebookUrl !== undefined) updateFields.facebookUrl = String(facebookUrl);
  if (eventDate !== undefined) updateFields.eventDate = String(eventDate);
  if (venue !== undefined) updateFields.venue = String(venue);
  if (showRegisteredCount !== undefined) {
    updateFields.showRegisteredCount = Boolean(showRegisteredCount);
  }
  if (minPlayers !== undefined) {
    updateFields.minPlayers =
      minPlayers !== "" && minPlayers !== null && Number(minPlayers) > 0
        ? Number(minPlayers)
        : null;
  }
  if (maxPlayers !== undefined && maxPlayers !== "") {
    updateFields.maxPlayers = Math.max(1, Number(maxPlayers));
  }

  await db.collection("events").updateOne({ slug }, { $set: updateFields });
  const afterDoc = await db.collection("events").findOne({ slug });

  await recordAdminAuditLog(db, {
    session,
    entityType: "event",
    entityId: slug,
    action: "update",
    summary: `Modified event '${slug}' fields (${Object.keys(updateFields).join(", ")})`,
    before: existingBefore,
    after: afterDoc,
  });

  return NextResponse.json({
    ok: true,
    updated: updateFields,
    lockedFields: ["title", "title_he"],
  });
}

export async function DELETE(request: Request) {
  const db = await getDb();
  const session = await resolveAdminSessionFromRequest(request, db);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }
  if (!hasAdminPrivilege(session, "events")) {
    return NextResponse.json(
      { error: "Forbidden: Missing 'events' admin privilege" },
      { status: 403 }
    );
  }
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const existingBefore = await db.collection("events").findOne({ slug });
  await db.collection("events").deleteOne({ slug });

  await recordAdminAuditLog(db, {
    session,
    entityType: "event",
    entityId: slug,
    action: "delete",
    summary: `Deleted event '${slug}'`,
    before: existingBefore,
    after: null,
  });

  return NextResponse.json({ ok: true, deletedSlug: slug });
}
