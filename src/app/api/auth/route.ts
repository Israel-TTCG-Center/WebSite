import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { normalizeNotifications, nowUtcIso } from "@/lib/premium";
import { normalizeName } from "@/lib/name";
import {
  normalizeAddress,
  normalizeDeliveryAddress,
  resolveDefaultCountryAlpha3,
} from "@/lib/address";
import { buildNewUserDoc, normalizeUserDoc } from "@/lib/customers";

/** Returns the profile of the signed-in customer. */
export async function GET() {
  const session = await auth();
  if (session?.user?.kind !== "customer" || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }
  const doc = await db
    .collection("users")
    .findOne({ email: session.user.email.trim().toLowerCase() });
  if (!doc) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ user: normalizeUserDoc(doc) });
}

/**
 * Registers a new customer account (email + password). Signing in is done by the client
 * through Auth.js (`signIn("customer")`) after registration succeeds.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }
  const normalizedEmail = String(email).trim().toLowerCase();

  const db = await getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const users = db.collection("users");
  if (await users.findOne({ email: normalizedEmail })) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const userDoc = buildNewUserDoc({
    name,
    email: normalizedEmail,
    password: String(password),
    authStrategy: "auth0-db",
    notifications: body.notifications,
    billingAddress: body.billingAddress,
    deliveryAddress: body.deliveryAddress,
    savedAddresses: body.savedAddresses,
    paymentMethod: body.paymentMethod,
    savedPaymentMethods: body.savedPaymentMethods,
    gamingAccounts: body.gamingAccounts,
    preferences: body.preferences,
  });
  try {
    await users.insertOne(userDoc);
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }
    throw err;
  }
  return NextResponse.json({ user: normalizeUserDoc(userDoc) });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const {
    name,
    contactEmail,
    notifications,
    linkedProviders,
    billingAddress,
    deliveryAddress,
    savedAddresses,
    paymentMethod,
    savedPaymentMethods,
    gamingAccounts,
    preferences,
  } = body;

  // The account being updated is always the signed-in customer; body emails are ignored.
  const session = await auth();
  const sessionEmail =
    session?.user?.kind === "customer" && session.user.email
      ? session.user.email.trim().toLowerCase()
      : "";
  if (!sessionEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = sessionEmail;

  const db = await getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const nowUtc = nowUtcIso();
  const updateFields: Record<string, unknown> = {
    updatedAt: nowUtc,
    updatedAtUtc: nowUtc,
  };

  if (name !== undefined) {
    updateFields.name = normalizeName(name, email.split("@")[0] || "Guest", "Player");
  }

  if (contactEmail !== undefined) {
    updateFields.contactEmail = String(contactEmail || email).trim();
  }

  if (notifications !== undefined) {
    updateFields.notifications = normalizeNotifications(notifications);
  }
  if (linkedProviders !== undefined) {
    updateFields.linkedProviders = Array.isArray(linkedProviders)
      ? linkedProviders
      : [];
  }
  const existingUserDoc = await db.collection("users").findOne({ email });
  const fallbackCountry = resolveDefaultCountryAlpha3(
    billingAddress || existingUserDoc?.billingAddress,
    deliveryAddress || existingUserDoc?.deliveryAddress,
    "ISR"
  );

  if (billingAddress !== undefined) {
    const normBilling = normalizeAddress(billingAddress, {
      billingCountry: fallbackCountry,
      defaultId: "billing-default",
      defaultNickname: "Billing (Default Shipping)",
    });
    updateFields.billingAddress = normBilling;
    if (deliveryAddress === undefined) {
      updateFields.deliveryAddress = normalizeDeliveryAddress(normBilling, {
        billingCountry: normBilling.CountryCodeAlpha3,
        defaultId: "billing-default",
        defaultNickname: "Billing (Default Shipping)",
      });
    }
  }
  if (deliveryAddress !== undefined) {
    updateFields.deliveryAddress = normalizeDeliveryAddress(deliveryAddress, {
      billingCountry: fallbackCountry,
      defaultId: deliveryAddress?.id || "addr-default",
    });
  }
  if (savedAddresses !== undefined) {
    updateFields.savedAddresses = Array.isArray(savedAddresses)
      ? savedAddresses.map((item: any, idx: number) =>
          normalizeDeliveryAddress(item, {
            billingCountry: fallbackCountry,
            defaultId: item?.id || `addr-${idx + 1}`,
          })
        )
      : [];
  }
  if (paymentMethod !== undefined) {
    updateFields.paymentMethod = paymentMethod;
  }
  if (savedPaymentMethods !== undefined) {
    updateFields.savedPaymentMethods = Array.isArray(savedPaymentMethods)
      ? savedPaymentMethods
      : [];
  }
  if (gamingAccounts !== undefined) {
    updateFields.gamingAccounts = gamingAccounts;
  }
  if (preferences !== undefined) {
    updateFields.preferences = preferences;
  }

  await db
    .collection("users")
    .updateOne({ email }, { $set: updateFields }, { upsert: false });

  const updatedDoc = await db.collection("users").findOne({ email });
  return NextResponse.json({
    ok: true,
    user: updatedDoc ? normalizeUserDoc(updatedDoc) : undefined,
    billingAddress: updateFields.billingAddress,
    deliveryAddress,
    savedAddresses,
    paymentMethod,
    savedPaymentMethods,
    gamingAccounts,
    preferences,
    contactEmail: updatedDoc?.contactEmail || contactEmail || email,
    notifications: updateFields.notifications,
    linkedProviders: updateFields.linkedProviders,
  });
}
