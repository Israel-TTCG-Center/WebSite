"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, SlidersHorizontal, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useCart } from "@/context/CartContext";
import {
  normalizePrivacyConsent,
  PRIVACY_CONSENT_STORAGE_KEY,
  type PrivacyConsentPreferences,
} from "@/lib/privacy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const OPEN_PRIVACY_CHOICES_EVENT = "dockside:open-privacy-choices";

export function openPrivacyChoicesModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_PRIVACY_CHOICES_EVENT));
  }
}

export default function PrivacyConsentBanner() {
  const { t } = useLanguage();
  const { user } = useCart();

  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [gpcDetected, setGpcDetected] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [doNotSellOrShare, setDoNotSellOrShare] = useState(false);

  useEffect(() => {
    const navGpc =
      typeof navigator !== "undefined" &&
      Boolean((navigator as any).globalPrivacyControl);
    setGpcDetected(navGpc);

    try {
      const storedRaw = localStorage.getItem(PRIVACY_CONSENT_STORAGE_KEY);
      if (storedRaw) {
        const parsed = JSON.parse(storedRaw) as Partial<PrivacyConsentPreferences>;
        const normalized = normalizePrivacyConsent(parsed, {
          clientGpc: navGpc,
        });
        setAnalytics(normalized.analytics);
        setMarketing(normalized.marketing);
        setDoNotSellOrShare(normalized.doNotSellOrShare);
        setVisible(false);
      } else {
        if (navGpc) {
          setDoNotSellOrShare(true);
          setAnalytics(false);
          setMarketing(false);
        }
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }

    const handleOpen = () => {
      setVisible(true);
      setExpanded(true);
    };
    window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT, handleOpen);
    return () => {
      window.removeEventListener(OPEN_PRIVACY_CHOICES_EVENT, handleOpen);
    };
  }, []);

  const persistConsent = async (next: Partial<PrivacyConsentPreferences>) => {
    const normalized = normalizePrivacyConsent(next, {
      clientGpc: gpcDetected,
    });
    setAnalytics(normalized.analytics);
    setMarketing(normalized.marketing);
    setDoNotSellOrShare(normalized.doNotSellOrShare);
    try {
      localStorage.setItem(
        PRIVACY_CONSENT_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    } catch {
      // Ignore storage quota errors
    }
    setVisible(false);
    setExpanded(false);

    try {
      await fetch("/api/privacy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user?.email ? { "x-user-email": user.email } : {}),
        },
        body: JSON.stringify({
          email: user?.email,
          consent: normalized,
          gpcDetected,
        }),
      });
    } catch {
      // Offline or local-only mode
    }
  };

  if (!visible) return null;

  return (
    <aside
      role="region"
      aria-label={t.privacy.bannerTitle}
      data-testid="privacy-consent-banner"
      className="fixed bottom-0 inset-x-0 z-50 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md shadow-2xl p-4"
    >
      <div className="max-w-6xl mx-auto space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck
                className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0"
                aria-hidden="true"
              />
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                {t.privacy.bannerTitle}
              </h2>
              {gpcDetected && (
                <Badge
                  variant="default"
                  data-testid="gpc-active-badge"
                  className="text-[10px]"
                >
                  {t.privacy.gpcActiveBadge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.privacy.bannerBody}{" "}
              <Link
                href="/privacy"
                data-testid="banner-privacy-policy-link"
                className="text-teal-600 dark:text-teal-400 underline font-semibold"
              >
                {t.footer.privacyPolicyLink}
              </Link>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="privacy-customize-btn"
              onClick={() => setExpanded((prev) => !prev)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              {t.privacy.customizeBtn}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="privacy-essential-only-btn"
              onClick={() =>
                persistConsent({
                  analytics: false,
                  marketing: false,
                  doNotSellOrShare: true,
                })
              }
            >
              {t.privacy.essentialOnlyBtn}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              data-testid="privacy-accept-all-btn"
              onClick={() =>
                persistConsent({
                  analytics: !gpcDetected,
                  marketing: !gpcDetected,
                  doNotSellOrShare: gpcDetected,
                })
              }
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              {t.privacy.acceptAllBtn}
            </Button>
          </div>
        </div>

        {expanded && (
          <div
            data-testid="privacy-preferences-panel"
            className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs"
          >
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/70">
              <input
                type="checkbox"
                checked
                disabled
                aria-label={t.privacy.essentialLabel}
                className="mt-0.5 rounded"
              />
              <div>
                <span className="font-semibold block text-slate-900 dark:text-slate-100">
                  {t.privacy.essentialLabel}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {t.privacy.essentialDesc}
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/70 cursor-pointer">
              <input
                type="checkbox"
                data-testid="privacy-toggle-analytics"
                checked={analytics && !doNotSellOrShare}
                disabled={doNotSellOrShare}
                onChange={(e) => setAnalytics(e.target.checked)}
                aria-label={t.privacy.analyticsLabel}
                className="mt-0.5 rounded"
              />
              <div>
                <span className="font-semibold block text-slate-900 dark:text-slate-100">
                  {t.privacy.analyticsLabel}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {t.privacy.analyticsDesc}
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/70 cursor-pointer">
              <input
                type="checkbox"
                data-testid="privacy-toggle-marketing"
                checked={marketing && !doNotSellOrShare}
                disabled={doNotSellOrShare}
                onChange={(e) => setMarketing(e.target.checked)}
                aria-label={t.privacy.marketingLabel}
                className="mt-0.5 rounded"
              />
              <div>
                <span className="font-semibold block text-slate-900 dark:text-slate-100">
                  {t.privacy.marketingLabel}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {t.privacy.marketingDesc}
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/70 cursor-pointer">
              <input
                type="checkbox"
                data-testid="privacy-toggle-do-not-sell"
                checked={doNotSellOrShare}
                disabled={gpcDetected}
                onChange={(e) => {
                  const nextVal = e.target.checked;
                  setDoNotSellOrShare(nextVal);
                  if (nextVal) {
                    setAnalytics(false);
                    setMarketing(false);
                  }
                }}
                aria-label={t.privacy.doNotSellLabel}
                className="mt-0.5 rounded"
              />
              <div>
                <span className="font-semibold block text-slate-900 dark:text-slate-100">
                  {t.privacy.doNotSellLabel}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {t.privacy.doNotSellDesc}
                </span>
              </div>
            </label>

            <div className="md:col-span-2 flex justify-end">
              <Button
                type="button"
                variant="default"
                size="sm"
                data-testid="privacy-save-choices-btn"
                onClick={() =>
                  persistConsent({
                    analytics,
                    marketing,
                    doNotSellOrShare,
                  })
                }
              >
                {t.privacy.saveChoicesBtn}
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
