import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { appName, githubUrl, releasesUrl } from "./shared";

/**
 * Shared layout config for both the docs layout and the home/landing layout.
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <span className="font-semibold">{appName}</span>
        </>
      ),
    },
    githubUrl,
    links: [
      {
        text: "Documentation",
        url: "/docs",
        active: "nested-url",
      },
      {
        text: "Download",
        url: releasesUrl,
        external: true,
      },
    ],
  };
}
