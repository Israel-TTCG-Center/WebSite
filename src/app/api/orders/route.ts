import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getPremiumClassesFromDb } from "@/lib/store";
import { normalizeMoney } from "@/lib/money";
import { formatFullName, normalizeName } from "@/lib/name";
import {
  normalizeAddress,
  normalizeDeliveryAddress,
  resolveDefaultCountryAlpha3,
} from "@/lib/address";
import {
  recordAdminAuditLog,
  resolveAdminSessionFromRequest,
  resolveCustomerUserFromRequest,
} from "@/lib/admin";
import {
  calculateLoyaltyStatus,
  calculatePaymentMethodFee,
  canStoreCancelOrder,
  canTransitionOrderStatus,
  canUserAbortOrder,
  computeExpectedDeliveryUtc,
  computeThreeDayReservationUtc,
  normalizeDeliveryOptions,
  normalizeOrderStatus,
  normalizePaymentMethodsConfig,
  nowUtcIso,
} from "@/lib/premium";
import {
  incrementOtelCounter,
  recordErrorInvestigation,
  recordFeatureUsage,
  recordOtelTraceSpan,
} from "@/lib/otel";

export async function POST(request: Request) {
  const body = await request.json();
  const cartItems: any[] = Array.isArray(body.items) ? body.items : [];

  if (cartItems.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const db = await getDb();
  const currencyId =
    body.totalMoney?.currencyId ||
    cartItems[0]?.money?.currencyId ||
    "ILS";
  const subtotalPrice = cartItems.reduce(
    (sum, item) =>
      sum +
      Number(item.money?.price ?? item.price ?? 0) *
        Math.max(1, Number(item.quantity || 1)),
    0
  );

  const rawCustomer = body.customer || {
    name: { firstName: "Guest", lastName: "Player" },
    email: "guest@local",
  };
  const contactEmail =
    body.contactEmail || rawCustomer.contactEmail || rawCustomer.email;
  const customer = {
    ...rawCustomer,
    name: normalizeName(rawCustomer.name, "Guest", "Player"),
    contactEmail,
  };

  const deliveryOption = body.deliveryOption || {
    id: "wait-in-store",
    label: "Wait in Store (Store Pickup — Haifa)",
    label_he: "איסוף עצמי מהחנות (הזמנה ממתינה בחנות בחיפה)",
    cost: { price: 0, currencyId },
    isStorePickup: true,
  };
  const deliveryCostPrice = Math.max(
    0,
    Number(deliveryOption.cost?.price ?? deliveryOption.price ?? 0)
  );
  const deliveryCostMoney = { price: deliveryCostPrice, currencyId };

  const paymentMethod = body.paymentMethod || {
    type: "credit-card",
    detail: "",
  };
  const isBankOrCash =
    paymentMethod.type === "bank-transfer" || paymentMethod.type === "cash";

  if (db) {
    // Orders are attributed to the signed-in customer; a registered account's email cannot be
    // used by an anonymous visitor (it would expose that account's loyalty discount and history).
    const sessionCustomer = await resolveCustomerUserFromRequest(request, db);
    if (sessionCustomer) {
      customer.email = sessionCustomer.email;
    } else if (
      customer.email &&
      (await db
        .collection("users")
        .findOne({ email: String(customer.email).trim().toLowerCase() }))
    ) {
      return NextResponse.json(
        { error: "Unauthorized: Sign in to order with a registered account" },
        { status: 401 }
      );
    }

    // Check store metadata paymentMethodsConfig before claiming inventory stock
    const metadataDoc = await db
      .collection("metadata")
      .findOne({ key: "store-metadata" });
    const paymentMethodsConfig = normalizePaymentMethodsConfig(
      metadataDoc?.paymentMethodsConfig,
      currencyId
    );
    const matchedPaymentConfig = paymentMethodsConfig.find(
      (m) => m.type === paymentMethod.type
    );
    if (!matchedPaymentConfig || !matchedPaymentConfig.active) {
      return NextResponse.json(
        {
          error: "PAYMENT_METHOD_INACTIVE",
          paymentType: paymentMethod.type,
        },
        { status: 400 }
      );
    }

    const itemsCol = db.collection("items");
    const eventsCol = db.collection("events");
    const claimedItems: {
      slug: string;
      reqQty: number;
      collectionName: "items" | "events";
    }[] = [];
    const missingItems: string[] = [];

    // Atomically decrement available quantity for each store item or event ticket; detect race conditions if stock is insufficient
    for (const cartItem of cartItems) {
      const reqQty = Math.max(1, Number(cartItem.quantity || 1));
      const preferEvents =
        cartItem.kind === "event" ||
        cartItem.type === "ticket" ||
        cartItem.category === "Event Tickets";
      const primaryCol = preferEvents ? eventsCol : itemsCol;
      const primaryColName: "items" | "events" = preferEvents ? "events" : "items";
      const secondaryCol = preferEvents ? itemsCol : eventsCol;
      const secondaryColName: "items" | "events" = preferEvents ? "items" : "events";

      let matchedCol = primaryCol;
      let matchedColName: "items" | "events" = primaryColName;
      let updatedDoc = await primaryCol.findOneAndUpdate(
        {
          slug: cartItem.slug,
          inStock: { $ne: false },
          quantity: { $gte: reqQty },
        },
        {
          $inc: { quantity: -reqQty, registeredCount: reqQty },
        },
        { returnDocument: "after" }
      );

      if (!updatedDoc) {
        updatedDoc = await secondaryCol.findOneAndUpdate(
          {
            slug: cartItem.slug,
            inStock: { $ne: false },
            quantity: { $gte: reqQty },
          },
          {
            $inc: { quantity: -reqQty, registeredCount: reqQty },
          },
          { returnDocument: "after" }
        );
        if (updatedDoc) {
          matchedCol = secondaryCol;
          matchedColName = secondaryColName;
        }
      }

      if (!updatedDoc) {
        missingItems.push(cartItem.title || cartItem.slug);
      } else {
        claimedItems.push({
          slug: cartItem.slug,
          reqQty,
          collectionName: matchedColName,
        });
        if ((updatedDoc.quantity ?? 0) <= 0) {
          const nextStage = updatedDoc.wontBeStocked
            ? "wont-be-stocked"
            : "out-of-stock";
          await matchedCol.updateOne(
            { slug: cartItem.slug },
            {
              $set: {
                inStock: false,
                quantity: 0,
                ...(matchedColName === "items"
                  ? { lifecycleStage: nextStage }
                  : {}),
                updatedAtUtc: nowUtcIso(),
              },
            }
          );
        }
      }
    }

    if (missingItems.length > 0) {
      // Roll back any quantities already decremented during this failed multi-item checkout
      for (const claimed of claimedItems) {
        const targetCol =
          claimed.collectionName === "events" ? eventsCol : itemsCol;
        await targetCol.updateOne(
          { slug: claimed.slug },
          {
            $inc: {
              quantity: claimed.reqQty,
              registeredCount: -claimed.reqQty,
            },
            $set: {
              inStock: true,
              ...(claimed.collectionName === "items"
                ? { lifecycleStage: "regular" }
                : {}),
              updatedAtUtc: nowUtcIso(),
            },
          }
        );
      }
      await recordErrorInvestigation(db, {
        route: "/api/orders",
        httpStatus: 409,
        error: `ITEM_OUT_OF_STOCK: ${missingItems.join(", ")}`,
        context: { missingItems, customerEmail: customer.email },
      });
      return NextResponse.json(
        {
          error: "ITEM_OUT_OF_STOCK",
          missingItems,
        },
        { status: 409 }
      );
    }

    // Calculate customer's current Premium Class discount based on last 1 month UTC orders or Admin assignment
    const classes = await getPremiumClassesFromDb();
    const userDoc = await db
      .collection("users")
      .findOne({ email: customer.email });
    const pastOrders = await db
      .collection("orders")
      .find({ "customer.email": customer.email })
      .toArray();
    const loyalty = calculateLoyaltyStatus(
      pastOrders as any[],
      classes,
      userDoc?.assignedClassId || null
    );

    const discountPercent = loyalty.discountPercent || 0;
    const discountedItemsPrice = Number(
      (subtotalPrice * (1 - discountPercent / 100)).toFixed(2)
    );
    const preFeeOrderAmount = Number(
      (discountedItemsPrice + deliveryCostPrice).toFixed(2)
    );
    const paymentFeeMoney = calculatePaymentMethodFee(
      preFeeOrderAmount,
      matchedPaymentConfig,
      currencyId
    );
    const totalPriceWithDelivery = Number(
      (preFeeOrderAmount + paymentFeeMoney.price).toFixed(2)
    );

    const totalMoney = { price: totalPriceWithDelivery, currencyId };
    const subtotalMoney = { price: subtotalPrice, currencyId };
    const pointsEarned = Math.max(1, Math.floor(subtotalPrice));
    const nowUtc = nowUtcIso();
    const configuredDeliveryOptions = normalizeDeliveryOptions(
      metadataDoc?.deliveryOptions,
      nowUtc
    );
    const matchedDeliveryOpt = configuredDeliveryOptions.find(
      (o) => o.id === deliveryOption.id
    );
    const estimatedDays = Math.max(
      0,
      Math.floor(
        Number(
          matchedDeliveryOpt?.estimatedDays ??
            deliveryOption.estimatedDays ??
            (deliveryOption.isStorePickup ? 0 : 3)
        )
      )
    );
    const expectedDeliveryAtUtc = computeExpectedDeliveryUtc(
      estimatedDays,
      nowUtc
    );
    const reservedUntilUtc = isBankOrCash
      ? computeThreeDayReservationUtc()
      : null;
    const orderStatus = isBankOrCash ? "ordered-not-paid" : "ordered-paid";

    const fallbackOrderCountry = resolveDefaultCountryAlpha3(
      body.billingAddress || userDoc?.billingAddress,
      body.shippingAddress || body.deliveryAddress || userDoc?.deliveryAddress,
      "ISR"
    );
    const rawBillingAddr =
      body.billingAddress ||
      userDoc?.billingAddress ||
      body.shippingAddress ||
      body.deliveryAddress;
    const rawShippingAddr =
      body.shippingAddress ||
      body.deliveryAddress ||
      userDoc?.deliveryAddress ||
      rawBillingAddr;

    const structuredBillingAddress = rawBillingAddr
      ? normalizeAddress(rawBillingAddr, {
          billingCountry: fallbackOrderCountry,
          defaultId: "billing-default",
          defaultNickname: "Billing (Default Shipping)",
        })
      : null;

    const structuredShippingAddress = rawShippingAddr
      ? normalizeDeliveryAddress(rawShippingAddr, {
          billingCountry:
            structuredBillingAddress?.CountryCodeAlpha3 || fallbackOrderCountry,
          defaultId: rawShippingAddr?.id || "shipping-order",
        })
      : null;

    const orderDoc = {
      items: cartItems,
      subtotalMoney,
      discountPercent,
      premiumClassName: loyalty.currentClass?.name || null,
      deliveryOption: {
        ...(matchedDeliveryOpt || {}),
        ...deliveryOption,
        cost: deliveryCostMoney,
        estimatedDays,
        expectedDeliveryAtUtc,
      },
      expectedDeliveryAtUtc,
      paymentFeeMoney,
      paymentFeePercent: matchedPaymentConfig.feePercent,
      paymentFeeConstant: matchedPaymentConfig.feeConstant,
      totalMoney,
      pointsEarned,
      billingAddress: structuredBillingAddress,
      shippingAddress: structuredShippingAddress,
      deliveryAddress: structuredShippingAddress,
      paymentMethod,
      contactEmail,
      gamingAccounts: body.gamingAccounts ||
        userDoc?.gamingAccounts || {
          wizardsAccount: "",
          riotAccount: "",
        },
      customer,
      status: orderStatus,
      reservedUntilUtc,
      createdAt: nowUtc,
      createdAtUtc: nowUtc,
    };

    const result = await db.collection("orders").insertOne(orderDoc);
    if (isBankOrCash && reservedUntilUtc) {
      await db.collection("order_ttl_holds").insertOne({
        orderId: result.insertedId.toString(),
        customerEmail: customer.email,
        items: cartItems,
        expiresAt: new Date(reservedUntilUtc),
        expiresAtUtc: reservedUntilUtc,
        createdAtUtc: nowUtc,
      });
    }
    await incrementOtelCounter(db, "dockside_orders_checkout_total", 1, {
      payment_type: paymentMethod.type,
      delivery_id: deliveryOption.id,
    });
    await recordFeatureUsage(db, "cart_checkout", {
      orderId: result.insertedId.toString(),
      paymentType: paymentMethod.type,
      deliveryOption: deliveryOption.id,
      totalPrice: totalPriceWithDelivery,
    });
    if (isBankOrCash) {
      await recordFeatureUsage(db, "order_3day_hold", {
        orderId: result.insertedId.toString(),
        paymentType: paymentMethod.type,
      });
    }
    await recordOtelTraceSpan(db, {
      operation: "orders.checkout",
      durationMs: 8,
      status: "OK",
      attributes: {
        orderId: result.insertedId.toString(),
        itemsCount: cartItems.length,
        totalPrice: totalPriceWithDelivery,
      },
    });
    return NextResponse.json({
      ok: true,
      orderId: result.insertedId.toString(),
      order: { ...orderDoc, _id: result.insertedId.toString() },
      pointsEarned,
      discountPercent,
      paymentFeeMoney,
      reservedUntilUtc,
    });
  }

  return NextResponse.json({
    ok: true,
    orderId: `local-${Date.now()}`,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const eventSlug = searchParams.get("eventSlug");
  const format = searchParams.get("format");
  const db = await getDb();

  if (!db) {
    return NextResponse.json({ orders: [], participants: [] });
  }

  const adminSession = await resolveAdminSessionFromRequest(request, db);

  if (eventSlug) {
    if (!adminSession) {
      return NextResponse.json(
        { error: "Unauthorized admin" },
        { status: 401 }
      );
    }

    const eventOrders = await db
      .collection("orders")
      .find({
        "items.slug": eventSlug,
        status: { $nin: ["declined", "cancelled", "aborted"] },
      })
      .sort({ createdAtUtc: -1, createdAt: -1 })
      .toArray();

    const participants = eventOrders.map((ord) => {
      const matchingItem = (ord.items || []).find(
        (it: any) => it.slug === eventSlug
      );
      return {
        orderId: ord._id.toString(),
        name: formatFullName(ord.customer?.name) || "Guest Player",
        structuredName: normalizeName(ord.customer?.name, "Guest", "Player"),
        email: ord.customer?.email || "guest@local",
        contactEmail:
          ord.contactEmail ||
          ord.customer?.contactEmail ||
          ord.customer?.email ||
          "guest@local",
        ticketsCount: Number(matchingItem?.quantity || 1),
        wizardsAccount: ord.gamingAccounts?.wizardsAccount || "",
        riotAccount: ord.gamingAccounts?.riotAccount || "",
        status: normalizeOrderStatus(ord.status),
        registeredAtUtc: ord.createdAtUtc || ord.createdAt || "",
      };
    });

    if (format === "csv") {
      await recordFeatureUsage(db, "event_participants_csv_download", {
        eventSlug,
        participantsCount: participants.length,
      });
      const header =
        "orderId,name,email,contactEmail,ticketsCount,wizardsAccount,riotAccount,status,registeredAtUtc";
      const rows = participants.map((p) =>
        [
          p.orderId,
          p.name.replace(/,/g, " "),
          p.email,
          p.contactEmail,
          p.ticketsCount,
          p.wizardsAccount.replace(/,/g, " "),
          p.riotAccount.replace(/,/g, " "),
          p.status,
          p.registeredAtUtc,
        ].join(",")
      );
      const csvContent = [header, ...rows].join("\n");
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="participants-${eventSlug}.csv"`,
        },
      });
    }

    return NextResponse.json({ eventSlug, participants });
  }

  // Admins may filter by any email; customers only ever see their own orders.
  const sessionCustomer = adminSession
    ? null
    : await resolveCustomerUserFromRequest(request, db);
  if (!adminSession && !sessionCustomer) {
    return NextResponse.json(
      { error: "Unauthorized: Admin or customer sign-in required" },
      { status: 401 }
    );
  }
  const scopedEmail = sessionCustomer ? sessionCustomer.email : email;

  const filter = scopedEmail ? { "customer.email": scopedEmail } : {};
  const docs = await db
    .collection("orders")
    .find(filter)
    .sort({ createdAtUtc: -1, createdAt: -1 })
    .limit(50)
    .toArray();

  const orders = docs.map((d) => ({
    ...d,
    _id: d._id.toString(),
    status: normalizeOrderStatus(d.status),
    totalMoney: normalizeMoney(d.totalMoney ?? d.totalPrice, "ILS"),
    subtotalMoney: normalizeMoney(
      d.subtotalMoney ?? d.totalMoney ?? d.totalPrice,
      "ILS"
    ),
    discountPercent: Number(d.discountPercent ?? 0),
    pointsEarned: Number(
      d.pointsEarned ?? Math.floor(d.totalMoney?.price ?? 0)
    ),
    createdAtUtc: d.createdAtUtc || d.createdAt,
  }));

  return NextResponse.json({ orders });
}

export async function PATCH(request: Request) {
  const db = await getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { orderId, status, customerEmail } = body;
  if (!orderId || !status) {
    return NextResponse.json(
      { error: "orderId and status are required" },
      { status: 400 }
    );
  }

  const query = { _id: String(orderId) };

  const existingOrder = await db.collection("orders").findOne(query);
  if (!existingOrder) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const currentStatus = normalizeOrderStatus(existingOrder.status);
  const nextStatus = normalizeOrderStatus(status);
  const adminSession = await resolveAdminSessionFromRequest(request, db);

  if (adminSession) {
    // Store admin action: can cancel at any point before completed, or advance order lifecycle
    if (nextStatus === "cancelled" && !canStoreCancelOrder(currentStatus)) {
      return NextResponse.json(
        { error: "Cannot cancel an order that is already completed or terminated" },
        { status: 400 }
      );
    }
    if (
      nextStatus !== "cancelled" &&
      !canTransitionOrderStatus(currentStatus, nextStatus, "store")
    ) {
      return NextResponse.json(
        {
          error: `Invalid store order transition from '${currentStatus}' to '${nextStatus}'`,
        },
        { status: 400 }
      );
    }
  } else {
    // Customer action: must be logged-in owner of the order and can only abort BEFORE packaged
    const customerUser = await resolveCustomerUserFromRequest(request, db);
    const orderOwnerEmail = String(
      existingOrder.customer?.email || ""
    ).toLowerCase();

    if (!customerUser || customerUser.email.toLowerCase() !== orderOwnerEmail) {
      return NextResponse.json(
        { error: "Unauthorized: Must be the logged-in customer who placed the order" },
        { status: 401 }
      );
    }

    if (nextStatus !== "aborted") {
      return NextResponse.json(
        { error: "Forbidden: Customers can only abort their own order" },
        { status: 403 }
      );
    }

    if (!canUserAbortOrder(currentStatus)) {
      return NextResponse.json(
        {
          error:
            "Order cannot be aborted once it has been packaged or completed",
        },
        { status: 400 }
      );
    }
  }

  const nowUtc = nowUtcIso();
  const wasActive =
    currentStatus !== "cancelled" && currentStatus !== "aborted";
  const isNowTerminated =
    nextStatus === "cancelled" || nextStatus === "aborted";

  await db.collection("orders").updateOne(query, {
    $set: {
      status: nextStatus,
      updatedAt: nowUtc,
      updatedAtUtc: nowUtc,
    },
  });

  if (nextStatus !== "ordered-not-paid") {
    await db.collection("order_ttl_holds").deleteOne({ orderId: String(orderId) });
  }

  // Restore held inventory in `items` and `events` collections when an active order is cancelled or aborted
  if (wasActive && isNowTerminated && Array.isArray(existingOrder.items)) {
    const itemsCol = db.collection("items");
    const eventsCol = db.collection("events");
    for (const ordItem of existingOrder.items) {
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
  }

  if (adminSession) {
    await recordAdminAuditLog(db, {
      session: adminSession,
      entityType: "order",
      entityId: String(orderId),
      action: "update",
      summary: `Updated order '${orderId}' status from '${currentStatus}' to '${nextStatus}'`,
      before: { status: currentStatus },
      after: { status: nextStatus },
    });
  }

  return NextResponse.json({
    ok: true,
    orderId,
    status: nextStatus,
    previousStatus: currentStatus,
  });
}
