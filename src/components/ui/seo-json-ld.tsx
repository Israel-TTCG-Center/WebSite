import React from "react";

export interface SeoJsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
  "data-testid"?: string;
}

/**
 * Reusable Schema.org Structured Data (`application/ld+json`) primitive.
 */
export function SeoJsonLd({ data, "data-testid": testId }: SeoJsonLdProps) {
  return (
    <script
      type="application/ld+json"
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
