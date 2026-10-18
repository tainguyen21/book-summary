import type { Metadata } from "next";

import { ActivityRoute } from "../../components/activity/activity-route";

export const metadata: Metadata = {
  title: "Activity",
  robots: { index: false, follow: false },
};

export default function ActivityPage() {
  return <ActivityRoute />;
}
