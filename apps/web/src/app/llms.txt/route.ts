import { faqs, howItWorksSteps } from "../../components/landing/landing-content";
import { siteDescription, siteName, siteUrl } from "../../lib/site";

export const dynamic = "force-static";

/**
 * A plain description of Bookwise for AI assistants (llmstxt.org format),
 * built from the same copy as the landing page so the two never drift.
 */
export function GET() {
  const body = [
    `# ${siteName}`,
    "",
    `> ${siteDescription}`,
    "",
    "## How it works",
    "",
    ...howItWorksSteps.map((step, index) => `${index + 1}. ${step.title}: ${step.body}`),
    "",
    "## Questions",
    "",
    ...faqs.flatMap((faq) => [`### ${faq.question}`, "", faq.answer, ""]),
    "## Pages",
    "",
    `- [${siteName}](${siteUrl}/): ${siteDescription}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Crawlable for assistants, but never a search result in place of the page.
      "X-Robots-Tag": "noindex",
    },
  });
}
