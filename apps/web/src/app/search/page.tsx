import type { Metadata } from "next";

import { SearchRoute } from "../../components/search/search-route";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

export default function SearchPage() {
  return <SearchRoute />;
}
