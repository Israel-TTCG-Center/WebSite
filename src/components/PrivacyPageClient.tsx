"use client";

import React from "react";
import Link from "next/link";
import { ShieldCheck, SlidersHorizontal, UserCheck } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { STORE_CONTACT } from "@/lib/i18n";
import { openPrivacyChoicesModal } from "@/components/PrivacyConsentBanner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function PrivacyPageClient() {
  const { t } = useLanguage();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <PageHeader
        headingId="privacy-policy-heading"
        badgeText="GDPR • CCPA / CPRA • Israel PPL Amendment 13"
        title={t.privacy.pageTitle}
        subtitle={t.privacy.pageSubtitle}
      />

      <Card data-testid="privacy-policy-gdpr">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-500" aria-hidden="true" />
            {t.privacy.gdprHeading}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
          <p>{t.privacy.gdprBody}</p>
        </CardContent>
      </Card>

      <Card data-testid="privacy-policy-ccpa">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-500" aria-hidden="true" />
            {t.privacy.ccpaHeading}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-3">
          <p>{t.privacy.ccpaBody}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="privacy-page-open-choices-btn"
            onClick={openPrivacyChoicesModal}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            {t.footer.privacyChoicesBtn}
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="privacy-policy-israel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-500" aria-hidden="true" />
            {t.privacy.israelHeading}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
          <p>{t.privacy.israelBody}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-teal-500" aria-hidden="true" />
            {t.privacy.accountPrivacyTitle}
          </CardTitle>
          <CardDescription>
            {STORE_CONTACT.address} • {STORE_CONTACT.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Link
            href="/account"
            data-testid="privacy-page-account-link"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition"
          >
            {t.nav.account}
          </Link>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openPrivacyChoicesModal}
          >
            {t.privacy.manageCookiesBtn}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
