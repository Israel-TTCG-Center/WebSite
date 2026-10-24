"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  Sun,
  Moon,
  User,
  LogOut,
  Globe,
  History,
  ShieldAlert,
  Package,
  Calendar,
  Settings,
  Store,
  Crown,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useLanguage } from "@/context/LanguageContext";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormattedName } from "@/components/ui/name-fields";
import { formatFullName } from "@/lib/name";
import { PAGE_SEO_CONFIG, type SeoPageKey } from "@/lib/seo";

const PATH_TO_SEO_KEY: Record<string, SeoPageKey> = {
  "/": "home",
  "/events": "events",
  "/blog": "blog",
  "/contact": "contact",
  "/cart": "cart",
  "/account": "account",
  "/login": "login",
  "/admin": "admin",
};

export default function Navbar() {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");

  const { theme, toggleTheme } = useTheme();
  const { locale, setLocale, t } = useLanguage();
  const {
    totalCount,
    loyalty,
    user,
    setUser,
    saveUserPreferences,
  } = useCart();

  // Ensure every page retains its unique <title> tag during client-side navigation
  useEffect(() => {
    if (!pathname) return;
    const seoKey = PATH_TO_SEO_KEY[pathname];
    if (seoKey && PAGE_SEO_CONFIG[seoKey]) {
      document.title = PAGE_SEO_CONFIG[seoKey].title;
    }
  }, [pathname]);

  const handleToggleLanguage = async () => {
    const nextLocale = locale === "en" ? "he" : "en";
    setLocale(nextLocale);
    await saveUserPreferences({ locale: nextLocale, theme });
  };

  const handleToggleTheme = async () => {
    const nextTheme = toggleTheme();
    await saveUserPreferences({ locale, theme: nextTheme });
  };

  // Dedicated Admin Header when on /admin routes (distinct from regular store header)
  if (isAdminRoute) {
    return (
      <header
        role="banner"
        aria-label="Admin Portal Header"
        data-testid="admin-header"
        className="sticky top-0 z-40 border-b border-amber-500/30 bg-slate-950 text-white backdrop-blur"
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div
              aria-hidden="true"
              className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-md shadow-amber-500/20"
            >
              <ShieldAlert className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-white block leading-none">
                {t.adminPortal.consoleTitle}
              </span>
              <span className="text-xs text-amber-400 font-semibold">
                {t.adminPortal.consoleSubtitle}
              </span>
            </div>
          </div>

          <nav
            aria-label="Admin portal navigation"
            data-testid="admin-main-nav"
            className="flex items-center gap-1.5"
          >
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-slate-200 hover:text-white hover:bg-slate-800"
            >
              <Link href="/admin?page=inventory" data-testid="admin-nav-inventory">
                <Package className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>{t.adminPortal.navInventory}</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-slate-200 hover:text-white hover:bg-slate-800"
            >
              <Link href="/admin?page=events" data-testid="admin-nav-events">
                <Calendar className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>{t.adminPortal.navEvents}</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-slate-200 hover:text-white hover:bg-slate-800"
            >
              <Link href="/admin?page=metadata" data-testid="admin-nav-metadata">
                <Settings className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <span>{t.adminPortal.navMetadata}</span>
              </Link>
            </Button>
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleLanguage}
              data-testid="lang-toggle"
              aria-label="Switch Language"
              className="border-slate-700 bg-slate-900 text-white hover:bg-slate-800 font-bold"
            >
              <Globe className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <span>{locale === "en" ? "עברית" : "EN"}</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleToggleTheme}
              data-testid="theme-toggle"
              aria-label="Toggle Dark or Light Mode"
              className="border-slate-700 bg-slate-900 text-white"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4 text-slate-300" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="border-slate-700 bg-slate-900 text-slate-200 hover:text-white"
            >
              <Link href="/" data-testid="admin-back-to-store">
                <Store className="w-4 h-4 text-brand-400" aria-hidden="true" />
                <span>{t.adminPortal.backToStore}</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>
    );
  }

  // Regular Store Header (Note: Social links removed from header and kept only in Footer)
  return (
    <header
      role="banner"
      aria-label="Dockside Keep Store Header"
      data-testid="store-header"
      className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur"
    >
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link
          href="/"
          aria-label={`${t.brandName} — ${t.storeSubtitle}`}
          className="flex items-center gap-2.5 group"
        >
          <img
            src="/icon.svg?v=2"
            alt={`${t.brandName} logo`}
            data-testid="brand-store-icon"
            width={40}
            height={44}
            className="w-10 h-11 object-contain drop-shadow-md group-hover:scale-105 transition"
          />
          <div>
            <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white block leading-none">
              {t.brandName}
            </span>
            <span className="text-xs text-brand-600 dark:text-brand-400 font-medium">
              {t.storeSubtitle}
            </span>
          </div>
        </Link>

        {/* Main Header Navigation Links */}
        <nav
          aria-label="Main store navigation"
          data-testid="main-nav"
          className="hidden md:flex items-center gap-1"
        >
          <Button variant="ghost" size="sm" asChild>
            <Link
              href="/"
              data-testid="nav-store"
              aria-current={pathname === "/" ? "page" : undefined}
            >
              {t.nav.store}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link
              href="/events"
              data-testid="nav-events"
              aria-current={pathname === "/events" ? "page" : undefined}
            >
              {t.nav.events}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link
              href="/blog"
              data-testid="nav-blog"
              aria-current={pathname === "/blog" ? "page" : undefined}
            >
              {t.nav.blog}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link
              href="/contact"
              data-testid="nav-contact"
              aria-current={pathname === "/contact" ? "page" : undefined}
            >
              {t.nav.contact}
            </Link>
          </Button>
        </nav>

        <div className="flex items-center gap-1.5">
          {/* Language Toggle Button (EN <-> עברית) */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleLanguage}
            data-testid="lang-toggle"
            aria-label="Switch Language"
          >
            <Globe className="w-4 h-4 text-brand-500" aria-hidden="true" />
            <span>{locale === "en" ? "עברית" : "EN"}</span>
          </Button>

          {/* Dark/Light Mode Toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleToggleTheme}
            data-testid="theme-toggle"
            aria-label="Toggle Dark/Light Mode"
            title={
              theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"
            }
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-accent-400" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" aria-hidden="true" />
            )}
          </Button>

          {/* Account & Order History Link (Only available when signed in) */}
          {user ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href="/account"
                  data-testid="account-link"
                  aria-label={`Account (${formatFullName(user.name)})`}
                  aria-current={pathname === "/account" ? "page" : undefined}
                >
                  <History className="w-4 h-4 text-brand-500" aria-hidden="true" />
                  <FormattedName
                    value={user.name}
                    className="hidden lg:inline"
                  />
                  {loyalty?.currentClass && (
                    <Badge variant="amber" className="ml-1 text-[10px] px-1.5 py-0">
                      <Crown className="w-3 h-3" aria-hidden="true" />
                      {loyalty.discountPercent}%
                    </Badge>
                  )}
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setUser(null)}
                aria-label={t.nav.signOut}
                title={t.nav.signOut}
              >
                <LogOut
                  className="w-4 h-4 text-slate-400 hover:text-rose-500"
                  aria-hidden="true"
                />
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link
                href="/login"
                data-testid="login-link"
                aria-label={t.nav.signIn}
                aria-current={pathname === "/login" ? "page" : undefined}
              >
                <User className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t.nav.signIn}</span>
              </Link>
            </Button>
          )}

          {/* Dedicated Cart Page Link */}
          <Button size="sm" asChild>
            <Link
              href="/cart"
              data-testid="cart-button"
              aria-label={`${t.nav.cart} (${totalCount} items)`}
              aria-current={pathname === "/cart" ? "page" : undefined}
            >
              <ShoppingCart className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t.nav.cart}</span>
              {totalCount > 0 && (
                <span
                  data-testid="cart-count"
                  aria-live="polite"
                  className="px-1.5 py-0.5 text-xs rounded-full bg-white text-brand-700 font-bold"
                >
                  {totalCount}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
