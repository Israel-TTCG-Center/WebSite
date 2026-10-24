"use client";

import React from "react";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  headingId: string;
  title: React.ReactNode;
  titleTestId?: string;
  subtitle?: React.ReactNode;
  subtitleTestId?: string;
  badgeIcon?: React.ReactNode;
  badgeText?: React.ReactNode;
  actions?: React.ReactNode;
  variant?: "indigo" | "purple" | "plain";
  className?: string;
}

/**
 * Accessible & SEO-compliant Page Header primitive (`<PageHeader>`) powered by MUI `<Paper>` & `<Box>`:
 * - Enforces a semantic `<section aria-labelledby={headingId}>` landmark.
 * - Renders the page's single primary `<h1 id={headingId}>` headline.
 */
export function PageHeader({
  headingId,
  title,
  titleTestId,
  subtitle,
  subtitleTestId,
  badgeIcon,
  badgeText,
  actions,
  variant = "indigo",
  className,
}: PageHeaderProps) {
  if (variant === "plain") {
    return (
      <Box
        component="section"
        aria-labelledby={headingId}
        className={cn(
          "flex flex-wrap items-center justify-between gap-4",
          className
        )}
      >
        <div className="space-y-1.5">
          <h1
            id={headingId}
            data-testid={titleTestId}
            className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight"
          >
            {title}
          </h1>
          {subtitle && (
            <p
              data-testid={subtitleTestId}
              className="text-slate-600 dark:text-slate-400 text-sm"
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </Box>
    );
  }

  const gradientClass =
    variant === "purple"
      ? "from-slate-900 via-brand-950 to-amber-950/60 border-accent-500/30"
      : "from-brand-950 via-slate-900 to-cyan-950 border-brand-500/30";

  const badgeClass =
    variant === "purple"
      ? "bg-accent-500/20 border-accent-400/30 text-accent-300"
      : "bg-brand-500/20 border-brand-400/30 text-brand-300";

  return (
    <Paper
      component="section"
      elevation={0}
      aria-labelledby={headingId}
      className={cn(
        "relative overflow-hidden rounded-3xl bg-gradient-to-br text-white p-8 md:p-12 border shadow-xl",
        gradientClass,
        className
      )}
    >
      <div className="max-w-2xl space-y-4">
        {badgeText && (
          <Badge className={badgeClass}>
            {badgeIcon}
            <span>{badgeText}</span>
          </Badge>
        )}
        <h1
          id={headingId}
          data-testid={titleTestId}
          className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight"
        >
          {title}
        </h1>
        {subtitle && (
          <p
            data-testid={subtitleTestId}
            className="text-slate-300 text-sm md:text-base leading-relaxed"
          >
            {subtitle}
          </p>
        )}
        {actions && <div className="pt-2 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </Paper>
  );
}
