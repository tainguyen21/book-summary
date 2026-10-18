"use client";

import { useLocale, type Locale } from "./locale";

/**
 * One area's interface text in both languages. The Vietnamese set must have
 * exactly the English shape, so a missing or extra string is a type error.
 * Values are strings, or functions for text with numbers or names in it.
 */
export function defineMessages<T extends Record<string, unknown>>(
  en: T,
  vi: NoInfer<T>,
): Record<Locale, T> {
  return { en, vi };
}

/** The current language's text for an area defined with `defineMessages`. */
export function useMessages<T>(messages: Record<Locale, T>): T {
  return messages[useLocale()];
}
