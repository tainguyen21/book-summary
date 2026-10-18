"use client";

import type { GetAccessTokenSilently } from "./bookwise-api";
import { readEventStream } from "./event-stream";
import { bookProcessingStatusSchema, type BookProcessingStatus } from "./library-types";

type Listener = (status: BookProcessingStatus) => void;

const listeners = new Set<Listener>();
// Subscribers that need changes while the page is hidden (ready notifications).
const background = new Set<Listener>();
let tokenSource: GetAccessTokenSilently | undefined;
let running = false;
let abort: AbortController | undefined;

/**
 * Subscribes to pushed book status changes (`GET /v1/live/books`). All
 * subscribers share one connection, open while the page is visible (or while
 * a `whileHidden` subscriber needs it), and reopened when the server ends it
 * (about every 50 s) or after an error.
 */
export function subscribeLiveStatus(
  getToken: GetAccessTokenSilently,
  listener: Listener,
  options: { whileHidden?: boolean } = {},
): () => void {
  tokenSource = getToken;
  listeners.add(listener);
  if (options.whileHidden) {
    background.add(listener);
  }
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    void run();
  }
  return () => {
    listeners.delete(listener);
    background.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      abort?.abort();
    }
  };
}

const keepRunning = () => listeners.size > 0 && (!document.hidden || background.size > 0);

function onVisibilityChange() {
  if (!keepRunning()) {
    abort?.abort();
  } else {
    void run();
  }
}

async function run() {
  if (running) {
    return;
  }
  running = true;
  let failures = 0;
  try {
    while (keepRunning() && tokenSource) {
      abort = new AbortController();
      try {
        const token = await tokenSource();
        const { publicConfig } = await import("./config");
        const response = await fetch(new URL("/v1/live/books", publicConfig.NEXT_PUBLIC_API_URL), {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`live status ${response.status}`);
        }
        failures = 0;
        await readEventStream(response.body, (event, data) => {
          if (event !== "status") {
            return;
          }
          const parsed = bookProcessingStatusSchema.safeParse(data);
          if (parsed.success) {
            listeners.forEach((listener) => listener(parsed.data));
          }
        });
      } catch {
        if (abort.signal.aborted) {
          // Hidden page or no subscribers: the loop condition decides. A quick
          // resubscribe (React remounting an effect) keeps the loop going.
          continue;
        }
        // Back off after errors (5 s, 10 s, … up to 60 s); pages still poll slowly.
        failures += 1;
        await new Promise((resolve) => setTimeout(resolve, Math.min(5_000 * failures, 60_000)));
      }
    }
  } finally {
    running = false;
  }
}
