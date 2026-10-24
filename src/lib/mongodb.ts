import { MongoClient, Db, ObjectId } from "mongodb";
import { hashPasswordScrypt, isScryptHash } from "@/lib/auth-security";
import { type Money, normalizeMoney } from "@/lib/money";
import { emitOtelLog, incrementOtelCounter } from "@/lib/otel";
import {
  detectMissingItemFields,
  getItemSaleStage,
  normalizeOrderStatus,
  nowUtcIso,
  toUtcIso,
  type PremiumClass,
  type SaleStage,
} from "@/lib/premium";

export interface StoreItem {
  _id?: string;
  slug: string;
  kind?: "item" | "event";
  type: "board-game" | "tcg" | "ticket" | "item";
  title: string;
  title_he?: string;
  money: Money;
  preOrderMoney?: Money | null;
  category: string;
  description: string;
  description_he?: string;
  badge?: string;
  badge_he?: string;
  imageUrl?: string;
  inStock: boolean;
  quantity: number;
  // Visibility & Release Schedule (Always UTC ISO-8601)
  isHidden?: boolean;
  wontBeStocked?: boolean;
  lifecycleStage?: SaleStage;
  revealAtUtc?: string | null;
  preOrderAtUtc?: string | null;
  comingSoonAtUtc?: string | null;
  regularSaleAtUtc?: string | null;
  saleStage?: SaleStage;
  // Event-specific fields
  facebookUrl?: string;
  eventDate?: string;
  venue?: string;
  showRegisteredCount?: boolean;
  registeredCount?: number;
  minPlayers?: number | null;
  maxPlayers?: number;
  createdAtUtc?: string;
  updatedAtUtc?: string;
  // Backward-compatibility missing fields list for Admin alert panel
  missingFields?: string[];
  [key: string]: any;
}

// No dummy, mock, or initial catalog items are seeded into the database.
export const INITIAL_ITEMS: StoreItem[] = [];

export function normalizeDoc(doc: Record<string, any>): StoreItem {
  const money = normalizeMoney(doc.money ?? doc.price, "ILS");
  const rawPreOrder = doc.preOrderMoney ?? doc.preOrderPrice;
  const preOrderMoney =
    rawPreOrder !== undefined &&
    rawPreOrder !== null &&
    rawPreOrder !== "" &&
    Number(
      typeof rawPreOrder === "object" ? rawPreOrder.price : rawPreOrder
    ) > 0
      ? normalizeMoney(rawPreOrder, money.currencyId)
      : null;
  const rest = { ...doc };
  delete rest.price;
  const quantity =
    typeof doc.quantity === "number"
      ? Math.max(0, doc.quantity)
      : doc.inStock === false
      ? 0
      : 1;
  const inStock = quantity > 0 && doc.inStock !== false;
  const isEvent =
    doc.kind === "event" ||
    doc.type === "ticket" ||
    doc.category === "Event Tickets";

  const revealAtUtc = toUtcIso(doc.revealAtUtc);
  const preOrderAtUtc = toUtcIso(doc.preOrderAtUtc);
  const comingSoonAtUtc = toUtcIso(doc.comingSoonAtUtc);
  const regularSaleAtUtc = toUtcIso(doc.regularSaleAtUtc);
  const isHidden = Boolean(doc.isHidden);
  const wontBeStocked = Boolean(doc.wontBeStocked);
  const saleStage = getItemSaleStage({
    isHidden,
    lifecycleStage: doc.lifecycleStage,
    wontBeStocked,
    inStock,
    quantity,
    revealAtUtc,
    preOrderAtUtc,
    comingSoonAtUtc,
    regularSaleAtUtc,
  });

  const missingFields = detectMissingItemFields(doc);

  return {
    ...rest,
    _id: doc._id ? doc._id.toString() : undefined,
    kind: isEvent ? "event" : "item",
    type: isEvent ? "ticket" : doc.type || "item",
    category: isEvent ? "Event Tickets" : doc.category || "Store Items",
    money,
    preOrderMoney,
    quantity,
    inStock,
    wontBeStocked,
    lifecycleStage: doc.lifecycleStage || undefined,
    imageUrl: doc.imageUrl || "",
    description: doc.description || "",
    description_he: doc.description_he || doc.description || "",
    isHidden,
    revealAtUtc,
    preOrderAtUtc,
    comingSoonAtUtc,
    regularSaleAtUtc,
    saleStage,
    registeredCount:
      typeof doc.registeredCount === "number" ? doc.registeredCount : 0,
    minPlayers:
      typeof doc.minPlayers === "number" && doc.minPlayers > 0
        ? doc.minPlayers
        : null,
    maxPlayers:
      typeof doc.maxPlayers === "number" && doc.maxPlayers > 0
        ? doc.maxPlayers
        : quantity +
          (typeof doc.registeredCount === "number" ? doc.registeredCount : 0),
    showRegisteredCount: Boolean(doc.showRegisteredCount),
    createdAtUtc: toUtcIso(doc.createdAtUtc ?? doc.createdAt) || nowUtcIso(),
    updatedAtUtc: toUtcIso(doc.updatedAtUtc ?? doc.updatedAt) || nowUtcIso(),
    missingFields,
  } as StoreItem;
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let initialized = false;

export async function getDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  if (cachedDb && cachedClient) {
    return cachedDb;
  }

  try {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 2500,
      connectTimeoutMS: 2500,
    });
    await client.connect();
    const db = client.db();
    cachedClient = client;
    cachedDb = db;

    if (!initialized) {
      initialized = true;
      const nowUtc = nowUtcIso();

      await ensureDbIndexes(db);
      startOrderTtlChangeStream(db);

      // Ensure store products ("items" collection) and events ("events" collection) are strictly separated.
      // Migrate any legacy event documents out of "items" into "events".
      try {
        const legacyEventsInItems = await db
          .collection("items")
          .find({
            $or: [
              { kind: "event" },
              { type: "ticket" },
              { category: "Event Tickets" },
            ],
          })
          .toArray();
        for (const evDoc of legacyEventsInItems) {
          const { _id, ...rest } = evDoc;
          await db
            .collection("events")
            .updateOne(
              { slug: evDoc.slug },
              { $set: { ...rest, kind: "event", type: "ticket", category: "Event Tickets" } },
              { upsert: true }
            );
          await db.collection("items").deleteOne({ _id });
        }
      } catch {
        // Ignore migration errors on empty collections
      }

      // IMPORTANT: Never delete or wipe any DB collections on startup or update,
      // and never fill dummy/mock/initial items, events, or classes into the database!
      // Only ensure the root owner admin account exists via Auth0 delegation.
      const adminsCol = db.collection("admins");
      const defaultAdminUser = process.env.ADMIN_USERNAME || "admin";
      const defaultAdminPass =
        process.env.ADMIN_PASSWORD || "dockside-admin-2026";
      const existingRootAdmin = await adminsCol.findOne({
        username: defaultAdminUser,
      });
      const rootVerifier =
        existingRootAdmin?.passwordHash &&
        isScryptHash(existingRootAdmin.passwordHash)
          ? existingRootAdmin.passwordHash
          : hashPasswordScrypt(
              existingRootAdmin?.password || defaultAdminPass
            );
      await adminsCol.updateOne(
        { username: defaultAdminUser },
        {
          $set: {
            role: "owner",
            level: 100,
            authProvider: "auth0",
            auth0Sub: `auth0|admin|${defaultAdminUser}`,
            passwordHash: rootVerifier,
            privileges: [
              "inventory",
              "events",
              "metadata",
              "blog",
              "manage_admins",
            ],
          },
          $unset: {
            password: "",
          },
          $setOnInsert: {
            username: defaultAdminUser,
            createdAtUtc: nowUtc,
          },
        },
        { upsert: true }
      );
    }

    return db;
  } catch {
    return null;
  }
}

export async function ensureDbIndexes(db: Db): Promise<void> {
  try {
    await Promise.all([
      db.collection("items").createIndex({ slug: 1 }, { unique: true }),
      db
        .collection("items")
        .createIndex({ inStock: 1, quantity: 1, createdAtUtc: -1 }),
      db.collection("items").createIndex({ category: 1, createdAtUtc: -1 }),
      db.collection("items").createIndex({ "money.price": 1 }),
      db.collection("events").createIndex({ slug: 1 }, { unique: true }),
      db
        .collection("events")
        .createIndex({ inStock: 1, quantity: 1, createdAtUtc: -1 }),
      db.collection("events").createIndex({ "money.price": 1 }),
      db.collection("blog_posts").createIndex({ slug: 1 }, { unique: true }),
      db.collection("blog_posts").createIndex({ createdAtUtc: -1 }),
      db.collection("users").createIndex({ email: 1 }, { unique: true }),
      db.collection("admins").createIndex({ username: 1 }, { unique: true }),
      db.collection("orders").createIndex({ status: 1, expiresAtUtc: 1 }),
      db
        .collection("order_ttl_holds")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db
        .collection("geocode_cache")
        .createIndex({ cacheKey: 1 }, { unique: true }),
      db
        .collection("geocode_cache")
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
    try {
      await db.command({
        collMod: "order_ttl_holds",
        changeStreamPreAndPostImages: { enabled: true },
      });
    } catch {
      // Ignore collMod errors if collection does not exist yet or topology does not support pre-images
    }
  } catch {
    // Ignore duplicate index errors on existing collections
  }
}

export interface OrderTtlDeletionEvent {
  operationType?: string;
  documentKey?: { _id?: any };
  fullDocumentBeforeChange?: {
    _id?: any;
    orderId?: string;
    items?: Array<{ slug: string; quantity?: number }>;
  } | null;
}

/**
 * MongoDB "Capturing TTL Deletion Events" handler:
 * Invoked when the TTL index on `order_ttl_holds` deletes an expired 3-day reservation hold document.
 * Preserves the historical order in `orders` by transitioning it from `ordered-not-paid` to `cancelled`
 * (`cancelledReason: "ttl-expired-3-days"`) and restoring held stock to `items` and `events`.
 */
export async function handleOrderTtlDeletionEvent(
  db: Db,
  changeEvent: OrderTtlDeletionEvent
): Promise<{ handled: boolean; orderId?: string; status?: string; reason?: string }> {
  const preImage = changeEvent?.fullDocumentBeforeChange;
  const rawId = preImage?.orderId ?? changeEvent?.documentKey?._id;
  if (!rawId) {
    return { handled: false, reason: "missing-document-key" };
  }

  const orderIdStr = String(rawId);
  const query = ObjectId.isValid(orderIdStr)
    ? { _id: new ObjectId(orderIdStr) }
    : ({ _id: rawId } as any);

  const existingOrder = await db.collection("orders").findOne(query);
  if (!existingOrder) {
    return { handled: false, orderId: orderIdStr, reason: "order-not-found" };
  }

  const currentStatus = normalizeOrderStatus(existingOrder.status);
  if (currentStatus !== "ordered-not-paid") {
    return {
      handled: false,
      orderId: orderIdStr,
      status: currentStatus,
      reason: "already-resolved",
    };
  }

  const nowUtc = nowUtcIso();
  await db.collection("orders").updateOne(query, {
    $set: {
      status: "cancelled",
      cancelledReason: "ttl-expired-3-days",
      updatedAt: nowUtc,
      updatedAtUtc: nowUtc,
    },
  });

  const heldItems: Array<{ slug: string; quantity?: number }> = Array.isArray(
    existingOrder.items
  )
    ? existingOrder.items
    : Array.isArray(preImage?.items)
    ? preImage.items
    : [];

  const itemsCol = db.collection("items");
  const eventsCol = db.collection("events");
  for (const ordItem of heldItems) {
    if (!ordItem?.slug) continue;
    const qty = Math.max(1, Number(ordItem.quantity || 1));
    const itemUpdate = await itemsCol.updateOne(
      { slug: ordItem.slug },
      {
        $inc: { quantity: qty, registeredCount: -qty },
        $set: {
          inStock: true,
          lifecycleStage: "regular",
          updatedAtUtc: nowUtc,
        },
      }
    );
    if (itemUpdate.matchedCount === 0) {
      await eventsCol.updateOne(
        { slug: ordItem.slug },
        {
          $inc: { quantity: qty, registeredCount: -qty },
          $set: { inStock: true, updatedAtUtc: nowUtc },
        }
      );
    }
  }

  await incrementOtelCounter(db, "dockside_order_ttl_deletions_total", 1, {
    reason: "ttl-expired-3-days",
  });
  await emitOtelLog(db, {
    severityText: "INFO",
    category: "order.ttl",
    body: `Captured TTL deletion event for 3-day unpaid order '${orderIdStr}'; order cancelled and stock restored`,
    attributes: {
      orderId: orderIdStr,
      cancelledReason: "ttl-expired-3-days",
      itemsRestored: heldItems.length,
    },
  });

  return {
    handled: true,
    orderId: orderIdStr,
    status: "cancelled",
  };
}

let orderTtlChangeStreamStarted = false;

export function startOrderTtlChangeStream(db: Db): void {
  if (orderTtlChangeStreamStarted) return;
  try {
    const holdsCol = db.collection("order_ttl_holds");
    if (typeof holdsCol.watch !== "function") return;
    const changeStream = holdsCol.watch(
      [{ $match: { operationType: "delete" } }],
      { fullDocumentBeforeChange: "whenAvailable" }
    );
    orderTtlChangeStreamStarted = true;
    changeStream.on("change", (changeEvent: any) => {
      handleOrderTtlDeletionEvent(db, changeEvent).catch(() => {
        // Ignore individual event processing errors
      });
    });
    changeStream.on("error", () => {
      // Gracefully ignore change stream errors on standalone non-replica-set MongoDB instances
      orderTtlChangeStreamStarted = false;
      changeStream.close().catch(() => {});
    });
  } catch {
    // Standalone MongoDB instances without replica sets do not support Change Streams
  }
}

export interface DbPaginationMeta {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

export interface PaginatedItemsQuery {
  page?: number;
  pageSize?: number;
  kind?: "item" | "event";
  category?: string;
  type?: string;
  search?: string;
  maxPrice?: number;
  includeOutOfStock?: boolean;
  includeHidden?: boolean;
  sort?: "newest" | "oldest" | "price-asc" | "price-desc";
}

export function buildItemsDbFilter(
  options: PaginatedItemsQuery = {}
): Record<string, any> {
  const andConditions: Record<string, any>[] = [];

  if (options.category && options.category !== "All") {
    andConditions.push({ category: options.category });
  }

  if (options.kind === "event") {
    andConditions.push({
      $or: [
        { kind: "event" },
        { type: "ticket" },
        { category: "Event Tickets" },
      ],
    });
  } else if (options.kind === "item") {
    andConditions.push({
      kind: { $ne: "event" },
      type: { $ne: "ticket" },
      category: { $ne: "Event Tickets" },
    });
  }

  if (options.type && options.type !== "all") {
    andConditions.push({ type: options.type });
  }

  const allowHidden =
    options.includeHidden !== undefined
      ? options.includeHidden
      : Boolean(options.includeOutOfStock);

  if (!options.includeOutOfStock) {
    andConditions.push({
      isHidden: { $ne: true },
      lifecycleStage: { $ne: "hidden" },
      inStock: { $ne: false },
      quantity: { $gt: 0 },
    });
  } else if (!allowHidden) {
    andConditions.push({
      isHidden: { $ne: true },
      lifecycleStage: { $ne: "hidden" },
    });
  }

  if (
    typeof options.maxPrice === "number" &&
    !Number.isNaN(options.maxPrice) &&
    options.maxPrice >= 0
  ) {
    andConditions.push({
      "money.price": { $lte: options.maxPrice },
    });
  }

  if (options.search && options.search.trim()) {
    const escaped = options.search
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    andConditions.push({
      $or: [
        { title: regex },
        { title_he: regex },
        { description: regex },
        { description_he: regex },
        { slug: regex },
      ],
    });
  }

  if (andConditions.length === 0) return {};
  if (andConditions.length === 1) return andConditions[0];
  return { $and: andConditions };
}

export async function getPaginatedItems(
  options: PaginatedItemsQuery = {}
): Promise<{ items: StoreItem[]; pagination: DbPaginationMeta }> {
  const safePageSize = Math.min(
    100,
    Math.max(1, Math.floor(Number(options.pageSize) || 9))
  );
  const requestedPage = Math.max(1, Math.floor(Number(options.page) || 1));

  const db = await getDb();
  if (!db) {
    return {
      items: [],
      pagination: {
        currentPage: 1,
        pageSize: safePageSize,
        totalItems: 0,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false,
      },
    };
  }

  const isEventQuery =
    options.kind === "event" ||
    options.type === "ticket" ||
    options.category === "Event Tickets";
  const targetCollection = isEventQuery ? "events" : "items";

  const query = buildItemsDbFilter({
    ...options,
    kind: undefined,
  });
  const sortSpec: Record<string, 1 | -1> =
    options.sort === "oldest"
      ? { createdAtUtc: 1 }
      : options.sort === "price-asc"
      ? { "money.price": 1, createdAtUtc: -1 }
      : options.sort === "price-desc"
      ? { "money.price": -1, createdAtUtc: -1 }
      : { createdAtUtc: -1 };

  const totalItems = await db
    .collection(targetCollection)
    .countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const skip = (currentPage - 1) * safePageSize;

  const docs = await db
    .collection(targetCollection)
    .find(query)
    .sort(sortSpec)
    .skip(skip)
    .limit(safePageSize)
    .toArray();

  const allowHidden =
    options.includeHidden !== undefined
      ? options.includeHidden
      : Boolean(options.includeOutOfStock);

  const normalized = docs.map((d) =>
    normalizeDoc(isEventQuery ? { ...d, kind: "event", type: "ticket" } : d)
  );
  const items = allowHidden
    ? normalized
    : normalized.filter((item) => item.saleStage !== "hidden");

  return {
    items,
    pagination: {
      currentPage,
      pageSize: safePageSize,
      totalItems,
      totalPages,
      hasPrevPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
    },
  };
}

export async function getPaginatedEvents(
  options: Omit<PaginatedItemsQuery, "kind"> = {}
): Promise<{ events: StoreItem[]; pagination: DbPaginationMeta }> {
  const { items, pagination } = await getPaginatedItems({
    ...options,
    kind: "event",
  });
  return { events: items, pagination };
}

export async function getAllItems(
  category?: string,
  includeOutOfStock = false
): Promise<StoreItem[]> {
  const db = await getDb();
  if (db) {
    const query = buildItemsDbFilter({
      includeOutOfStock,
    });
    let docs: Record<string, any>[] = [];
    if (category === "Event Tickets") {
      const evDocs = await db
        .collection("events")
        .find(query)
        .sort({ createdAtUtc: -1 })
        .toArray();
      docs = evDocs.map((d) => ({ ...d, kind: "event", type: "ticket" }));
    } else if (category === "Store Items") {
      docs = await db
        .collection("items")
        .find(query)
        .sort({ createdAtUtc: -1 })
        .toArray();
    } else {
      const [itemDocs, evDocs] = await Promise.all([
        db.collection("items").find(query).sort({ createdAtUtc: -1 }).toArray(),
        db.collection("events").find(query).sort({ createdAtUtc: -1 }).toArray(),
      ]);
      docs = [
        ...itemDocs,
        ...evDocs.map((d) => ({ ...d, kind: "event", type: "ticket" })),
      ];
    }

    const normalized = docs.map((d) => normalizeDoc(d));
    if (includeOutOfStock) {
      return normalized;
    }
    return normalized.filter(
      (item) =>
        item.inStock &&
        item.quantity > 0 &&
        item.saleStage !== "hidden"
    );
  }

  return [];
}

export async function getStoreProducts(): Promise<StoreItem[]> {
  const db = await getDb();
  if (!db) return [];
  const docs = await db
    .collection("items")
    .find({ isHidden: { $ne: true } })
    .sort({ createdAtUtc: -1 })
    .toArray();
  return docs
    .map((d) => normalizeDoc(d))
    .filter((item) => item.saleStage !== "hidden");
}

export async function getEventTickets(): Promise<StoreItem[]> {
  const db = await getDb();
  if (!db) return [];
  const docs = await db
    .collection("events")
    .find({ isHidden: { $ne: true } })
    .sort({ createdAtUtc: -1 })
    .toArray();
  return docs
    .map((d) => normalizeDoc({ ...d, kind: "event", type: "ticket" }))
    .filter(
      (item) =>
        item.inStock &&
        item.quantity > 0 &&
        item.saleStage !== "hidden"
    );
}

export async function getEventBySlug(slug: string): Promise<StoreItem | null> {
  const db = await getDb();
  if (!db) return null;
  const doc = await db.collection("events").findOne({ slug });
  if (!doc) return null;
  const normalized = normalizeDoc({ ...doc, kind: "event", type: "ticket" });
  if (normalized.saleStage === "hidden") return null;
  return normalized;
}

export async function getItemBySlug(slug: string): Promise<StoreItem | null> {
  const db = await getDb();
  if (db) {
    const itemDoc = await db.collection("items").findOne({ slug });
    if (itemDoc) {
      const normalized = normalizeDoc(itemDoc);
      if (normalized.saleStage === "hidden") {
        return null;
      }
      return normalized;
    }
    const eventDoc = await db.collection("events").findOne({ slug });
    if (eventDoc) {
      const normalized = normalizeDoc({
        ...eventDoc,
        kind: "event",
        type: "ticket",
      });
      if (normalized.saleStage === "hidden") {
        return null;
      }
      return normalized;
    }
  }
  return null;
}

export async function getPremiumClassesFromDb(): Promise<PremiumClass[]> {
  const db = await getDb();
  if (!db) return [];
  const docs = await db.collection("premium_classes").find({}).toArray();
  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    name_he: d.name_he || d.name,
    minPoints:
      typeof d.minPoints === "number" && d.minPoints > 0 ? d.minPoints : null,
    discountPercent: Number(d.discountPercent ?? 0),
    isPointsReachable: Boolean(d.isPointsReachable),
    updatedAtUtc: d.updatedAtUtc || nowUtcIso(),
  }));
}

export interface StoredBlogPost {
  _id?: string;
  slug: string;
  title: string;
  title_he?: string;
  content: string;
  content_he?: string;
  imageUrl?: string;
  author: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export async function getPaginatedBlogPosts(options?: {
  page?: number;
  pageSize?: number;
}): Promise<{ posts: StoredBlogPost[]; pagination: DbPaginationMeta }> {
  const safePageSize = Math.min(
    50,
    Math.max(1, Math.floor(Number(options?.pageSize) || 6))
  );
  const requestedPage = Math.max(1, Math.floor(Number(options?.page) || 1));

  const db = await getDb();
  if (!db) {
    return {
      posts: [],
      pagination: {
        currentPage: 1,
        pageSize: safePageSize,
        totalItems: 0,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false,
      },
    };
  }

  const totalItems = await db.collection("blog_posts").countDocuments({});
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const skip = (currentPage - 1) * safePageSize;

  const docs = await db
    .collection("blog_posts")
    .find({})
    .sort({ createdAtUtc: -1 })
    .skip(skip)
    .limit(safePageSize)
    .toArray();

  const posts: StoredBlogPost[] = docs.map((d) => ({
    _id: d._id ? d._id.toString() : undefined,
    slug: String(d.slug || ""),
    title: String(d.title || ""),
    title_he: String(d.title_he || d.title || ""),
    content: String(d.content || ""),
    content_he: String(d.content_he || d.content || ""),
    imageUrl: String(d.imageUrl || ""),
    author: String(d.author || "Dockside Keep Staff"),
    createdAtUtc: String(d.createdAtUtc || nowUtcIso()),
    updatedAtUtc: String(d.updatedAtUtc || d.createdAtUtc || nowUtcIso()),
  }));

  return {
    posts,
    pagination: {
      currentPage,
      pageSize: safePageSize,
      totalItems,
      totalPages,
      hasPrevPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
    },
  };
}

export async function getBlogPostBySlug(
  slug: string
): Promise<StoredBlogPost | null> {
  const db = await getDb();
  if (!db) return null;
  const d = await db.collection("blog_posts").findOne({ slug });
  if (!d) return null;
  return {
    _id: d._id ? d._id.toString() : undefined,
    slug: String(d.slug || ""),
    title: String(d.title || ""),
    title_he: String(d.title_he || d.title || ""),
    content: String(d.content || ""),
    content_he: String(d.content_he || d.content || ""),
    imageUrl: String(d.imageUrl || ""),
    author: String(d.author || "Dockside Keep Staff"),
    createdAtUtc: String(d.createdAtUtc || nowUtcIso()),
    updatedAtUtc: String(d.updatedAtUtc || d.createdAtUtc || nowUtcIso()),
  };
}
