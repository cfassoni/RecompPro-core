import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import Version from "../Version";

const VERSION = "0.8.1";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version?: string }) => {
      const translations: Record<string, string> = {
        "version.github": "Support us on GitHub",
        "version.githubAria": "Open GitHub project (opens in new tab)",
        "version.bug": "Report an issue",
        "version.bugAria": "Open issue tracker (opens in new tab)",
        "version.release": "Recomp Pro releases",
      };
      if (key === "version.releaseAria") {
        return `Open release notes for v${options?.version} (opens in new tab)`;
      }
      return translations[key] || key;
    },
    i18n: {
      language: "en",
    },
  }),
}));

describe("Version", () => {
  it("renders all links in expanded mode in correct order with accessible labels and attributes", () => {
    render(<Version />);

    // Check GitHub link
    const githubLink = screen.getByLabelText("Open GitHub project (opens in new tab)");
    expect(githubLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute("href", "https://github.com/cfassoni/RecompPro-core");
    expect(githubLink).toHaveAttribute("target", "_blank");
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(githubLink).toHaveAttribute("title", "Support us on GitHub");

    // Check Bug link
    const bugLink = screen.getByLabelText("Open issue tracker (opens in new tab)");
    expect(bugLink).toBeInTheDocument();
    expect(bugLink).toHaveAttribute("href", "https://github.com/cfassoni/RecompPro-core/issues");
    expect(bugLink).toHaveAttribute("target", "_blank");
    expect(bugLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(bugLink).toHaveAttribute("title", "Report an issue");

    // Check Release Version link
    const releaseLink = screen.getByLabelText(`Open release notes for v${VERSION} (opens in new tab)`);
    expect(releaseLink).toBeInTheDocument();
    expect(releaseLink).toHaveAttribute("href", `https://github.com/cfassoni/RecompPro-core/releases/tag/v${VERSION}`);
    expect(releaseLink).toHaveAttribute("target", "_blank");
    expect(releaseLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(releaseLink).toHaveAttribute("title", "Recomp Pro releases");
    expect(screen.getByText(`v${VERSION}`)).toBeInTheDocument();
  });

  it("renders only GitHub icon link when isCollapsed is true", () => {
    render(<Version isCollapsed={true} />);

    // GitHub link should be present
    const githubLink = screen.getByLabelText("Open GitHub project (opens in new tab)");
    expect(githubLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute("href", "https://github.com/cfassoni/RecompPro-core");

    // Bug and version links should not be present
    expect(screen.queryByLabelText("Open issue tracker (opens in new tab)")).not.toBeInTheDocument();
    expect(screen.queryByText(`v${VERSION}`)).not.toBeInTheDocument();
  });
});
