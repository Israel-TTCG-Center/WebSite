import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  hashPasswordScrypt,
  isScryptHash,
  verifyPasswordScrypt,
  verifyThirdPartyIdentity,
} from "@/lib/auth-security";
import { normalizeNotifications, nowUtcIso } from "@/lib/premium";
import { normalizeName } from "@/lib/name";
import {
  normalizeAddress,
  normalizeDeliveryAddress,
  resolveDefaultCountryAlpha3,
  type Address,
  type DeliveryAddress,
} from "@/lib/address";

function hasAddressStreet(addr: any): boolean {
  return Boolean(addr && (addr.StreetName || addr.street));
}

function normalizeUserDoc(doc: Record<string, any>) {
  const notifications = normalizeNotifications(doc.notifications);
  // The user's custom contact email or account email is used for newsletters & notifications
  const contactEmail = doc.contactEmail || doc.email;

  const defaultCountry = resolveDefaultCountryAlpha3(
    doc.billingAddress,
    doc.deliveryAddress || doc.savedAddresses?.[0],
    "ISR"
  );

  let rawSaved = Array.isArray(doc.savedAddresses) ? doc.savedAddresses : [];
  if (rawSaved.length === 0 && hasAddressStreet(doc.deliveryAddress)) {
    rawSaved = [doc.deliveryAddress];
  }

  const savedAddresses: DeliveryAddress[] = rawSaved.map(
    (item: any, idx: number) =>
      normalizeDeliveryAddress(item, {
        billingCountry: defaultCountry,
        defaultId: item?.id || `addr-${idx + 1}`,
        defaultNickname: item?.nickname || "Home",
      })
  );

  const rawBilling = hasAddressStreet(doc.billingAddress)
    ? doc.billingAddress
    : hasAddressStreet(doc.deliveryAddress)
    ? doc.deliveryAddress
    : savedAddresses[0] || {};

  const billingAddress: Address = normalizeAddress(rawBilling, {
    billingCountry: defaultCountry,
    defaultId: "billing-default",
    defaultNickname: rawBilling?.nickname || "Billing (Default Shipping)",
  });

  const deliveryAddress: DeliveryAddress = hasAddressStreet(doc.deliveryAddress)
    ? normalizeDeliveryAddress(doc.deliveryAddress, {
        billingCountry: billingAddress.CountryCodeAlpha3,
        defaultId: doc.deliveryAddress.id || "addr-default",
        defaultNickname: doc.deliveryAddress.nickname || "Home",
      })
    : normalizeDeliveryAddress(billingAddress, {
        billingCountry: billingAddress.CountryCodeAlpha3,
        defaultId: "billing-default",
        defaultNickname:
          billingAddress.nickname || "Billing (Default Shipping)",
      });

  let savedPaymentMethods = Array.isArray(doc.savedPaymentMethods)
    ? doc.savedPaymentMethods
    : [];
  if (savedPaymentMethods.length === 0 && doc.paymentMethod?.detail) {
    savedPaymentMethods = [
      {
        id: doc.paymentMethod.id || "pm-default",
        nickname: doc.paymentMethod.nickname || "Primary",
        type: doc.paymentMethod.type || "credit-card",
        detail: doc.paymentMethod.detail || "",
      },
    ];
  }

  return {
    name: normalizeName(doc.name, doc.email?.split("@")[0] || "Guest", "Player"),
    email: doc.email,
    contactEmail,
    authStrategy: doc.authStrategy || "auth0-oauth",
    notifications,
    billingAddress,
    savedAddresses,
    savedPaymentMethods,
    linkedProviders: Array.isArray(doc.linkedProviders)
      ? doc.linkedProviders
      : [],
    deliveryAddress,
    paymentMethod: doc.paymentMethod ||
      savedPaymentMethods[0] || {
        type: "credit-card",
        detail: "",
      },
    gamingAccounts: doc.gamingAccounts || {
      wizardsAccount: "",
      riotAccount: "",
    },
    preferences: doc.preferences || {
      locale: "en",
      theme: "dark",
    },
  };
}

export async function POST(request: Request) {
  const body = await request.json();
  const {
    mode,
    provider,
    idToken,
    name,
    email,
    password,
    notifications,
    billingAddress,
    deliveryAddress,
    savedAddresses,
    paymentMethod,
    savedPaymentMethods,
    gamingAccounts,
    preferences,
  } = body;

  const db = await getDb();
  if (!db) {
    return NextResponse.json(
      { error: "Database connection unavailable" },
      { status: 503 }
    );
  }

  const users = db.collection("users");
  const nowUtc = nowUtcIso();

  // Third-Party Login / Registration via Auth0 / Google OAuth Adapter (Zero password stored in DB!)
  if (mode === "third-party" || provider) {
    const verified = verifyThirdPartyIdentity({
      provider,
      email,
      name,
      idToken,
    });
    const targetEmail = verified.email;
    const existing = await users.findOne({ email: targetEmail });

    if (existing) {
      const currentLinks = Array.isArray(existing.linkedProviders)
        ? existing.linkedProviders
        : [];
      const alreadyLinked = currentLinks.some(
        (lp: any) => lp.provider === verified.provider
      );
      const updatedLinks = alreadyLinked
        ? currentLinks
        : [
            ...currentLinks,
            {
              provider: verified.provider,
              providerEmail: targetEmail,
              connectedAtUtc: nowUtc,
            },
          ];

      await users.updateOne(
        { email: targetEmail },
        {
          $set: {
            contactEmail: existing.contactEmail || targetEmail,
            linkedProviders: updatedLinks,
            updatedAtUtc: nowUtc,
          },
          $unset: { password: "" },
        }
      );
      const refreshed = await users.findOne({ email: targetEmail });
      return NextResponse.json({
        user: normalizeUserDoc(refreshed || existing),
      });
    }

    const defaultCountry = resolveDefaultCountryAlpha3(
      billingAddress,
      deliveryAddress,
      "ISR"
    );
    const defaultBilling = normalizeAddress(
      billingAddress || deliveryAddress || {},
      {
        billingCountry: defaultCountry,
        defaultId: "billing-default",
        defaultNickname: "Billing (Default Shipping)",
      }
    );
    const defaultDelivery = normalizeDeliveryAddress(
      deliveryAddress || defaultBilling,
      {
        billingCountry: defaultBilling.CountryCodeAlpha3,
        defaultId: "billing-default",
        defaultNickname: "Billing (Default Shipping)",
      }
    );
    const normalizedSavedList = Array.isArray(savedAddresses)
      ? savedAddresses.map((item: any, idx: number) =>
          normalizeDeliveryAddress(item, {
            billingCountry: defaultBilling.CountryCodeAlpha3,
            defaultId: item?.id || `addr-${idx + 1}`,
          })
        )
      : [];

    const newThirdPartyUser = {
      name: verified.name,
      email: targetEmail,
      // Google account email is automatically used for newsletters
      contactEmail: targetEmail,
      authStrategy: verified.authStrategy,
      providerAccountId: verified.providerAccountId,
      passwordHash: null,
      notifications: normalizeNotifications(notifications),
      linkedProviders: [
        {
          provider: verified.provider,
          providerEmail: targetEmail,
          connectedAtUtc: nowUtc,
        },
      ],
      billingAddress: defaultBilling,
      savedAddresses: normalizedSavedList,
      savedPaymentMethods: Array.isArray(savedPaymentMethods)
        ? savedPaymentMethods
        : [],
      deliveryAddress: defaultDelivery,
      paymentMethod: paymentMethod || {
        type: "credit-card",
        detail: "",
      },
      gamingAccounts: gamingAccounts || {
        wizardsAccount: "",
        riotAccount: "",
      },
      preferences: preferences || {
        locale: "en",
        theme: "dark",
      },
      createdAt: nowUtc,
      createdAtUtc: nowUtc,
    };

    await users.insertOne(newThirdPartyUser);
    return NextResponse.json({
      user: normalizeUserDoc(newThirdPartyUser),
    });
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (mode === "register") {
    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const defaultCountry = resolveDefaultCountryAlpha3(
      billingAddress,
      deliveryAddress,
      "ISR"
    );
    const defaultBilling = normalizeAddress(
      billingAddress || deliveryAddress || {},
      {
        billingCountry: defaultCountry,
        defaultId: "billing-default",
        defaultNickname: "Billing (Default Shipping)",
      }
    );
    const defaultDelivery = normalizeDeliveryAddress(
      deliveryAddress || defaultBilling,
      {
        billingCountry: defaultBilling.CountryCodeAlpha3,
        defaultId: "billing-default",
        defaultNickname: "Billing (Default Shipping)",
      }
    );
    const normalizedSavedList = Array.isArray(savedAddresses)
      ? savedAddresses.map((item: any, idx: number) =>
          normalizeDeliveryAddress(item, {
            billingCountry: defaultBilling.CountryCodeAlpha3,
            defaultId: item?.id || `addr-${idx + 1}`,
          })
        )
      : [];

    // Never store plaintext password in DB; hash with salted scrypt & bind registered email for newsletters
    const userDoc = {
      name: normalizeName(name, normalizedEmail.split("@")[0] || "Guest", "Player"),
      email: normalizedEmail,
      contactEmail: normalizedEmail,
      authStrategy: "auth0-db",
      passwordHash: hashPasswordScrypt(password),
      notifications: normalizeNotifications(notifications),
      linkedProviders: [],
      billingAddress: defaultBilling,
      savedAddresses: normalizedSavedList,
      savedPaymentMethods: Array.isArray(savedPaymentMethods)
        ? savedPaymentMethods
        : [],
      deliveryAddress: defaultDelivery,
      paymentMethod: paymentMethod || {
        type: "credit-card",
        detail: "",
      },
      gamingAccounts: gamingAccounts || {
        wizardsAccount: "",
        riotAccount: "",
      },
      preferences: preferences || {
        locale: "en",
        theme: "dark",
      },
      createdAt: nowUtc,
      createdAtUtc: nowUtc,
    };
    await users.insertOne(userDoc);
    return NextResponse.json({
      user: normalizeUserDoc(userDoc),
    });
  }

  const found =
    (await users.findOne({ email: normalizedEmail })) ||
    (await users.findOne({ email }));
  const storedVerifier = found?.passwordHash || found?.password;

  if (!found || !verifyPasswordScrypt(password, storedVerifier)) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  // Transparently migrate any legacy plaintext password to salted scrypt hash and remove plaintext
  if (found.password || !isScryptHash(found.passwordHash)) {
    await users.updateOne(
      { _id: found._id },
      {
        $set: {
          authStrategy: "auth0-db",
          passwordHash: hashPasswordScrypt(password),
          contactEmail: found.contactEmail || found.email,
          updatedAtUtc: nowUtc,
        },
        $unset: { password: "" },
      }
    );
  }

  return NextResponse.json({
    user: normalizeUserDoc(found),
  });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const {
    email,
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

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

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
    .updateOne({ email }, { $set: updateFields }, { upsert: true });

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
