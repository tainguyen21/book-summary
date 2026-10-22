"use client";

import Link from "next/link";

import { useMessages } from "../../lib/i18n/messages";
import { notFoundMessages } from "../../lib/i18n/messages/not-found";

/** A short explanation with ways back into the app. */
export function NotFoundContent() {
  const t = useMessages(notFoundMessages);

  return (
    <main id="main" className="not-found">
      <p className="not-found-eyebrow">{t.eyebrow}</p>
      <h1>{t.title}</h1>
      <p>{t.body}</p>
      <div className="not-found-actions">
        <Link className="button button-ink" href="/">
          {t.home}
        </Link>
        <Link className="button button-line" href="/library">
          {t.library}
        </Link>
      </div>
    </main>
  );
}
