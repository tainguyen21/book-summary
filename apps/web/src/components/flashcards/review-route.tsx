"use client";

import { RequireAuth } from "../auth/require-auth";
import { LibrarySkeleton } from "../library/library-skeleton";
import { ReviewScreen } from "./review-screen";

export function ReviewRoute() {
  return (
    <RequireAuth skeleton={<LibrarySkeleton />}>
      <ReviewScreen />
    </RequireAuth>
  );
}
