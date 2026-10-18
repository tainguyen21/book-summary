import type { Metadata } from "next";

import { ReviewRoute } from "../../components/flashcards/review-route";

export const metadata: Metadata = {
  title: "Review",
  robots: { index: false, follow: false },
};

export default function ReviewPage() {
  return <ReviewRoute />;
}
