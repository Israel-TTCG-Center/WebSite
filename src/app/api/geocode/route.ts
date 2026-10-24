import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { normalizeCountryCodeAlpha3 } from "@/lib/address";
import {
  DEFAULT_SUPPORTED_COUNTRIES,
  normalizeSupportedCountries,
} from "@/lib/premium";
import {
  lookupAddressOrZipViaGeoapify,
  type GeocodeMode,
} from "@/lib/geoapify";

const VALID_MODES: GeocodeMode[] = [
  "zip-to-address",
  "address-to-zip",
  "autocomplete-city",
  "autocomplete-street",
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const modeParam = (searchParams.get("mode") || "").trim() as GeocodeMode;
  const country = normalizeCountryCodeAlpha3(
    searchParams.get("country") || "ISR"
  );
  const query = (searchParams.get("query") || "").trim();
  const postalCode = (searchParams.get("postalCode") || "").trim();
  const street = (searchParams.get("street") || "").trim();
  const buildingNumber = (searchParams.get("buildingNumber") || "").trim();
  const city = (searchParams.get("city") || "").trim();
  const stateRegion = (searchParams.get("stateRegion") || "").trim();

  if (!VALID_MODES.includes(modeParam)) {
    return NextResponse.json(
      { error: "Invalid geocode mode" },
      { status: 400 }
    );
  }

  const db = await getDb();
  let supportedCountries = DEFAULT_SUPPORTED_COUNTRIES;
  if (db) {
    try {
      const metaDoc = await db
        .collection("metadata")
        .findOne({ key: "store-metadata" });
      if (metaDoc?.supportedCountries) {
        supportedCountries = normalizeSupportedCountries(
          metaDoc.supportedCountries
        );
      }
    } catch {
      // Fallback to default supported countries
    }
  }

  if (modeParam === "zip-to-address" || modeParam === "address-to-zip") {
    const countryConfig = supportedCountries.find((c) => c.code === country);
    if (!countryConfig || !countryConfig.supportsZipAutocomplete) {
      return NextResponse.json(
        {
          error: `ZIP / Postal Code autocomplete is not supported for country ${country}`,
        },
        { status: 400 }
      );
    }
  }

  if (modeParam === "zip-to-address" && !postalCode) {
    return NextResponse.json(
      { error: "postalCode is required for zip-to-address mode" },
      { status: 400 }
    );
  }

  if (modeParam === "address-to-zip" && !city && !street) {
    return NextResponse.json(
      { error: "city or street is required for address-to-zip mode" },
      { status: 400 }
    );
  }

  const response = await lookupAddressOrZipViaGeoapify(
    {
      mode: modeParam,
      country,
      query,
      postalCode,
      street,
      buildingNumber,
      city,
      stateRegion,
    },
    { db }
  );

  const suggestions: string[] =
    modeParam === "autocomplete-city"
      ? (response.result.cities || []).map((c) => c.city)
      : modeParam === "autocomplete-street"
      ? (response.result.streets || []).map((s) => s.street)
      : [];

  const found =
    modeParam === "autocomplete-city" || modeParam === "autocomplete-street"
      ? suggestions.length > 0
      : Boolean(
          response.result.postalCode ||
            response.result.city ||
            response.result.street
        );

  const payload = {
    ...response,
    found,
    postalCode: response.result.postalCode || null,
    city: response.result.city || null,
    stateRegion: response.result.stateRegion || null,
    street: response.result.street || null,
    suggestions,
  };

  if (response.rateLimited) {
    return NextResponse.json(payload, { status: 429 });
  }

  return NextResponse.json(payload);
}
