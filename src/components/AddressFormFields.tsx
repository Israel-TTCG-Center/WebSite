"use client";

import React, { useEffect, useState } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { useLanguage } from "@/context/LanguageContext";
import type { SupportedCountryConfig } from "@/lib/premium";
import { normalizeCountryCodeAlpha3 } from "@/lib/address";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NameFields } from "@/components/ui/name-fields";
import { PhoneField } from "@/components/ui/phone-input";

export interface AddressFormFieldsProps {
  form: UseFormReturn<any>;
  activeCountries: SupportedCountryConfig[];
  testIdPrefix: string;
  showNickname?: boolean;
  showRecipientName?: boolean;
  showDeliveryNotes?: boolean;
  requiredFields?: boolean;
  zipActionsTestId?: string;
  fillZipBtnTestId?: string;
  findZipBtnTestId?: string;
}

/**
 * Reusable generic address form fields ordered from biggest to smallest:
 * 1. Nickname field
 * 2. Zip code field (+ autocomplete buttons between zip code and address parts)
 * 3. Country field (ISO 3166-1 alpha-3 CountryCodeAlpha3)
 * 4. State field (CountrySubDivision)
 * 5. City field (TownName)
 * 6. Street (StreetName), Building (BuildingNumber) & Apartment (Apartment)
 * 7. Phone number (Phone: CountryCodeAlpha3 + PhoneNumber)
 * 8. Other notes (deliveryNotes — only on DeliveryAddress)
 */
export function AddressFormFields({
  form,
  activeCountries,
  testIdPrefix,
  showNickname = true,
  showRecipientName = false,
  showDeliveryNotes = true,
  requiredFields = false,
  zipActionsTestId,
  fillZipBtnTestId,
  findZipBtnTestId,
}: AddressFormFieldsProps) {
  const { locale, t } = useLanguage();
  const watched = useWatch({ control: form.control });

  const selectedCountryCode = normalizeCountryCodeAlpha3(
    watched?.CountryCodeAlpha3 ||
      watched?.country ||
      activeCountries[0]?.code ||
      "ISR"
  );
  const selectedCountryConfig =
    activeCountries.find((c) => c.code === selectedCountryCode) ||
    activeCountries[0];

  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [streetSuggestions, setStreetSuggestions] = useState<string[]>([]);
  const [zipLookupLoading, setZipLookupLoading] = useState(false);

  const currentCity = String(watched?.TownName ?? watched?.city ?? "");
  const currentStreet = String(watched?.StreetName ?? watched?.street ?? "");
  const currentPostalCode = String(
    watched?.PostalCode ?? watched?.postalCode ?? ""
  );
  const currentBuilding = String(
    watched?.BuildingNumber ?? watched?.buildingNumber ?? ""
  );
  const currentState = String(
    watched?.CountrySubDivision ?? watched?.stateRegion ?? ""
  );

  useEffect(() => {
    const country = selectedCountryCode;
    const city = currentCity;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/geocode?mode=autocomplete-city&country=${encodeURIComponent(
            country
          )}&city=${encodeURIComponent(city)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.suggestions)) {
            setCitySuggestions(data.suggestions);
          }
        }
      } catch {
        // ignore network errors
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [selectedCountryCode, currentCity]);

  useEffect(() => {
    const country = selectedCountryCode;
    const city = currentCity;
    const street = currentStreet;
    if (!city.trim()) {
      setStreetSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/geocode?mode=autocomplete-street&country=${encodeURIComponent(
            country
          )}&city=${encodeURIComponent(city)}&street=${encodeURIComponent(
            street
          )}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.suggestions)) {
            setStreetSuggestions(data.suggestions);
          }
        }
      } catch {
        // ignore network errors
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [selectedCountryCode, currentCity, currentStreet]);

  const handleFillAddressFromZip = async () => {
    const postal = currentPostalCode.trim();
    if (!postal) return;
    setZipLookupLoading(true);
    try {
      const res = await fetch(
        `/api/geocode?mode=zip-to-address&country=${encodeURIComponent(
          selectedCountryCode
        )}&postalCode=${encodeURIComponent(postal)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          const nextCity = data.TownName || data.city;
          const nextState = data.CountrySubDivision || data.stateRegion;
          const nextStreet = data.StreetName || data.street;
          if (nextCity) form.setValue("TownName", nextCity);
          if (nextState) form.setValue("CountrySubDivision", nextState);
          if (nextStreet && !currentStreet.trim()) {
            form.setValue("StreetName", nextStreet);
          }
        }
      }
    } finally {
      setZipLookupLoading(false);
    }
  };

  const handleFindZipFromAddress = async () => {
    const city = currentCity.trim();
    const street = currentStreet.trim();
    if (!city && !street) return;
    setZipLookupLoading(true);
    try {
      const res = await fetch(
        `/api/geocode?mode=address-to-zip&country=${encodeURIComponent(
          selectedCountryCode
        )}&city=${encodeURIComponent(city)}&street=${encodeURIComponent(
          street
        )}&buildingNumber=${encodeURIComponent(
          currentBuilding.trim()
        )}&stateRegion=${encodeURIComponent(currentState.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        const nextPostal = data.PostalCode || data.postalCode;
        if (data.found && nextPostal) {
          form.setValue("PostalCode", nextPostal);
          const nextCity = data.TownName || data.city;
          const nextState = data.CountrySubDivision || data.stateRegion;
          if (nextCity && !city) form.setValue("TownName", nextCity);
          if (nextState && !currentState.trim()) {
            form.setValue("CountrySubDivision", nextState);
          }
        }
      }
    } finally {
      setZipLookupLoading(false);
    }
  };

  const reqRule = requiredFields
    ? {
        required: true,
        validate: (v: string) => String(v || "").trim().length > 0,
      }
    : undefined;

  const cityDatalistId = `${testIdPrefix}-city-suggestions`;
  const streetDatalistId = `${testIdPrefix}-street-suggestions`;

  return (
    <div
      data-testid={`${testIdPrefix}-fields-container`}
      className="space-y-2.5"
    >
      {/* 1. Nickname field */}
      {showNickname && (
        <Input
          required={requiredFields}
          data-testid={`${testIdPrefix}-nickname`}
          placeholder={t.address.nicknamePlaceholder}
          {...form.register("nickname", reqRule)}
        />
      )}

      {/* Recipient Name (ISO 20022 & AFT Structured Name) */}
      {showRecipientName && (
        <NameFields
          register={form.register}
          fieldPrefix="recipientName"
          testIdPrefix={`${testIdPrefix}-recipient-name`}
        />
      )}

      {/* 2. Zip code field (+ autocomplete actions between zip code and address parts) */}
      <Input
        required={requiredFields}
        data-testid={`${testIdPrefix}-postal`}
        placeholder={t.address.postalCodePlaceholder}
        {...form.register("PostalCode", reqRule)}
      />

      {selectedCountryConfig?.supportsZipAutocomplete && (
        <div
          data-testid={
            zipActionsTestId || `${testIdPrefix}-zip-autocomplete-actions`
          }
          className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={zipLookupLoading}
            data-testid={
              fillZipBtnTestId || `${testIdPrefix}-fill-address-from-zip-btn`
            }
            onClick={handleFillAddressFromZip}
            className="text-[11px]"
          >
            <span>
              {zipLookupLoading
                ? t.address.lookingUpZip
                : t.address.fillAddressFromZipBtn}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={zipLookupLoading}
            data-testid={
              findZipBtnTestId || `${testIdPrefix}-find-zip-from-address-btn`
            }
            onClick={handleFindZipFromAddress}
            className="text-[11px]"
          >
            <span>
              {zipLookupLoading
                ? t.address.lookingUpZip
                : t.address.findZipFromAddressBtn}
            </span>
          </Button>
        </div>
      )}

      {/* 3. Country field (CountryCodeAlpha3) */}
      <select
        data-testid={`${testIdPrefix}-country`}
        aria-label={t.address.country}
        {...form.register("CountryCodeAlpha3")}
        className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-xs font-semibold"
      >
        {activeCountries.map((c) => (
          <option key={c.code} value={c.code}>
            {locale === "he" ? c.name_he : c.name} ({c.code})
          </option>
        ))}
      </select>

      {/* 4. State field (CountrySubDivision) & 5. City field (TownName) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input
          required={requiredFields}
          data-testid={`${testIdPrefix}-state`}
          placeholder={t.address.stateRegionPlaceholder}
          {...form.register("CountrySubDivision", reqRule)}
        />
        <div>
          <Input
            required={requiredFields}
            data-testid={`${testIdPrefix}-city`}
            list={cityDatalistId}
            placeholder={t.address.cityPlaceholder}
            {...form.register("TownName", reqRule)}
          />
          <datalist id={cityDatalistId}>
            {citySuggestions.map((cityOption) => (
              <option key={cityOption} value={cityOption} />
            ))}
          </datalist>
        </div>
      </div>

      {/* 6. Street (StreetName), Building (BuildingNumber) & Apartment (Apartment) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Input
            required={requiredFields}
            data-testid={`${testIdPrefix}-street`}
            list={streetDatalistId}
            placeholder={t.address.streetPlaceholder}
            {...form.register("StreetName", reqRule)}
          />
          <datalist id={streetDatalistId}>
            {streetSuggestions.map((streetOption) => (
              <option key={streetOption} value={streetOption} />
            ))}
          </datalist>
        </div>
        <Input
          required={requiredFields}
          data-testid={`${testIdPrefix}-building`}
          placeholder={t.address.buildingNumberPlaceholder}
          {...form.register("BuildingNumber", reqRule)}
        />
      </div>

      <Input
        data-testid={`${testIdPrefix}-unit`}
        placeholder={t.address.unitNumberPlaceholder}
        {...form.register("Apartment")}
      />

      {/* 7. Phone number (delegated to PhoneField powered by react-phone-number-input & world-countries) */}
      <PhoneField
        countryCode={selectedCountryCode}
        register={form.register}
        fieldName="phone.PhoneNumber"
        rules={reqRule}
        required={requiredFields}
        testId={`${testIdPrefix}-phone`}
        placeholder={t.address.phonePlaceholder}
      />

      {/* 8. Other notes (only on DeliveryAddress) */}
      {showDeliveryNotes && (
        <Input
          data-testid={`${testIdPrefix}-notes`}
          placeholder={t.address.deliveryNotesPlaceholder}
          {...form.register("deliveryNotes")}
        />
      )}
    </div>
  );
}
