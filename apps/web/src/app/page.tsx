import { BookOpen, Lock } from "lucide-react";
import type { Metadata } from "next";

import { HeroProductDemo } from "../components/landing/hero-product-demo";
import { LandingAuthActions } from "../components/landing/landing-auth-actions";
import {
  bookKinds,
  faqs,
  howItWorksSteps,
} from "../components/landing/landing-content";
import { RevealOnScroll } from "../components/landing/reveal-on-scroll";
import { siteDescription, siteName, siteUrl } from "../lib/site";
import "./landing.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: siteName,
    url: siteUrl,
    description: siteDescription,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  },
];

const heroWords = ["Understand", "any", "book."];
const heroWordsSecondLine = ["every", "line."];

export default function LandingPage() {
  return (
    <div className="lp">
      <script
        type="application/ld+json"
        // Static, trusted data serialized at build time.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <RevealOnScroll />

      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <a className="lp-brand" href="#main" aria-label={`${siteName} home`}>
            <span className="lp-mark" aria-hidden="true">
              <BookOpen size={15} strokeWidth={2.2} />
            </span>
            {siteName}
          </a>
          <nav className="lp-links" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
          <LandingAuthActions placement="nav" />
        </div>
      </header>

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-aurora" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="lp-grid-bg" aria-hidden="true" />
          <div className="lp-wrap lp-hero-copy">
            <p className="lp-pill lp-fade">
              <b>New</b>Evidence-first summaries, privately
            </p>
            <h1 id="hero-title">
              {heroWords.map((word, index) => (
                <span key={word}>
                  <span className="lp-word" style={{ animationDelay: `${0.1 + index * 0.08}s` }}>
                    {word}
                  </span>{" "}
                </span>
              ))}
              <br />
              <span className="lp-word lp-gradient-text" style={{ animationDelay: "0.38s" }}>
                Trust
              </span>{" "}
              {heroWordsSecondLine.map((word, index) => (
                <span key={word}>
                  <span className="lp-word" style={{ animationDelay: `${0.46 + index * 0.08}s` }}>
                    {word}
                  </span>{" "}
                </span>
              ))}
            </h1>
            <p className="lp-lede lp-fade" style={{ animationDelay: "0.7s" }}>
              Drop in a PDF, EPUB, DOCX, or TXT. Bookwise reads it end to end
              and writes a clear summary where every point traces back to the
              page it came from.
            </p>
            <div className="lp-fade" style={{ animationDelay: "0.85s" }}>
              <LandingAuthActions placement="hero" />
            </div>
            <p className="lp-fine lp-fade" style={{ animationDelay: "1s" }}>
              Free to start · Sign in with email or Google
            </p>
            <HeroProductDemo />
          </div>
          <div className="lp-hero-fade" aria-hidden="true" />
        </section>

        <div className="lp-marquee-band" aria-label="Works with">
          <div className="lp-marquee">
            <ul className="lp-marquee-track">
              {[...bookKinds, ...bookKinds].map((kind, index) => (
                <li key={`${kind}-${index}`} aria-hidden={index >= bookKinds.length}>
                  {kind}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <section className="lp-section" id="features" aria-labelledby="features-title">
          <div className="lp-wrap">
            <div className="lp-section-head lp-reveal">
              <p className="lp-eyebrow">Features</p>
              <h2 id="features-title">
                Summaries you can <em>actually</em> check
              </h2>
              <p>
                Built for readers, students, and researchers who want the gist
                without losing the source.
              </p>
            </div>

            <div className="lp-bento">
              <article className="lp-card lp-card-wide lp-reveal">
                <h3>Every claim, cited</h3>
                <p>
                  Each summary links back to the exact page, chapter, or
                  paragraph it was drawn from.
                </p>
                <div className="lp-cite-demo" aria-hidden="true">
                  <p>
                    “Small improvements, repeated daily,{" "}
                    <mark>produce remarkable results</mark>.” <sup>[1]</sup>
                  </p>
                  <div className="lp-page">
                    <b>Page 12</b>
                    <i />
                    <i style={{ width: "80%" }} />
                    <i className="is-hl" />
                    <i style={{ width: "70%" }} />
                    <i />
                  </div>
                </div>
              </article>
              <article className="lp-card lp-reveal">
                <h3>Private by default</h3>
                <p>Only your account can see your books. Source text is never shared.</p>
                <span className="lp-lock" aria-hidden="true">
                  <Lock size={26} strokeWidth={1.8} />
                </span>
              </article>
              <article className="lp-card lp-reveal">
                <h3>Live progress</h3>
                <p>Upload and walk away — status updates on its own.</p>
                <ul className="lp-pipe" aria-hidden="true">
                  <li className="is-done">Upload received</li>
                  <li className="is-done">Text extracted</li>
                  <li className="is-active">Writing summary…</li>
                  <li>Ready to read</li>
                </ul>
              </article>
              <article className="lp-card lp-reveal">
                <h3>Bring any format</h3>
                <p>Up to 256 MB per file.</p>
                <ul className="lp-formats">
                  <li><i style={{ background: "#ef4444" }} />PDF</li>
                  <li><i style={{ background: "#8b5cf6" }} />EPUB</li>
                  <li><i style={{ background: "#3b82f6" }} />DOCX</li>
                  <li><i style={{ background: "#71717a" }} />TXT</li>
                </ul>
              </article>
              <article className="lp-card lp-card-dark lp-reveal">
                <h3>Reads beautifully</h3>
                <p>A calm reading view on desktop and phone, in light or dark.</p>
                <span className="lp-big-glyph" aria-hidden="true">
                  Aa
                </span>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section lp-section-tight" id="how-it-works" aria-labelledby="how-title">
          <div className="lp-wrap">
            <div className="lp-section-head lp-reveal">
              <p className="lp-eyebrow">How it works</p>
              <h2 id="how-title">
                From file to <em>insight</em> in three steps
              </h2>
            </div>
            <ol className="lp-how">
              {howItWorksSteps.map((step, index) => (
                <li className="lp-reveal" style={{ transitionDelay: `${index * 0.1}s` }} key={step.title}>
                  <span className="lp-how-number">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-section-tight" id="faq" aria-labelledby="faq-title">
          <div className="lp-wrap lp-faq">
            <div className="lp-section-head lp-reveal">
              <p className="lp-eyebrow">FAQ</p>
              <h2 id="faq-title">
                Questions, <em>answered</em>
              </h2>
            </div>
            <div className="lp-reveal">
              {faqs.map((faq, index) => (
                <details key={faq.question} open={index === 0}>
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-cta lp-reveal" aria-labelledby="cta-title">
          <div className="lp-aurora" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <h2 id="cta-title">
            Your next book,
            <br />
            <em>understood.</em>
          </h2>
          <p>Start a private library in under a minute.</p>
          <LandingAuthActions placement="cta" />
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <span>© {new Date().getFullYear()} {siteName}</span>
          <span>Evidence-first book summaries</span>
        </div>
      </footer>
    </div>
  );
}
