"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { presentStatus } from "../../lib/book-status";
import { useLocale } from "../../lib/i18n/locale";
import { notificationMessages } from "../../lib/i18n/messages/notifications";
import type { LibraryBook } from "../../lib/library-types";
import { subscribeLiveStatus } from "../../lib/live-status";

const PREFERENCE_KEY = "bookwise.notify";
const listeners = new Set<() => void>();

export type NotificationSetting = "unsupported" | "blocked" | "off" | "on";

function currentSetting(): NotificationSetting {
  if (typeof Notification === "undefined") {
    return "unsupported";
  }
  if (Notification.permission === "denied") {
    return "blocked";
  }
  let opted = false;
  try {
    opted = window.localStorage.getItem(PREFERENCE_KEY) === "on";
  } catch {
    // Without storage the preference lasts only for this page view.
  }
  return opted && Notification.permission === "granted" ? "on" : "off";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setPreference(on: boolean) {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, on ? "on" : "off");
  } catch {
    // Ignore blocked storage.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Opt-in browser notifications when a book finishes summarizing while
 * Bookwise is in a background tab. Uses the live status stream, kept open
 * while hidden only when notifications are on.
 */
export function useReadyNotifications(books: LibraryBook[] | undefined) {
  const { getAccessTokenSilently } = useAuth0();
  const router = useRouter();
  const locale = useLocale();
  const setting = useSyncExternalStore(subscribe, currentSetting, () => "unsupported" as const);
  const titles = useRef(new Map<string, string>());
  const ready = useRef(new Set<string>());

  // Remember titles and which books were already ready, so only new completions notify.
  useEffect(() => {
    for (const book of books ?? []) {
      titles.current.set(book.id, book.title || book.filename);
      if (presentStatus(book).category === "ready") {
        ready.current.add(book.id);
      }
    }
  }, [books]);

  useEffect(() => {
    if (setting !== "on") {
      return;
    }
    const t = notificationMessages[locale];
    return subscribeLiveStatus(
      getAccessTokenSilently,
      (status) => {
        const isReady = presentStatus(status).category === "ready";
        const wasReady = ready.current.has(status.bookId);
        if (!isReady) {
          ready.current.delete(status.bookId);
          return;
        }
        ready.current.add(status.bookId);
        if (wasReady || !document.hidden) {
          return;
        }
        const title = titles.current.get(status.bookId);
        const notification = new Notification(t.readyTitle, {
          body: title ? t.readyBody(title) : t.readyBodyUntitled,
          tag: `bookwise-ready-${status.bookId}`,
        });
        notification.onclick = () => {
          window.focus();
          router.push(`/books/${status.bookId}`);
          notification.close();
        };
      },
      { whileHidden: true },
    );
  }, [getAccessTokenSilently, locale, router, setting]);

  const enable = useCallback(async () => {
    if (typeof Notification === "undefined") {
      return;
    }
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setPreference(permission === "granted");
  }, []);

  const disable = useCallback(() => setPreference(false), []);

  return { setting, enable, disable };
}
