export const ISO20022_MAX_NAME_LENGTH = 140; // ISO 20022 Max140Text (<Nm>)
export const AFT_MAX_GIVEN_NAME_LENGTH = 35; // AFT / Visa Direct / Mastercard Send structured field limit
export const AFT_MAX_SURNAME_LENGTH = 35;
export const AFT_MAX_FULL_NAME_LENGTH = 70;

/**
 * Structured Name value object supporting ISO 20022 and AFT (Account Funding Transactions).
 * Does not store `fullName` redundantly; full names and standard-specific strings are built on demand.
 */
export interface Name {
  firstName: string;
  middleName?: string;
  lastName: string;
  secondLastName?: string;
}

export interface AftNamePayload {
  senderFirstName: string;
  senderMiddleName?: string;
  senderLastName: string;
  senderSecondLastName?: string;
  formattedFullName: string;
}

/**
 * Strips control characters, normalizes internal whitespace, and trims to optional maxLength.
 */
export function sanitizeNamePart(val?: unknown, maxLength?: number): string {
  if (val === null || val === undefined) return "";
  const cleaned = String(val)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (typeof maxLength === "number" && maxLength > 0 && cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength).trim();
  }
  return cleaned;
}

/**
 * Normalizes a structured `Name` object, legacy string, or partial record into a strict `{ firstName, middleName?, lastName }` object.
 * Never attaches `fullName` to the returned object.
 */
export function normalizeName(
  raw?: Name | string | Record<string, any> | null,
  fallbackFirstName = "",
  fallbackLastName = ""
): Name {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, any>;
    const rawFirst =
      obj.firstName ?? obj.givenName ?? obj.first ?? "";
    const rawMiddle =
      obj.middleName ?? obj.middle ?? "";
    const rawLast =
      obj.lastName ?? obj.surname ?? obj.familyName ?? obj.last ?? "";
    const rawSecondLast =
        obj.secondLastName ?? obj.secondSurname ?? obj.secondFamilyName ?? obj.secondLast ?? "";

    // If someone passed an object with only a legacy `fullName` or `name` string property
    if (!rawFirst && !rawLast && typeof (obj.fullName ?? obj.name) === "string") {
      return normalizeName(
        String(obj.fullName ?? obj.name),
        fallbackFirstName,
        fallbackLastName
      );
    }

    const firstName = sanitizeNamePart(
      rawFirst || fallbackFirstName,
      ISO20022_MAX_NAME_LENGTH
    );
    const middleName = sanitizeNamePart(rawMiddle, ISO20022_MAX_NAME_LENGTH);
    const lastName = sanitizeNamePart(
      rawLast || (rawFirst ? "" : fallbackLastName),
      ISO20022_MAX_NAME_LENGTH
    );
    const secondLastName = sanitizeNamePart(rawSecondLast, ISO20022_MAX_NAME_LENGTH);

    const result: Name = {
      firstName,
      lastName,
    };
    if (middleName) {
      result.middleName = middleName;
    }
    if (secondLastName) {
      result.secondLastName = secondLastName;
    }
    return result;
  }

  if (typeof raw === "string") {
    const cleaned = sanitizeNamePart(raw, ISO20022_MAX_NAME_LENGTH);
    if (!cleaned) {
      return {
        firstName: sanitizeNamePart(fallbackFirstName, ISO20022_MAX_NAME_LENGTH),
        lastName: sanitizeNamePart(fallbackLastName, ISO20022_MAX_NAME_LENGTH),
      };
    }
    const tokens = cleaned.split(" ").filter(Boolean);
    if (tokens.length === 1) {
      return {
        firstName: tokens[0],
        lastName: sanitizeNamePart(fallbackLastName, ISO20022_MAX_NAME_LENGTH),
      };
    }
    if (tokens.length === 2) {
      return {
        firstName: tokens[0],
        lastName: tokens[1],
      };
    }
    return {
      firstName: tokens[0],
      middleName: tokens.slice(1, -1).join(" "),
      lastName: tokens[tokens.length - 1],
    };
  }

  return {
    firstName: sanitizeNamePart(fallbackFirstName, ISO20022_MAX_NAME_LENGTH),
    lastName: sanitizeNamePart(fallbackLastName, ISO20022_MAX_NAME_LENGTH),
  };
}

/**
 * Dynamically builds the human-readable full name from a `Name` object or string when needed.
 */
export function formatFullName(
  name?: Name | string | Record<string, any> | null
): string {
  const norm = normalizeName(name);
  return [norm.firstName, norm.middleName, norm.lastName, norm.secondLastName]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Builds an ISO 20022 compliant party name (`<Nm>` Max140Text, <= 140 characters).
 */
export function formatIso20022Name(
  name?: Name | string | Record<string, any> | null
): string {
  const full = formatFullName(name);
  return sanitizeNamePart(full, ISO20022_MAX_NAME_LENGTH);
}

/**
 * Builds AFT (Account Funding Transaction — Visa Direct / Mastercard Send) structured name fields
 * with strict per-field (<= 35 chars) and combined (<= 70 chars) limits.
 */
export function toAftNameFields(
  name?: Name | string | Record<string, any> | null
): AftNamePayload {
  const norm = normalizeName(name);
  const senderFirstName = sanitizeNamePart(
    norm.firstName,
    AFT_MAX_GIVEN_NAME_LENGTH
  );
  const senderMiddleName = norm.middleName
    ? sanitizeNamePart(norm.middleName, AFT_MAX_GIVEN_NAME_LENGTH)
    : undefined;
  const senderLastName = sanitizeNamePart(
    norm.lastName,
    AFT_MAX_SURNAME_LENGTH
  );
  const senderSecondLastName = sanitizeNamePart(
      norm.secondLastName,
      AFT_MAX_SURNAME_LENGTH
  );
  const formattedFullName = sanitizeNamePart(
    [senderFirstName, senderMiddleName, senderLastName, senderSecondLastName]
      .filter(Boolean)
      .join(" "),
    AFT_MAX_FULL_NAME_LENGTH
  );

  return {
    senderFirstName,
    ...(senderMiddleName ? { senderMiddleName } : {}),
    senderLastName,
    ...(senderSecondLastName ? { senderSecondLastName } : {}),
    formattedFullName,
  };
}

/**
 * Checks whether a `Name` has non-empty `firstName` and `lastName` conforming to ISO 20022 and AFT limits.
 */
export function isValidIso20022AndAftName(
  name?: Name | string | Record<string, any> | null
): boolean {
  const norm = normalizeName(name);
  if (!norm.firstName || !norm.lastName) return false;
  if (norm.firstName.length > AFT_MAX_GIVEN_NAME_LENGTH) return false;
  if (norm.middleName && norm.middleName.length > AFT_MAX_GIVEN_NAME_LENGTH) {
    return false;
  }
  if (norm.lastName.length > AFT_MAX_SURNAME_LENGTH) return false;
  if (norm.secondLastName && norm.secondLastName.length > AFT_MAX_SURNAME_LENGTH) {
    return false;
  }
  const full = formatFullName(norm);
  return full.length > 0 && full.length <= ISO20022_MAX_NAME_LENGTH;
}
