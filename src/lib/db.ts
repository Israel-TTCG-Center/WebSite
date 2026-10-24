import postgres, { type Sql } from "postgres";

/**
 * Postgres (Supabase) document access layer.
 *
 * Every collection is a table of `id uuid` + `doc jsonb` (see supabase/migrations).
 * Documents are returned as plain objects with `_id` set to the row uuid, and filters /
 * updates use a small, explicit subset of operators ($or, $and, $ne, $gt(e), $lt(e), $in,
 * $nin, $exists, RegExp, $set, $unset, $inc, $setOnInsert, dotted paths).
 * Updates run inside a transaction with `SELECT ... FOR UPDATE`, so conditional
 * decrements such as stock claims are atomic.
 */

export type Doc = Record<string, any>;
export type Filter = Record<string, any>;
export type SortSpec = Record<string, 1 | -1>;

export const COLLECTIONS = [
  "items",
  "events",
  "blog_posts",
  "users",
  "admins",
  "orders",
  "order_ttl_holds",
  "geocode_cache",
  "metadata",
  "premium_classes",
  "loyalty_users",
  "privacy_consents",
  "admin_audit_logs",
  "otel_metrics",
  "otel_feature_usage",
  "otel_traces",
  "otel_logs",
] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

/** Root keys whose value is an array of sub-documents (equality matches any element). */
const ARRAY_ROOTS = new Set(["items"]);
const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function segments(path: string): string[] {
  const parts = path.split(".");
  for (const p of parts) {
    if (!SEGMENT_RE.test(p)) throw new Error(`Invalid field path: ${path}`);
  }
  return parts;
}

const jsonPath = (path: string) => `'{${segments(path).join(",")}}'`;
const jsonAt = (path: string) => `(doc #> ${jsonPath(path)})`;
const textAt = (path: string) => `(doc #>> ${jsonPath(path)})`;

function nest(path: string, value: unknown): Doc {
  const parts = segments(path);
  let out: unknown = value;
  for (let i = parts.length - 1; i >= 1; i--) out = { [parts[i]]: out };
  // `items.slug` -> { items: [ { slug } ] }: equality on an array root matches any element
  return {
    [parts[0]]: parts.length > 1 && ARRAY_ROOTS.has(parts[0]) ? [out] : out,
  };
}

function push(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

function isOperatorObject(v: unknown): v is Doc {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !(v instanceof RegExp) &&
    Object.keys(v).length > 0 &&
    Object.keys(v).every((k) => k.startsWith("$"))
  );
}

function equality(path: string, value: unknown, params: unknown[]): string {
  if (value === null) {
    return `(${jsonAt(path)} is null or jsonb_typeof(${jsonAt(path)}) = 'null')`;
  }
  if (value instanceof RegExp) {
    const op = value.flags.includes("i") ? "~*" : "~";
    return `(${textAt(path)} ${op} ${push(params, value.source)})`;
  }
  const normalized = JSON.parse(JSON.stringify(value));
  return `(doc @> ${push(params, JSON.stringify(nest(path, normalized)))}::text::jsonb)`;
}

function compare(
  path: string,
  op: string,
  value: unknown,
  params: unknown[]
): string {
  if (typeof value === "number") {
    return `(case when jsonb_typeof(${jsonAt(path)}) = 'number' then (${textAt(
      path
    )})::numeric end ${op} ${push(params, String(value))}::numeric)`;
  }
  const text = value instanceof Date ? value.toISOString() : String(value);
  return `(${textAt(path)} ${op} ${push(params, text)}::text)`;
}

function inList(values: unknown[], params: unknown[]): string {
  return `(select jsonb_array_elements_text(${push(
    params,
    JSON.stringify(values)
  )}::text::jsonb))`;
}

function fieldCondition(path: string, cond: unknown, params: unknown[]): string {
  if (path === "_id") {
    if (isOperatorObject(cond)) throw new Error("Unsupported _id operator");
    return isValidId(String(cond))
      ? `(id = ${push(params, String(cond))}::uuid)`
      : "false";
  }
  if (!isOperatorObject(cond)) return equality(path, cond, params);

  const parts: string[] = [];
  for (const [op, value] of Object.entries(cond)) {
    switch (op) {
      case "$ne":
        parts.push(`(not ${equality(path, value, params)})`);
        break;
      case "$gt":
        parts.push(compare(path, ">", value, params));
        break;
      case "$gte":
        parts.push(compare(path, ">=", value, params));
        break;
      case "$lt":
        parts.push(compare(path, "<", value, params));
        break;
      case "$lte":
        parts.push(compare(path, "<=", value, params));
        break;
      case "$in":
        parts.push(`(${textAt(path)} = any ${inList(value as unknown[], params)})`);
        break;
      case "$nin":
        parts.push(
          `(coalesce(${textAt(path)}, '') <> all ${inList(
            value as unknown[],
            params
          )})`
        );
        break;
      case "$exists":
        parts.push(`(${jsonAt(path)} is ${value ? "not " : ""}null)`);
        break;
      default:
        throw new Error(`Unsupported filter operator: ${op}`);
    }
  }
  return `(${parts.join(" and ")})`;
}

export function compileFilter(filter: Filter, params: unknown[]): string {
  const parts: string[] = [];
  for (const [key, cond] of Object.entries(filter || {})) {
    if (key === "$or" || key === "$and") {
      const subs = (cond as Filter[]).map((f) => compileFilter(f, params));
      if (subs.length === 0) {
        parts.push(key === "$or" ? "false" : "true");
      } else {
        parts.push(`(${subs.join(key === "$or" ? " or " : " and ")})`);
      }
    } else {
      parts.push(fieldCondition(key, cond, params));
    }
  }
  return parts.length ? parts.join(" and ") : "true";
}

// ---- update application (runs in JS on the row locked by SELECT ... FOR UPDATE) ----

function setPath(target: Doc, path: string, value: unknown) {
  const parts = segments(path);
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) {
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function getPath(target: Doc, path: string): unknown {
  let cur: any = target;
  for (const p of segments(path)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function unsetPath(target: Doc, path: string) {
  const parts = segments(path);
  let cur: any = target;
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur?.[parts[i]];
    if (cur === null || typeof cur !== "object") return;
  }
  delete cur[parts[parts.length - 1]];
}

export interface UpdateSpec {
  $set?: Doc;
  $unset?: Doc;
  $inc?: Record<string, number>;
  $setOnInsert?: Doc;
}

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}

function applyUpdate(base: Doc, update: UpdateSpec, inserting: boolean): Doc {
  const next = toPlain(base);
  for (const [k, v] of Object.entries(update.$set || {})) setPath(next, k, toPlain(v));
  if (inserting) {
    for (const [k, v] of Object.entries(update.$setOnInsert || {})) {
      setPath(next, k, toPlain(v));
    }
  }
  for (const [k, v] of Object.entries(update.$inc || {})) {
    const current = Number(getPath(next, k) ?? 0);
    setPath(next, k, (Number.isFinite(current) ? current : 0) + Number(v));
  }
  for (const k of Object.keys(update.$unset || {})) unsetPath(next, k);
  return next;
}

/** Seeds an upserted document from the equality fields of the filter. */
function seedFromFilter(filter: Filter): Doc {
  const seed: Doc = {};
  for (const [k, v] of Object.entries(filter || {})) {
    if (k.startsWith("$") || k === "_id" || isOperatorObject(v)) continue;
    setPath(seed, k, toPlain(v));
  }
  return seed;
}

function toDoc(row: { id: string; doc: Doc }): Doc {
  return { ...row.doc, _id: row.id };
}

function stripId(doc: Doc): Doc {
  const { _id, ...rest } = doc;
  return rest;
}

// ---- collection API ----

export interface UpdateResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedCount: number;
}

export interface Cursor {
  sort(spec: SortSpec): Cursor;
  skip(n: number): Cursor;
  limit(n: number): Cursor;
  toArray(): Promise<Doc[]>;
}

export interface Collection {
  find(filter?: Filter): Cursor;
  findOne(filter?: Filter): Promise<Doc | null>;
  countDocuments(filter?: Filter): Promise<number>;
  insertOne(doc: Doc): Promise<{ insertedId: string }>;
  updateOne(
    filter: Filter,
    update: UpdateSpec,
    options?: { upsert?: boolean }
  ): Promise<UpdateResult>;
  findOneAndUpdate(
    filter: Filter,
    update: UpdateSpec,
    options?: { returnDocument?: "before" | "after"; upsert?: boolean }
  ): Promise<Doc | null>;
  deleteOne(filter: Filter): Promise<{ deletedCount: number }>;
}

export interface Db {
  collection(name: string): Collection;
}

function makeCollection(sql: Sql, name: CollectionName): Collection {
  const table = `public."${name}"`;

  const modify = async (
    filter: Filter,
    update: UpdateSpec,
    upsert: boolean
  ): Promise<{ result: UpdateResult; before: Doc | null; after: Doc | null }> => {
    const attempt = () =>
      sql.begin(async (tx) => {
        const params: unknown[] = [];
        const where = compileFilter(filter, params);
        const rows = await tx.unsafe<{ id: string; doc: Doc }[]>(
          `select id, doc from ${table} where ${where} limit 1 for update`,
          params as any[]
        );
        if (rows.length > 0) {
          const next = applyUpdate(rows[0].doc, update, false);
          await tx.unsafe(`update ${table} set doc = $1::text::jsonb where id = $2::uuid`, [
            JSON.stringify(next),
            rows[0].id,
          ]);
          return {
            result: { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 },
            before: toDoc(rows[0]),
            after: toDoc({ id: rows[0].id, doc: next }),
          };
        }
        if (!upsert) {
          return {
            result: { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 },
            before: null,
            after: null,
          };
        }
        const next = applyUpdate(seedFromFilter(filter), update, true);
        const inserted = await tx.unsafe<{ id: string }[]>(
          `insert into ${table} (doc) values ($1::text::jsonb) returning id`,
          [JSON.stringify(next)]
        );
        return {
          result: { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 },
          before: null,
          after: toDoc({ id: inserted[0].id, doc: next }),
        };
      });

    try {
      return await attempt();
    } catch (err: any) {
      // A concurrent upsert won the unique index; retry as an update.
      if (upsert && err?.code === "23505") return attempt();
      throw err;
    }
  };

  const buildFind = (
    filter: Filter,
    state: { sort?: SortSpec; skip?: number; limit?: number }
  ): Cursor => ({
    sort: (spec) => buildFind(filter, { ...state, sort: spec }),
    skip: (n) => buildFind(filter, { ...state, skip: n }),
    limit: (n) => buildFind(filter, { ...state, limit: n }),
    toArray: async () => {
      const params: unknown[] = [];
      const where = compileFilter(filter, params);
      const order = Object.entries(state.sort || {})
        .map(
          ([path, dir]) =>
            `${jsonAt(path)} ${dir === -1 ? "desc" : "asc"} nulls last`
        )
        .join(", ");
      const query =
        `select id, doc from ${table} where ${where}` +
        (order ? ` order by ${order}, id` : "") +
        (state.limit !== undefined ? ` limit ${Math.max(0, Math.floor(state.limit))}` : "") +
        (state.skip ? ` offset ${Math.max(0, Math.floor(state.skip))}` : "");
      const rows = await sql.unsafe<{ id: string; doc: Doc }[]>(query, params as any[]);
      return rows.map(toDoc);
    },
  });

  return {
    find: (filter = {}) => buildFind(filter, {}),
    findOne: async (filter = {}) => {
      const rows = await buildFind(filter, {}).limit(1).toArray();
      return rows[0] ?? null;
    },
    countDocuments: async (filter = {}) => {
      const params: unknown[] = [];
      const where = compileFilter(filter, params);
      const rows = await sql.unsafe<{ count: number }[]>(
        `select count(*)::int as count from ${table} where ${where}`,
        params as any[]
      );
      return rows[0]?.count ?? 0;
    },
    insertOne: async (doc) => {
      const rows = await sql.unsafe<{ id: string }[]>(
        `insert into ${table} (doc) values ($1::text::jsonb) returning id`,
        [JSON.stringify(toPlain(stripId(doc)))]
      );
      return { insertedId: rows[0].id };
    },
    updateOne: async (filter, update, options) =>
      (await modify(filter, update, Boolean(options?.upsert))).result,
    findOneAndUpdate: async (filter, update, options) => {
      const { before, after } = await modify(filter, update, Boolean(options?.upsert));
      return options?.returnDocument === "before" ? before : after;
    },
    deleteOne: async (filter) => {
      const params: unknown[] = [];
      const where = compileFilter(filter, params);
      const rows = await sql.unsafe<{ id: string }[]>(
        `delete from ${table} where id = (select id from ${table} where ${where} limit 1) returning id`,
        params as any[]
      );
      return { deletedCount: rows.length };
    },
  };
}

// ---- connection ----

declare global {
  // eslint-disable-next-line no-var
  var __docksideSql: Sql | undefined;
}

function getSql(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalThis.__docksideSql) {
    globalThis.__docksideSql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      idle_timeout: 20,
      connect_timeout: 5,
      // Supabase's pooler (transaction mode) does not support prepared statements.
      prepare: false,
    });
  }
  return globalThis.__docksideSql;
}

export function createDb(sql: Sql): Db {
  const collections = new Map<string, Collection>();
  return {
    collection(name: string) {
      if (!(COLLECTIONS as readonly string[]).includes(name)) {
        throw new Error(`Unknown collection: ${name}`);
      }
      let col = collections.get(name);
      if (!col) {
        col = makeCollection(sql, name as CollectionName);
        collections.set(name, col);
      }
      return col;
    },
  };
}

let cachedDb: Db | null = null;
let ready: Promise<void> | null = null;

/**
 * Returns the database handle, or null when DATABASE_URL is not configured or the
 * database is unreachable. The first successful call bootstraps the root admin and
 * every call opportunistically sweeps expired order holds.
 */
export async function getDb(): Promise<Db | null> {
  const sql = getSql();
  if (!sql) return null;

  try {
    if (!cachedDb) {
      await sql`select 1`;
      cachedDb = createDb(sql);
    }
    const db = cachedDb;
    if (!ready) {
      ready = import("@/lib/db-bootstrap").then((m) => m.bootstrapDb(db));
      ready.catch(() => {
        ready = null;
      });
    }
    await ready;
    void import("@/lib/db-bootstrap").then((m) => m.maybeSweepExpiredHolds(db));
    return db;
  } catch {
    return null;
  }
}
