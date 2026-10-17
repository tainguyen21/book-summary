import { Activity, CircleAlert, Clock3 } from "lucide-react";
import type { ReactNode } from "react";

import { presentStatus } from "../../lib/book-status";
import type { LibraryBook } from "../../lib/library-types";
import { Spinner } from "../ui/loading";

/** Four summary cards; the first shows the status mix as a donut chart. */
export function LibraryStats({ books }: { books: LibraryBook[] }) {
  const counts = { ready: 0, processing: 0, queued: 0, attention: 0 };
  let incompleteUploads = 0;

  for (const book of books) {
    counts[presentStatus(book).category] += 1;
    if (book.bookStatus === "pending_upload") {
      incompleteUploads += 1;
    }
  }

  const total = books.length;
  const percent = (value: number) => (total ? (value / total) * 100 : 0);
  const readyEnd = percent(counts.ready);
  const processingEnd = readyEnd + percent(counts.processing);
  const queuedEnd = processingEnd + percent(counts.queued);
  const donut = `conic-gradient(var(--color-accent) 0 ${readyEnd}%, var(--color-info) ${readyEnd}% ${processingEnd}%, var(--color-chart-queued) ${processingEnd}% ${queuedEnd}%, var(--color-chart-attention) ${queuedEnd}% 100%)`;
  const failed = counts.attention - incompleteUploads;

  return (
    <section className="lib-stats" aria-label="Library overview">
      <div className="lib-stat lib-stat-chart">
        <div>
          <h2>Summaries ready</h2>
          <p className="lib-stat-number">
            {counts.ready} <span>of {total}</span>
          </p>
          <ul className="lib-legend">
            <li><i style={{ background: "var(--color-accent)" }} />Ready</li>
            <li><i style={{ background: "var(--color-info)" }} />In progress</li>
            <li><i style={{ background: "var(--color-chart-queued)" }} />Queued</li>
            <li><i style={{ background: "var(--color-chart-attention)" }} />Attention</li>
          </ul>
        </div>
        <div
          className="lib-donut"
          style={{ background: donut }}
          role="img"
          aria-label={`${Math.round(readyEnd)}% of books have a summary ready`}
        >
          <span>{Math.round(readyEnd)}%</span>
        </div>
      </div>

      <StatCard
        tone="info"
        icon={
          counts.processing > 0 ? (
            <Spinner size="sm" />
          ) : (
            <Activity aria-hidden="true" size={15} />
          )
        }
        title="In progress"
        value={counts.processing}
        detail={counts.processing ? "Usually a few minutes" : "Nothing running"}
      />
      <StatCard
        tone="neutral"
        icon={<Clock3 aria-hidden="true" size={15} />}
        title="Queued"
        value={counts.queued}
        detail={counts.queued ? "Starts automatically" : "Queue is clear"}
      />
      <StatCard
        tone="danger"
        icon={<CircleAlert aria-hidden="true" size={15} />}
        title="Needs attention"
        value={counts.attention}
        detail={attentionDetail(incompleteUploads, failed)}
      />
    </section>
  );
}

function attentionDetail(incompleteUploads: number, failed: number): string {
  const parts: string[] = [];

  if (incompleteUploads) {
    parts.push(`${incompleteUploads} upload${incompleteUploads > 1 ? "s" : ""} didn’t finish`);
  }

  if (failed) {
    parts.push(`${failed} couldn’t be summarized`);
  }

  return parts.join(" · ") || "All good";
}

function StatCard({
  tone,
  icon,
  title,
  value,
  detail,
}: {
  tone: "info" | "neutral" | "danger";
  icon: ReactNode;
  title: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="lib-stat">
      <div>
        <h2>
          <span className={`lib-stat-icon tone-${tone}`}>
            {icon}
          </span>
          {title}
        </h2>
        <p className="lib-stat-number">{value}</p>
        <p className="lib-stat-detail">{detail}</p>
      </div>
    </div>
  );
}
