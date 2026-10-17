import type { MetadataRoute } from "next";

import { siteUrl } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private, signed-in areas have nothing for crawlers.
      disallow: ["/library", "/books/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
