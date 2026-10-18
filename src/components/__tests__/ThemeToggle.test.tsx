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
        "toolbar.themeOptions": "Theme options",
      };

      if (key === "toolbar.currentTheme") {
        return `Theme selector, current theme: ${options?.theme}`;
      }

      return translations[key] || key;
    },
  }),
}));

describe("ThemeToggle", () => {
  let mediaQueryMatches = false;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    mediaQueryMatches = false;

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return mediaQueryMatches;
        },
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

  it("renders trigger button with system theme and shows Sun icon when OS is light", () => {
    mediaQueryMatches = false;

    render(
      <ThemeProvider>
        <ThemeToggle variant="icon" />
      </ThemeProvider>
    );

    const button = screen.getByRole("button", {
      name: "Theme selector, current theme: System",
    });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-haspopup", "menu");

    // Shows Sun icon because OS is light
    expect(button.querySelector(".lucide-sun")).toBeInTheDocument();
  });

  it("renders trigger button with Moon icon when OS is dark in system mode", () => {
    mediaQueryMatches = true;

    render(
      <ThemeProvider>
        <ThemeToggle variant="icon" />
      </ThemeProvider>
    );

    const button = screen.getByRole("button", {
      name: "Theme selector, current theme: System",
    });
    expect(button).toBeInTheDocument();

    // Shows Moon icon because OS is dark
    expect(button.querySelector(".lucide-moon")).toBeInTheDocument();
  });

  it("opens menu on click and lists options in order: System (top), Light, Dark", () => {
    render(
      <ThemeProvider>
        <ThemeToggle variant="icon" />
      </ThemeProvider>
    );

    const trigger = screen.getByRole("button", {
      name: "Theme selector, current theme: System",
    });

    // Menu is closed initially
    expect(screen.queryByRole("menu", { name: "Theme options" })).not.toBeInTheDocument();

    // Click trigger to open menu
    fireEvent.click(trigger);

    const menu = screen.getByRole("menu", { name: "Theme options" });
    expect(menu).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems).toHaveLength(3);
    expect(menuItems[0]).toHaveTextContent("System");
    expect(menuItems[0].querySelector(".lucide-monitor")).toBeInTheDocument();

    expect(menuItems[1]).toHaveTextContent("Light");
    expect(menuItems[1].querySelector(".lucide-sun")).toBeInTheDocument();

    expect(menuItems[2]).toHaveTextContent("Dark");
    expect(menuItems[2].querySelector(".lucide-moon")).toBeInTheDocument();
  });

  it("selects an option, updates theme and closes the menu", () => {
    render(
      <ThemeProvider>
        <ThemeToggle variant="icon" />
      </ThemeProvider>
    );

    const trigger = screen.getByRole("button", {
      name: "Theme selector, current theme: System",
    });
    fireEvent.click(trigger);

    // Click Dark mode
    const darkOption = screen.getByRole("menuitem", { name: /Dark/i });
    fireEvent.click(darkOption);

    // Menu should be closed
    expect(screen.queryByRole("menu", { name: "Theme options" })).not.toBeInTheDocument();

    // Trigger should reflect new theme
    const updatedTrigger = screen.getByRole("button", {
      name: "Theme selector, current theme: Dark",
    });
    expect(updatedTrigger).toBeInTheDocument();
    expect(updatedTrigger.querySelector(".lucide-moon")).toBeInTheDocument();
    expect(localStorage.getItem("recomp_pro_theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("closes on Escape key and returns focus to trigger button", () => {
    render(
      <ThemeProvider>
        <ThemeToggle variant="icon" />
      </ThemeProvider>
    );

    const trigger = screen.getByRole("button", {
      name: "Theme selector, current theme: System",
    });
    fireEvent.click(trigger);

    const menu = screen.getByRole("menu", { name: "Theme options" });
    expect(menu).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Theme options" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("renders variant='full' displaying current active icon, label, and chevron", () => {
    render(
      <ThemeProvider>
        <ThemeToggle variant="full" />
      </ThemeProvider>
    );

    const trigger = screen.getByRole("button", {
      name: "Theme selector, current theme: System",
    });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(trigger.querySelector(".lucide-sun")).toBeInTheDocument();

    // Click and select Dark
    fireEvent.click(trigger);
    const darkOption = screen.getByRole("menuitem", { name: /Dark/i });
    fireEvent.click(darkOption);

    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(trigger.querySelector(".lucide-moon")).toBeInTheDocument();
    expect(localStorage.getItem("recomp_pro_theme")).toBe("dark");
  });

  it("works safely when rendered outside ThemeProvider with fallback defaults", () => {
    render(<ThemeToggle variant="icon" />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });
});
