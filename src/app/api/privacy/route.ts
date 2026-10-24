import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { resolveCustomerUserFromRequest } from "@/lib/admin";
import { normalizeOrderStatus, nowUtcIso } from "@/lib/premium";
import {
  anonymizeOrderForGdprErasure,
  buildUserPortabilityExport,
  detectGlobalPrivacyControl,
  normalizePrivacyConsent,
} from "@/lib/privacy";
import { incrementOtelCounter } from "@/lib/otel";

export async function GET(request: Request) {
  const db = await getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const customerUser = await resolveCustomerUserFromRequest(request, db);
  if (!customerUser) {
    return NextResponse.json(
      {
        error:
          "Unauthorized: Logged-in customer entity verification required for Data Portability export",
      },
      { status: 401 }
    );
  }

  const targetEmail = customerUser.email.toLowerCase();
  const [userDoc, orders, loyaltyDoc, consentDoc] = await Promise.all([
    db.collection("users").findOne({ email: targetEmail }),
    db
      .collection("orders")
      .find({ "customer.email": targetEmail })
      .sort({ createdAtUtc: -1 })
      .toArray(),
    db.collection("loyalty_users").findOne({ email: targetEmail }),
    db.collection("privacy_consents").findOne({ email: targetEmail }),
  ]);

  if (!userDoc) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const gpcDetected = detectGlobalPrivacyControl(request.headers);
  const consent = normalizePrivacyConsent(
    consentDoc || userDoc.privacyConsent,
    { headers: request.headers, clientGpc: gpcDetected }
  );

  const exportBundle = buildUserPortabilityExport({
    user: userDoc,
    orders,
    loyalty: loyaltyDoc,
    consent,
  });

  const { searchParams } = new URL(request.url);
  if (searchParams.get("download") === "1") {
    return new NextResponse(JSON.stringify(exportBundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="dockside-keep-personal-data.json"`,
      },
    });
  }

  return NextResponse.json(exportBundle);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const nowUtc = nowUtcIso();
  const consent = normalizePrivacyConsent(body.consent ?? body, {
    headers: request.headers,
    clientGpc: Boolean(body.gpcDetected),
    nowUtc,
  });

  const db = await getDb();
  if (db) {
    const customerUser = await resolveCustomerUserFromRequest(request, db);
    if (customerUser) {
      await Promise.all([
        db.collection("users").updateOne(
          { email: customerUser.email },
          {
            $set: {
              privacyConsent: consent,
              updatedAtUtc: nowUtc,
            },
          }
        ),
        db.collection("privacy_consents").updateOne(
          { email: customerUser.email },
          {
            $set: {
              email: customerUser.email,
              ...consent,
            },
          },
          { upsert: true }
        ),
      ]);
    }
  }

  return NextResponse.json({
    ok: true,
    consent,
  });
}

export async function DELETE(request: Request) {
  const db = await getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const customerUser = await resolveCustomerUserFromRequest(request, db);
  if (!customerUser) {
    return NextResponse.json(
      {
        error:
          "Unauthorized: Logged-in customer entity verification required for Account Erasure",
      },
      { status: 401 }
    );
  }

  const targetEmail = customerUser.email.toLowerCase();
  const nowUtc = nowUtcIso();

  // 1. Find all orders for this customer to anonymize PII and release any active 3-day unpaid holds
  const ordersCol = db.collection("orders");
  const itemsCol = db.collection("items");
  const eventsCol = db.collection("events");
  const userOrders = await ordersCol
    .find({ "customer.email": targetEmail })
    .toArray();

  let anonymizedOrdersCount = 0;
  for (const ord of userOrders) {
    const currentStatus = normalizeOrderStatus(ord.status);
    const shouldCancelUnpaidHold = currentStatus === "ordered-not-paid";

    if (shouldCancelUnpaidHold && Array.isArray(ord.items)) {
      for (const ordItem of ord.items) {
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
      await db.collection("order_ttl_holds").deleteOne({ orderId: String(ord._id) });
    }

    const anonymized = anonymizeOrderForGdprErasure(
      {
        ...ord,
        status: shouldCancelUnpaidHold ? "cancelled" : ord.status,
        ...(shouldCancelUnpaidHold
          ? { cancelledReason: "gdpr-account-erasure" }
          : {}),
      },
      nowUtc
    );
    const { _id, ...fieldsToSet } = anonymized as Record<string, any>;
    await ordersCol.updateOne({ _id: ord._id }, { $set: fieldsToSet });
    anonymizedOrdersCount += 1;
  }

  // 2. Delete the customer's profile, loyalty record, and stored consent record
  await Promise.all([
    db.collection("users").deleteOne({ email: targetEmail }),
    db.collection("loyalty_users").deleteOne({ email: targetEmail }),
    db.collection("privacy_consents").deleteOne({ email: targetEmail }),
  ]);

  await incrementOtelCounter(db, "dockside_privacy_erasures_total", 1, {
    framework: "GDPR-CCPA-PPL",
  });

  return NextResponse.json({
    ok: true,
    erasedUser: true,
    anonymizedOrdersCount,
    erasedAtUtc: nowUtc,
  });
}
