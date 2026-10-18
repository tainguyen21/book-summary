"use client";

import { useSearchParams } from "next/navigation";

import { RequireAuth } from "../auth/require-auth";
import { LibrarySkeleton } from "../library/library-skeleton";
import { SearchScreen } from "./search-screen";

/** Reads `?q=` (search) and `?ask=` (prefilled library question), e.g. from the ⌘K palette. */
export function SearchRoute() {
  const params = useSearchParams();
  const query = params.get("q") ?? "";
  const question = params.get("ask") ?? "";

  return (
    <RequireAuth skeleton={<LibrarySkeleton />}>
      {/* Remount when the palette navigates here again with new values. */}
      <SearchScreen key={`${query}\n${question}`} initialQuery={query} initialQuestion={question} />
    </RequireAuth>
  );
}
