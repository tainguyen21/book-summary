"use client";

import { RequireAuth } from "../auth/require-auth";
import { LibrarySkeleton } from "../library/library-skeleton";
import { SearchScreen } from "./search-screen";

export function SearchRoute() {
  return (
    <RequireAuth skeleton={<LibrarySkeleton />}>
      <SearchScreen />
    </RequireAuth>
  );
}
