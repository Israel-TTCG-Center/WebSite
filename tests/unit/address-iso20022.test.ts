import { describe, it, expect } from "vitest";
import {
  COUNTRY_CODE_ALPHA3_REGEX,
  SUBSCRIBER_PHONE_NUMBER_REGEX,
  ISO20022_VISUAL_PHONE_REGEX,
  POSTAL_CODE_REGEX,
  DEFAULT_STORE_ADDRESS,
  DEFAULT_STORE_PHONE,
  isValidCountryCodeAlpha3,
  isValidSubscriberPhoneNumber,
  isValidIso20022Phone,
  isValidPostalCode,
  normalizeCountryCodeAlpha3,
  resolveDefaultCountryAlpha3,
  normalizePhone,
  formatPhone,
  normalizeAddress,
  normalizeDeliveryAddress,
  formatAddressOneLine,
  type Address,
  type DeliveryAddress,
} from "@/lib/address";

describe("ISO 20022 Address, DeliveryAddress Inheritance & Regex-Typed Phone", () => {
  it("validates regex-constrained types for CountryCodeAlpha3, SubscriberPhoneNumber, Iso20022FormattedPhone, and PostalCodeString", () => {
    expect(COUNTRY_CODE_ALPHA3_REGEX.test("ISR")).toBe(true);
    expect(COUNTRY_CODE_ALPHA3_REGEX.test("USA")).toBe(true);
    expect(isValidCountryCodeAlpha3("GBR")).toBe(true);
    expect(isValidCountryCodeAlpha3("IL")).toBe(false);
    expect(isValidCountryCodeAlpha3("isr")).toBe(false);

    expect(SUBSCRIBER_PHONE_NUMBER_REGEX.test("053-774-6837")).toBe(true);
    expect(SUBSCRIBER_PHONE_NUMBER_REGEX.test("(212)-555-0199")).toBe(true);
    expect(isValidSubscriberPhoneNumber("053-774-6837")).toBe(true);
    expect(isValidSubscriberPhoneNumber("abc-invalid")).toBe(false);

    expect(ISO20022_VISUAL_PHONE_REGEX.test("+972-053-774-6837")).toBe(true);
    expect(ISO20022_VISUAL_PHONE_REGEX.test("+1-(212)-555-0199")).toBe(true);
    expect(isValidIso20022Phone("+972-053-774-6837")).toBe(true);
    expect(isValidIso20022Phone("053-774-6837")).toBe(false);

    expect(POSTAL_CODE_REGEX.test("3223201")).toBe(true);
    expect(POSTAL_CODE_REGEX.test("SW1A 1AA")).toBe(true);
    expect(POSTAL_CODE_REGEX.test("90210-1234")).toBe(true);
    expect(isValidPostalCode("3223201")).toBe(true);
    expect(isValidPostalCode("INVALID@POSTAL!")).toBe(false);
  });

  it("normalizes Phone objects and formats them visually as +{dialCode}-{PhoneNumber}", () => {
    const fromLocalString = normalizePhone("053-774-6837", "ISR");
    expect(fromLocalString).toEqual({
      CountryCodeAlpha3: "ISR",
      PhoneNumber: "053-774-6837",
    });
    const formatted = formatPhone(fromLocalString);
    expect(formatted).toBe("+972-053-774-6837");
    expect(isValidIso20022Phone(formatted)).toBe(true);

    // Parses visual ISO 20022 string back into structured Phone (CountryCodeAlpha3 + PhoneNumber)
    const fromIsoVisual = normalizePhone("+44-20-7946-0958");
    expect(fromIsoVisual).toEqual({
      CountryCodeAlpha3: "GBR",
      PhoneNumber: "20-7946-0958",
    });
    expect(formatPhone(fromIsoVisual)).toBe("+44-20-7946-0958");
  });

  it("enforces country fallback chain: user billing address country -> user shipping address country -> ISR", () => {
    const billingUSA: Partial<Address> = { CountryCodeAlpha3: "USA" as any };
    const shippingGBR: Partial<DeliveryAddress> = {
      CountryCodeAlpha3: "GBR" as any,
    };

    // 1. Uses billing address country when present
    expect(resolveDefaultCountryAlpha3(billingUSA, shippingGBR)).toBe("USA");
    expect(
      normalizeCountryCodeAlpha3(undefined, {
        billingCountry: billingUSA.CountryCodeAlpha3,
        shippingCountry: shippingGBR.CountryCodeAlpha3,
      })
    ).toBe("USA");

    // 2. Falls back to shipping address country when billing country is empty
    expect(resolveDefaultCountryAlpha3(null, shippingGBR)).toBe("GBR");
    expect(
      normalizeCountryCodeAlpha3("", {
        billingCountry: "",
        shippingCountry: shippingGBR.CountryCodeAlpha3,
      })
    ).toBe("GBR");

    // 3. Falls back to ISR when both are absent
    expect(resolveDefaultCountryAlpha3(null, null)).toBe("ISR");
  });

  it("separates base Address (no deliveryNotes, no nested iso20022, no stored formattedOneLine) from inherited DeliveryAddress (with deliveryNotes)", () => {
    const rawInput = {
      nickname: "HQ",
      StreetName: "Hertz",
      BuildingNumber: "3",
      Apartment: "Apt 2",
      PostalCode: "3223201",
      TownName: "Haifa",
      CountrySubDivision: "Haifa District",
      CountryCodeAlpha3: "IL", // 2-letter input auto-upgraded to alpha-3 ISR
      phone: "053-774-6837",
      deliveryNotes: "Leave at reception",
    };

    const baseAddr: Address = normalizeAddress(rawInput);
    expect(baseAddr.StreetName).toBe("Hertz");
    expect(baseAddr.BuildingNumber).toBe("3");
    expect(baseAddr.Apartment).toBe("Apt 2");
    expect(baseAddr.PostalCode).toBe("3223201");
    expect(baseAddr.TownName).toBe("Haifa");
    expect(baseAddr.CountrySubDivision).toBe("Haifa District");
    expect(baseAddr.CountryCodeAlpha3).toBe("ISR");
    expect(baseAddr.phone).toEqual({
      CountryCodeAlpha3: "ISR",
      PhoneNumber: "053-774-6837",
    });
    // Base Address must NOT hold deliveryNotes, nested iso20022, or formattedOneLine
    expect("deliveryNotes" in baseAddr).toBe(false);
    expect("iso20022" in baseAddr).toBe(false);
    expect("formattedOneLine" in baseAddr).toBe(false);

    const deliveryAddr: DeliveryAddress = normalizeDeliveryAddress(rawInput);
    expect(deliveryAddr.StreetName).toBe("Hertz");
    expect(deliveryAddr.CountryCodeAlpha3).toBe("ISR");
    expect(deliveryAddr.deliveryNotes).toBe("Leave at reception");
  });

  it("parses legacy 1-line address strings into full structured ISO 20022 Address and formats back to 1 line for UI", () => {
    const parsed = normalizeAddress("הרץ 3, Haifa, Israel, 3223201");
    expect(parsed.StreetName).toBe("הרץ");
    expect(parsed.BuildingNumber).toBe("3");
    expect(parsed.TownName).toBe("Haifa");
    expect(parsed.PostalCode).toBe("3223201");
    expect(parsed.CountryCodeAlpha3).toBe("ISR");

    const oneLine = formatAddressOneLine({
      nickname: "Home Base",
      StreetName: "Hertz",
      BuildingNumber: "3",
      Apartment: "Apt 2",
      TownName: "Haifa",
      CountrySubDivision: "Haifa District",
      PostalCode: "3223201" as any,
      CountryCodeAlpha3: "ISR" as any,
      phone: {
        CountryCodeAlpha3: "ISR" as any,
        PhoneNumber: "053-111-2222" as any,
      },
    });
    expect(oneLine).toBe(
      "Hertz 3, Apt/Unit Apt 2, Haifa, Haifa District 3223201 (053-111-2222)"
    );

    expect(DEFAULT_STORE_ADDRESS.CountryCodeAlpha3).toBe("ISR");
    expect(DEFAULT_STORE_PHONE.CountryCodeAlpha3).toBe("ISR");
    expect(formatPhone(DEFAULT_STORE_PHONE)).toBe("+972-053-774-6837");
  });
});
