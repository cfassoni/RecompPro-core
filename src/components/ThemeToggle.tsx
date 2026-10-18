"use client";

import { useTranslation } from "react-i18next";
import { Sun, Moon, Monitor } from "lucide-react";
import IconButton from "./IconButton";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";

interface ThemeToggleProps {
  variant?: "icon" | "full";
}

export default function ThemeToggle({ variant = "icon" }: ThemeToggleProps) {
  const { theme, cycleTheme, mounted } = useTheme();
  const { t } = useTranslation();

  const getNextTheme = (curr: ThemePreference): ThemePreference => {
    if (curr === "system") return "light";
    if (curr === "light") return "dark";
    return "system";
  };

  const nextTheme = getNextTheme(theme);

  const getThemeLabel = (pref: ThemePreference): string => {
    if (pref === "system") return t("toolbar.themeSystem");
    if (pref === "light") return t("toolbar.themeLight");
    return t("toolbar.themeDark");
  };

  const getSwitchLabel = (pref: ThemePreference): string => {
    if (pref === "system") return t("toolbar.switchToSystem");
    if (pref === "light") return t("toolbar.switchToLight");
    return t("toolbar.switchToDark");
  };

  const currentLabel = getThemeLabel(theme);
  const nextLabel = getThemeLabel(nextTheme);
  const nextActionLabel = getSwitchLabel(nextTheme);

  const titleText = t("toolbar.themeTooltip", {
    current: currentLabel,
    next: nextLabel,
    defaultValue: `Theme: ${currentLabel} (click to switch to ${nextLabel})`,
  });

  const renderIcon = (pref: ThemePreference) => {
    if (pref === "light") {
      return <Sun className="h-5 w-5" />;
    }
    if (pref === "dark") {
      return <Moon className="h-5 w-5" />;
    }
    return <Monitor className="h-5 w-5" />;
  };

  if (!mounted) {
    const defaultTitle = t("toolbar.themeTooltip", {
      current: t("toolbar.themeSystem"),
      next: t("toolbar.themeLight"),
      defaultValue: "Theme: System (click to switch to Light)",
    });

    if (variant === "icon") {
      return (
        <IconButton title={defaultTitle} aria-label={defaultTitle}>
          <Monitor className="h-5 w-5" />
        </IconButton>
      );
    }

    return (
      <button
        type="button"
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
        title={defaultTitle}
        aria-label={defaultTitle}
      >
        <Monitor className="h-5 w-5" />
        <span className="text-sm font-medium">{t("toolbar.switchToLight")}</span>
      </button>
    );
  }

  if (variant === "icon") {
    return (
      <IconButton
        onClick={cycleTheme}
        title={titleText}
        aria-label={titleText}
      >
        {renderIcon(theme)}
      </IconButton>
    );
  }

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
      title={titleText}
      aria-label={titleText}
    >
      {renderIcon(theme)}
      <span className="text-sm font-medium">{nextActionLabel}</span>
    </button>
  );
}
