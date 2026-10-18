import type { Metadata } from "next";
import { Suspense } from "react";

import { LibrarySkeleton } from "../../components/library/library-skeleton";
import { SearchRoute } from "../../components/search/search-route";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

export default function SearchPage() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <SearchRoute />
    </Suspense>
  );
}
