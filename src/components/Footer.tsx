"use client";

import React from "react";
import Link from "next/link";
import {
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  Navigation,
  ShieldCheck,
} from "lucide-react";
import { Facebook, Instagram } from "@/components/ui/brand-icons";
import { useLanguage } from "@/context/LanguageContext";
import { STORE_CONTACT } from "@/lib/i18n";
import { formatAddressOneLine, formatPhone } from "@/lib/address";
import { openPrivacyChoicesModal } from "@/components/PrivacyConsentBanner";

export default function Footer() {
  const { t } = useLanguage();
  const addressOneLine = formatAddressOneLine(STORE_CONTACT.address, {
    includePhone: false,
  });
  const formattedPhone = formatPhone(STORE_CONTACT.phone);
  return (
    <footer
      role="contentinfo"
      aria-label="Store footer and community links"
      className="border-t border-slate-200 dark:border-slate-800 py-8 mt-16 text-xs text-slate-500 dark:text-slate-400"
    >
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center md:text-start">
          <p className="font-semibold text-slate-700 dark:text-slate-300">
            © {new Date().getFullYear()} {t.footer.copyright}
          </p>
          <p>{t.footer.tagline}</p>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
            <Link
              href="/privacy"
              data-testid="footer-privacy-policy"
              className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline font-medium"
            >
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              {t.footer.privacyPolicyLink}
            </Link>
            <button
              type="button"
              data-testid="footer-privacy-choices"
              onClick={openPrivacyChoicesModal}
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-teal-500 underline font-medium cursor-pointer"
            >
              {t.footer.privacyChoicesBtn}
            </button>
          </div>
        </div>

        <address className="not-italic flex flex-wrap items-center justify-center gap-4">
          <a
            href={STORE_CONTACT.googleMaps}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="footer-address-nav"
            aria-label={`Store address: ${addressOneLine}`}
            className="inline-flex items-center gap-1 hover:text-brand-500 transition"
          >
            <MapPin className="w-3.5 h-3.5 text-brand-500" aria-hidden="true" />
            {addressOneLine}
          </a>
          <a
            href={`tel:${formattedPhone}`}
            aria-label={`Call store at ${formattedPhone}`}
            className="inline-flex items-center gap-1 hover:text-brand-500 transition"
          >
            <Phone className="w-3.5 h-3.5 text-brand-500" aria-hidden="true" />
            {formattedPhone}
          </a>
          <a
            href={`mailto:${STORE_CONTACT.email}`}
            aria-label={`Email store at ${STORE_CONTACT.email}`}
            className="inline-flex items-center gap-1 hover:text-brand-500 transition"
          >
            <Mail className="w-3.5 h-3.5 text-brand-500" aria-hidden="true" />
            {STORE_CONTACT.email}
          </a>
          <a
            href={STORE_CONTACT.instagram}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="footer-instagram"
            aria-label="Dockside Keep on Instagram"
            className="inline-flex items-center gap-1 text-pink-500 hover:underline font-medium"
          >
            <Instagram className="w-3.5 h-3.5" aria-hidden="true" />
            Instagram
          </a>
          <a
            href={STORE_CONTACT.facebook}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="footer-facebook"
            aria-label="Dockside Keep on Facebook"
            className="inline-flex items-center gap-1 text-blue-500 hover:underline font-medium"
          >
            <Facebook className="w-3.5 h-3.5" aria-hidden="true" />
            Facebook
          </a>
          <a
            href={STORE_CONTACT.geekguild}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="footer-geekguild"
            aria-label="Dockside Keep on GeekGuild"
            className="inline-flex items-center gap-1 text-accent-500 hover:underline font-medium"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            GeekGuild
          </a>
          <a
            href={STORE_CONTACT.mydecklist}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="footer-mydecklist"
            aria-label="Dockside Keep on MyDecklist"
            className="inline-flex items-center gap-1 text-brand-500 hover:underline font-medium"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            MyDecklist
          </a>
          <a
            href={STORE_CONTACT.googleMaps}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="footer-google-nav"
            aria-label="Navigate to Dockside Keep on Google Maps"
            className="inline-flex items-center gap-1 text-emerald-500 hover:underline font-medium"
          >
            <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
            Google Maps
          </a>
        </address>
      </div>
    </footer>
  );
}
