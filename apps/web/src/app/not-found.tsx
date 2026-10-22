import type { Metadata } from "next";

import { NotFoundContent } from "../components/not-found/not-found-content";

// Next.js already marks not-found responses noindex.
export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return <NotFoundContent />;
}
