/**
 * Public site facts shared by metadata, robots, sitemap, and structured data.
 * The canonical origin defaults to the Auth0 redirect URI, which is already
 * configured as the app's public origin in every environment.
 */
export const siteName = "Bookwise";

export const siteDescription =
  "Upload a PDF, EPUB, DOCX, or TXT and get a clear, private book summary where every point is cited back to the page or chapter it came from.";

export const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_AUTH0_REDIRECT_URI ??
    "http://localhost:3000",
).origin;
