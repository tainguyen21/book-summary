import { Check, FileText } from "lucide-react";

/**
 * Decorative, CSS-animated walkthrough of the product: upload, processing,
 * then a cited summary. It loops every 10s; reduced motion shows the final
 * summary frame only. Hidden from assistive tech because the page copy
 * already describes the same flow.
 */
export function HeroProductDemo() {
  return (
    <div className="lp-stage" aria-hidden="true">
      <div className="lp-window">
        <span className="lp-beam" />
        <div className="lp-window-inner">
          <div className="lp-window-bar">
            <i />
            <i />
            <i />
            <span>bookwise · library</span>
          </div>
          <div className="lp-app">
            <div className="lp-app-side">
              <p>Library</p>
              <DemoBook cover="cover-1" title="The Compound Habit" format="TXT" status="ready" active />
              <DemoBook cover="cover-2" title="Deep Work Notes" format="PDF" status="running" />
              <DemoBook cover="cover-3" title="Field Guide" format="EPUB" status="queued" />
            </div>
            <div className="lp-app-main">
              <div className="lp-phase lp-phase-upload">
                <div className="lp-demo-file">
                  <FileText size={18} />
                  the-compound-habit.txt · 8 KB
                </div>
                <div className="lp-demo-track">
                  <i />
                </div>
                <p className="lp-demo-note">Uploading privately…</p>
              </div>
              <div className="lp-phase lp-phase-process">
                <p className="lp-demo-title">The Compound Habit</p>
                <p className="lp-demo-meta">Summarizing · updates live</p>
                <ol className="lp-demo-steps">
                  {["Upload received", "Reading every chapter", "Writing a cited summary"].map(
                    (step) => (
                      <li key={step}>
                        <span>
                          <Check size={11} strokeWidth={4} />
                        </span>
                        {step}
                      </li>
                    ),
                  )}
                </ol>
              </div>
              <div className="lp-phase lp-phase-read">
                <p className="lp-demo-title">The Compound Habit</p>
                <p className="lp-demo-meta">1 min read · 3 sources</p>
                <p className="lp-demo-text">
                  <span>
                    Habits compound over time: small improvements, repeated
                    daily, produce remarkable results. Systems matter more
                    than goals — goals set direction, but systems are what
                    drive progress.
                  </span>
                </p>
                <div className="lp-demo-chips">
                  <span>
                    <i>1</i>Page 12
                  </span>
                  <span>
                    <i>2</i>Chapter 3
                  </span>
                  <span>
                    <i>3</i>Page 40
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoBook({
  cover,
  title,
  format,
  status,
  active = false,
}: {
  cover: string;
  title: string;
  format: string;
  status: "ready" | "running" | "queued";
  active?: boolean;
}) {
  return (
    <div className={active ? "lp-demo-book is-active" : "lp-demo-book"}>
      <span className={`book-cover book-cover-sm ${cover}`} />
      <div>
        <b>{title}</b>
        <small>{format}</small>
      </div>
      <span className={`lp-demo-status is-${status}`}>
        {status === "running" && <span className="spinner spinner-sm" />}
        {status === "ready" ? "Ready" : status === "running" ? "Running" : "Queued"}
      </span>
    </div>
  );
}
