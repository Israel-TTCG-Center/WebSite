"use client";

import React from "react";
import PhoneInputFromLib, {
  getCountryCallingCode,
  type Country as IsoCountryAlpha2,
} from "react-phone-number-input";
import type { UseFormRegister } from "react-hook-form";
import {
  countryAlpha3ToAlpha2,
  normalizeCountryCodeAlpha3,
} from "@/lib/address";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PhoneFieldProps {
  /** Country code in ISO 3166-1 alpha-2 or alpha-3 (defaults to "ISR" / "IL") */
  countryCode?: string;
  /** Optional react-hook-form register function */
  register?: UseFormRegister<any>;
  /** Field name for react-hook-form (defaults to "phone") */
  fieldName?: string;
  /** Validation rules for react-hook-form */
  rules?: Record<string, any>;
  /** Controlled value when not using react-hook-form */
  value?: string;
  /** Controlled change handler when not using react-hook-form */
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  testId?: string;
  className?: string;
}

/**
 * Reusable Phone Input component powered by `react-phone-number-input` and `world-countries`.
 * Displays the resolved ITU-T E.164 country calling code prefix (`+972`, `+1`, `+44`, etc.)
 * via `getCountryCallingCode` and binds seamlessly to `react-hook-form` or controlled state.
 */
export function PhoneField({
  countryCode = "ISR",
  register,
  fieldName = "phone",
  rules,
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  testId = "phone-input",
  className,
}: PhoneFieldProps) {
  const alpha3 = normalizeCountryCodeAlpha3(countryCode);
  const alpha2 = countryAlpha3ToAlpha2(alpha3).toUpperCase() as IsoCountryAlpha2;

  let callingCode = "972";
  try {
    callingCode = getCountryCallingCode(alpha2);
  } catch {
    callingCode = "972";
  }

  if (register) {
    return (
      <div className={cn("flex items-center gap-1.5", className)} dir="ltr">
        <span
          className="h-10 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 text-xs font-mono font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center shrink-0 select-none"
          title={`${alpha3} (+${callingCode})`}
        >
          +{callingCode}-
        </span>
        <Input
          type="tel"
          autoComplete="tel-national"
          required={required}
          disabled={disabled}
          data-testid={testId}
          placeholder={placeholder}
          {...register(fieldName, rules)}
        />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <PhoneInputFromLib
        international
        defaultCountry={alpha2}
        country={alpha2}
        value={value}
        onChange={(val) => onChange?.(val ? String(val) : "")}
        disabled={disabled}
        placeholder={placeholder}
        numberInputProps={{
          "data-testid": testId,
          required,
          className:
            "flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100",
        }}
        className="flex w-full items-center gap-1.5"
      />
    </div>
  );
}
