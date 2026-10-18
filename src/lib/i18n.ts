import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enTranslations from "../locales/en.json";
import ptTranslations from "../locales/pt.json";
import esTranslations from "../locales/es.json";

const COOKIE_NAME = "recomp_pro_lang";

// Cookie helper utilities
export function getLanguageCookie(): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${COOKIE_NAME}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(";").shift() || null;
  }
  return null;
}

export function setLanguageCookie(lang: string, days = 365): void {
  if (typeof document === "undefined") return;
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${COOKIE_NAME}=${lang};expires=${date.toUTCString()};path=/;SameSite=Lax${isSecure ? ";Secure" : ""}`;
}

import { resolveLanguage, getLocaleTag, type SupportedLanguage } from "./locale";

export { resolveLanguage, getLocaleTag };
export type { SupportedLanguage };

export function getActiveLocale(): string {
  return getLocaleTag(i18n.language);
}

// Detect client preferred language
export function detectLanguage(): SupportedLanguage {
  if (typeof window === "undefined") {
    return "en";
  }

  // 1. Check persistent cookie first
  const cookieLang = getLanguageCookie();

  // 2. Check browser navigator language
  const navLang =
    navigator.language ||
    (navigator.languages && navigator.languages[0]) ||
    "";

  return resolveLanguage(cookieLang, navLang);
}

const resources = {
  en: { translation: enTranslations },
  pt: { translation: ptTranslations },
  es: { translation: esTranslations },
};

const initialLang = typeof window !== "undefined" ? detectLanguage() : "en";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: initialLang,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    react: {
      useSuspense: false,
    },
  });

  if (typeof window !== "undefined") {
    i18n.on("languageChanged", (lng) => {
      setLanguageCookie(lng);
    });
  }
}

// Dynamic Date and Time Formatting Helpers
export function formatDate(date: Date | string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return "";
  let d: Date;
  if (typeof date === "string") {
    // Check if it is a simple YYYY-MM-DD date-only string
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split("-").map(Number);
      d = new Date(year, month - 1, day);
    } else {
      d = new Date(date);
    }
  } else {
    d = date;
  }

  if (isNaN(d.getTime())) return "";

  // Use active i18n language locale
  return d.toLocaleDateString(getActiveLocale(), options || {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";

  return d.toLocaleString(getActiveLocale(), options || {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Dynamic Locale-Aware Number Formatting Helpers
export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
  localeOverride?: string
): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  const locale = localeOverride || getActiveLocale();
  return new Intl.NumberFormat(locale, { useGrouping: "always", ...options }).format(value);
}


export function formatInteger(
  value: number | null | undefined,
  localeOverride?: string
): string {
  return formatNumber(value, { maximumFractionDigits: 0 }, localeOverride);
}

export function formatDecimal(
  value: number | null | undefined,
  fractionDigits = 1,
  localeOverride?: string
): string {
  return formatNumber(
    value,
    {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    },
    localeOverride
  );
}

export function formatDelta(
  val: number | null | undefined,
  fractionDigits = 1,
  unit = "",
  localeOverride?: string
): { formatted: string; isPositive: boolean; isNegative: boolean; isNeutral: boolean } | null {
  if (val === null || val === undefined || isNaN(val)) return null;
  const sign = val > 0 ? "+" : "";
  const formatted = `${sign}${formatDecimal(val, fractionDigits, localeOverride)}${unit}`;
  return {
    formatted,
    isPositive: val > 0,
    isNegative: val < 0,
    isNeutral: val === 0,
  };
}

export default i18n;

