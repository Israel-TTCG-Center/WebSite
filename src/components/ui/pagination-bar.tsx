"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PaginationBarProps {
  prefix: string;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  labels?: {
    showing?: string;
    of?: string;
    perPage?: string;
    previous?: string;
    next?: string;
  };
}

/**
 * Accessible & SEO-friendly `<PaginationBar>` primitive:
 * - Renders `<nav aria-label="Pagination">` landmark.
 * - Announces live item range (`Showing 1-9 of 24`) via `role="status" aria-live="polite"`.
 * - Marks active page button with `aria-current="page"`.
 */
export function PaginationBar({
  prefix,
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
  labels,
}: PaginationBarProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <nav
      aria-label="Pagination"
      data-testid={`${prefix}-pagination`}
      className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          role="status"
          aria-live="polite"
          data-testid={`${prefix}-pagination-summary`}
          className="font-semibold"
        >
          {labels?.showing || "Showing"} {startIndex}–{endIndex}{" "}
          {labels?.of || "of"} {totalItems}
        </span>

        <label className="inline-flex items-center gap-1.5">
          <span>{labels?.perPage || "Per page"}:</span>
          <select
            data-testid={`${prefix}-page-size`}
            aria-label={labels?.perPage || "Items per page"}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 text-xs font-semibold text-slate-900 dark:text-white"
          >
            <option value={9}>9</option>
            <option value={18}>18</option>
            <option value={36}>36</option>
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          data-testid={`${prefix}-prev-page`}
          aria-label={labels?.previous || "Previous page"}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          <span>{labels?.previous || "Prev"}</span>
        </Button>

        {pages.map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={p === currentPage ? "default" : "outline"}
            data-testid={`${prefix}-page-${p}`}
            aria-label={`Page ${p}`}
            aria-current={p === currentPage ? "page" : undefined}
            onClick={() => onPageChange(p)}
          >
            {p}
          </Button>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
          data-testid={`${prefix}-next-page`}
          aria-label={labels?.next || "Next page"}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <span>{labels?.next || "Next"}</span>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
