import type { MetadataRoute } from "next";

import { landingUpdatedAt, siteUrl } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}/`,
      lastModified: landingUpdatedAt,
    },
  ];
}
