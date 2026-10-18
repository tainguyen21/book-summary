"use client";

import { BookOpen, CornerDownLeft, Library, MessageCircleQuestion, Search, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { categoryLabelsByLocale, presentStatus, type BookCategory } from "../../lib/book-status";
import type { LibraryBook } from "../../lib/library-types";
import { useLocale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { paletteMessages } from "../../lib/i18n/messages/palette";
import { shellMessages } from "../../lib/i18n/messages/shell";
import "./command-palette.css";

const MAX_BOOKS = 8;

interface Command {
  id: string;
  group: "books" | "actions" | "goTo";
  label: string;
  hint?: string;
  icon: ReactNode;
  run(): void;
}

/** Case- and accent-insensitive text for matching ("Tài" matches "tai"). */
function folded(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase();
}

function matches(text: string, query: string): boolean {
  const haystack = folded(text);
  return folded(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * ⌘K / Ctrl+K palette: jump to a book or library view, search inside books,
 * ask the library, or upload. A modal combobox; arrows move, Enter runs.
 */
export function CommandPalette({
  books,
  onClose,
  onUpload,
}: {
  books?: LibraryBook[];
  onClose(): void;
  onUpload(): void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const locale = useLocale();
  const t = useMessages(paletteMessages);
  const shell = useMessages(shellMessages);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const commands = useMemo(() => {
    const go = (href: string) => () => {
      onClose();
      router.push(href);
    };
    const trimmed = query.trim();
    const list: Command[] = [];

    if (trimmed.length >= 2) {
      list.push(
        {
          id: "search",
          group: "actions",
          label: t.searchInside(trimmed),
          icon: <Search aria-hidden="true" size={16} />,
          run: go(`/search?q=${encodeURIComponent(trimmed)}`),
        },
        {
          id: "ask",
          group: "actions",
          label: t.askLibrary(trimmed),
          hint: t.askHint,
          icon: <MessageCircleQuestion aria-hidden="true" size={16} />,
          run: go(`/search?ask=${encodeURIComponent(trimmed)}`),
        },
      );
    }

    for (const book of (books ?? [])
      .filter((candidate) => !trimmed || matches(`${candidate.title} ${candidate.filename}`, trimmed))
      .slice(0, MAX_BOOKS)) {
      list.push({
        id: `book-${book.id}`,
        group: "books",
        label: book.title || book.filename,
        hint: presentStatus(book, locale).label,
        icon: <BookOpen aria-hidden="true" size={16} />,
        run: go(`/books/${book.id}`),
      });
    }

    const categoryLabels = categoryLabelsByLocale[locale];
    const destinations: { id: string; label: string; href: string; icon: ReactNode }[] = [
      { id: "all", label: shell.allBooks, href: "/library", icon: <Library aria-hidden="true" size={16} /> },
      ...(Object.keys(categoryLabels) as BookCategory[]).map((view) => ({
        id: view,
        label: categoryLabels[view],
        href: `/library?view=${view}`,
        icon: <Library aria-hidden="true" size={16} />,
      })),
      { id: "search-page", label: shell.searchBooks, href: "/search", icon: <Search aria-hidden="true" size={16} /> },
    ];
    for (const destination of destinations) {
      if (!trimmed || matches(destination.label, trimmed)) {
        list.push({ ...destination, id: `go-${destination.id}`, group: "goTo", run: go(destination.href) });
      }
    }
    if (!trimmed || matches(shell.uploadBook, trimmed)) {
      list.push({
        id: "upload",
        group: "goTo",
        label: shell.uploadBook,
        icon: <Upload aria-hidden="true" size={16} />,
        run: () => {
          onClose();
          onUpload();
        },
      });
    }
    return list;
  }, [books, locale, onClose, onUpload, query, router, shell, t]);

  const activeIndex = Math.min(active, Math.max(commands.length - 1, 0));
  const activeCommand = commands[activeIndex];

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + commands.length) % Math.max(commands.length, 1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : commands.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      activeCommand?.run();
    }
  }

  let lastGroup: Command["group"] | undefined;

  return (
    <dialog
      ref={dialogRef}
      className="dialog palette"
      aria-label={shell.quickFind}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="palette-field">
        <Search aria-hidden="true" size={18} />
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeCommand ? `${listId}-${activeCommand.id}` : undefined}
          aria-label={t.inputLabel}
          placeholder={t.placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="palette-kbd">Esc</kbd>
      </div>

      <ul ref={listRef} id={listId} role="listbox" className="palette-list" aria-label={t.results}>
        {commands.map((command, index) => {
          const heading = command.group !== lastGroup ? command.group : undefined;
          lastGroup = command.group;
          return (
            <li key={command.id} role="presentation">
              {heading && (
                <p className="palette-group" aria-hidden="true">
                  {t.groups[heading]}
                </p>
              )}
              <div
                id={`${listId}-${command.id}`}
                role="option"
                aria-selected={index === activeIndex}
                data-index={index}
                className="palette-option"
                onMouseMove={() => setActive(index)}
                onClick={() => command.run()}
              >
                {command.icon}
                <span className="palette-label">{command.label}</span>
                {command.hint && <span className="palette-hint">{command.hint}</span>}
                {index === activeIndex && <CornerDownLeft aria-hidden="true" className="palette-enter" size={14} />}
              </div>
            </li>
          );
        })}
      </ul>
      {commands.length === 0 && (
        <p className="palette-empty" role="status">
          {t.empty}
        </p>
      )}
      <p className="palette-footer" aria-hidden="true">
        <kbd>↑</kbd>
        <kbd>↓</kbd> {t.toMove} · <kbd>Enter</kbd> {t.toOpen}
      </p>
    </dialog>
  );
}
