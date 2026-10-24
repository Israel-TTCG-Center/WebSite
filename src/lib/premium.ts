import { type Money, normalizeMoney } from "@/lib/money";
import {
  type CountryCodeAlpha3,
  getCountryMetadata,
  isValidCountryCodeAlpha3,
  normalizeCountryCodeAlpha3,
} from "@/lib/address";

export interface PremiumClass {
  id: string;
  name: string;
  name_he: string;
  minPoints: number | null;
  discountPercent: number;
  isPointsReachable: boolean;
  updatedAtUtc?: string;
}

export interface LoyaltyStatus {
  monthlyPoints: number;
  currentClass: PremiumClass | null;
  discountPercent: number;
  isAdminAssigned: boolean;
  nextClass: PremiumClass | null;
  pointsNeededForNext: number | null;
}

export interface NotificationPreferences {
  restockAlerts: boolean;
  orderStatusUpdates: boolean;
  newsletterAndArrivals: boolean;
}

export interface DeliveryOption {
  id: string;
  label: string;
  label_he: string;
  cost: Money;
  isStorePickup?: boolean;
  active?: boolean;
  estimatedDays?: number;
  expectedDeliveryAtUtc?: string;
}

export const DEFAULT_DELIVERY_OPTIONS: DeliveryOption[] = [
  {
    id: "wait-in-store",
    label: "Wait in Store (Store Pickup — Haifa)",
    label_he: "איסוף עצמי מהחנות (הזמנה ממתינה בחנות בחיפה)",
    cost: { price: 0, currencyId: "ILS" },
    isStorePickup: true,
    active: true,
    estimatedDays: 0,
  },
  {
    id: "home-courier",
    label: "Home Courier Delivery",
    label_he: "משלוח עם שליח עד הבית",
    cost: { price: 35, currencyId: "ILS" },
    isStorePickup: false,
    active: true,
    estimatedDays: 3,
  },
];

export function computeExpectedDeliveryUtc(
  estimatedDays: number,
  baseUtcIso?: string
): string {
  const safeDays = Number.isFinite(Number(estimatedDays))
    ? Math.max(0, Math.floor(Number(estimatedDays)))
    : 0;
  const parsedBase = baseUtcIso ? new Date(baseUtcIso).getTime() : NaN;
  const baseMs = Number.isFinite(parsedBase)
    ? parsedBase
    : new Date().getTime();
  return new Date(baseMs + safeDays * 24 * 60 * 60 * 1000).toISOString();
}

export function formatExpectedDeliveryDate(
  utcIsoOrDays: string | number,
  baseUtcIso?: string
): string {
  const iso =
    typeof utcIsoOrDays === "number"
      ? computeExpectedDeliveryUtc(utcIsoOrDays, baseUtcIso)
      : String(utcIsoOrDays || "").trim() ||
        computeExpectedDeliveryUtc(0, baseUtcIso);
  const parsed = new Date(iso);
  if (isNaN(parsed.getTime())) {
    return computeExpectedDeliveryUtc(0, baseUtcIso).slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

export function normalizeDeliveryOptions(
  raw?: unknown,
  baseUtcIso?: string
): DeliveryOption[] {
  const sourceList =
    Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_DELIVERY_OPTIONS;

  const normalized: DeliveryOption[] = sourceList.map(
    (opt: any, idx: number) => {
      const id = String(opt?.id || `delivery-${idx + 1}`).trim();
      const isPickup = Boolean(opt?.isStorePickup);
      const defaultDays = isPickup || id === "wait-in-store" ? 0 : 3;
      const rawDays =
        opt?.estimatedDays !== undefined && opt?.estimatedDays !== null
          ? Number(opt.estimatedDays)
          : defaultDays;
      const estimatedDays = Number.isFinite(rawDays)
        ? Math.max(0, Math.floor(rawDays))
        : defaultDays;
      const label = String(opt?.label || "Delivery").trim();
      const label_he = String(opt?.label_he || label || "משלוח").trim();
      const rawCost = normalizeMoney(opt?.cost ?? opt?.price ?? 0, "ILS");
      const cost: Money = {
        price: Number(Math.max(0, rawCost.price).toFixed(2)),
        currencyId: rawCost.currencyId || "ILS",
      };
      const active = opt?.active !== undefined ? Boolean(opt.active) : true;
      const expectedDeliveryAtUtc = computeExpectedDeliveryUtc(
        estimatedDays,
        baseUtcIso
      );

      return {
        id,
        label,
        label_he,
        cost,
        isStorePickup: isPickup,
        active,
        estimatedDays,
        expectedDeliveryAtUtc,
      };
    }
  );

  if (!normalized.some((o) => o.active !== false)) {
    normalized[0].active = true;
  }

  return normalized;
}

export type PaymentMethodId =
  | "credit-card"
  | "paypal"
  | "apple-pay"
  | "google-pay"
  | "paybox"
  | "bit"
  | "bank-transfer"
  | "cash";

export interface PaymentMethodConfig {
  type: PaymentMethodId;
  active: boolean;
  feePercent: number;
  feeConstant: Money;
}

export const ALL_PAYMENT_METHOD_TYPES: PaymentMethodId[] = [
  "credit-card",
  "paypal",
  "apple-pay",
  "google-pay",
  "paybox",
  "bit",
  "bank-transfer",
  "cash",
];

export const DISABLED_BY_DEFAULT_PAYMENT_TYPES: ReadonlySet<PaymentMethodId> =
  new Set<PaymentMethodId>(["paybox", "bit"]);

export const DEFAULT_PAYMENT_METHODS_CONFIG: PaymentMethodConfig[] =
  ALL_PAYMENT_METHOD_TYPES.map((type) => ({
    type,
    active: !DISABLED_BY_DEFAULT_PAYMENT_TYPES.has(type),
    feePercent: 0,
    feeConstant: { price: 0, currencyId: "ILS" },
  }));

export function normalizePaymentMethodsConfig(
  raw?: unknown,
  currencyId = "ILS"
): PaymentMethodConfig[] {
  const inputList = Array.isArray(raw) ? raw : [];
  const byType = new Map<string, Record<string, any>>();
  for (const item of inputList) {
    if (item && typeof item === "object" && typeof (item as any).type === "string") {
      byType.set((item as any).type, item as Record<string, any>);
    }
  }

  const normalized: PaymentMethodConfig[] = ALL_PAYMENT_METHOD_TYPES.map((type) => {
    const found = byType.get(type);
    const defaultActive = !DISABLED_BY_DEFAULT_PAYMENT_TYPES.has(type);
    const active =
      found?.active !== undefined ? Boolean(found.active) : defaultActive;
    const rawPct = Number(found?.feePercent ?? 0);
    const feePercent = Number.isFinite(rawPct)
      ? Number(Math.min(100, Math.max(0, rawPct)).toFixed(2))
      : 0;
    const rawConst = found?.feeConstant ?? found?.constantFee ?? 0;
    const normalizedConst = normalizeMoney(rawConst, currencyId);
    const feeConstant: Money = {
      price: Number(Math.max(0, normalizedConst.price).toFixed(2)),
      currencyId: normalizedConst.currencyId || currencyId,
    };
    return {
      type,
      active,
      feePercent,
      feeConstant,
    };
  });

  if (!normalized.some((m) => m.active)) {
    normalized[0].active = true;
  }

  return normalized;
}

/**
 * Calculates the payment method fee on the pre-fee order total `(discountedItems + deliveryCost)`:
 * `fee = preFeeOrderAmount * (feePercent / 100) + feeConstant`
 */
export function calculatePaymentMethodFee(
  preFeeOrderAmount: number,
  config?: Partial<PaymentMethodConfig> | null,
  currencyId = "ILS"
): Money {
  const safeBase = Math.max(0, Number(preFeeOrderAmount || 0));
  const rawPct = Number(config?.feePercent ?? 0);
  const pct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 0;
  const rawConstant = Number(config?.feeConstant?.price ?? 0);
  const constantFee = Number.isFinite(rawConstant)
    ? Math.max(0, rawConstant)
    : 0;

  const feePrice = Number((safeBase * (pct / 100) + constantFee).toFixed(2));
  return {
    price: feePrice,
    currencyId: config?.feeConstant?.currencyId || currencyId,
  };
}

export interface SupportedCountryConfig {
  code: CountryCodeAlpha3;
  name: string;
  name_he: string;
  active: boolean;
  supportsZipAutocomplete: boolean;
}

export const DEFAULT_SUPPORTED_COUNTRIES: SupportedCountryConfig[] = (
  [
    { code: "ISR", active: true, supportsZipAutocomplete: false },
    { code: "USA", active: false, supportsZipAutocomplete: true },
    { code: "GBR", active: false, supportsZipAutocomplete: true },
    { code: "DEU", active: false, supportsZipAutocomplete: true },
    { code: "FRA", active: false, supportsZipAutocomplete: true },
    { code: "CAN", active: false, supportsZipAutocomplete: true },
  ] as const
).map(({ code, active, supportsZipAutocomplete }) => {
  const meta = getCountryMetadata(code);
  return {
    code: meta.cca3,
    name: meta.name,
    name_he: meta.name_he,
    active,
    supportsZipAutocomplete,
  };
});

export function normalizeSupportedCountries(
  raw?: unknown
): SupportedCountryConfig[] {
  const inputList = Array.isArray(raw) ? raw : [];
  if (inputList.length === 0) {
    return DEFAULT_SUPPORTED_COUNTRIES.map((c) => ({ ...c }));
  }

  const seen = new Set<string>();
  const normalized: SupportedCountryConfig[] = [];

  for (const item of inputList) {
    if (!item || typeof item !== "object") continue;
    const rawCodeInput = String((item as any).code || "")
      .trim()
      .toUpperCase();
    if (!rawCodeInput) continue;
    const rawCode = normalizeCountryCodeAlpha3(rawCodeInput);
    if (!isValidCountryCodeAlpha3(rawCode) || seen.has(rawCode)) continue;
    seen.add(rawCode);

    const def = DEFAULT_SUPPORTED_COUNTRIES.find((d) => d.code === rawCode);
    const meta = getCountryMetadata(rawCode);
    const name = String(
      (item as any).name || def?.name || meta.name || rawCode
    ).trim();
    const name_he = String(
      (item as any).name_he || def?.name_he || meta.name_he || name
    ).trim();
    const active =
      (item as any).active !== undefined
        ? Boolean((item as any).active)
        : Boolean(def?.active ?? false);
    const supportsZipAutocomplete =
      (item as any).supportsZipAutocomplete !== undefined
        ? Boolean((item as any).supportsZipAutocomplete)
        : Boolean(def?.supportsZipAutocomplete ?? false);

    normalized.push({
      code: rawCode,
      name,
      name_he,
      active,
      supportsZipAutocomplete,
    });
  }

  // Ensure all default countries remain present in the closed list if any were omitted
  for (const def of DEFAULT_SUPPORTED_COUNTRIES) {
    if (!seen.has(def.code)) {
      seen.add(def.code);
      normalized.push({ ...def });
    }
  }

  if (!normalized.some((c) => c.active)) {
    const isr = normalized.find((c) => c.code === "ISR") || normalized[0];
    if (isr) isr.active = true;
  }

  return normalized;
}

/**
 * Users are opted out of notifications by default.
 * Any missing or undefined value MUST be handled as false.
 */
export function normalizeNotifications(
  raw?: Partial<NotificationPreferences> | Record<string, any> | null
): NotificationPreferences {
  return {
    restockAlerts: Boolean(raw?.restockAlerts ?? false),
    orderStatusUpdates: Boolean(raw?.orderStatusUpdates ?? false),
    newsletterAndArrivals: Boolean(raw?.newsletterAndArrivals ?? false),
  };
}

export function computeThreeDayReservationUtc(
  nowMs: number = Date.now()
): string {
  return new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString();
}

export interface ParsedCsvInventoryItem {
  slug: string;
  title: string;
  title_he: string;
  price: number;
  currencyId: string;
  quantity: number;
  description: string;
  imageUrl: string;
}

export function parseInventoryCsv(csvText: string): ParsedCsvInventoryItem[] {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const results: ParsedCsvInventoryItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (cols.length < 2) continue;
    // Skip header row if first column is "slug"
    if (i === 0 && cols[0].toLowerCase() === "slug") continue;

    const slug = cols[0];
    const title = cols[1];
    if (!slug || !title) continue;

    const title_he = cols[2] || title;
    const price = Number(cols[3] || 0);
    const currencyId = cols[4] || "ILS";
    const quantity =
      cols[5] !== undefined && cols[5] !== ""
        ? Math.max(0, Number(cols[5]))
        : 5;
    const description = cols[6] || "";
    const imageUrl = cols[7] || "";

    results.push({
      slug,
      title,
      title_he,
      price: isNaN(price) ? 0 : price,
      currencyId,
      quantity: isNaN(quantity) ? 5 : quantity,
      description,
      imageUrl,
    });
  }
  return results;
}

export function detectMissingItemFields(doc: Record<string, any>): string[] {
  const missing: string[] = [];
  const isEvent =
    doc.kind === "event" ||
    doc.type === "ticket" ||
    doc.category === "Event Tickets";

  if (!doc.description || String(doc.description).trim() === "") {
    missing.push("description");
  }
  if (!doc.imageUrl || String(doc.imageUrl).trim() === "") {
    missing.push("imageUrl");
  }
  if (doc.money === undefined && doc.price === undefined) {
    missing.push("money");
  }
  if (doc.quantity === undefined) {
    missing.push("quantity");
  }
  if (isEvent) {
    if (!doc.eventDate || String(doc.eventDate).trim() === "") {
      missing.push("eventDate");
    }
    if (!doc.venue || String(doc.venue).trim() === "") {
      missing.push("venue");
    }
  }
  return missing;
}

export const DEFAULT_PREMIUM_CLASSES: PremiumClass[] = [
  {
    id: "bronze",
    name: "Bronze Member",
    name_he: "חבר ארד",
    minPoints: 100,
    discountPercent: 5,
    isPointsReachable: true,
  },
  {
    id: "silver",
    name: "Silver Member",
    name_he: "חבר כסף",
    minPoints: 300,
    discountPercent: 10,
    isPointsReachable: true,
  },
  {
    id: "gold",
    name: "Gold Champion",
    name_he: "אלוף זהב",
    minPoints: 600,
    discountPercent: 15,
    isPointsReachable: true,
  },
  {
    id: "affiliate-vip",
    name: "VIP / Affiliate Partner",
    name_he: "שותף VIP / שגריר",
    minPoints: null,
    discountPercent: 20,
    isPointsReachable: false,
  },
];

export function nowUtcIso(): string {
  return new Date().toISOString();
}

export function toUtcIso(val?: string | Date | null): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString();
  }
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export type SaleStage =
  | "hidden"
  | "pre-order-soon"
  | "pre-order"
  | "coming-soon"
  | "regular"
  | "out-of-stock"
  | "wont-be-stocked";

/**
 * Valid transitions in the Items Lifecycle:
 * Hidden -> Pre Order Soon -> Pre Order -> Coming Soon -> Regular <-> Out of stock <-> Won't be stocked.
 * Won't be stocked can be Regular too (direct transition WontBeStocked <-> Regular).
 */
export const ITEM_STAGE_TRANSITIONS: Record<SaleStage, SaleStage[]> = {
  hidden: ["pre-order-soon", "pre-order", "coming-soon", "regular"],
  "pre-order-soon": ["pre-order", "coming-soon", "regular", "hidden"],
  "pre-order": ["coming-soon", "regular", "hidden"],
  "coming-soon": ["regular", "out-of-stock", "hidden"],
  regular: ["out-of-stock", "wont-be-stocked", "hidden"],
  "out-of-stock": ["regular", "wont-be-stocked", "hidden"],
  "wont-be-stocked": ["out-of-stock", "regular", "hidden"],
};

export function canTransitionItemStage(
  fromStage: SaleStage,
  toStage: SaleStage
): boolean {
  if (fromStage === toStage) return true;
  const allowed = ITEM_STAGE_TRANSITIONS[fromStage];
  return Array.isArray(allowed) && allowed.includes(toStage);
}

export function getItemSaleStage(
  item: {
    isHidden?: boolean;
    lifecycleStage?: SaleStage | string | null;
    wontBeStocked?: boolean;
    inStock?: boolean;
    quantity?: number;
    revealAtUtc?: string | null;
    preOrderAtUtc?: string | null;
    comingSoonAtUtc?: string | null;
    regularSaleAtUtc?: string | null;
  },
  nowIso: string = nowUtcIso()
): SaleStage {
  if (item.isHidden || item.lifecycleStage === "hidden") {
    return "hidden";
  }

  const revealUtc = toUtcIso(item.revealAtUtc);
  if (revealUtc && nowIso < revealUtc) {
    return "hidden";
  }

  const explicitStage = item.lifecycleStage as SaleStage | undefined;
  if (
    explicitStage === "pre-order-soon" ||
    explicitStage === "pre-order" ||
    explicitStage === "coming-soon" ||
    explicitStage === "out-of-stock" ||
    explicitStage === "wont-be-stocked"
  ) {
    // "Won't be stocked can be regular too": if it still has active stock while wontBeStocked is true
    if (
      explicitStage === "wont-be-stocked" &&
      item.inStock !== false &&
      typeof item.quantity === "number" &&
      item.quantity > 0
    ) {
      return "regular";
    }
    return explicitStage;
  }

  const preOrderUtc = toUtcIso(item.preOrderAtUtc);
  const comingSoonUtc = toUtcIso(item.comingSoonAtUtc);
  const regularUtc = toUtcIso(item.regularSaleAtUtc);

  // 1. Revealed, but Pre-Order has not opened yet -> "pre-order-soon"
  if (preOrderUtc && nowIso < preOrderUtc) {
    return "pre-order-soon";
  }

  // 2. Before Regular Sale date: either in Pre-Order window or Coming Soon window
  if (regularUtc && nowIso < regularUtc) {
    if (preOrderUtc && nowIso >= preOrderUtc) {
      if (comingSoonUtc && nowIso >= comingSoonUtc) {
        return "coming-soon";
      }
      return "pre-order";
    }
    return "coming-soon";
  }

  if (!regularUtc && preOrderUtc) {
    if (comingSoonUtc && nowIso >= comingSoonUtc) {
      return "coming-soon";
    }
    if (nowIso >= preOrderUtc) {
      return "pre-order";
    }
    return "pre-order-soon";
  }

  // 3. Post-release: Regular <-> Out of stock <-> Won't be stocked (Won't be stocked can be Regular too)
  const isOutOfStock =
    item.inStock === false ||
    (typeof item.quantity === "number" && item.quantity <= 0);

  if (item.wontBeStocked) {
    if (isOutOfStock) {
      return "wont-be-stocked";
    }
    // Item is marked won't be restocked in the future, but still has units in stock -> Regular!
    return "regular";
  }

  if (isOutOfStock) {
    return "out-of-stock";
  }

  return "regular";
}

/**
 * Orders Lifecycle:
 * In cart (not an order yet) -> ordered (not paid) -> ordered (paid) -> packaged -> sent/waiting for collection -> completed.
 * - At any point before completion, the store can cancel the order ("cancelled").
 * - At any point before packaged, the user can abort the order ("aborted").
 */
export type OrderLifecycleStatus =
  | "in-cart"
  | "ordered-not-paid"
  | "ordered-paid"
  | "packaged"
  | "sent-or-waiting"
  | "completed"
  | "cancelled"
  | "aborted";

export const ORDER_LIFECYCLE_STEPS: OrderLifecycleStatus[] = [
  "in-cart",
  "ordered-not-paid",
  "ordered-paid",
  "packaged",
  "sent-or-waiting",
  "completed",
];

export function normalizeOrderStatus(
  rawStatus?: string | null
): OrderLifecycleStatus {
  if (!rawStatus) return "ordered-not-paid";
  const lower = String(rawStatus).trim().toLowerCase();
  if (lower === "in-cart" || lower === "in_cart") return "in-cart";
  if (
    lower === "ordered-not-paid" ||
    lower === "ordered (not paid)" ||
    lower === "reserved-3-days" ||
    lower === "unpaid"
  ) {
    return "ordered-not-paid";
  }
  if (
    lower === "ordered-paid" ||
    lower === "ordered (paid)" ||
    lower === "confirmed" ||
    lower === "paid"
  ) {
    return "ordered-paid";
  }
  if (lower === "packaged" || lower === "pacakged" || lower === "approved") {
    return "packaged";
  }
  if (
    lower === "sent-or-waiting" ||
    lower === "sent/waiting for collection" ||
    lower === "sent" ||
    lower === "waiting-for-collection"
  ) {
    return "sent-or-waiting";
  }
  if (lower === "completed" || lower === "complete") {
    return "completed";
  }
  if (
    lower === "cancelled" ||
    lower === "canceled" ||
    lower === "declined"
  ) {
    return "cancelled";
  }
  if (lower === "aborted") {
    return "aborted";
  }
  return "ordered-not-paid";
}

/**
 * At any point before completion, the store can cancel the order.
 */
export function canStoreCancelOrder(rawStatus?: string | null): boolean {
  const status = normalizeOrderStatus(rawStatus);
  return (
    status === "ordered-not-paid" ||
    status === "ordered-paid" ||
    status === "packaged" ||
    status === "sent-or-waiting"
  );
}

/**
 * At any point before packaged, the user can abort the order.
 */
export function canUserAbortOrder(rawStatus?: string | null): boolean {
  const status = normalizeOrderStatus(rawStatus);
  return (
    status === "in-cart" ||
    status === "ordered-not-paid" ||
    status === "ordered-paid"
  );
}

export function canTransitionOrderStatus(
  fromRaw: string | null | undefined,
  toRaw: string,
  actor: "admin" | "store" | "user"
): boolean {
  const fromStatus = normalizeOrderStatus(fromRaw);
  const toStatus = normalizeOrderStatus(toRaw);

  if (actor === "user") {
    return toStatus === "aborted" && canUserAbortOrder(fromStatus);
  }

  // Store / Admin actor
  if (toStatus === "cancelled") {
    return canStoreCancelOrder(fromStatus);
  }

  if (
    fromStatus === "completed" ||
    fromStatus === "cancelled" ||
    fromStatus === "aborted"
  ) {
    return false;
  }

  const validAdminTargets: Record<string, OrderLifecycleStatus[]> = {
    "in-cart": ["ordered-not-paid", "ordered-paid"],
    "ordered-not-paid": [
      "ordered-paid",
      "packaged",
      "sent-or-waiting",
      "completed",
      "cancelled",
    ],
    "ordered-paid": [
      "packaged",
      "sent-or-waiting",
      "completed",
      "cancelled",
    ],
    packaged: ["sent-or-waiting", "completed", "cancelled"],
    "sent-or-waiting": ["completed", "cancelled"],
  };

  return (validAdminTargets[fromStatus] || []).includes(toStatus);
}

export function getEffectiveItemMoney(
  item: {
    money: Money;
    preOrderMoney?: Money | null;
    saleStage?: SaleStage;
    lifecycleStage?: SaleStage | string | null;
    isHidden?: boolean;
    revealAtUtc?: string | null;
    preOrderAtUtc?: string | null;
    comingSoonAtUtc?: string | null;
    regularSaleAtUtc?: string | null;
  },
  nowIso: string = nowUtcIso()
): Money {
  const stage = getItemSaleStage(item, nowIso);
  if (
    (stage === "pre-order" || item.saleStage === "pre-order") &&
    item.preOrderMoney &&
    typeof item.preOrderMoney.price === "number" &&
    item.preOrderMoney.price > 0
  ) {
    return item.preOrderMoney;
  }
  return item.money;
}

export function calculateLoyaltyStatus(
  orders: {
    status?: string;
    createdAtUtc?: string;
    createdAt?: string;
    pointsEarned?: number;
    totalMoney?: { price: number };
  }[],
  classes: PremiumClass[],
  assignedClassId?: string | null,
  nowMs: number = Date.now()
): LoyaltyStatus {
  const oneMonthAgoIso = new Date(
    nowMs - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const monthlyPoints = orders.reduce((sum, order) => {
    const normStatus = normalizeOrderStatus(order.status);
    if (normStatus === "cancelled" || normStatus === "aborted") return sum;
    const orderUtc =
      toUtcIso(order.createdAtUtc ?? order.createdAt) || nowUtcIso();
    if (orderUtc < oneMonthAgoIso) return sum;
    const pts =
      typeof order.pointsEarned === "number"
        ? order.pointsEarned
        : Math.max(0, Math.floor(order.totalMoney?.price ?? 0));
    return sum + pts;
  }, 0);

  // 1. Check if Admin explicitly assigned a class (including non-points-reachable Special/Affiliate classes)
  if (assignedClassId) {
    const assigned = classes.find((c) => c.id === assignedClassId);
    if (assigned) {
      return {
        monthlyPoints,
        currentClass: assigned,
        discountPercent: assigned.discountPercent,
        isAdminAssigned: true,
        nextClass: null,
        pointsNeededForNext: null,
      };
    }
  }

  // 2. Evaluate points-reachable classes sorted ascending by minPoints
  const reachable = classes
    .filter(
      (c) =>
        c.isPointsReachable &&
        typeof c.minPoints === "number" &&
        c.minPoints > 0
    )
    .sort((a, b) => (a.minPoints ?? 0) - (b.minPoints ?? 0));

  let currentClass: PremiumClass | null = null;
  for (const cls of reachable) {
    if (monthlyPoints >= (cls.minPoints ?? 0)) {
      currentClass = cls;
    }
  }

  const nextClass =
    reachable.find((cls) => (cls.minPoints ?? 0) > monthlyPoints) || null;
  const pointsNeededForNext = nextClass
    ? Math.max(0, (nextClass.minPoints ?? 0) - monthlyPoints)
    : null;

  return {
    monthlyPoints,
    currentClass,
    discountPercent: currentClass ? currentClass.discountPercent : 0,
    isAdminAssigned: false,
    nextClass,
    pointsNeededForNext,
  };
}

/**
 * Detects whether a value looks like an ISO-8601 date/time string (e.g., "2026-10-22T19:00:00.000Z" or "2026-10-22").
 */
export function isIsoDateString(val: unknown): boolean {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(trimmed)) {
    return false;
  }
  const parsed = new Date(trimmed);
  return !isNaN(parsed.getTime());
}

/**
 * Formats an ISO/UTC timestamp or Date into the user's browser locale format
 * instead of a raw UTC machine format ("2026-10-22T19:00:00.000Z").
 * Non-ISO human strings (such as "Friday, 19:00") are returned as-is.
 */
export function formatBrowserDateTime(
  val?: string | Date | null,
  locale?: string
): string {
  if (!val) return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return new Intl.DateTimeFormat(locale || undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(val);
  }
  const trimmed = String(val).trim();
  if (!trimmed) return "";
  if (!isIsoDateString(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return trimmed;
  const hasTime = trimmed.includes("T") || trimmed.includes(":");
  return new Intl.DateTimeFormat(
    locale || undefined,
    hasTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" }
  ).format(parsed);
}

/**
 * Returns true if a store item is currently in stock (inStock !== false and quantity > 0).
 */
export function isStoreItemInStock(item: {
  inStock?: boolean;
  quantity?: number;
}): boolean {
  return Boolean(item.inStock !== false && (item.quantity ?? 0) > 0);
}

/**
 * Returns true if an event has already ended relative to `nowMs`.
 * Checks `hasEnded`, `eventEndUtc`, `eventDateUtc`, or an ISO-formatted `eventDate`.
 */
export function isEventEnded(
  item: {
    hasEnded?: boolean;
    eventEndUtc?: string | null;
    eventDateUtc?: string | null;
    eventDate?: string | null;
  },
  nowMs: number = Date.now()
): boolean {
  if (item.hasEnded === true) return true;
  const candidate = item.eventEndUtc || item.eventDateUtc || item.eventDate;
  if (!candidate) return false;
  const trimmed = String(candidate).trim();
  if (!isIsoDateString(trimmed)) {
    return false;
  }
  const parsedMs = new Date(trimmed).getTime();
  if (isNaN(parsedMs)) return false;
  return parsedMs < nowMs;
}

/**
 * Returns true if an event has reached capacity or has 0 tickets remaining.
 */
export function isEventFull(item: {
  inStock?: boolean;
  quantity?: number;
  registeredCount?: number;
  maxPlayers?: number | null;
}): boolean {
  if (item.inStock === false || (item.quantity ?? 0) <= 0) {
    return true;
  }
  if (
    typeof item.maxPlayers === "number" &&
    item.maxPlayers > 0 &&
    typeof item.registeredCount === "number" &&
    item.registeredCount >= item.maxPlayers
  ) {
    return true;
  }
  return false;
}

export type AddedDateWindow = "all" | "7d" | "30d" | "90d";

/**
 * Checks whether an item was added within the selected date window (`all` | `7d` | `30d` | `90d`).
 * Items without `createdAtUtc`/`createdAt` are treated as recently seeded so default catalog items remain visible.
 */
export function isWithinAddedWindow(
  item: { createdAtUtc?: string | null; createdAt?: string | null },
  windowKey: AddedDateWindow,
  nowMs: number = Date.now()
): boolean {
  if (windowKey === "all") return true;
  const raw = item.createdAtUtc || item.createdAt;
  if (!raw) return true;
  const parsedMs = new Date(String(raw)).getTime();
  if (isNaN(parsedMs)) return true;

  const daysMap: Record<Exclude<AddedDateWindow, "all">, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
  };
  const days = daysMap[windowKey] || 30;
  const cutoffMs = nowMs - days * 24 * 60 * 60 * 1000;
  return parsedMs >= cutoffMs;
}

export interface PaginationResult<T> {
  pageItems: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Pure pagination helper for large Store & Events catalogs.
 */
export function paginateItems<T>(
  items: T[],
  currentPage: number,
  pageSize: number
): PaginationResult<T> {
  const safeSize = Math.max(1, Math.floor(pageSize || 9));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));
  const safePage = Math.min(Math.max(1, Math.floor(currentPage || 1)), totalPages);
  const startOffset = (safePage - 1) * safeSize;
  const pageItems = items.slice(startOffset, startOffset + safeSize);
  const startIndex = totalItems === 0 ? 0 : startOffset + 1;
  const endIndex = Math.min(totalItems, startOffset + pageItems.length);

  return {
    pageItems,
    currentPage: safePage,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  };
}
