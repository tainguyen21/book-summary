import { presentStatus, type BookStatusSource } from "../../lib/book-status";
import { Spinner } from "../ui/loading";

export function BookStatusBadge({ source }: { source: BookStatusSource }) {
  const { label, tone, category } = presentStatus(source);

  return (
    <span className={`badge tone-${tone}`}>
      {category === "processing" ? (
        <Spinner size="sm" />
      ) : (
        <span className="badge-dot" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
