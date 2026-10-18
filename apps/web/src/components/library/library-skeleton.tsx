"use client";

import { BookOpen } from "lucide-react";

import { useMessages } from "../../lib/i18n/messages";
import { libraryMessages } from "../../lib/i18n/messages/library";
import { Skeleton } from "../ui/loading";
import "../app-shell/app-shell.css";
import "./library.css";

/** Library dashboard placeholder in its final layout (shell + stats + rows). */
export function LibraryDashboardSkeleton() {
  const t = useMessages(libraryMessages);

  return (
    <div className="shell-content" aria-busy="true">
      <span className="visually-hidden" role="status">
        {t.loading}
      </span>
      <div className="lib-heading">
        <div>
          <Skeleton width={260} height={30} />
          <Skeleton width={200} height={14} className="lib-skeleton-gap" />
        </div>
      </div>
      <div className="lib-stats">
        {[0, 1, 2, 3].map((index) => (
          <div className="lib-stat" key={index}>
            <div>
              <Skeleton width={110} height={12} />
              <Skeleton width={48} height={28} className="lib-skeleton-gap" />
            </div>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-header">
          <Skeleton width={120} height={14} />
        </div>
        {[0, 1, 2, 3].map((index) => (
          <div className="lib-skeleton-row" key={index}>
            <Skeleton width={30} height={40} radius="3px 7px 7px 3px" />
            <div>
              <Skeleton width="45%" height={13} />
              <Skeleton width="28%" height={11} className="lib-skeleton-gap" />
            </div>
            <Skeleton width={84} height={22} radius={999} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Whole-page placeholder used while sign-in state resolves. */
export function LibrarySkeleton() {
  return (
    <div className="shell">
      <aside className="shell-side" aria-hidden="true">
        <div className="shell-brand-row">
          <span className="shell-brand">
            <span className="shell-mark">
              <BookOpen size={15} strokeWidth={2.2} />
            </span>
            Bookwise
          </span>
        </div>
        <Skeleton width="100%" height={40} radius={10} className="shell-upload" />
        <div className="shell-nav">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} width="100%" height={30} radius={8} />
          ))}
        </div>
      </aside>
      <main id="main" className="shell-main">
        <LibraryDashboardSkeleton />
      </main>
    </div>
  );
}
