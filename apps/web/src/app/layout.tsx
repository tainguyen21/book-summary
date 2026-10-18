import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import { BookwiseAuth0Provider } from "../components/auth/auth0-provider";
import { siteDescription, siteName, siteUrl } from "../lib/site";
import { READING_SETTINGS_BOOT_SCRIPT } from "../lib/reading-settings-boot";
import "./globals.css";

// Inter for UI, Instrument Serif for display accents, Source Serif for reading.
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin", "vietnamese"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — Private, cited book summaries`,
    template: `%s · ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  openGraph: {
    type: "website",
    siteName,
    url: "/",
    title: `${siteName} — Understand any book. Trust every line.`,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} — Understand any book. Trust every line.`,
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d0d" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${sourceSerif.variable}`}
      // The boot script sets reading-setting attributes before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: READING_SETTINGS_BOOT_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <BookwiseAuth0Provider>{children}</BookwiseAuth0Provider>
      </body>
    </html>
  );
}
