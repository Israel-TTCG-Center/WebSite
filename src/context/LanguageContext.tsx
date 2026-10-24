"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { translations, type Locale } from "@/lib/i18n";

interface LanguageContextType {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (typeof translations)["en"] | (typeof translations)["he"];
}

const LanguageContext = createContext<LanguageContextType>({
  locale: "en",
  dir: "ltr",
  setLocale: () => {},
  toggleLocale: () => {},
  t: translations.en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem("docksidekeep-locale") as Locale | null;
    const initial: Locale = saved === "he" ? "he" : "en";
    setLocaleState(initial);
    document.documentElement.lang = initial;
    document.documentElement.dir = initial === "he" ? "rtl" : "ltr";
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem("docksidekeep-locale", next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "he" ? "rtl" : "ltr";
  };

  const toggleLocale = () => {
    setLocale(locale === "en" ? "he" : "en");
  };

  const dir = locale === "he" ? "rtl" : "ltr";
  const t = translations[locale];

  return (
    <LanguageContext.Provider
      value={{ locale, dir, setLocale, toggleLocale, t }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
