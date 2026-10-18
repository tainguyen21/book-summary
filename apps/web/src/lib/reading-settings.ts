"use client";

import { useSyncExternalStore } from "react";

import { STORAGE_KEY } from "./reading-settings-boot";

export type ThemeChoice = "system" | "light" | "dark";
export type ReadingSize = "s" | "m" | "l" | "xl";
export type ReadingWidth = "narrow" | "normal" | "wide";

export interface ReadingSettings {
  theme: ThemeChoice;
  size: ReadingSize;
  width: ReadingWidth;
}

const DEFAULTS: ReadingSettings = { theme: "system", size: "m", width: "normal" };
const listeners = new Set<() => void>();
let cached: ReadingSettings | undefined;


function read(): ReadingSettings {
  if (cached) {
    return cached;
  }
  let stored: Partial<ReadingSettings> = {};
  try {
    stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<ReadingSettings>;
  } catch {
    // Blocked or corrupt storage: use the defaults.
  }
  cached = {
    theme: ["system", "light", "dark"].includes(stored.theme ?? "") ? stored.theme! : DEFAULTS.theme,
    size: ["s", "m", "l", "xl"].includes(stored.size ?? "") ? stored.size! : DEFAULTS.size,
    width: ["narrow", "normal", "wide"].includes(stored.width ?? "") ? stored.width! : DEFAULTS.width,
  };
  return cached;
}

function applyToDocument(settings: ReadingSettings) {
  const root = document.documentElement;
  if (settings.theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = settings.theme;
  }
  if (settings.size === "m") {
    delete root.dataset.readingSize;
  } else {
    root.dataset.readingSize = settings.size;
  }
  if (settings.width === "normal") {
    delete root.dataset.readingWidth;
  } else {
    root.dataset.readingWidth = settings.width;
  }
}

/** Saves one setting on this device and applies it at once. */
export function updateReadingSettings(change: Partial<ReadingSettings>) {
  cached = { ...read(), ...change };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Still applies for this page view.
  }
  applyToDocument(cached);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current reading settings; defaults during server rendering. */
export function useReadingSettings(): ReadingSettings {
  return useSyncExternalStore(subscribe, read, () => DEFAULTS);
}
