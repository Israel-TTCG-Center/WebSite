import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  hasAdminPrivilege,
  recordAdminAuditLog,
  resolveAdminSessionFromRequest,
} from "@/lib/admin";
import {
  DEFAULT_DELIVERY_OPTIONS,
  DEFAULT_PAYMENT_METHODS_CONFIG,
  DEFAULT_SUPPORTED_COUNTRIES,
  normalizeDeliveryOptions,
  normalizePaymentMethodsConfig,
  normalizeSupportedCountries,
  nowUtcIso,
  type DeliveryOption,
  type PaymentMethodConfig,
  type SupportedCountryConfig,
} from "@/lib/premium";
import {
  DEFAULT_STORE_ADDRESS,
  DEFAULT_STORE_PHONE,
  normalizeAddress,
  normalizePhone,
  type Address,
  type Phone,
} from "@/lib/address";
import { STORE_CONTACT } from "@/lib/i18n";

export interface StoreMetadata {
  phone: Phone;
  email: string;
  address: Address;
  openingHours: string;
  openingHours_he: string;
  deliveryOptions: DeliveryOption[];
  paymentMethodsConfig: PaymentMethodConfig[];
  supportedCountries: SupportedCountryConfig[];
  updatedAtUtc: string;
}

const DEFAULT_METADATA: StoreMetadata = {
  phone: DEFAULT_STORE_PHONE,
  email: STORE_CONTACT.email,
  address: DEFAULT_STORE_ADDRESS,
  openingHours:
    "Tue–Thu: 10:00 – 22:00 | Fri–Sat: Event Hours | Check Instagram & Facebook for weekly tournament updates.",
  openingHours_he:
    "ג׳–ה׳: 10:00 – 22:00 | ו׳–שבת: בהתאם לאירועים | התעדכנו באינסטגרם ובפייסבוק ללוח הטורנירים השבועי.",
  deliveryOptions: normalizeDeliveryOptions(DEFAULT_DELIVERY_OPTIONS),
  paymentMethodsConfig: DEFAULT_PAYMENT_METHODS_CONFIG,
  supportedCountries: DEFAULT_SUPPORTED_COUNTRIES,
  updatedAtUtc: nowUtcIso(),
};

export async function GET() {
  const db = await getDb();
  if (!db) {
    return NextResponse.json({ metadata: DEFAULT_METADATA });
  }

  const doc = await db
    .collection("metadata")
    .findOne({ key: "store-metadata" });
  if (!doc) {
    return NextResponse.json({ metadata: DEFAULT_METADATA });
  }

  const normalizedAddress = normalizeAddress(doc.address, {
    fallbackAddress: DEFAULT_STORE_ADDRESS,
  });
  const normalizedPhone = normalizePhone(
    doc.phone || DEFAULT_STORE_PHONE,
    normalizedAddress.CountryCodeAlpha3
  );

  return NextResponse.json({
    metadata: {
      phone: normalizedPhone,
      email: doc.email || DEFAULT_METADATA.email,
      address: normalizedAddress,
      openingHours: doc.openingHours || DEFAULT_METADATA.openingHours,
      openingHours_he: doc.openingHours_he || DEFAULT_METADATA.openingHours_he,
      deliveryOptions: normalizeDeliveryOptions(doc.deliveryOptions),
      paymentMethodsConfig: normalizePaymentMethodsConfig(
        doc.paymentMethodsConfig
      ),
      supportedCountries: normalizeSupportedCountries(doc.supportedCountries),
      updatedAtUtc: doc.updatedAtUtc || DEFAULT_METADATA.updatedAtUtc,
    },
  });
}

export async function PUT(request: Request) {
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
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  if (
    Array.isArray(body.paymentMethodsConfig) &&
    body.paymentMethodsConfig.length > 0 &&
    !body.paymentMethodsConfig.some((m: any) => Boolean(m?.active))
  ) {
    return NextResponse.json(
      { error: "At least one payment method must remain active" },
      { status: 400 }
    );
  }

  if (
    Array.isArray(body.deliveryOptions) &&
    body.deliveryOptions.length > 0 &&
    !body.deliveryOptions.some((o: any) => o?.active !== false)
  ) {
    return NextResponse.json(
      { error: "At least one delivery option must remain active" },
      { status: 400 }
    );
  }

  if (
    Array.isArray(body.supportedCountries) &&
    body.supportedCountries.length > 0 &&
    !body.supportedCountries.some((c: any) => Boolean(c?.active))
  ) {
    return NextResponse.json(
      { error: "At least one country must remain active" },
      { status: 400 }
    );
  }

  const existing = await db
    .collection("metadata")
    .findOne({ key: "store-metadata" });

  const deliveryOptions =
    body.deliveryOptions !== undefined
      ? normalizeDeliveryOptions(body.deliveryOptions)
      : normalizeDeliveryOptions(existing?.deliveryOptions);

  const paymentMethodsConfig =
    body.paymentMethodsConfig !== undefined
      ? normalizePaymentMethodsConfig(body.paymentMethodsConfig)
      : normalizePaymentMethodsConfig(existing?.paymentMethodsConfig);

  const supportedCountries =
    body.supportedCountries !== undefined
      ? normalizeSupportedCountries(body.supportedCountries)
      : normalizeSupportedCountries(existing?.supportedCountries);

  const normalizedAddress = normalizeAddress(
    body.address ?? existing?.address,
    { fallbackAddress: DEFAULT_STORE_ADDRESS }
  );
  const normalizedPhone = normalizePhone(
    body.phone ?? existing?.phone ?? DEFAULT_STORE_PHONE,
    normalizedAddress.CountryCodeAlpha3
  );

  const updated: StoreMetadata = {
    phone: normalizedPhone,
    email: body.email || existing?.email || DEFAULT_METADATA.email,
    address: normalizedAddress,
    openingHours:
      body.openingHours ||
      existing?.openingHours ||
      DEFAULT_METADATA.openingHours,
    openingHours_he:
      body.openingHours_he ||
      body.openingHours ||
      existing?.openingHours_he ||
      DEFAULT_METADATA.openingHours_he,
    deliveryOptions,
    paymentMethodsConfig,
    supportedCountries,
    updatedAtUtc: nowUtcIso(),
  };

  await db
    .collection("metadata")
    .updateOne(
      { key: "store-metadata" },
      { $set: { key: "store-metadata", ...updated } },
      { upsert: true }
    );

  await recordAdminAuditLog(db, {
    session,
    entityType: "metadata",
    entityId: "store-metadata",
    action: "update",
    summary: "Updated store metadata (hours, contact details & delivery options)",
    before: existing,
    after: updated,
  });

  return NextResponse.json({ ok: true, metadata: updated });
}
