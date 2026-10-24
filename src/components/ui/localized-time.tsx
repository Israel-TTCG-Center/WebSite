"use client";

import React, { useEffect, useState } from "react";
import { formatBrowserDateTime, isIsoDateString, toUtcIso } from "@/lib/premium";

export interface LocalizedTimeProps {
  value?: string | Date | null;
  className?: string;
  "data-testid"?: string;
}

/**
 * Accessible & SEO-friendly `<time>` primitive (`<LocalizedTime>`):
 * - Exposes machine-readable `dateTime` (UTC ISO) for search engines & assistive tech.
 * - Formats visible text in the user's browser locale & timezone (`Intl.DateTimeFormat(undefined, ...)`).
 */
export function LocalizedTime({
  value,
  className,
  "data-testid": testId,
}: LocalizedTimeProps) {
  const [browserFormatted, setBrowserFormatted] = useState<string>(() =>
    formatBrowserDateTime(value)
  );

  useEffect(() => {
    setBrowserFormatted(formatBrowserDateTime(value));
  }, [value]);

  if (!value) return null;

  const isoAttr =
    value instanceof Date || isIsoDateString(value)
      ? toUtcIso(value) || undefined
      : undefined;

  return (
    <time dateTime={isoAttr} data-testid={testId} className={className}>
      {browserFormatted}
    </time>
  );
}
