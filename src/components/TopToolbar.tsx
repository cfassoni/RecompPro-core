"use client";

import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import Logo from "./Logo";
import IconButton from "./IconButton";
import ThemeToggle from "./ThemeToggle";
import LanguageMenu from "./LanguageMenu";
import UserMenu from "./UserMenu";
import type { User } from "@/lib/api";

interface TopToolbarProps {
  user: User | null;
  onLogout: () => void;
  onEditProfile: () => void;
  onNavigateToIntegrations?: () => void;
  onUserUpdate?: (user: User) => void;
  onMobileMenuToggle: () => void;
}

export default function TopToolbar({
  user,
  onLogout,
  onEditProfile,
  onNavigateToIntegrations,
  onUserUpdate,
  onMobileMenuToggle,
}: TopToolbarProps) {
  const { t } = useTranslation();

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-border bg-card px-4 md:px-6 sticky top-0 z-40">
      {/* Left Area: Mobile menu toggle + Logo */}
      <div className="flex items-center gap-3">
        <IconButton
          onClick={onMobileMenuToggle}
          title={t("toolbar.toggleMenu")}
          aria-label={t("toolbar.toggleMenu")}
          className="flex md:hidden cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </IconButton>

        <Logo />
      </div>

      {/* Right Area: Controls (ordered from rightmost inward: User, Theme, Language) */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Language selector flyout */}
        <LanguageMenu user={user} onUserUpdate={onUserUpdate} />

        {/* Theme Toggle */}
        <ThemeToggle variant="icon" />

        {/* User profile avatar / dropdown */}
        <UserMenu
          user={user}
          onLogout={onLogout}
          onEditProfile={onEditProfile}
          onIntegrations={onNavigateToIntegrations}
        />
      </div>
    </header>
  );
}
