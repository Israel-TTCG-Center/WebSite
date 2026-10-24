import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_SUPPORTED_COUNTRIES,
  normalizeSupportedCountries,
} from "@/lib/premium";
import {
  consumeGeoapifyRateLimit,
  getSeedCitySuggestions,
  getSeedStreetSuggestions,
  lookupAddressOrZipViaGeoapify,
  normalizeGeocodeCacheKey,
  resetGeoapifyCacheAndRateLimit,
} from "@/lib/geoapify";
import { GET as getGeocode } from "@/app/api/geocode/route";

describe("Controllable Supported Countries & Geoapify Autocomplete", () => {
  beforeEach(() => {
    resetGeoapifyCacheAndRateLimit();
  });

  it("configures ISR as active by default with supportsZipAutocomplete=false, and USA/GBR/DEU/FRA/CAN as inactive with supportsZipAutocomplete=true", () => {
    const isr = DEFAULT_SUPPORTED_COUNTRIES.find((c) => c.code === "ISR");
    const usa = DEFAULT_SUPPORTED_COUNTRIES.find((c) => c.code === "USA");
    const gbr = DEFAULT_SUPPORTED_COUNTRIES.find((c) => c.code === "GBR");

    expect(isr).toBeDefined();
    expect(isr?.active).toBe(true);
    expect(isr?.supportsZipAutocomplete).toBe(false);

    expect(usa?.active).toBe(false);
    expect(usa?.supportsZipAutocomplete).toBe(true);
    expect(gbr?.active).toBe(false);
    expect(gbr?.supportsZipAutocomplete).toBe(true);
  });

  it("normalizes supportedCountries to ISO alpha-3 codes, preserves custom countries, and guarantees at least one active country", () => {
    const normalized = normalizeSupportedCountries([
      {
        code: "il" as any,
        name: "Israel",
        name_he: "ישראל",
        active: false,
        supportsZipAutocomplete: false,
      },
      {
        code: "nl" as any,
        name: "Netherlands",
        name_he: "הולנד",
        active: false,
        supportsZipAutocomplete: true,
      },
    ]);

    // Since all countries in input were inactive, ISR falls back to active=true
    const isr = normalized.find((c) => c.code === "ISR");
    const nld = normalized.find((c) => c.code === "NLD");
    expect(isr?.active).toBe(true);
    expect(nld).toBeDefined();
    expect(nld?.supportsZipAutocomplete).toBe(true);
  });

  it("normalizes cache keys deterministically across all 4 lookup modes using alpha-3 country codes", () => {
    expect(
      normalizeGeocodeCacheKey({
        mode: "zip-to-address",
        country: " us ",
        postalCode: " 90210 ",
      })
    ).toBe("zip2addr|USA|90210");

    expect(
      normalizeGeocodeCacheKey({
        mode: "address-to-zip",
        country: "USA",
        street: "  Main   St ",
        buildingNumber: " 10 ",
        city: " Beverly Hills ",
      })
    ).toBe("addr2zip|USA|beverly hills|main st|10|");

    expect(
      normalizeGeocodeCacheKey({
        mode: "autocomplete-city",
        country: "ISR",
        city: "  Haifa ",
      })
    ).toBe("city|ISR|haifa");

    expect(
      normalizeGeocodeCacheKey({
        mode: "autocomplete-street",
        country: "ISR",
        city: "Haifa",
        street: " Herzl ",
      })
    ).toBe("street|ISR|haifa|herzl");
  });

  it("enforces strict 5 requests per second sliding-window rate limit", () => {
    const t0 = 1_700_000_000_000;
    expect(consumeGeoapifyRateLimit(t0).allowed).toBe(true);
    expect(consumeGeoapifyRateLimit(t0 + 100).allowed).toBe(true);
    expect(consumeGeoapifyRateLimit(t0 + 200).allowed).toBe(true);
    expect(consumeGeoapifyRateLimit(t0 + 300).allowed).toBe(true);
    expect(consumeGeoapifyRateLimit(t0 + 400).allowed).toBe(true);
    // 6th call within 1000ms is rate-limited
    const sixth = consumeGeoapifyRateLimit(t0 + 500);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterMs).toBeGreaterThan(0);
    // After 1000ms window slides past first call, allowed again
    expect(consumeGeoapifyRateLimit(t0 + 1001).allowed).toBe(true);
  });

  it("provides instant built-in city and street suggestions for short queries without hitting external API", async () => {
    expect(getSeedCitySuggestions("IL").length).toBeGreaterThan(5);
    expect(
      getSeedStreetSuggestions("IL", "Haifa").map((s) => s.street)
    ).toContain("Hertz");

    const cityRes = await lookupAddressOrZipViaGeoapify({
      mode: "autocomplete-city",
      country: "IL",
      city: "",
    });
    expect(cityRes.ok).toBe(true);
    expect(cityRes.cached).toBe(true);
    expect(cityRes.source).toBe("seed");
    expect(cityRes.result.cities?.map((c) => c.city)).toContain("Haifa");

    const streetRes = await lookupAddressOrZipViaGeoapify({
      mode: "autocomplete-street",
      country: "IL",
      city: "Haifa",
      street: "",
    });
    expect(streetRes.ok).toBe(true);
    expect(streetRes.cached).toBe(true);
    expect(streetRes.source).toBe("seed");
    expect(streetRes.result.streets?.map((s) => s.street)).toContain("Hertz");
  });

  it("caches Geoapify lookup responses in memory and in MongoDB geocode_cache with 7-day TTL", async () => {
    const storedDocs = new Map<string, any>();
    const fakeDb: any = {
      collection: (name: string) => {
        expect(name).toBe("geocode_cache");
        return {
          findOne: async ({ cacheKey }: { cacheKey: string }) =>
            storedDocs.get(cacheKey) || null,
          updateOne: async (
            { cacheKey }: { cacheKey: string },
            { $set }: { $set: any }
          ) => {
            storedDocs.set(cacheKey, $set);
          },
        };
      },
    };

    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            postcode: "90210",
            city: "Beverly Hills",
            state: "California",
            street: "Rodeo Drive",
            country_code: "us",
            formatted: "Beverly Hills, CA 90210, United States",
          },
        ],
      }),
    });

    const first = await lookupAddressOrZipViaGeoapify(
      {
        mode: "zip-to-address",
        country: "US",
        postalCode: "90210",
      },
      {
        db: fakeDb,
        fetchImpl: fakeFetch as any,
      }
    );

    expect(first.ok).toBe(true);
    expect(first.cached).toBe(false);
    expect(first.source).toBe("geoapify");
    expect(first.result.city).toBe("Beverly Hills");
    expect(first.result.stateRegion).toBe("California");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(storedDocs.size).toBe(1);

    // Second call hits Tier 1 in-memory cache without calling fetch
    const second = await lookupAddressOrZipViaGeoapify(
      {
        mode: "zip-to-address",
        country: "US",
        postalCode: "90210",
      },
      {
        db: fakeDb,
        fetchImpl: fakeFetch as any,
      }
    );
    expect(second.ok).toBe(true);
    expect(second.cached).toBe(true);
    expect(second.source).toBe("memory-cache");
    expect(second.result.city).toBe("Beverly Hills");
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects zip-to-address and address-to-zip in GET /api/geocode when country has supportsZipAutocomplete=false (e.g. ISR)", async () => {
    const req = new Request(
      "http://localhost:3000/api/geocode?mode=zip-to-address&country=ISR&postalCode=3223201"
    );
    const res = await getGeocode(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not supported for country ISR");
  });
});
