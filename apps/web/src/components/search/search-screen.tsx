"use client";

import { BookOpenText, Search, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

import { useLocale } from "../../lib/i18n/locale";
import { useMessages } from "../../lib/i18n/messages";
import { searchMessages } from "../../lib/i18n/messages/search";
import {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  type SearchResult,
} from "../../lib/search-types";
import { AppShell } from "../app-shell/app-shell";
import { locationLabel } from "../book/book-summary-reader";
import { AskPanel } from "../ask/ask-panel";
import { PassageDialog } from "../book/passage-dialog";
import { StateCallout } from "../layout/state-callout";
import { useLibraryBooks } from "../library/use-library-books";
import { Skeleton } from "../ui/loading";
import { MIN_QUERY_LENGTH, useBookSearch } from "./use-book-search";
import "./search.css";

/** Turns ts_headline markers into <mark>, never interpreting book text as HTML. */
function highlighted(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    const start = rest.indexOf(HIGHLIGHT_START);
    if (start === -1) {
      parts.push(rest);
      break;
    }
    const end = rest.indexOf(HIGHLIGHT_END, start);
    parts.push(rest.slice(0, start));
    parts.push(<mark key={key++}>{rest.slice(start + 1, end === -1 ? undefined : end)}</mark>);
    rest = end === -1 ? "" : rest.slice(end + 1);
  }
  return parts;
}

function groupByBook(results: SearchResult[]): { bookId: string; title: string; hits: SearchResult[] }[] {
  const groups = new Map<string, { bookId: string; title: string; hits: SearchResult[] }>();
  for (const result of results) {
    const group = groups.get(result.bookId) ?? { bookId: result.bookId, title: result.bookTitle, hits: [] };
    group.hits.push(result);
    groups.set(result.bookId, group);
  }
  return [...groups.values()];
}

/** Search inside the signed-in owner's books, by keyword and by meaning. */
export function SearchScreen({
  initialQuery = "",
  initialQuestion = "",
}: {
  initialQuery?: string;
  initialQuestion?: string;
}) {
  const library = useLibraryBooks();
  const [query, setQuery] = useState(initialQuery.slice(0, 200));
  const state = useBookSearch(query);
  const [passage, setPassage] = useState<{ bookId: string; spanId: string; label: string }>();
  const openerRef = useRef<HTMLElement | null>(null);
  const locale = useLocale();
  const t = useMessages(searchMessages);
  const labelFor = (location: Record<string, unknown>) => locationLabel(location, locale);

  return (
    <AppShell
      books={library.state.kind === "ready" ? library.state.books : undefined}
      onUploaded={library.refresh}
      searchActive
    >
      <div className="shell-content search-page">
        <header className="search-heading">
          <h1>{t.title}</h1>
          <p>{t.lede}</p>
        </header>

        <form className="search-field" role="search" onSubmit={(event) => event.preventDefault()}>
          <Search aria-hidden="true" size={18} />
          <label className="visually-hidden" htmlFor="book-search">
            {t.fieldLabel}
          </label>
          <input
            id="book-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.placeholder}
            maxLength={200}
            autoFocus={!initialQuestion}
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label={t.clear}>
              <X aria-hidden="true" size={16} />
            </button>
          )}
        </form>

        <AskPanel
          askPath="/v1/ask"
          initialQuestion={initialQuestion}
          heading={t.askHeading}
          lede={t.askLede}
          placeholder={t.askPlaceholder}
          showBookTitles
          labelFor={labelFor}
          onViewInContext={(bookId, spanId, label, opener) => {
            openerRef.current = opener;
            setPassage({ bookId, spanId, label });
          }}
        />

        <div aria-live="polite" aria-busy={state.kind === "loading"}>
          {state.kind === "idle" && (
            <p className="search-hint">
              {t.hint(MIN_QUERY_LENGTH)}
            </p>
          )}
          {state.kind === "loading" && (
            <div className="search-skeleton">
              <span className="visually-hidden" role="status">{t.searching}</span>
              <Skeleton width="40%" height={16} />
              <Skeleton width="92%" height={14} />
              <Skeleton width="86%" height={14} />
            </div>
          )}
          {state.kind === "error" && (
            <StateCallout tone="danger" title={t.errorTitle} body={t.errorBody} />
          )}
          {state.kind === "ready" && (
            <>
              <p className="search-summary" role="status">
                {t.summary(state.response.results.length, state.query)}
                {state.response.mode === "keyword" &&
                  (state.response.keywordReason === "budget" ? t.keywordBudget : t.keywordUnavailable)}
              </p>
              {state.response.results.length === 0 ? (
                <div className="search-empty">
                  <SearchX aria-hidden="true" size={22} />
                  <p>{t.empty}</p>
                </div>
              ) : (
                groupByBook(state.response.results).map((group) => (
                  <section className="search-group" key={group.bookId} aria-labelledby={`group-${group.bookId}`}>
                    <h2 id={`group-${group.bookId}`}>
                      <Link href={`/books/${group.bookId}`}>{group.title}</Link>
                    </h2>
                    <ol className="search-hits">
                      {group.hits.map((hit) => {
                        const label = labelFor(hit.location);
                        return (
                          <li key={hit.sourceSpanId}>
                            <span className={`search-kind kind-${hit.kind}`}>
                              {hit.kind === "evidence" ? t.kindFact : t.kindPassage}
                            </span>
                            <p className="search-text">{highlighted(hit.text)}</p>
                            {hit.quote && <blockquote>“{hit.quote}”</blockquote>}
                            <div className="search-meta">
                              <span>{label}</span>
                              <button
                                type="button"
                                className="button button-line button-sm"
                                onClick={(event) => {
                                  openerRef.current = event.currentTarget;
                                  setPassage({ bookId: hit.bookId, spanId: hit.sourceSpanId, label });
                                }}
                              >
                                <BookOpenText aria-hidden="true" size={14} />
                                {t.viewPassage}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {passage && (
        <PassageDialog
          bookId={passage.bookId}
          sourceSpanId={passage.spanId}
          label={passage.label}
          onClose={() => {
            setPassage(undefined);
            const opener = openerRef.current;
            requestAnimationFrame(() => opener?.focus());
          }}
        />
      )}
    </AppShell>
  );
}
