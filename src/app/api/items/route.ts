import { NextResponse } from "next/server";
import { getDb, getPaginatedItems, normalizeDoc } from "@/lib/mongodb";
import { normalizeMoney } from "@/lib/money";
import {
  hasAdminPrivilege,
  recordAdminAuditLog,
  resolveAdminSessionFromRequest,
} from "@/lib/admin";
import {
  canTransitionItemStage,
  getItemSaleStage,
  nowUtcIso,
  parseInventoryCsv,
  toUtcIso,
  type SaleStage,
} from "@/lib/premium";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || undefined;
  const kindParam = searchParams.get("kind");
  const kind =
    kindParam === "item" || kindParam === "event" ? kindParam : undefined;
  const type = searchParams.get("type") || undefined;
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

  // Never trust URL parameters (e.g. ?admin=1) to determine if request is from an admin.
  // Always verify the logged-in admin entity.
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

  const { items, pagination } = await getPaginatedItems({
    page,
    pageSize,
    kind: kind || "item",
    category,
    type,
    search,
    maxPrice,
    includeOutOfStock,
    includeHidden,
    sort,
  });

  return NextResponse.json({ items, pagination });
}

export async function POST(request: Request) {
  const db = await getDb();
  const session = await resolveAdminSessionFromRequest(request, db);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }

  const body = await request.json();
  const isEventPayload =
    body.kind === "event" ||
    body.type === "ticket" ||
    body.category === "Event Tickets";
  const requiredPriv = isEventPayload ? "events" : "inventory";
  if (!hasAdminPrivilege(session, requiredPriv)) {
    return NextResponse.json(
      { error: `Forbidden: Missing '${requiredPriv}' admin privilege` },
      { status: 403 }
    );
  }

  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const nowUtc = nowUtcIso();

  // Support bulk CSV upload for new store inventory items (saved in "items" collection)
  if (typeof body.csvText === "string") {
    const parsedRows = parseInventoryCsv(body.csvText);
    if (parsedRows.length === 0) {
      return NextResponse.json(
        { error: "No valid CSV rows found" },
        { status: 400 }
      );
    }

    const importedItems = [];
    for (const row of parsedRows) {
      const existingBefore = await db
        .collection("items")
        .findOne({ slug: row.slug });
      const money = normalizeMoney(
        { price: row.price, currencyId: row.currencyId },
        "ILS"
      );
      const doc: Record<string, any> = {
        slug: row.slug,
        kind: "item",
        type: "item",
        category: "Store Items",
        title: row.title,
        title_he: row.title_he || row.title,
        money,
        description: row.description || "",
        description_he: row.description || "",
        imageUrl: row.imageUrl || "",
        quantity: row.quantity,
        inStock: row.quantity > 0,
        isHidden: false,
        wontBeStocked: false,
        revealAtUtc: null,
        preOrderAtUtc: null,
        comingSoonAtUtc: null,
        regularSaleAtUtc: null,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      };
      await db
        .collection("items")
        .updateOne({ slug: doc.slug }, { $set: doc }, { upsert: true });
      await recordAdminAuditLog(db, {
        session,
        entityType: "item",
        entityId: doc.slug,
        action: "bulk-csv",
        summary: `CSV imported item '${doc.title}' (${doc.slug}) with qty=${doc.quantity}`,
        before: existingBefore,
        after: doc,
      });
      importedItems.push(normalizeDoc(doc));
    }

    return NextResponse.json({
      ok: true,
      importedCount: importedItems.length,
      items: importedItems,
    });
  }

  const money = normalizeMoney(body.money ?? body.price, "ILS");
  const rawPreOrder = body.preOrderMoney ?? body.preOrderPrice;
  const preOrderMoney =
    rawPreOrder !== undefined &&
    rawPreOrder !== null &&
    rawPreOrder !== "" &&
    Number(
      typeof rawPreOrder === "object" ? rawPreOrder.price : rawPreOrder
    ) > 0
      ? normalizeMoney(rawPreOrder, money.currencyId)
      : null;

  if (!body.title || !body.slug) {
    return NextResponse.json(
      { error: "title and slug are required" },
      { status: 400 }
    );
  }

  const isEvent = isEventPayload;
  const targetCollection = isEvent ? "events" : "items";
  const quantity =
    body.quantity !== undefined ? Math.max(0, Number(body.quantity)) : 5;
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

  const existingBefore = await db
    .collection(targetCollection)
    .findOne({ slug: body.slug });

  const newItem: Record<string, any> = isEvent
    ? {
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
      }
    : {
        slug: body.slug,
        kind: "item",
        type: body.type && body.type !== "ticket" ? body.type : "item",
        category: "Store Items",
        title: body.title,
        title_he: body.title_he || body.title,
        money,
        preOrderMoney,
        description: body.description || "",
        description_he: body.description_he || body.description || "",
        imageUrl: body.imageUrl || "",
        quantity,
        inStock:
          body.inStock !== undefined
            ? Boolean(body.inStock) && quantity > 0
            : quantity > 0,
        isHidden: Boolean(body.isHidden),
        wontBeStocked: Boolean(body.wontBeStocked),
        lifecycleStage: body.lifecycleStage || undefined,
        revealAtUtc: toUtcIso(body.revealAtUtc),
        preOrderAtUtc: toUtcIso(body.preOrderAtUtc),
        comingSoonAtUtc: toUtcIso(body.comingSoonAtUtc),
        regularSaleAtUtc: toUtcIso(body.regularSaleAtUtc),
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      };

  await db
    .collection(targetCollection)
    .updateOne({ slug: newItem.slug }, { $set: newItem }, { upsert: true });

  await recordAdminAuditLog(db, {
    session,
    entityType: isEvent ? "event" : "item",
    entityId: newItem.slug,
    action: existingBefore ? "update" : "create",
    summary: `${existingBefore ? "Updated" : "Created"} ${isEvent ? "event" : "store item"} '${newItem.title}' (${newItem.slug})`,
    before: existingBefore,
    after: newItem,
  });

  return NextResponse.json({
    ok: true,
    item: normalizeDoc(newItem),
  });
}

export async function PATCH(request: Request) {
  const db = await getDb();
  const session = await resolveAdminSessionFromRequest(request, db);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized admin" }, { status: 401 });
  }

  const body = await request.json();
  const {
    slug,
    // Note: title and title_he are intentionally excluded — item names cannot be edited after creation!
    inStock,
    quantity,
    wontBeStocked,
    lifecycleStage,
    money,
    preOrderMoney,
    preOrderPrice,
    imageUrl,
    description,
    description_he,
    isHidden,
    revealAtUtc,
    preOrderAtUtc,
    comingSoonAtUtc,
    regularSaleAtUtc,
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

  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const existingItem = await db.collection("items").findOne({ slug });
  const existingEvent = !existingItem
    ? await db.collection("events").findOne({ slug })
    : null;
  const existingBefore = existingItem || existingEvent;
  const isEventItem = Boolean(existingEvent) || body.kind === "event";
  const targetCollection = isEventItem ? "events" : "items";

  const requiredPriv = isEventItem ? "events" : "inventory";
  if (!hasAdminPrivilege(session, requiredPriv)) {
    return NextResponse.json(
      { error: `Forbidden: Missing '${requiredPriv}' admin privilege` },
      { status: 403 }
    );
  }

  if (lifecycleStage !== undefined && existingBefore) {
    const currentStage = getItemSaleStage(existingBefore as any);
    if (!canTransitionItemStage(currentStage, lifecycleStage as SaleStage)) {
      return NextResponse.json(
        {
          error: `Invalid item lifecycle transition from '${currentStage}' to '${lifecycleStage}'`,
        },
        { status: 400 }
      );
    }
  }

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
    } else {
      if (
        !existingBefore ||
        !existingBefore.quantity ||
        existingBefore.quantity <= 0
      ) {
        updateFields.quantity = 1;
      }
    }
  }

  if (wontBeStocked !== undefined) {
    updateFields.wontBeStocked = Boolean(wontBeStocked);
  }
  if (lifecycleStage !== undefined) {
    updateFields.lifecycleStage = lifecycleStage || null;
    if (lifecycleStage === "hidden") {
      updateFields.isHidden = true;
    } else if (lifecycleStage === "out-of-stock") {
      updateFields.inStock = false;
      updateFields.quantity = 0;
      updateFields.wontBeStocked = false;
    } else if (lifecycleStage === "wont-be-stocked") {
      updateFields.wontBeStocked = true;
    } else if (lifecycleStage === "regular") {
      updateFields.isHidden = false;
    }
  }

  if (money !== undefined) updateFields.money = normalizeMoney(money, "ILS");
  if (preOrderMoney !== undefined || preOrderPrice !== undefined) {
    const rawPre = preOrderMoney ?? preOrderPrice;
    updateFields.preOrderMoney =
      rawPre !== null &&
      rawPre !== "" &&
      Number(typeof rawPre === "object" ? rawPre.price : rawPre) > 0
        ? normalizeMoney(rawPre, "ILS")
        : null;
  }
  if (imageUrl !== undefined) updateFields.imageUrl = String(imageUrl);
  if (description !== undefined) updateFields.description = String(description);
  if (description_he !== undefined)
    updateFields.description_he = String(description_he);
  if (isHidden !== undefined) updateFields.isHidden = Boolean(isHidden);
  if (revealAtUtc !== undefined)
    updateFields.revealAtUtc = toUtcIso(revealAtUtc);
  if (preOrderAtUtc !== undefined)
    updateFields.preOrderAtUtc = toUtcIso(preOrderAtUtc);
  if (comingSoonAtUtc !== undefined)
    updateFields.comingSoonAtUtc = toUtcIso(comingSoonAtUtc);
  if (regularSaleAtUtc !== undefined)
    updateFields.regularSaleAtUtc = toUtcIso(regularSaleAtUtc);
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

  await db
    .collection(targetCollection)
    .updateOne({ slug }, { $set: updateFields });
  const afterDoc = await db.collection(targetCollection).findOne({ slug });

  await recordAdminAuditLog(db, {
    session,
    entityType: isEventItem ? "event" : "item",
    entityId: slug,
    action: "update",
    summary: `Modified ${isEventItem ? "event" : "item"} '${slug}' fields (${Object.keys(updateFields).join(", ")})`,
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

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const existingItem = await db.collection("items").findOne({ slug });
  const existingEvent = !existingItem
    ? await db.collection("events").findOne({ slug })
    : null;
  const existingBefore = existingItem || existingEvent;
  const isEventItem = Boolean(existingEvent);
  const targetCollection = isEventItem ? "events" : "items";

  const requiredPriv = isEventItem ? "events" : "inventory";
  if (!hasAdminPrivilege(session, requiredPriv)) {
    return NextResponse.json(
      { error: `Forbidden: Missing '${requiredPriv}' admin privilege` },
      { status: 403 }
    );
  }

  await db.collection(targetCollection).deleteOne({ slug });

  await recordAdminAuditLog(db, {
    session,
    entityType: isEventItem ? "event" : "item",
    entityId: slug,
    action: "delete",
    summary: `Deleted ${isEventItem ? "event" : "item"} '${slug}'`,
    before: existingBefore,
    after: null,
  });

  return NextResponse.json({ ok: true, deletedSlug: slug });
}
