"use client";

import React from "react";
import type { UseFormRegister } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/LanguageContext";
import {
  AFT_MAX_GIVEN_NAME_LENGTH,
  AFT_MAX_SURNAME_LENGTH,
  formatFullName,
  formatIso20022Name,
  normalizeName,
  toAftNameFields,
  type Name,
} from "@/lib/name";
import { cn } from "@/lib/utils";

export interface NameFieldsProps {
  /**
   * Optional react-hook-form `register` function.
   * When provided, binds `<fieldPrefix>.firstName`, `<fieldPrefix>.middleName`, and `<fieldPrefix>.lastName`
   * (or `firstName`, `middleName`, `lastName` when `fieldPrefix` is empty).
   */
  register?: UseFormRegister<any>;
  /**
   * Field path prefix for react-hook-form (e.g. `"name"`, `"recipientName"`, `"accountHolderName"`).
   */
  fieldPrefix?: string;
  /**
   * Controlled value when not using react-hook-form.
   */
  value?: Name | string | null;
  /**
   * Controlled change handler when not using react-hook-form.
   */
  onChange?: (next: Name) => void;
  /**
   * Prefix for `data-testid` attributes:
   * - `${testIdPrefix}-first`
   * - `${testIdPrefix}-middle`
   * - `${testIdPrefix}-last`
   */
  testIdPrefix?: string;
  /**
   * Optional section label rendered above the 3 name inputs.
   */
  label?: string;
  /**
   * Whether `firstName` and `lastName` are required HTML form fields.
   * `middleName` is always optional per ISO 20022 & AFT rules.
   */
  required?: boolean;
  /**
   * Whether to show individual field labels above each input.
   */
  showFieldLabels?: boolean;
  className?: string;
}

/**
 * Generic reusable ISO 20022 & AFT structured `<NameFields />` component (`firstName`, optional `middleName`, `lastName`).
 * Can be used in any form across the application (`/login`, `/account`, `/cart`, `/admin`).
 */
export function NameFields({
  register,
  fieldPrefix = "name",
  value,
  onChange,
  testIdPrefix = "name",
  label,
  required = false,
  showFieldLabels = false,
  className,
}: NameFieldsProps) {
  const { t } = useLanguage();
  const normalizedValue = normalizeName(value);

  const buildFieldName = (key: keyof Name) =>
    fieldPrefix ? `${fieldPrefix}.${key}` : key;

  const firstFieldProps = register
    ? register(buildFieldName("firstName"), {
        required,
        maxLength: AFT_MAX_GIVEN_NAME_LENGTH,
        ...(required
          ? { validate: (v: string) => String(v || "").trim().length > 0 }
          : {}),
      })
    : {
        value: normalizedValue.firstName,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onChange?.({
            ...normalizedValue,
            firstName: e.target.value,
          }),
      };

  const middleFieldProps = register
    ? register(buildFieldName("middleName"), {
        required: false,
        maxLength: AFT_MAX_GIVEN_NAME_LENGTH,
      })
    : {
        value: normalizedValue.middleName || "",
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          const nextMiddle = e.target.value;
          const next: Name = {
            firstName: normalizedValue.firstName,
            lastName: normalizedValue.lastName,
          };
          if (nextMiddle) {
            next.middleName = nextMiddle;
          }
          onChange?.(next);
        },
      };

  const lastFieldProps = register
    ? register(buildFieldName("lastName"), {
        required,
        maxLength: AFT_MAX_SURNAME_LENGTH,
        ...(required
          ? { validate: (v: string) => String(v || "").trim().length > 0 }
          : {}),
      })
    : {
        value: normalizedValue.lastName,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onChange?.({
            ...normalizedValue,
            lastName: e.target.value,
          }),
      };

  return (
    <div
      data-testid={`${testIdPrefix}-group`}
      className={cn("space-y-1.5", className)}
    >
      {label && (
        <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
          {label}
        </span>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          {showFieldLabels && (
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t.name.firstName}
            </label>
          )}
          <Input
            type="text"
            required={required}
            maxLength={AFT_MAX_GIVEN_NAME_LENGTH}
            aria-label={t.name.firstName}
            data-testid={`${testIdPrefix}-first`}
            placeholder={t.name.firstNamePlaceholder}
            {...firstFieldProps}
          />
        </div>
        <div>
          {showFieldLabels && (
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t.name.middleName}
            </label>
          )}
          <Input
            type="text"
            required={false}
            maxLength={AFT_MAX_GIVEN_NAME_LENGTH}
            aria-label={t.name.middleName}
            data-testid={`${testIdPrefix}-middle`}
            placeholder={t.name.middleNamePlaceholder}
            {...middleFieldProps}
          />
        </div>
        <div>
          {showFieldLabels && (
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
              {t.name.lastName}
            </label>
          )}
          <Input
            type="text"
            required={required}
            maxLength={AFT_MAX_SURNAME_LENGTH}
            aria-label={t.name.lastName}
            data-testid={`${testIdPrefix}-last`}
            placeholder={t.name.lastNamePlaceholder}
            {...lastFieldProps}
          />
        </div>
      </div>
    </div>
  );
}

export interface FormattedNameProps {
  value?: Name | string | Record<string, any> | null;
  mode?: "full" | "iso20022" | "aft";
  fallback?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * Generic display primitive that dynamically builds the full name (or ISO 20022 / AFT formatted string)
 * from a structured `Name` object (`{ firstName, middleName?, lastName }`) or legacy string.
 */
export function FormattedName({
  value,
  mode = "full",
  fallback = "",
  className,
  "data-testid": testId,
}: FormattedNameProps) {
  const formatted =
    mode === "iso20022"
      ? formatIso20022Name(value)
      : mode === "aft"
      ? toAftNameFields(value).formattedFullName
      : formatFullName(value);

  const text = formatted || fallback;
  if (!text) return null;

  return (
    <span data-testid={testId} className={className}>
      {text}
    </span>
  );
}
