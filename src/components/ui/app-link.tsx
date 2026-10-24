"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface AppLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  exact?: boolean;
  "data-testid"?: string;
}

/**
 * Accessible & SEO-aware Link primitive (`<AppLink>`):
 * - Automatically distinguishes internal Next.js routes (`/events`) from external URLs (`https://...`, `mailto:`, `tel:`).
 * - Injects `aria-current="page"` on active internal routes for screen readers.
 * - Enforces `target="_blank" rel="noopener noreferrer"` on external HTTP(S) links.
 */
export const AppLink = React.forwardRef<HTMLAnchorElement, AppLinkProps>(
  ({ href, exact = true, className, children, ...props }, ref) => {
    const pathname = usePathname();
    const isExternal =
      href.startsWith("http://") ||
      href.startsWith("https://") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:");

    if (isExternal) {
      const isWebExternal =
        href.startsWith("http://") || href.startsWith("https://");
      return (
        <a
          ref={ref}
          href={href}
          target={isWebExternal ? "_blank" : props.target}
          rel={isWebExternal ? "noopener noreferrer" : props.rel}
          className={cn(className)}
          {...props}
        >
          {children}
        </a>
      );
    }

    const cleanHref = href.split("?")[0];
    const isActive = exact
      ? pathname === cleanHref
      : Boolean(pathname && pathname.startsWith(cleanHref));

    return (
      <Link
        ref={ref}
        href={href}
        aria-current={isActive ? "page" : props["aria-current"]}
        className={cn(className)}
        {...props}
      >
        {children}
      </Link>
    );
  }
);
AppLink.displayName = "AppLink";
