import worldCountries from "world-countries";
import {
  getCountryCallingCode,
  parsePhoneNumber,
  type Country as IsoCountryAlpha2,
} from "react-phone-number-input";
import { type Name, normalizeName } from "@/lib/name";

export type RegexString<Pattern extends string> = string & {
  readonly __regexPattern?: Pattern;
};

export const COUNTRY_CODE_ALPHA3_REGEX = /^[A-Z]{3}$/;
export type CountryCodeAlpha3 = RegexString<"^[A-Z]{3}$">;

export const SUBSCRIBER_PHONE_NUMBER_REGEX = /^[0-9()+\-]{1,30}$/;
export type SubscriberPhoneNumber = RegexString<"^[0-9()+\\-]{1,30}$">;

export const ISO20022_VISUAL_PHONE_REGEX = /^\+[0-9]{1,3}-[0-9()+\-]{1,30}$/;
export type Iso20022FormattedPhone =
  RegexString<"^\\+[0-9]{1,3}-[0-9()+\\-]{1,30}$">;

export const POSTAL_CODE_REGEX = /^[A-Za-z0-9 \-]{1,16}$/;
export type PostalCodeString = RegexString<"^[A-Za-z0-9 \\-]{1,16}$">;

export interface Phone {
  CountryCodeAlpha3: CountryCodeAlpha3;
  PhoneNumber: SubscriberPhoneNumber;
}

export interface Address {
  id?: string;
  nickname?: string;
  recipientName?: Name;
  StreetName: string;
  BuildingNumber?: string;
  Apartment?: string;
  PostalCode: PostalCodeString;
  TownName: string;
  CountrySubDivision?: string;
  CountryCodeAlpha3: CountryCodeAlpha3;
  phone?: Phone;
}

export interface DeliveryAddress extends Address {
  deliveryNotes?: string;
}

interface WorldCountryEntry {
  cca2: string;
  cca3: CountryCodeAlpha3;
  nameCommon: string;
  dialCode: string;
}

const BY_ALPHA2 = new Map<string, WorldCountryEntry>();
const BY_ALPHA3 = new Map<string, WorldCountryEntry>();
const BY_NAME_UPPER = new Map<string, WorldCountryEntry>();
const DIAL_TO_COUNTRIES = new Map<string, CountryCodeAlpha3[]>();

for (const c of worldCountries) {
  const cca2 = String(c.cca2 || "").toUpperCase();
  const cca3 = String(c.cca3 || "").toUpperCase() as CountryCodeAlpha3;
  if (!cca2 || !cca3) continue;

  let dialCode = "";
  try {
    dialCode = String(getCountryCallingCode(cca2 as IsoCountryAlpha2));
  } catch {
    const root = String(c.idd?.root || "").replace(/[^0-9]/g, "");
    const suffix =
      Array.isArray(c.idd?.suffixes) && c.idd.suffixes.length === 1
        ? String(c.idd.suffixes[0] || "").replace(/[^0-9]/g, "")
        : "";
    dialCode = `${root}${suffix}`;
  }

  const entry: WorldCountryEntry = {
    cca2,
    cca3,
    nameCommon: c.name?.common || cca3,
    dialCode,
  };

  BY_ALPHA2.set(cca2, entry);
  BY_ALPHA3.set(cca3, entry);
  if (c.name?.common) {
    BY_NAME_UPPER.set(c.name.common.toUpperCase(), entry);
  }
  if (c.name?.official) {
    BY_NAME_UPPER.set(c.name.official.toUpperCase(), entry);
  }
  if (dialCode) {
    const list = DIAL_TO_COUNTRIES.get(dialCode) || [];
    // Ensure primary territories like USA for +1 appear first
    if (cca3 === "USA" || cca3 === "GBR" || cca3 === "ISR") {
      list.unshift(cca3);
    } else {
      list.push(cca3);
    }
    DIAL_TO_COUNTRIES.set(dialCode, list);
  }
}

// Common alias "UK" -> GBR
const gbrEntry = BY_ALPHA3.get("GBR");
if (gbrEntry) {
  BY_ALPHA2.set("UK", gbrEntry);
}

const heRegionNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["he"], { type: "region" })
    : null;

export function getCountryMetadata(codeOrName?: string | null): {
  cca2: string;
  cca3: CountryCodeAlpha3;
  name: string;
  name_he: string;
  dialCode: string;
} {
  const alpha3 = normalizeCountryCodeAlpha3(codeOrName);
  const entry = BY_ALPHA3.get(alpha3);
  const cca2 = entry?.cca2 || alpha3.slice(0, 2);
  const name = entry?.nameCommon || alpha3;
  let name_he = name;
  if (heRegionNames && cca2.length === 2) {
    try {
      name_he = heRegionNames.of(cca2) || name;
    } catch {
      name_he = name;
    }
  }
  return {
    cca2,
    cca3: alpha3,
    name,
    name_he,
    dialCode: entry?.dialCode || "972",
  };
}

export function isValidCountryCodeAlpha3(
  val: string
): val is CountryCodeAlpha3 {
  return COUNTRY_CODE_ALPHA3_REGEX.test(val);
}

export function isValidSubscriberPhoneNumber(
  val: string
): val is SubscriberPhoneNumber {
  return SUBSCRIBER_PHONE_NUMBER_REGEX.test(val);
}

export function isValidIso20022Phone(
  val: string
): val is Iso20022FormattedPhone {
  return ISO20022_VISUAL_PHONE_REGEX.test(val);
}

export function isValidPostalCode(val: string): val is PostalCodeString {
  return POSTAL_CODE_REGEX.test(val);
}

export function resolveDefaultCountryAlpha3(
  userBilling?: Partial<Address> | Record<string, any> | null,
  userShipping?: Partial<Address> | Record<string, any> | null,
  fallback: string = "ISR"
): CountryCodeAlpha3 {
  const billingRaw =
    userBilling?.CountryCodeAlpha3 || (userBilling as any)?.country;
  if (billingRaw && String(billingRaw).trim()) {
    return normalizeCountryCodeAlpha3(String(billingRaw));
  }
  const shippingRaw =
    userShipping?.CountryCodeAlpha3 || (userShipping as any)?.country;
  if (shippingRaw && String(shippingRaw).trim()) {
    return normalizeCountryCodeAlpha3(String(shippingRaw));
  }
  return normalizeCountryCodeAlpha3(fallback);
}

export function normalizeCountryCodeAlpha3(
  code?: string | null,
  fallbackChain?: {
    billingCountry?: string | null;
    shippingCountry?: string | null;
  }
): CountryCodeAlpha3 {
  const candidates = [
    code,
    fallbackChain?.billingCountry,
    fallbackChain?.shippingCountry,
    "ISR",
  ];
  for (const cand of candidates) {
    const rawTrimmed = String(cand || "").trim().toUpperCase();
    if (!rawTrimmed) continue;
    const byName = BY_NAME_UPPER.get(rawTrimmed);
    if (byName) return byName.cca3;

    const clean = rawTrimmed.replace(/[^A-Z]/g, "");
    if (!clean) continue;
    if (clean.length === 2) {
      const byA2 = BY_ALPHA2.get(clean);
      if (byA2) return byA2.cca3;
    }
    if (clean.length === 3 && isValidCountryCodeAlpha3(clean)) {
      const byA3 = BY_ALPHA3.get(clean);
      return byA3 ? byA3.cca3 : clean;
    }
    const byCleanName = BY_NAME_UPPER.get(clean);
    if (byCleanName) return byCleanName.cca3;
  }
  return "ISR";
}

export function countryAlpha3ToAlpha2(codeAlpha3?: string | null): string {
  const norm = normalizeCountryCodeAlpha3(codeAlpha3);
  const entry = BY_ALPHA3.get(norm);
  if (entry) {
    return entry.cca2.toLowerCase();
  }
  return norm.slice(0, 2).toLowerCase();
}

export function countryAlpha3ToDialCode(codeAlpha3?: string | null): string {
  const norm = normalizeCountryCodeAlpha3(codeAlpha3);
  return BY_ALPHA3.get(norm)?.dialCode || "972";
}

export function dialCodeToCountryAlpha3(
  dialCode: string,
  preferredCountryAlpha3?: string | null
): CountryCodeAlpha3 {
  const digits = String(dialCode || "").replace(/[^0-9]/g, "");
  const pref = preferredCountryAlpha3
    ? normalizeCountryCodeAlpha3(preferredCountryAlpha3)
    : undefined;
  if (pref && BY_ALPHA3.get(pref)?.dialCode === digits) {
    return pref;
  }
  const matches = DIAL_TO_COUNTRIES.get(digits);
  if (matches && matches.length > 0) {
    return matches[0];
  }
  return pref || "ISR";
}

export function sanitizeSubscriberPhoneNumber(
  raw?: string | null
): SubscriberPhoneNumber {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[^0-9()+\-]/g, "")
    .slice(0, 30);
  return cleaned as SubscriberPhoneNumber;
}

export function normalizePostalCode(raw?: string | null): PostalCodeString {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[^A-Za-z0-9 \-]/g, "")
    .slice(0, 16);
  return cleaned as PostalCodeString;
}

export function normalizePhone(
  raw: unknown,
  fallbackCountryAlpha3?: string | null
): Phone {
  const defaultCountry = normalizeCountryCodeAlpha3(fallbackCountryAlpha3);

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, any>;
    const country = normalizeCountryCodeAlpha3(
      obj.CountryCodeAlpha3 || obj.countryCodeAlpha3 || obj.country,
      { billingCountry: defaultCountry }
    );
    const rawSub = String(
      obj.PhoneNumber ?? obj.phoneNumber ?? obj.number ?? ""
    ).trim();
    const matchFormatted = rawSub.match(/^\+([0-9]{1,3})-(.+)$/);
    if (matchFormatted) {
      const resolvedCountry = dialCodeToCountryAlpha3(
        matchFormatted[1],
        country
      );
      return {
        CountryCodeAlpha3: resolvedCountry,
        PhoneNumber: sanitizeSubscriberPhoneNumber(matchFormatted[2]),
      };
    }
    return {
      CountryCodeAlpha3: country,
      PhoneNumber: sanitizeSubscriberPhoneNumber(rawSub),
    };
  }

  const str = String(raw || "").trim();
  if (!str) {
    return {
      CountryCodeAlpha3: defaultCountry,
      PhoneNumber: "" as SubscriberPhoneNumber,
    };
  }

  const isoMatch = str.match(/^\+([0-9]{1,3})-(.+)$/);
  if (isoMatch) {
    const resolvedCountry = dialCodeToCountryAlpha3(
      isoMatch[1],
      defaultCountry
    );
    return {
      CountryCodeAlpha3: resolvedCountry,
      PhoneNumber: sanitizeSubscriberPhoneNumber(isoMatch[2]),
    };
  }

  // Delegate E.164 / international phone parsing to react-phone-number-input (libphonenumber-js)
  if (str.startsWith("+")) {
    const defaultAlpha2 = countryAlpha3ToAlpha2(
      defaultCountry
    ).toUpperCase() as IsoCountryAlpha2;
    const parsed = parsePhoneNumber(str, defaultAlpha2);
    if (parsed) {
      const parsedCountryAlpha3 = parsed.country
        ? normalizeCountryCodeAlpha3(parsed.country)
        : dialCodeToCountryAlpha3(parsed.countryCallingCode, defaultCountry);
      return {
        CountryCodeAlpha3: parsedCountryAlpha3,
        PhoneNumber: sanitizeSubscriberPhoneNumber(parsed.nationalNumber),
      };
    }
  }

  return {
    CountryCodeAlpha3: defaultCountry,
    PhoneNumber: sanitizeSubscriberPhoneNumber(str),
  };
}

export function formatPhone(
  phone: Phone | string | null | undefined,
  fallbackCountryAlpha3?: string | null
): Iso20022FormattedPhone | "" {
  if (!phone) return "";
  const normalized = normalizePhone(phone, fallbackCountryAlpha3);
  if (!normalized.PhoneNumber) return "";
  const dialCode = countryAlpha3ToDialCode(normalized.CountryCodeAlpha3);
  return `+${dialCode}-${normalized.PhoneNumber}` as Iso20022FormattedPhone;
}

function clampStr(val: unknown, maxLen: number): string {
  return String(val || "")
    .trim()
    .slice(0, maxLen);
}

function parseAddressFromString(
  rawStr: string,
  defaultCountry: CountryCodeAlpha3
): Address {
  const parts = rawStr
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const firstPart = parts[0] || "";
  const streetMatch = firstPart.match(/^(.*?)\s+(\d+[A-Za-z]?)$/);
  const StreetName = clampStr(
    streetMatch ? streetMatch[1] : firstPart,
    70
  );
  const BuildingNumber = clampStr(streetMatch ? streetMatch[2] : "", 16);
  const TownName = clampStr(parts[1] || "", 35);
  const lastPart = parts[parts.length - 1] || "";
  const postalMatch = lastPart.match(/^[A-Za-z0-9 \-]{3,16}$/);
  const PostalCode = normalizePostalCode(
    parts.length >= 3 && postalMatch ? lastPart : ""
  );

  return {
    StreetName,
    BuildingNumber,
    Apartment: "",
    PostalCode,
    TownName,
    CountrySubDivision: "",
    CountryCodeAlpha3: defaultCountry,
  };
}

export interface NormalizeAddressOptions {
  billingCountry?: string | null;
  shippingCountry?: string | null;
  defaultId?: string;
  defaultNickname?: string;
  fallbackAddress?: Partial<Address>;
}

export function normalizeAddress(
  raw: unknown,
  options?: NormalizeAddressOptions
): Address {
  const resolvedCountry = normalizeCountryCodeAlpha3(
    typeof raw === "object" && raw !== null
      ? (raw as any).CountryCodeAlpha3 || (raw as any).country
      : undefined,
    {
      billingCountry:
        options?.billingCountry || options?.fallbackAddress?.CountryCodeAlpha3,
      shippingCountry: options?.shippingCountry,
    }
  );

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed && options?.fallbackAddress) {
      return normalizeAddress(options.fallbackAddress, options);
    }
    const parsed = parseAddressFromString(trimmed, resolvedCountry);
    return {
      ...(options?.defaultId ? { id: options.defaultId } : {}),
      ...(options?.defaultNickname
        ? { nickname: options.defaultNickname }
        : {}),
      ...parsed,
    };
  }

  const obj =
    raw && typeof raw === "object"
      ? (raw as Record<string, any>)
      : (options?.fallbackAddress as Record<string, any>) || {};

  let rawStreet = String(obj.StreetName ?? obj.street ?? "").trim();
  let rawBuilding = String(
    obj.BuildingNumber ?? obj.buildingNumber ?? ""
  ).trim();

  const StreetName = clampStr(rawStreet, 70);
  const BuildingNumber = clampStr(rawBuilding, 16);
  const Apartment = clampStr(
    obj.Apartment ?? obj.unitNumber ?? obj.apartment ?? "",
    70
  );
  const PostalCode = normalizePostalCode(
    obj.PostalCode ?? obj.postalCode ?? ""
  );
  const TownName = clampStr(obj.TownName ?? obj.city ?? "", 35);
  const CountrySubDivision = clampStr(
    obj.CountrySubDivision ?? obj.stateRegion ?? "",
    35
  );
  const CountryCodeAlpha3 = normalizeCountryCodeAlpha3(
    obj.CountryCodeAlpha3 ?? obj.country,
    {
      billingCountry:
        options?.billingCountry || options?.fallbackAddress?.CountryCodeAlpha3,
      shippingCountry: options?.shippingCountry,
    }
  );

  const id = obj.id || options?.defaultId;
  const nickname = obj.nickname || options?.defaultNickname;
  const recipientName = obj.recipientName
    ? normalizeName(obj.recipientName)
    : undefined;
  const hasPhoneInput = obj.phone !== undefined && obj.phone !== null;
  const normalizedPhone = hasPhoneInput
    ? normalizePhone(obj.phone, CountryCodeAlpha3)
    : undefined;

  const result: Address = {
    ...(id ? { id: String(id) } : {}),
    ...(nickname ? { nickname: String(nickname) } : {}),
    ...(recipientName ? { recipientName } : {}),
    StreetName,
    BuildingNumber,
    Apartment,
    PostalCode,
    TownName,
    CountrySubDivision,
    CountryCodeAlpha3,
    ...(normalizedPhone ? { phone: normalizedPhone } : {}),
  };

  return result;
}

export function normalizeDeliveryAddress(
  raw: unknown,
  options?: NormalizeAddressOptions
): DeliveryAddress {
  const base = normalizeAddress(raw, options);
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
  const deliveryNotes = String(obj.deliveryNotes ?? "").trim();
  return {
    ...base,
    deliveryNotes,
  };
}

export function formatAddressOneLine(
  addr: Address | DeliveryAddress | string | null | undefined,
  options?: {
    includeNickname?: boolean;
    includePhone?: boolean;
    includeCountry?: boolean;
  }
): string {
  if (!addr) return "";
  if (typeof addr === "string") return addr.trim();

  const norm = normalizeAddress(addr);
  const streetAndBuilding = [norm.StreetName, norm.BuildingNumber]
    .filter(Boolean)
    .join(" ");
  const aptPart = norm.Apartment ? `Apt/Unit ${norm.Apartment}` : "";
  const cityPart = norm.TownName || "";
  const stateAndPostal = [norm.CountrySubDivision, norm.PostalCode]
    .filter(Boolean)
    .join(" ");

  const segments = [
    streetAndBuilding,
    aptPart,
    cityPart,
    stateAndPostal,
  ].filter(Boolean);

  if (options?.includeCountry && norm.CountryCodeAlpha3) {
    segments.push(norm.CountryCodeAlpha3);
  }

  let line = segments.join(", ");

  const includePhone = options?.includePhone ?? true;
  if (includePhone && norm.phone?.PhoneNumber) {
    line = `${line} (${norm.phone.PhoneNumber})`.trim();
  }

  if (options?.includeNickname && norm.nickname) {
    line = `[${norm.nickname}] ${line}`.trim();
  }

  return line;
}

export const DEFAULT_STORE_PHONE: Phone = {
  CountryCodeAlpha3: "ISR",
  PhoneNumber: "053-774-6837" as SubscriberPhoneNumber,
};

export const DEFAULT_STORE_ADDRESS: Address = {
  StreetName: "הרץ",
  BuildingNumber: "3",
  Apartment: "",
  PostalCode: "3223201" as PostalCodeString,
  TownName: "Haifa",
  CountrySubDivision: "Haifa District",
  CountryCodeAlpha3: "ISR",
  phone: DEFAULT_STORE_PHONE,
};
