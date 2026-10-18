import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { ThemeProvider, useTheme } from "../ThemeContext";

function TestConsumer() {
  const { theme, resolvedTheme, setTheme, cycleTheme, mounted } = useTheme();

  return (
    <div>
      <span data-testid="mounted">{mounted ? "yes" : "no"}</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button data-testid="btn-cycle" onClick={cycleTheme}>
        Cycle
      </button>
      <button data-testid="btn-set-dark" onClick={() => setTheme("dark")}>
        Set Dark
      </button>
      <button data-testid="btn-set-light" onClick={() => setTheme("light")}>
        Set Light
      </button>
      <button data-testid="btn-set-system" onClick={() => setTheme("system")}>
        Set System
      </button>
    </div>
  );
}

describe("ThemeContext", () => {
  let listeners: Record<string, ((e: unknown) => void)[]> = {};
  let mediaQueryMatches = false;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    listeners = {};
    mediaQueryMatches = false;

    // Mock matchMedia
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return mediaQueryMatches;
        },
        media: query,
        onchange: null,
        addListener: vi.fn((fn) => {
          listeners["change"] = listeners["change"] || [];
          listeners["change"].push(fn);
        }),
        removeListener: vi.fn((fn) => {
          listeners["change"] = (listeners["change"] || []).filter((l) => l !== fn);
        }),
        addEventListener: vi.fn((event, fn) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        }),
        removeEventListener: vi.fn((event, fn) => {
          listeners[event] = (listeners[event] || []).filter((l) => l !== fn);
        }),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to system theme and adapts to system light preference", () => {
    mediaQueryMatches = false; // System prefers light

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("defaults to system theme and adapts to system dark preference", () => {
    mediaQueryMatches = true; // System prefers dark

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("restores saved preference from recomp_pro_theme", () => {
    localStorage.setItem("recomp_pro_theme", "dark");

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("migrates legacy 'theme' key to 'recomp_pro_theme' and removes legacy key", () => {
    localStorage.setItem("theme", "dark");

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(localStorage.getItem("recomp_pro_theme")).toBe("dark");
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("cycles theme: system -> light -> dark -> system", () => {
    mediaQueryMatches = false;

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    const cycleBtn = screen.getByTestId("btn-cycle");

    // Initially system
    expect(screen.getByTestId("theme").textContent).toBe("system");

    // Click cycle -> light
    act(() => {
      cycleBtn.click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(localStorage.getItem("recomp_pro_theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Click cycle -> dark
    act(() => {
      cycleBtn.click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(localStorage.getItem("recomp_pro_theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Click cycle -> system
    act(() => {
      cycleBtn.click();
    });
    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(localStorage.getItem("recomp_pro_theme")).toBe("system");
  });

  it("updates DOM and localStorage when setTheme is called", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    act(() => {
      screen.getByTestId("btn-set-dark").click();
    });

    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("recomp_pro_theme")).toBe("dark");

    act(() => {
      screen.getByTestId("btn-set-light").click();
    });

    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("recomp_pro_theme")).toBe("light");
  });

  it("reacts in real-time to system preference changes when theme is system", () => {
    mediaQueryMatches = false;

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Simulate system changing to dark mode
    mediaQueryMatches = true;
    act(() => {
      (listeners["change"] || []).forEach((fn) => fn({ matches: true }));
    });

    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does not react to system preference changes when theme is explicit light", () => {
    mediaQueryMatches = false;

    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    act(() => {
      screen.getByTestId("btn-set-light").click();
    });

    mediaQueryMatches = true;
    act(() => {
      (listeners["change"] || []).forEach((fn) => fn({ matches: true }));
    });

    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("syncs theme change from another tab via storage event", () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme").textContent).toBe("system");

    // Simulate storage event from another tab
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "recomp_pro_theme",
          newValue: "dark",
        })
      );
    });

    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("returns safe fallback when useTheme is called outside ThemeProvider", () => {
    render(<TestConsumer />);

    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });
});
