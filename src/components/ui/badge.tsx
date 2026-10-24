"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-brand-500/30 bg-brand-500/15 text-brand-700 dark:text-brand-300",
        secondary:
          "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200",
        emerald:
          "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
        amber:
          "border-accent-500/30 bg-accent-500/15 text-accent-600 dark:text-accent-300",
        destructive:
          "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300",
        outline:
          "text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <Box
      component="div"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
