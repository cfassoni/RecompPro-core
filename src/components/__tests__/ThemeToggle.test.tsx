import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import ThemeToggle from "../ThemeToggle";
import { ThemeProvider } from "@/context/ThemeContext";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "toolbar.themeSystem": "System",
        "toolbar.themeLight": "Light",
        "toolbar.themeDark": "Dark",
        "toolbar.switchToSystem": "Switch to System Mode",
        "toolbar.switchToLight": "Switch to Light Mode",
        "toolbar.switchToDark": "Switch to Dark Mode",
      };

      if (key === "toolbar.themeTooltip") {
        return `Theme: ${options?.current} (click to switch to ${options?.next})`;
      }

      return translations[key] || key;
    },
  }),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("renders in system mode by default with Monitor icon and descriptive tooltip", () => {
    render(
      <ThemeProvider>
        <ThemeToggle variant="icon" />
      </ThemeProvider>
    );

    const button = screen.getByRole("button", {
      name: "Theme: System (click to switch to Light)",
    });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute(
      "title",
      "Theme: System (click to switch to Light)"
    );
  });

  it("cycles through System -> Light -> Dark -> System on consecutive clicks", () => {
    render(
      <ThemeProvider>
        <ThemeToggle variant="icon" />
      </ThemeProvider>
    );

    // Initial state: System -> Next: Light
    let button = screen.getByRole("button", {
      name: "Theme: System (click to switch to Light)",
    });
    expect(button).toBeInTheDocument();

    // 1st click: Switch to Light -> Next: Dark
    fireEvent.click(button);
    button = screen.getByRole("button", {
      name: "Theme: Light (click to switch to Dark)",
    });
    expect(button).toBeInTheDocument();
    expect(localStorage.getItem("recomp_pro_theme")).toBe("light");

    // 2nd click: Switch to Dark -> Next: System
    fireEvent.click(button);
    button = screen.getByRole("button", {
      name: "Theme: Dark (click to switch to System)",
    });
    expect(button).toBeInTheDocument();
    expect(localStorage.getItem("recomp_pro_theme")).toBe("dark");

    // 3rd click: Switch to System -> Next: Light
    fireEvent.click(button);
    button = screen.getByRole("button", {
      name: "Theme: System (click to switch to Light)",
    });
    expect(button).toBeInTheDocument();
    expect(localStorage.getItem("recomp_pro_theme")).toBe("system");
  });

  it("renders variant='full' displaying current icon and next action label", () => {
    render(
      <ThemeProvider>
        <ThemeToggle variant="full" />
      </ThemeProvider>
    );

    // Initial state: in System mode, button displays next action "Switch to Light Mode"
    let button = screen.getByRole("button", {
      name: "Theme: System (click to switch to Light)",
    });
    expect(button).toBeInTheDocument();
    expect(screen.getByText("Switch to Light Mode")).toBeInTheDocument();

    // Click to cycle to Light mode -> next action is "Switch to Dark Mode"
    fireEvent.click(button);
    button = screen.getByRole("button", {
      name: "Theme: Light (click to switch to Dark)",
    });
    expect(button).toBeInTheDocument();
    expect(screen.getByText("Switch to Dark Mode")).toBeInTheDocument();

    // Click to cycle to Dark mode -> next action is "Switch to System Mode"
    fireEvent.click(button);
    button = screen.getByRole("button", {
      name: "Theme: Dark (click to switch to System)",
    });
    expect(button).toBeInTheDocument();
    expect(screen.getByText("Switch to System Mode")).toBeInTheDocument();
  });

  it("works safely when rendered outside ThemeProvider with fallback defaults", () => {
    render(<ThemeToggle variant="icon" />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });
});
