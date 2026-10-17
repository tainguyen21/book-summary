import type { Metadata } from "next";

import { RequireAuth } from "../../../components/auth/require-auth";
import { BookDetailScreen } from "../../../components/book/book-detail-screen";
import { LibrarySkeleton } from "../../../components/library/library-skeleton";

export const metadata: Metadata = {
  title: "Book",
  robots: { index: false, follow: false },
};

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  return (
    <RequireAuth skeleton={<LibrarySkeleton />}>
      <BookDetailScreen bookId={bookId} />
    </RequireAuth>
  );
}
