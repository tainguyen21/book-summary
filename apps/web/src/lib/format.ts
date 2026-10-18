/**
 * Locale-aware date and size formatting shared across screens.
 * Every function takes an optional interface `locale`; without one it keeps
 * the original behaviour (English words, the browser's default `Intl` locale).
 */

import type { Locale } from "./i18n/locale";
import { formatMessages, intlLocales } from "./i18n/messages/common";

function parse(value: string): Date | undefined {
  const date = new Date(value);

  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).valueOf();
}

/** The `Intl` locale for an interface language; undefined means the browser default. */
function intlLocale(locale?: Locale): string | undefined {
  return locale ? intlLocales[locale] : undefined;
}

/** "Today", "Yesterday", or a short date such as "Oct 10". */
export function formatDay(value: string, locale?: Locale): string {
  const date = parse(value);

  if (!date) {
    return value;
  }

  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  const words = formatMessages[locale ?? "en"];

  if (days === 0) {
    return words.today;
  }

  if (days === 1) {
    return words.yesterday;
  }

  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  }).format(date);
}

export function formatTime(value: string, locale?: Locale): string {
  const date = parse(value);

  return date
    ? new Intl.DateTimeFormat(intlLocale(locale), { timeStyle: "short" }).format(date)
    : "";
}

export function formatDate(value: string, locale?: Locale): string {
  const date = parse(value);

  return date
    ? new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(date)
    : value;
}

/** "just now", "5 min ago", "3 h ago", or a day label for older times. */
export function formatRelative(value: string, locale?: Locale): string {
  const date = parse(value);

  if (!date) {
    return value;
  }

  const minutes = Math.round((Date.now() - date.valueOf()) / 60_000);
  const words = formatMessages[locale ?? "en"];

  if (minutes < 1) {
    return words.justNow;
  }

  if (minutes < 60) {
    return words.minutesAgo(minutes);
  }

  if (minutes < 24 * 60) {
    return words.hoursAgo(Math.round(minutes / 60));
  }

  return formatDay(value, locale);
}

export function formatFileSize(bytes: number, locale?: Locale): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  const megabytes = bytes / (1024 * 1024);
  const number = locale
    ? new Intl.NumberFormat(intlLocales[locale], {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(megabytes)
    : megabytes.toFixed(1);

  return `${number} MB`;
}

export function greeting(now = new Date(), locale?: Locale): string {
  const hour = now.getHours();
  const words = formatMessages[locale ?? "en"];

  if (hour < 12) {
    return words.goodMorning;
  }

  return hour < 18 ? words.goodAfternoon : words.goodEvening;
}
