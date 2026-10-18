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

  it("renders trigger button with system theme by default", () => {
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
    expect(menuItems[1]).toHaveTextContent("Light");
    expect(menuItems[2]).toHaveTextContent("Dark");
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
    expect(
      screen.getByRole("button", { name: "Theme selector, current theme: Dark" })
    ).toBeInTheDocument();
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

  it("renders variant='full' displaying current icon, label, and chevron", () => {
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

    // Click and select Light
    fireEvent.click(trigger);
    const lightOption = screen.getByRole("menuitem", { name: /Light/i });
    fireEvent.click(lightOption);

    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(localStorage.getItem("recomp_pro_theme")).toBe("light");
  });

  it("works safely when rendered outside ThemeProvider with fallback defaults", () => {
    render(<ThemeToggle variant="icon" />);

    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
  });
});
