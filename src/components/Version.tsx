"use client";

import { Bug } from "lucide-react";
import { useTranslation } from "react-i18next";

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

interface VersionProps {
  isCollapsed?: boolean;
}

const VERSION = "0.8.1";
const GITHUB_REPO = "https://github.com/cfassoni/RecompPro-core";
const GITHUB_ISSUES = "https://github.com/cfassoni/RecompPro-core/issues";
const RELEASE_URL = `https://github.com/cfassoni/RecompPro-core/releases/tag/v${VERSION}`;

export default function Version({ isCollapsed = false }: VersionProps) {
  const { t } = useTranslation();

  if (isCollapsed) {
    return (
      <div className="flex items-center justify-center text-muted-foreground/60 text-xs">
        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          title={t("version.github")}
          aria-label={t("version.githubAria")}
          className="hover:text-foreground transition-colors inline-flex items-center justify-center p-1 rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
        >
          <GithubIcon className="h-4 w-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2.5 text-muted-foreground/60 text-xs">
      {/* GitHub Repository link */}
      <a
        href={GITHUB_REPO}
        target="_blank"
        rel="noopener noreferrer"
        title={t("version.github")}
        aria-label={t("version.githubAria")}
        className="hover:text-foreground transition-colors inline-flex items-center justify-center p-0.5 rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
      >
        <GithubIcon className="h-4 w-4" />
      </a>

      {/* Bug Tracker link */}
      <a
        href={GITHUB_ISSUES}
        target="_blank"
        rel="noopener noreferrer"
        title={t("version.bug")}
        aria-label={t("version.bugAria")}
        className="hover:text-foreground transition-colors inline-flex items-center justify-center p-0.5 rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
      >
        <Bug className="h-4 w-4" />
      </a>

      {/* Release Version link */}
      <a
        href={RELEASE_URL}
        target="_blank"
        rel="noopener noreferrer"
        title={t("version.release")}
        aria-label={t("version.releaseAria", { version: VERSION })}
        className="hover:text-foreground transition-colors inline-flex items-center gap-1 font-mono hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
      >
        <span>v{VERSION}</span>
      </a>
    </div>
  );
}
