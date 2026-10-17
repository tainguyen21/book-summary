import type { Metadata } from "next";
import { Suspense } from "react";

import { LibraryRoute } from "../../components/library/library-route";
import { LibrarySkeleton } from "../../components/library/library-skeleton";

export const metadata: Metadata = {
  title: "Library",
  robots: { index: false, follow: false },
};

export default function LibraryPage() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryRoute />
    </Suspense>
  );
}
