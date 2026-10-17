"use client";

import { useSearchParams } from "next/navigation";

import type { LibraryView } from "../app-shell/app-shell";
import { RequireAuth } from "../auth/require-auth";
import { LibraryScreen } from "./library-screen";
import { LibrarySkeleton } from "./library-skeleton";

const knownViews: LibraryView[] = [
  "all",
  "ready",
  "processing",
  "queued",
  "attention",
];

/** Reads the `?view=` filter so filtered library views are linkable. */
export function LibraryRoute() {
  const requested = useSearchParams().get("view") as LibraryView | null;
  const view = requested && knownViews.includes(requested) ? requested : "all";

  return (
    <RequireAuth skeleton={<LibrarySkeleton />}>
      <LibraryScreen view={view} />
    </RequireAuth>
  );
}
