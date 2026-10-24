import type { Db } from "@/lib/db";
import {
  type CountryCodeAlpha3,
  countryAlpha3ToAlpha2,
  normalizeCountryCodeAlpha3,
} from "@/lib/address";

export const GEOAPIFY_DEFAULT_TEST_KEY = "b46a1ee647aa4c7d956222d39155e0a";
export const GEOCODE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days TTL
export const GEOAPIFY_MAX_RPS = 5;
export const GEOAPIFY_WINDOW_MS = 1000;

export type GeocodeMode =
  | "autocomplete-city"
  | "autocomplete-street"
  | "zip-to-address"
  | "address-to-zip";

export interface GeocodeRequestParams {
  mode: GeocodeMode;
  country?: string;
  query?: string;
  city?: string;
  street?: string;
  buildingNumber?: string;
  stateRegion?: string;
  postalCode?: string;
}

export interface CitySuggestion {
  city: string;
  city_he?: string;
  stateRegion?: string;
}

export interface StreetSuggestion {
  street: string;
  street_he?: string;
  postalCode?: string;
}

export interface GeocodeLookupPayload {
  postalCode?: string | null;
  city?: string | null;
  stateRegion?: string | null;
  street?: string | null;
  country?: string;
  cities?: CitySuggestion[];
  streets?: StreetSuggestion[];
}

export interface GeocodeLookupResponse {
  ok: boolean;
  mode: GeocodeMode;
  cacheKey: string;
  cached: boolean;
  source: "seed" | "memory-cache" | "db-cache" | "geoapify" | "rate-limited";
  rateLimited: boolean;
  result: GeocodeLookupPayload;
}

/**
 * Built-in bilingual seed dictionary for instant 0-API-call city & street suggestions
 * in Israel and major supported countries, supplemented by cached Geoapify results.
 */
const BUILTIN_CITY_SEEDS: Record<string, CitySuggestion[]> = {
  ISR: [
    { city: "Haifa", city_he: "חיפה", stateRegion: "Haifa District" },
    { city: "Tel Aviv-Yafo", city_he: "תל אביב-יפו", stateRegion: "Tel Aviv District" },
    { city: "Jerusalem", city_he: "ירושלים", stateRegion: "Jerusalem District" },
    { city: "Rishon LeZion", city_he: "ראשון לציון", stateRegion: "Central District" },
    { city: "Petah Tikva", city_he: "פתח תקווה", stateRegion: "Central District" },
    { city: "Beer Sheva", city_he: "באר שבע", stateRegion: "Southern District" },
    { city: "Netanya", city_he: "נתניה", stateRegion: "Central District" },
    { city: "Ramat Gan", city_he: "רמת גן", stateRegion: "Tel Aviv District" },
    { city: "Herzliya", city_he: "הרצליה", stateRegion: "Tel Aviv District" },
    { city: "Rehovot", city_he: "רחובות", stateRegion: "Central District" },
    { city: "Ashdod", city_he: "אשדוד", stateRegion: "Southern District" },
    { city: "Kfar Saba", city_he: "כפר סבא", stateRegion: "Central District" },
    { city: "Ra'anana", city_he: "רעננה", stateRegion: "Central District" },
    { city: "Modi'in-Maccabim-Re'ut", city_he: "מודיעין-מכבים-רעות", stateRegion: "Central District" },
    { city: "Krayot", city_he: "קריות", stateRegion: "Haifa District" },
  ],
  USA: [
    { city: "New York", stateRegion: "NY" },
    { city: "Los Angeles", stateRegion: "CA" },
    { city: "San Francisco", stateRegion: "CA" },
    { city: "Chicago", stateRegion: "IL" },
    { city: "Seattle", stateRegion: "WA" },
    { city: "Austin", stateRegion: "TX" },
    { city: "Boston", stateRegion: "MA" },
  ],
  GBR: [
    { city: "London", stateRegion: "England" },
    { city: "Manchester", stateRegion: "England" },
    { city: "Edinburgh", stateRegion: "Scotland" },
    { city: "Birmingham", stateRegion: "England" },
  ],
  DEU: [
    { city: "Berlin", stateRegion: "Berlin" },
    { city: "Munich", stateRegion: "Bavaria" },
    { city: "Hamburg", stateRegion: "Hamburg" },
    { city: "Frankfurt", stateRegion: "Hesse" },
  ],
  FRA: [
    { city: "Paris", stateRegion: "Île-de-France" },
    { city: "Lyon", stateRegion: "Auvergne-Rhône-Alpes" },
    { city: "Marseille", stateRegion: "Provence-Alpes-Côte d'Azur" },
  ],
  CAN: [
    { city: "Toronto", stateRegion: "ON" },
    { city: "Vancouver", stateRegion: "BC" },
    { city: "Montreal", stateRegion: "QC" },
  ],
};

const BUILTIN_STREET_SEEDS: Record<string, StreetSuggestion[]> = {
  "ISR|haifa": [
    { street: "Herzl", street_he: "הרצל", postalCode: "3223201" },
    { street: "Hertz", street_he: "הרץ", postalCode: "3223201" },
    { street: "HaNassi Avenue", street_he: "שדרות הנשיא" },
    { street: "HaAtzmaut", street_he: "העצמאות" },
    { street: "Moriah Avenue", street_he: "שדרות מוריה" },
    { street: "Ben Gurion Avenue", street_he: "שדרות בן גוריון" },
    { street: "Horev", street_he: "חורב" },
  ],
  "ISR|חיפה": [
    { street: "הרץ", street_he: "הרץ", postalCode: "3223201" },
    { street: "הרצל", street_he: "הרצל", postalCode: "3223201" },
    { street: "שדרות הנשיא", street_he: "שדרות הנשיא" },
    { street: "העצמאות", street_he: "העצמאות" },
    { street: "שדרות מוריה", street_he: "שדרות מוריה" },
    { street: "שדרות בן גוריון", street_he: "שדרות בן גוריון" },
    { street: "חורב", street_he: "חורב" },
  ],
  "ISR|tel aviv-yafo": [
    { street: "Dizengoff", street_he: "דיזנגוף" },
    { street: "Rothschild Boulevard", street_he: "שדרות רוטשילד" },
    { street: "Ibn Gabirol", street_he: "אבן גבירול" },
    { street: "Allenby", street_he: "אלנבי" },
  ],
  "ISR|תל אביב-יפו": [
    { street: "דיזנגוף", street_he: "דיזנגוף" },
    { street: "שדרות רוטשילד", street_he: "שדרות רוטשילד" },
    { street: "אבן גבירול", street_he: "אבן גבירול" },
    { street: "אלנבי", street_he: "אלנבי" },
  ],
  "ISR|jerusalem": [
    { street: "Jaffa", street_he: "יפו" },
    { street: "King George", street_he: "המלך ג'ורג'" },
    { street: "Emek Refaim", street_he: "עמק רפאים" },
  ],
  "ISR|ירושלים": [
    { street: "יפו", street_he: "יפו" },
    { street: "המלך ג'ורג'", street_he: "המלך ג'ורג'" },
    { street: "עמק רפאים", street_he: "עמק רפאים" },
  ],
};

function cleanToken(val?: string | null): string {
  return String(val || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeGeocodeCacheKey(params: GeocodeRequestParams): string {
  const country: CountryCodeAlpha3 = normalizeCountryCodeAlpha3(params.country);
  const mode = params.mode;
  if (mode === "autocomplete-city") {
    return `city|${country}|${cleanToken(params.query || params.city)}`;
  }
  if (mode === "autocomplete-street") {
    return `street|${country}|${cleanToken(params.city)}|${cleanToken(
      params.query || params.street
    )}`;
  }
  if (mode === "zip-to-address") {
    return `zip2addr|${country}|${cleanToken(params.postalCode)}`;
  }
  return `addr2zip|${country}|${cleanToken(params.city)}|${cleanToken(
    params.street
  )}|${cleanToken(params.buildingNumber)}|${cleanToken(params.stateRegion)}`;
}

interface MemoryCacheEntry {
  result: GeocodeLookupPayload;
  expiresAtMs: number;
}

const memoryGeocodeCache = new Map<string, MemoryCacheEntry>();
const inFlightRequests = new Map<string, Promise<GeocodeLookupResponse>>();
let recentRequestTimestampsMs: number[] = [];

export function resetGeoapifyCacheAndRateLimit(): void {
  memoryGeocodeCache.clear();
  inFlightRequests.clear();
  recentRequestTimestampsMs = [];
}

/**
 * Sliding-window rate limiter enforcing at most 5 requests per second (1000ms) to Geoapify.
 */
export function consumeGeoapifyRateLimit(
  nowMs: number = Date.now()
): { allowed: boolean; retryAfterMs: number } {
  recentRequestTimestampsMs = recentRequestTimestampsMs.filter(
    (ts) => nowMs - ts < GEOAPIFY_WINDOW_MS
  );
  if (recentRequestTimestampsMs.length >= GEOAPIFY_MAX_RPS) {
    const oldest = recentRequestTimestampsMs[0];
    const retryAfterMs = Math.max(1, GEOAPIFY_WINDOW_MS - (nowMs - oldest));
    return { allowed: false, retryAfterMs };
  }
  recentRequestTimestampsMs.push(nowMs);
  return { allowed: true, retryAfterMs: 0 };
}

export function getSeedCitySuggestions(
  countryCode: string,
  query?: string
): CitySuggestion[] {
  const code = normalizeCountryCodeAlpha3(countryCode);
  const list = BUILTIN_CITY_SEEDS[code] || [];
  const q = cleanToken(query);
  if (!q) return list;
  return list.filter(
    (item) =>
      cleanToken(item.city).includes(q) ||
      (item.city_he && cleanToken(item.city_he).includes(q))
  );
}

export function getSeedStreetSuggestions(
  countryCode: string,
  city?: string,
  query?: string
): StreetSuggestion[] {
  const code = normalizeCountryCodeAlpha3(countryCode);
  const normCity = cleanToken(city);
  const list = BUILTIN_STREET_SEEDS[`${code}|${normCity}`] || [];
  const q = cleanToken(query);
  if (!q) return list;
  return list.filter(
    (item) =>
      cleanToken(item.street).includes(q) ||
      (item.street_he && cleanToken(item.street_he).includes(q))
  );
}

export async function lookupAddressOrZipViaGeoapify(
  params: GeocodeRequestParams,
  options?: {
    db?: Db | null;
    fetchImpl?: typeof fetch;
    apiKey?: string;
    nowMs?: number;
  }
): Promise<GeocodeLookupResponse> {
  const nowMs = options?.nowMs ?? Date.now();
  const country = normalizeCountryCodeAlpha3(params.country);
  const cacheKey = normalizeGeocodeCacheKey({ ...params, country });

  // 1. Check Tier 1: In-Memory Cache
  const memHit = memoryGeocodeCache.get(cacheKey);
  if (memHit && memHit.expiresAtMs > nowMs) {
    return {
      ok: true,
      mode: params.mode,
      cacheKey,
      cached: true,
      source: "memory-cache",
      rateLimited: false,
      result: memHit.result,
    };
  }

  // 2. Check In-Flight deduplication
  const existingInFlight = inFlightRequests.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const executeLookup = async (): Promise<GeocodeLookupResponse> => {
    const db = options?.db ?? null;

    // 3. Check Tier 2: Postgres `geocode_cache` (7-day TTL)
    if (db) {
      try {
        const dbDoc = await db.collection("geocode_cache").findOne({
          cacheKey,
        });
        if (dbDoc && dbDoc.result) {
          const expiresAtMs = dbDoc.expiresAt
            ? new Date(dbDoc.expiresAt).getTime()
            : nowMs + GEOCODE_CACHE_TTL_MS;
          if (expiresAtMs > nowMs) {
            memoryGeocodeCache.set(cacheKey, {
              result: dbDoc.result as GeocodeLookupPayload,
              expiresAtMs,
            });
            return {
              ok: true,
              mode: params.mode,
              cacheKey,
              cached: true,
              source: "db-cache",
              rateLimited: false,
              result: dbDoc.result as GeocodeLookupPayload,
            };
          }
        }
      } catch {
        // Ignore DB lookup errors and continue to seed/API
      }
    }

    // 4. For short queries (< 2 chars) in autocomplete modes, return built-in seeds immediately without consuming Geoapify RPS
    if (params.mode === "autocomplete-city") {
      const q = cleanToken(params.query || params.city);
      const seedCities = getSeedCitySuggestions(country, q);
      if (q.length < 2) {
        return {
          ok: true,
          mode: params.mode,
          cacheKey,
          cached: true,
          source: "seed",
          rateLimited: false,
          result: { country, cities: seedCities },
        };
      }
    } else if (params.mode === "autocomplete-street") {
      const q = cleanToken(params.query || params.street);
      const seedStreets = getSeedStreetSuggestions(country, params.city, q);
      if (q.length < 2) {
        return {
          ok: true,
          mode: params.mode,
          cacheKey,
          cached: true,
          source: "seed",
          rateLimited: false,
          result: { country, city: params.city || null, streets: seedStreets },
        };
      }
    }

    // 5. Enforce 5 requests/second sliding-window rate limit before calling Geoapify
    const rateCheck = consumeGeoapifyRateLimit(nowMs);
    if (!rateCheck.allowed) {
      const fallbackResult: GeocodeLookupPayload =
        params.mode === "autocomplete-city"
          ? {
              country,
              cities: getSeedCitySuggestions(
                country,
                params.query || params.city
              ),
            }
          : params.mode === "autocomplete-street"
          ? {
              country,
              city: params.city || null,
              streets: getSeedStreetSuggestions(
                country,
                params.city,
                params.query || params.street
              ),
            }
          : {
              country,
              postalCode: null,
              city: null,
              stateRegion: null,
              street: null,
            };
      return {
        ok: true,
        mode: params.mode,
        cacheKey,
        cached: false,
        source: "rate-limited",
        rateLimited: true,
        result: fallbackResult,
      };
    }

    // 6. Call Geoapify API
    const apiKey =
      options?.apiKey ||
      process.env.GEOAPIFY_API_KEY ||
      GEOAPIFY_DEFAULT_TEST_KEY;
    const fetchFn = options?.fetchImpl || fetch;
    const lowerCountry = countryAlpha3ToAlpha2(country);

    let url = "";
    if (params.mode === "autocomplete-city") {
      const text = encodeURIComponent(
        String(params.query || params.city || "").trim()
      );
      url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${text}&type=city&filter=countrycode:${lowerCountry}&limit=8&format=json&apiKey=${apiKey}`;
    } else if (params.mode === "autocomplete-street") {
      const combinedText = [params.query || params.street, params.city]
        .filter(Boolean)
        .join(", ");
      url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
        combinedText
      )}&type=street&filter=countrycode:${lowerCountry}&limit=8&format=json&apiKey=${apiKey}`;
    } else if (params.mode === "zip-to-address") {
      const postcode = encodeURIComponent(String(params.postalCode || "").trim());
      url = `https://api.geoapify.com/v1/geocode/search?postcode=${postcode}&filter=countrycode:${lowerCountry}&limit=1&format=json&apiKey=${apiKey}`;
    } else {
      const searchParams = new URLSearchParams({
        filter: `countrycode:${lowerCountry}`,
        limit: "1",
        format: "json",
        apiKey,
      });
      if (params.street) searchParams.set("street", params.street.trim());
      if (params.buildingNumber) {
        searchParams.set("housenumber", params.buildingNumber.trim());
      }
      if (params.city) searchParams.set("city", params.city.trim());
      if (params.stateRegion) searchParams.set("state", params.stateRegion.trim());
      url = `https://api.geoapify.com/v1/geocode/search?${searchParams.toString()}`;
    }

    let resolvedResult: GeocodeLookupPayload = { country };
    try {
      const res = await fetchFn(url);
      if (res.ok) {
        const data = await res.json();
        const rawResults: Record<string, any>[] = Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data?.features)
          ? data.features.map((f: any) => f?.properties || {})
          : [];

        if (params.mode === "autocomplete-city") {
          const seedCities = getSeedCitySuggestions(
            country,
            params.query || params.city
          );
          const seenCities = new Set<string>(
            seedCities.map((c) => cleanToken(c.city))
          );
          const merged: CitySuggestion[] = [...seedCities];
          for (const r of rawResults) {
            const cName = String(r.city || r.town || r.municipality || r.name || "").trim();
            if (!cName || seenCities.has(cleanToken(cName))) continue;
            seenCities.add(cleanToken(cName));
            merged.push({
              city: cName,
              stateRegion: r.state || r.county || undefined,
            });
          }
          resolvedResult = { country, cities: merged };
        } else if (params.mode === "autocomplete-street") {
          const seedStreets = getSeedStreetSuggestions(
            country,
            params.city,
            params.query || params.street
          );
          const seenStreets = new Set<string>(
            seedStreets.map((s) => cleanToken(s.street))
          );
          const merged: StreetSuggestion[] = [...seedStreets];
          for (const r of rawResults) {
            const sName = String(r.street || r.name || r.address_line1 || "").trim();
            if (!sName || seenStreets.has(cleanToken(sName))) continue;
            seenStreets.add(cleanToken(sName));
            merged.push({
              street: sName,
              postalCode: r.postcode ? String(r.postcode) : undefined,
            });
          }
          resolvedResult = {
            country,
            city: params.city || null,
            streets: merged,
          };
        } else {
          const first = rawResults[0] || {};
          resolvedResult = {
            country,
            postalCode: first.postcode ? String(first.postcode) : null,
            city: first.city || first.town || first.municipality || params.city || null,
            stateRegion: first.state || first.county || params.stateRegion || null,
            street: first.street || params.street || null,
          };
        }
      }
    } catch {
      // Fallback to built-in seeds on network error
      if (params.mode === "autocomplete-city") {
        resolvedResult = {
          country,
          cities: getSeedCitySuggestions(country, params.query || params.city),
        };
      } else if (params.mode === "autocomplete-street") {
        resolvedResult = {
          country,
          city: params.city || null,
          streets: getSeedStreetSuggestions(
            country,
            params.city,
            params.query || params.street
          ),
        };
      }
    }

    // 7. Save in Tier 1 (Memory) and Tier 2 (Postgres `geocode_cache` with 7-day TTL)
    const expiresAtMs = nowMs + GEOCODE_CACHE_TTL_MS;
    memoryGeocodeCache.set(cacheKey, {
      result: resolvedResult,
      expiresAtMs,
    });

    if (db) {
      try {
        await db.collection("geocode_cache").updateOne(
          { cacheKey },
          {
            $set: {
              cacheKey,
              mode: params.mode,
              country,
              result: resolvedResult,
              expiresAt: new Date(expiresAtMs),
              updatedAtUtc: new Date(nowMs).toISOString(),
            },
          },
          { upsert: true }
        );
      } catch {
        // Ignore DB cache write errors
      }
    }

    return {
      ok: true,
      mode: params.mode,
      cacheKey,
      cached: false,
      source: "geoapify",
      rateLimited: false,
      result: resolvedResult,
    };
  };

  const promise = executeLookup().finally(() => {
    inFlightRequests.delete(cacheKey);
  });
  inFlightRequests.set(cacheKey, promise);
  return promise;
}
