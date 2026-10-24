"use client";

import React, { useEffect, useState } from "react";
import {
  MapPin,
  Clock,
  Phone,
  Mail,
  Calendar,
  Trophy,
  ExternalLink,
  Navigation,
} from "lucide-react";
import { Facebook, Instagram } from "@/components/ui/brand-icons";
import { useLanguage } from "@/context/LanguageContext";
import { STORE_CONTACT } from "@/lib/i18n";
import {
  formatAddressOneLine,
  formatPhone,
  type Address,
  type Phone as StructuredPhone,
} from "@/lib/address";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
  const { locale, t } = useLanguage();
  const [metadata, setMetadata] = useState<{
    phone: StructuredPhone | string;
    email: string;
    address: Address | string;
    openingHours: string;
    openingHours_he: string;
  }>({
    phone: STORE_CONTACT.phone,
    email: STORE_CONTACT.email,
    address: STORE_CONTACT.address,
    openingHours: t.contact.hoursBody,
    openingHours_he: t.contact.hoursBody,
  });

  useEffect(() => {
    fetch("/api/metadata")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.metadata) {
          setMetadata(data.metadata);
        }
      })
      .catch(() => {});
  }, []);

  const displayAddress = formatAddressOneLine(metadata.address, {
    includePhone: false,
  });
  const displayPhone = formatPhone(metadata.phone);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
          {t.contact.title}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          {t.contact.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-1">
              <MapPin className="w-5 h-5" />
            </div>
            <CardTitle>{t.contact.locationTitle}</CardTitle>
            <CardDescription data-testid="contact-address">
              {displayAddress}
            </CardDescription>
            <div className="pt-1">
              <Button variant="outline" size="sm" asChild className="w-full">
                <a
                  href={STORE_CONTACT.googleMaps}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="contact-google-nav"
                >
                  <Navigation className="w-4 h-4 text-emerald-500" />
                  <span>{t.contact.navigateGoogle}</span>
                </a>
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-2">
              <Clock className="w-5 h-5" />
            </div>
            <CardTitle>{t.contact.hoursTitle}</CardTitle>
            <CardDescription data-testid="contact-opening-hours">
              {locale === "he" && metadata.openingHours_he
                ? metadata.openingHours_he
                : metadata.openingHours}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-2">
              <Mail className="w-5 h-5" />
            </div>
            <CardTitle>{t.contact.directContactTitle}</CardTitle>
            <CardDescription className="space-y-2 pt-1">
              <a
                href={`tel:${displayPhone}`}
                data-testid="contact-phone"
                className="flex items-center gap-2 hover:text-brand-500 transition"
              >
                <Phone className="w-4 h-4 text-brand-500" />
                {displayPhone}
              </a>
              <a
                href={`mailto:${metadata.email}`}
                data-testid="contact-email"
                className="flex items-center gap-2 hover:text-brand-500 transition"
              >
                <Mail className="w-4 h-4 text-brand-500" />
                {metadata.email}
              </a>
              <div className="pt-2 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={STORE_CONTACT.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="contact-instagram"
                  >
                    <Instagram className="w-4 h-4 text-pink-500" />
                    <span>{t.contact.followInstagram}</span>
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={STORE_CONTACT.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="contact-facebook"
                  >
                    <Facebook className="w-4 h-4 text-blue-500" />
                    <span>{t.contact.followFacebook}</span>
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={STORE_CONTACT.geekguild}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="contact-geekguild"
                  >
                    <ExternalLink className="w-4 h-4 text-amber-500" />
                    <span>{t.contact.followGeekGuild}</span>
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={STORE_CONTACT.mydecklist}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="contact-mydecklist"
                  >
                    <ExternalLink className="w-4 h-4 text-brand-500" />
                    <span>{t.contact.followMyDecklist}</span>
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={STORE_CONTACT.googleMaps}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="contact-google-social"
                  >
                    <Navigation className="w-4 h-4 text-emerald-500" />
                    <span>{t.contact.followGoogle}</span>
                  </a>
                </Button>
              </div>
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card className="p-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-xl">
            <Trophy className="w-5 h-5 text-amber-500" />
            {t.contact.scheduleTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 space-y-2">
              <Badge variant="default">
                <Calendar className="w-3.5 h-3.5" /> {t.contact.wedBadge}
              </Badge>
              <h3 className="font-bold text-slate-900 dark:text-white">
                {t.contact.wedTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.contact.wedDesc}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 space-y-2">
              <Badge variant="default">
                <Calendar className="w-3.5 h-3.5" /> {t.contact.friBadge}
              </Badge>
              <h3 className="font-bold text-slate-900 dark:text-white">
                {t.contact.friTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.contact.friDesc}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 space-y-2">
              <Badge variant="default">
                <Calendar className="w-3.5 h-3.5" /> {t.contact.satBadge}
              </Badge>
              <h3 className="font-bold text-slate-900 dark:text-white">
                {t.contact.satTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.contact.satDesc}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
