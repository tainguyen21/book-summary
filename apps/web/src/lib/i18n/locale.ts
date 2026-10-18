"use client";

import { useEffect, useSyncExternalStore } from "react";

/** Interface languages. Book text keeps its own language whatever this is. */
export type Locale = "en" | "vi";

const STORAGE_KEY = "bookwise.locale";
const listeners = new Set<() => void>();
// Holds a choice made while storage is blocked.
let memory: Locale | undefined;

function storedLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "vi") {
      return stored;
    }
  } catch {
    // Storage can be blocked (private mode); fall back to the browser language.
  }
  return window.navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Remembers the choice on this device and updates every mounted screen. */
export function setLocale(locale: Locale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Still switch for this page view.
  }
  memory = locale;
  listeners.forEach((listener) => listener());
}

/**
 * The interface language. Server rendering and the first client render use
 * English, so hydration matches; the stored choice applies right after.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, () => memory ?? storedLocale(), () => "en");
}

/** Keeps `<html lang>` in step with the interface language (render once, in the app shell). */
export function useDocumentLanguage() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}
