import { nowUtcIso } from "@/lib/premium";
import {
  DEFAULT_STORE_ADDRESS,
  type Address,
  type DeliveryAddress,
  type PostalCodeString,
  type SubscriberPhoneNumber,
} from "@/lib/address";

export type PrivacyRegulationFramework = "GDPR" | "CCPA-CPRA" | "IL-PPL-13";

export interface PrivacyConsentPreferences {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  doNotSellOrShare: boolean;
  gpcDetected: boolean;
  updatedAtUtc: string;
  regulationFrameworks: PrivacyRegulationFramework[];
}

export const PRIVACY_CONSENT_STORAGE_KEY = "dockside_privacy_consent_v1";

/**
 * Detects Global Privacy Control (`Sec-GPC: 1` HTTP header or `navigator.globalPrivacyControl === true`)
 * required under California CCPA/CPRA (11 CCR § 7025).
 */
export function detectGlobalPrivacyControl(
  headers?: Headers | Record<string, string | null | undefined> | null,
  clientGpc?: boolean
): boolean {
  if (clientGpc === true) return true;
  if (!headers) return false;

  if (typeof (headers as Headers).get === "function") {
    const secGpc = (headers as Headers).get("sec-gpc") || (headers as Headers).get("Sec-GPC");
    return String(secGpc || "").trim() === "1";
  }

  const record = headers as Record<string, string | null | undefined>;
  const raw = record["sec-gpc"] ?? record["Sec-GPC"];
  return String(raw || "").trim() === "1";
}

/**
 * Normalizes cookie & privacy consent under:
 * - EU/UK GDPR (ePrivacy prior opt-in for non-essential analytics/marketing)
 * - California CCPA/CPRA ("Do Not Sell or Share" & mandatory Global Privacy Control recognition)
 * - Israeli Protection of Privacy Law (Amendment 13) & Communications Law Section 30A ("Anti-Spam" explicit opt-in)
 */
export function normalizePrivacyConsent(
  input?: Partial<PrivacyConsentPreferences> | null,
  options?: {
    headers?: Headers | Record<string, string | null | undefined> | null;
    clientGpc?: boolean;
    nowUtc?: string;
  }
): PrivacyConsentPreferences {
  const gpcDetected =
    Boolean(input?.gpcDetected) ||
    detectGlobalPrivacyControl(options?.headers, options?.clientGpc);

  const doNotSellOrShare = gpcDetected
    ? true
    : Boolean(input?.doNotSellOrShare);

  // When GPC or Do Not Sell/Share is active, non-essential cross-context tracking/marketing defaults to false
  const analytics = doNotSellOrShare ? false : Boolean(input?.analytics);
  const marketing = doNotSellOrShare ? false : Boolean(input?.marketing);

  return {
    essential: true,
    analytics,
    marketing,
    doNotSellOrShare,
    gpcDetected,
    updatedAtUtc: input?.updatedAtUtc || options?.nowUtc || nowUtcIso(),
    regulationFrameworks: ["GDPR", "CCPA-CPRA", "IL-PPL-13"],
  };
}

export const REDACTED_EMAIL = "redacted@privacy.invalid";
export const REDACTED_TEXT = "[redacted-privacy]";

/**
 * Anonymizes personal data (PII) on a historical order document for GDPR Art. 17(3)(b),
 * CCPA Right to Delete, and Israeli PPL Amendment 13 erasure requests, while preserving
 * non-PII financial and inventory line items for tax/accounting integrity.
 */
export function anonymizeOrderForGdprErasure<T extends Record<string, any>>(
  orderDoc: T,
  nowUtc: string = nowUtcIso()
): T {
  const redactAddress = (addr: Record<string, any>) => ({
    id: "redacted",
    nickname: REDACTED_TEXT,
    recipientName: {
      firstName: REDACTED_TEXT,
      lastName: REDACTED_TEXT,
    },
    street: REDACTED_TEXT,
    buildingNumber: "",
    unitNumber: "",
    city: REDACTED_TEXT,
    stateRegion: "",
    postalCode: REDACTED_TEXT,
    StreetName: REDACTED_TEXT,
    BuildingNumber: "0",
    Apartment: "",
    PostalCode: "0000000" as PostalCodeString,
    TownName: REDACTED_TEXT,
    CountrySubDivision: REDACTED_TEXT,
    CountryCodeAlpha3: "ISR",
    phone:
      addr?.phone && typeof addr.phone === "object"
        ? {
            CountryCodeAlpha3: "ISR",
            PhoneNumber: "000-000-0000" as SubscriberPhoneNumber,
          }
        : REDACTED_TEXT,
  });

  const isStructuredCustomerName =
    orderDoc.customer?.name && typeof orderDoc.customer.name === "object";

  return {
    ...orderDoc,
    contactEmail: REDACTED_EMAIL,
    customer: {
      name: isStructuredCustomerName
        ? { firstName: REDACTED_TEXT, lastName: REDACTED_TEXT }
        : REDACTED_TEXT,
      email: REDACTED_EMAIL,
      contactEmail: REDACTED_EMAIL,
    },
    billingAddress: orderDoc.billingAddress
      ? redactAddress(orderDoc.billingAddress)
      : null,
    shippingAddress: orderDoc.shippingAddress
      ? { ...redactAddress(orderDoc.shippingAddress), deliveryNotes: REDACTED_TEXT }
      : null,
    deliveryAddress: orderDoc.deliveryAddress
      ? { ...redactAddress(orderDoc.deliveryAddress), deliveryNotes: REDACTED_TEXT }
      : null,
    paymentMethod: orderDoc.paymentMethod
      ? {
          type: orderDoc.paymentMethod.type || "credit-card",
          nickname: REDACTED_TEXT,
          accountHolderName: {
            firstName: REDACTED_TEXT,
            lastName: REDACTED_TEXT,
          },
          detail: REDACTED_TEXT,
        }
      : undefined,
    gamingAccounts: {
      wizardsAccount: "",
      riotAccount: "",
    },
    privacyRedacted: true,
    privacyRedactedAtUtc: nowUtc,
    updatedAt: nowUtc,
    updatedAtUtc: nowUtc,
  };
}

/**
 * Builds a machine-readable JSON Data Portability / Right-to-Know / Right-to-Inspect export
 * (GDPR Art. 15 & 20, CCPA 11 CCR § 7024, Israeli PPL Section 13) with zero password/verifier fields.
 */
export function buildUserPortabilityExport(params: {
  user: Record<string, any>;
  orders?: Record<string, any>[];
  loyalty?: Record<string, any> | null;
  consent?: PrivacyConsentPreferences | null;
  exportedAtUtc?: string;
}) {
  const exportedAtUtc = params.exportedAtUtc || nowUtcIso();
  const safeUser = { ...params.user };
  delete safeUser.password;
  delete safeUser.passwordHash;
  if (safeUser._id) {
    safeUser._id = String(safeUser._id);
  }

  const safeOrders = (params.orders || []).map((ord) => ({
    ...ord,
    _id: ord._id ? String(ord._id) : undefined,
  }));

  const safeLoyalty = params.loyalty
    ? {
        ...params.loyalty,
        _id: params.loyalty._id ? String(params.loyalty._id) : undefined,
      }
    : null;

  return {
    schemaVersion: "dockside-privacy-export-v1",
    exportedAtUtc,
    regulations: [
      "EU/UK GDPR (Articles 15 & 20 — Right of Access & Data Portability)",
      "California CCPA/CPRA (Right to Know & Access)",
      "Israel Protection of Privacy Law 5741-1981 & Amendment 13 (Section 13 Right to Inspect)",
    ],
    dataController: {
      name: "Dockside Keep",
      address: DEFAULT_STORE_ADDRESS,
      contactEmail: "israelttgcenter@gmail.com",
    },
    profile: safeUser,
    loyalty: safeLoyalty,
    privacyConsent:
      params.consent || normalizePrivacyConsent(safeUser.privacyConsent),
    orders: safeOrders,
  };
}
