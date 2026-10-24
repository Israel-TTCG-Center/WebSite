import { describe, it, expect } from "vitest";
import {
  ISO20022_MAX_NAME_LENGTH,
  AFT_MAX_GIVEN_NAME_LENGTH,
  AFT_MAX_SURNAME_LENGTH,
  AFT_MAX_FULL_NAME_LENGTH,
  sanitizeNamePart,
  normalizeName,
  formatFullName,
  formatIso20022Name,
  toAftNameFields,
  isValidIso20022AndAftName,
  type Name,
} from "@/lib/name";
import { anonymizeOrderForGdprErasure } from "@/lib/privacy";
import {
  normalizeCountryCodeAlpha3,
  countryAlpha3ToAlpha2,
  countryAlpha3ToDialCode,
  getCountryMetadata,
  normalizePhone,
  formatPhone,
} from "@/lib/address";

describe("Structured Name Object (ISO 20022 & AFT Compliance)", () => {
  it("stores only firstName, optional middleName, and lastName (no stored fullName property)", () => {
    const structured = normalizeName({
      firstName: "Tomer",
      middleName: "Aaron",
      lastName: "Ghelber",
    });

    expect(structured).toEqual({
      firstName: "Tomer",
      middleName: "Aaron",
      lastName: "Ghelber",
    });
    expect("fullName" in structured).toBe(false);
    expect(Object.keys(structured).sort()).toEqual([
      "firstName",
      "lastName",
      "middleName",
    ]);
  });

  it("omits middleName when empty or undefined", () => {
    const withoutMiddle = normalizeName({
      firstName: "Tomer",
      middleName: "   ",
      lastName: "Ghelber",
    });

    expect(withoutMiddle).toEqual({
      firstName: "Tomer",
      lastName: "Ghelber",
    });
    expect("middleName" in withoutMiddle).toBe(false);
    expect("fullName" in withoutMiddle).toBe(false);
  });

  it("parses legacy flat string names into structured { firstName, middleName?, lastName }", () => {
    expect(normalizeName("Ada Lovelace")).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });

    expect(normalizeName("Grace Brewster Murray Hopper")).toEqual({
      firstName: "Grace",
      middleName: "Brewster Murray",
      lastName: "Hopper",
    });

    expect(normalizeName("SingleToken")).toEqual({
      firstName: "SingleToken",
      lastName: "",
    });
  });

  it("dynamically builds fullName, ISO 20022 <Nm> (Max140Text), and AFT payload fields", () => {
    const name: Name = {
      firstName: "Alex",
      middleName: "James",
      lastName: "Mercer",
    };

    expect(formatFullName(name)).toBe("Alex James Mercer");
    expect(formatIso20022Name(name)).toBe("Alex James Mercer");
    expect(toAftNameFields(name)).toEqual({
      senderFirstName: "Alex",
      senderMiddleName: "James",
      senderLastName: "Mercer",
      formattedFullName: "Alex James Mercer",
    });
  });

  it("enforces AFT (35/35/35/70) and ISO 20022 (140) length boundaries and strips control chars", () => {
    const dirty = "  John\u0000\u0007   Doe  ";
    expect(sanitizeNamePart(dirty, 35)).toBe("John Doe");

    const overlongFirst = "A".repeat(50);
    const overlongMiddle = "B".repeat(50);
    const overlongLast = "C".repeat(50);

    const aft = toAftNameFields({
      firstName: overlongFirst,
      middleName: overlongMiddle,
      lastName: overlongLast,
    });

    expect(aft.senderFirstName.length).toBeLessThanOrEqual(
      AFT_MAX_GIVEN_NAME_LENGTH
    );
    expect(aft.senderMiddleName?.length).toBeLessThanOrEqual(
      AFT_MAX_GIVEN_NAME_LENGTH
    );
    expect(aft.senderLastName.length).toBeLessThanOrEqual(
      AFT_MAX_SURNAME_LENGTH
    );
    expect(aft.formattedFullName.length).toBeLessThanOrEqual(
      AFT_MAX_FULL_NAME_LENGTH
    );
    expect(
      formatIso20022Name({
        firstName: overlongFirst,
        middleName: overlongMiddle,
        lastName: overlongLast,
      }).length
    ).toBeLessThanOrEqual(ISO20022_MAX_NAME_LENGTH);
  });

  it("validates ISO 20022 and AFT compliance via isValidIso20022AndAftName", () => {
    expect(
      isValidIso20022AndAftName({
        firstName: "Sarah",
        lastName: "Connor",
      })
    ).toBe(true);

    expect(
      isValidIso20022AndAftName({
        firstName: "",
        lastName: "Connor",
      })
    ).toBe(false);

    expect(
      isValidIso20022AndAftName({
        firstName: "Sarah",
        lastName: "",
      })
    ).toBe(false);
  });

  it("redacts structured Name fields in anonymizeOrderForGdprErasure", () => {
    const order = {
      id: "ord-1",
      contactEmail: "player@example.com",
      customer: {
        name: { firstName: "Alex", middleName: "J", lastName: "Mercer" },
        email: "player@example.com",
      },
      deliveryAddress: {
        recipientName: { firstName: "Alex", lastName: "Mercer" },
        street: "123 Main St",
        city: "Tel Aviv",
        postalCode: "6100000",
        phone: "050-000-0000",
      },
      paymentMethod: {
        type: "credit-card",
        accountHolderName: { firstName: "Alex", lastName: "Mercer" },
        detail: "4242",
      },
    };

    const redacted = anonymizeOrderForGdprErasure(order);
    expect(redacted.customer?.name).toEqual({
      firstName: "[redacted-privacy]",
      lastName: "[redacted-privacy]",
    });
    expect(redacted.deliveryAddress?.recipientName).toEqual({
      firstName: "[redacted-privacy]",
      lastName: "[redacted-privacy]",
    });
    expect(redacted.paymentMethod?.accountHolderName).toEqual({
      firstName: "[redacted-privacy]",
      lastName: "[redacted-privacy]",
    });
  });

  it("delegates ISO 3166-1 country lookups to world-countries and phone parsing to react-phone-number-input", () => {
    // Countries outside the original 6 defaults work automatically via world-countries
    expect(normalizeCountryCodeAlpha3("BR")).toBe("BRA");
    expect(normalizeCountryCodeAlpha3("Brazil")).toBe("BRA");
    expect(countryAlpha3ToAlpha2("BRA")).toBe("br");
    expect(countryAlpha3ToDialCode("BRA")).toBe("55");

    const jpnMeta = getCountryMetadata("JP");
    expect(jpnMeta.cca3).toBe("JPN");
    expect(jpnMeta.cca2).toBe("JP");
    expect(jpnMeta.name).toBe("Japan");
    expect(jpnMeta.dialCode).toBe("81");

    // E.164 phone parsing via react-phone-number-input
    const parsedIl = normalizePhone("+972537746837");
    expect(parsedIl.CountryCodeAlpha3).toBe("ISR");
    expect(parsedIl.PhoneNumber).toBe("537746837");
    expect(formatPhone(parsedIl)).toBe("+972-537746837");
  });
});
