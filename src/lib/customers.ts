import { hashPasswordScrypt } from "@/lib/auth-security";
import { normalizeNotifications, nowUtcIso } from "@/lib/premium";
import { normalizeName } from "@/lib/name";
import {
  normalizeAddress,
  normalizeDeliveryAddress,
  resolveDefaultCountryAlpha3,
  type Address,
  type DeliveryAddress,
} from "@/lib/address";

export function hasAddressStreet(addr: any): boolean {
  return Boolean(addr && (addr.StreetName || addr.street));
}

export function normalizeUserDoc(doc: Record<string, any>) {
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

export interface NewUserInput {
  name?: any;
  email: string;
  password?: string;
  authStrategy: "auth0-db" | "auth0-oauth";
  provider?: { provider: string; providerAccountId?: string };
  notifications?: any;
  billingAddress?: any;
  deliveryAddress?: any;
  savedAddresses?: any;
  paymentMethod?: any;
  savedPaymentMethods?: any;
  gamingAccounts?: any;
  preferences?: any;
}

/** Builds a fresh `users` document (never stores a plaintext password). */
export function buildNewUserDoc(input: NewUserInput) {
  const nowUtc = nowUtcIso();
  const email = input.email.trim().toLowerCase();
  const defaultCountry = resolveDefaultCountryAlpha3(
    input.billingAddress,
    input.deliveryAddress,
    "ISR"
  );
  const defaultBilling = normalizeAddress(
    input.billingAddress || input.deliveryAddress || {},
    {
      billingCountry: defaultCountry,
      defaultId: "billing-default",
      defaultNickname: "Billing (Default Shipping)",
    }
  );
  const defaultDelivery = normalizeDeliveryAddress(
    input.deliveryAddress || defaultBilling,
    {
      billingCountry: defaultBilling.CountryCodeAlpha3,
      defaultId: "billing-default",
      defaultNickname: "Billing (Default Shipping)",
    }
  );
  const savedAddresses = Array.isArray(input.savedAddresses)
    ? input.savedAddresses.map((item: any, idx: number) =>
        normalizeDeliveryAddress(item, {
          billingCountry: defaultBilling.CountryCodeAlpha3,
          defaultId: item?.id || `addr-${idx + 1}`,
        })
      )
    : [];

  return {
    name: normalizeName(input.name, email.split("@")[0] || "Guest", "Player"),
    email,
    // The account email is used for newsletters and notifications by default
    contactEmail: email,
    authStrategy: input.authStrategy,
    ...(input.provider?.providerAccountId
      ? { providerAccountId: input.provider.providerAccountId }
      : {}),
    passwordHash: input.password ? hashPasswordScrypt(input.password) : null,
    notifications: normalizeNotifications(input.notifications),
    linkedProviders: input.provider
      ? [
          {
            provider: input.provider.provider,
            providerEmail: email,
            connectedAtUtc: nowUtc,
          },
        ]
      : [],
    billingAddress: defaultBilling,
    savedAddresses,
    savedPaymentMethods: Array.isArray(input.savedPaymentMethods)
      ? input.savedPaymentMethods
      : [],
    deliveryAddress: defaultDelivery,
    paymentMethod: input.paymentMethod || { type: "credit-card", detail: "" },
    gamingAccounts: input.gamingAccounts || {
      wizardsAccount: "",
      riotAccount: "",
    },
    preferences: input.preferences || { locale: "en", theme: "dark" },
    createdAt: nowUtc,
    createdAtUtc: nowUtc,
  };
}

/**
 * Creates or updates the `users` document for a verified Google sign-in.
 * The verified Google email is the account email and newsletter destination.
 */
export async function upsertGoogleCustomer(
  db: import("@/lib/db").Db,
  profile: { email: string; name?: unknown; sub?: string }
): Promise<void> {
  const email = profile.email.trim().toLowerCase();
  const users = db.collection("users");
  const nowUtc = nowUtcIso();
  const existing = await users.findOne({ email });

  if (existing) {
    const links = Array.isArray(existing.linkedProviders)
      ? existing.linkedProviders
      : [];
    const linked = links.some((lp: any) => lp.provider === "google");
    await users.updateOne(
      { email },
      {
        $set: {
          contactEmail: existing.contactEmail || email,
          linkedProviders: linked
            ? links
            : [
                ...links,
                { provider: "google", providerEmail: email, connectedAtUtc: nowUtc },
              ],
          updatedAtUtc: nowUtc,
        },
      }
    );
    return;
  }

  await users.insertOne(
    buildNewUserDoc({
      name: profile.name,
      email,
      authStrategy: "auth0-oauth",
      provider: { provider: "google", providerAccountId: profile.sub },
    })
  );
}
