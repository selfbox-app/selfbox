import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Selfbox",
    },
    githubUrl: "https://github.com/selfbox-app/selfbox",
    links: [
      {
        text: "Website",
        url: "https://selfbox.app",
      },
    ],
  };
}
