"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextType {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  cycleTheme: () => void;
  mounted: boolean;
}

const STORAGE_KEY = "recomp_pro_theme";
const LEGACY_STORAGE_KEY = "theme";

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") {
    return getSystemTheme();
  }
  return pref;
}

function applyHtmlClass(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  // Initialize theme from storage (with legacy migration) on mount
  useEffect(() => {
    let initialPref: ThemePreference = "system";

    try {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "system" || stored === "light" || stored === "dark") {
          initialPref = stored;
        } else {
          // Check for legacy unnamespaced key
          const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy === "light" || legacy === "dark") {
            initialPref = legacy;
            localStorage.setItem(STORAGE_KEY, legacy);
          }
          // Remove legacy key in all cases to sanitize client storage
          if (legacy !== null) {
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          }
        }
      }
    } catch {
      // Ignore storage restrictions
    }

    const resolved = resolveTheme(initialPref);
    setThemeState(initialPref);
    setResolvedTheme(resolved);
    applyHtmlClass(resolved);
    setMounted(true);
  }, []);

  // Update HTML class and resolvedTheme when theme preference changes
  const applyThemePreference = useCallback((pref: ThemePreference) => {
    const resolved = resolveTheme(pref);
    setResolvedTheme(resolved);
    applyHtmlClass(resolved);
  }, []);

  // Listen for system theme changes when preference is "system"
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e?: MediaQueryListEvent | { matches: boolean }) => {
      if (theme === "system") {
        const isDark = e && typeof e.matches === "boolean" ? e.matches : mediaQuery.matches;
        const systemTheme = isDark ? "dark" : "light";
        setResolvedTheme(systemTheme);
        applyHtmlClass(systemTheme);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange as EventListener);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange as EventListener);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [theme]);

  // Synchronize across multiple browser tabs via storage event
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        const newPref = event.newValue as ThemePreference | null;
        if (newPref === "system" || newPref === "light" || newPref === "dark") {
          setThemeState(newPref);
          applyThemePreference(newPref);
        } else if (newPref === null) {
          // Cleared or reset
          setThemeState("system");
          applyThemePreference("system");
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [applyThemePreference]);

  const setTheme = useCallback(
    (newTheme: ThemePreference) => {
      setThemeState(newTheme);
      applyThemePreference(newTheme);

      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY, newTheme);
        }
      } catch {
        // Ignore storage write restrictions
      }
    },
    [applyThemePreference]
  );

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      let next: ThemePreference = "system";
      if (current === "system") {
        next = "light";
      } else if (current === "light") {
        next = "dark";
      } else {
        next = "system";
      }

      applyThemePreference(next);

      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_KEY, next);
        }
      } catch {
        // Ignore storage write restrictions
      }

      return next;
    });
  }, [applyThemePreference]);

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      cycleTheme,
      mounted,
    }),
    [theme, resolvedTheme, setTheme, cycleTheme, mounted]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: "system",
      resolvedTheme: "light",
      setTheme: () => {},
      cycleTheme: () => {},
      mounted: true,
    };
  }
  return context;
}
