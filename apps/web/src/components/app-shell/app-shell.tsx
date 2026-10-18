"use client";

import { BookOpen, Command, Library, Search, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  categoryLabels,
  presentStatus,
  type BookCategory,
} from "../../lib/book-status";
import type { LibraryBook } from "../../lib/library-types";
import { AccountMenu, CompactAccountMenu } from "../auth/account-menu";
import { UploadDialog } from "../library/upload-dialog";
import { CommandPalette } from "./command-palette";
import { UploadContext } from "./upload-context";
import "./app-shell.css";

export type LibraryView = "all" | BookCategory;

const views: { view: BookCategory; dot: string }[] = [
  { view: "ready", dot: "var(--color-accent)" },
  { view: "processing", dot: "var(--color-info)" },
  { view: "queued", dot: "var(--color-chart-queued)" },
  { view: "attention", dot: "var(--color-chart-attention)" },
];

export function libraryViewHref(view: LibraryView): string {
  return view === "all" ? "/library" : `/library?view=${view}`;
}

/**
 * Signed-in app frame: sidebar with library filters and counts, the shared
 * upload dialog, and the account block. Collapses to a top bar on phones.
 */
export function AppShell({
  books,
  activeView,
  searchActive = false,
  onUploaded,
  children,
}: {
  /** Library books for sidebar counts; undefined while loading. */
  books?: LibraryBook[];
  activeView?: LibraryView;
  /** True on the search page, so its nav item shows as current. */
  searchActive?: boolean;
  onUploaded?(): Promise<void> | void;
  children: ReactNode;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteOpenerRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // ⌘K on Mac, Ctrl+K elsewhere, from anywhere in the signed-in app.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        paletteOpenerRef.current = document.activeElement as HTMLElement | null;
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    const opener = paletteOpenerRef.current;
    requestAnimationFrame(() => {
      // Navigation may have replaced the opener; only refocus it if it is still on the page.
      if (opener?.isConnected) {
        opener.focus();
      }
    });
  }, []);
  const openUpload = useCallback(() => setUploadOpen(true), []);

  // On phones the filters scroll sideways; keep the active one in view.
  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLElement>(".is-active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeView]);
  const uploadContext = useMemo(
    () => ({ openUpload: () => setUploadOpen(true) }),
    [],
  );

  const counts = useMemo(() => {
    const result: Record<LibraryView, number> = {
      all: books?.length ?? 0,
      ready: 0,
      processing: 0,
      queued: 0,
      attention: 0,
    };

    for (const book of books ?? []) {
      result[presentStatus(book).category] += 1;
    }

    return result;
  }, [books]);

  return (
    <UploadContext.Provider value={uploadContext}>
      <div className="shell">
        <aside className="shell-side">
          <div className="shell-brand-row">
            <Link className="shell-brand" href="/library">
              <span className="shell-mark" aria-hidden="true">
                <BookOpen size={15} strokeWidth={2.2} />
              </span>
              Bookwise
            </Link>
            <div className="shell-mobile-actions">
              <button
                className="button button-ink icon-button button-sm"
                type="button"
                onClick={() => setUploadOpen(true)}
                aria-label="Upload book"
              >
                <Upload aria-hidden="true" size={16} />
              </button>
              <CompactAccountMenu />
            </div>
          </div>

          <button
            className="button button-ink shell-upload"
            type="button"
            onClick={() => setUploadOpen(true)}
          >
            <Upload aria-hidden="true" size={16} />
            Upload book
          </button>

          <button
            className="shell-jump"
            type="button"
            aria-keyshortcuts="Meta+K Control+K"
            onClick={(event) => {
              paletteOpenerRef.current = event.currentTarget;
              setPaletteOpen(true);
            }}
          >
            <Command aria-hidden="true" size={15} />
            Quick find
            <kbd>⌘K</kbd>
          </button>

          <nav ref={navRef} className="shell-nav" aria-label="Library">
            <NavItem
              href="/search"
              active={searchActive}
              icon={<Search aria-hidden="true" size={16} />}
              label="Search books"
            />
            <p className="shell-nav-heading">Library</p>
            <NavItem
              href={libraryViewHref("all")}
              active={activeView === "all"}
              count={books ? counts.all : undefined}
              icon={<Library aria-hidden="true" size={16} />}
              label="All books"
            />
            {views.map(({ view, dot }) => (
              <NavItem
                key={view}
                href={libraryViewHref(view)}
                active={activeView === view}
                count={books ? counts[view] : undefined}
                icon={<span className="shell-dot" style={{ background: dot }} aria-hidden="true" />}
                label={categoryLabels[view]}
              />
            ))}
          </nav>

          <div className="shell-privacy">
            <ShieldCheck aria-hidden="true" size={16} />
            <p>
              <b>Private library</b>
              Only your account can see these books.
            </p>
          </div>

          <AccountMenu />
        </aside>

        <main id="main" className="shell-main">
          {children}
        </main>
      </div>

      {paletteOpen && <CommandPalette books={books} onClose={closePalette} onUpload={openUpload} />}

      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onComplete={async () => {
            await onUploaded?.();
          }}
        />
      )}
    </UploadContext.Provider>
  );
}

function NavItem({
  href,
  active,
  count,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  count?: number;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      className={active ? "shell-nav-item is-active" : "shell-nav-item"}
      href={href}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && <span className="shell-count">{count}</span>}
    </Link>
  );
}
