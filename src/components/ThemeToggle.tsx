"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Sun, Moon, Monitor, Check, ChevronDown } from "lucide-react";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";

interface ThemeToggleProps {
  variant?: "icon" | "full";
}

const THEME_OPTIONS: {
  value: ThemePreference;
  labelKey: string;
  icon: typeof Monitor;
}[] = [
  { value: "system", labelKey: "toolbar.themeSystem", icon: Monitor },
  { value: "light", labelKey: "toolbar.themeLight", icon: Sun },
  { value: "dark", labelKey: "toolbar.themeDark", icon: Moon },
];

export default function ThemeToggle({ variant = "icon" }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, mounted } = useTheme();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Return focus to button when closed
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (prevIsOpen.current && !isOpen) {
      buttonRef.current?.focus();
    }
    prevIsOpen.current = isOpen;
  }, [isOpen]);

  const toggleMenu = () => setIsOpen((prev) => !prev);

  const handleSelectTheme = (newTheme: ThemePreference) => {
    setTheme(newTheme);
    setIsOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) return;

    const activeIndex = THEME_OPTIONS.findIndex(
      (opt) => document.activeElement === itemRefs.current[THEME_OPTIONS.indexOf(opt)]
    );

    if (e.key === "Escape") {
      setIsOpen(false);
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      const nextIndex = (activeIndex + 1) % THEME_OPTIONS.length;
      itemRefs.current[nextIndex]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      const prevIndex = (activeIndex - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length;
      itemRefs.current[prevIndex]?.focus();
      e.preventDefault();
    } else if (e.key === "Tab") {
      if (e.shiftKey) {
        if (activeIndex === 0) {
          itemRefs.current[THEME_OPTIONS.length - 1]?.focus();
          e.preventDefault();
        }
      } else {
        if (activeIndex === THEME_OPTIONS.length - 1) {
          itemRefs.current[0]?.focus();
          e.preventDefault();
        }
      }
    }
  };

  const getThemeLabel = (pref: ThemePreference): string => {
    if (pref === "system") return t("toolbar.themeSystem");
    if (pref === "light") return t("toolbar.themeLight");
    return t("toolbar.themeDark");
  };

  const currentLabel = getThemeLabel(theme);

  const renderTriggerIcon = () => {
    if (resolvedTheme === "dark") {
      return <Moon className="h-5 w-5" aria-hidden="true" />;
    }
    return <Sun className="h-5 w-5" aria-hidden="true" />;
  };

  if (!mounted) {
    const defaultLabel = t("toolbar.themeSystem");
    const placeholderTitle = t("toolbar.currentTheme", {
      theme: defaultLabel,
      defaultValue: `Theme selector, current theme: ${defaultLabel}`,
    });

    if (variant === "icon") {
      return (
        <button
          type="button"
          aria-label={placeholderTitle}
          title={placeholderTitle}
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
        >
          <Sun className="h-5 w-5" aria-hidden="true" />
        </button>
      );
    }

    return (
      <button
        type="button"
        aria-label={placeholderTitle}
        title={placeholderTitle}
        className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex items-center gap-2">
          <Sun className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-medium">{defaultLabel}</span>
        </div>
        <ChevronDown className="h-4 w-4 opacity-70" />
      </button>
    );
  }

  const buttonTitle = t("toolbar.currentTheme", {
    theme: currentLabel,
    defaultValue: `Theme selector, current theme: ${currentLabel}`,
  });

  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      {variant === "icon" ? (
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleMenu}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={buttonTitle}
          title={buttonTitle}
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
        >
          {renderTriggerIcon()}
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleMenu}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={buttonTitle}
          title={buttonTitle}
          className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex items-center gap-2">
            {renderTriggerIcon()}
            <span className="text-sm font-medium">{currentLabel}</span>
          </div>
          <ChevronDown
            className={`h-4 w-4 opacity-70 transition-transform ${isOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      )}

      {/* Flyout Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-label={t("toolbar.themeOptions")}
          className="absolute right-0 mt-2 w-36 origin-top-right rounded-xl border border-border bg-card p-1.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150 z-50 focus:outline-hidden"
        >
          {THEME_OPTIONS.map((option, index) => {
            const Icon = option.icon;
            const isSelected = theme === option.value;
            const label = t(option.labelKey);

            return (
              <button
                key={option.value}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                role="menuitem"
                type="button"
                onClick={() => handleSelectTheme(option.value)}
                className={`flex items-center justify-between gap-2.5 w-full px-3 py-2 text-left text-sm rounded-lg transition-colors cursor-pointer focus-visible:outline-hidden ${
                  isSelected
                    ? "text-primary font-semibold bg-primary/5 focus-visible:bg-primary/10"
                    : "text-foreground hover:bg-muted focus-visible:bg-muted"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
