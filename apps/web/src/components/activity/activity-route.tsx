"use client";

import { RequireAuth } from "../auth/require-auth";
import { LibrarySkeleton } from "../library/library-skeleton";
import { ActivityScreen } from "./activity-screen";

export function ActivityRoute() {
  return (
    <RequireAuth skeleton={<LibrarySkeleton />}>
      <ActivityScreen />
    </RequireAuth>
  );
}
