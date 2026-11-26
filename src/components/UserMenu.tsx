"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "@/lib/api";

interface UserMenuProps {
  user: User | null;
  onLogout: () => void;
  onEditProfile: () => void;
  onIntegrations?: () => void;
  onAiAssistants?: () => void;
}

export default function UserMenu({
  user,
  onLogout,
  onEditProfile,
  onIntegrations,
  onAiAssistants,
}: UserMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const editProfileRef = useRef<HTMLButtonElement>(null);
  const integrationsRef = useRef<HTMLButtonElement>(null);
  const aiAssistantsRef = useRef<HTMLButtonElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle focus return when closed
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (prevIsOpen.current && !isOpen) {
      buttonRef.current?.focus();
    }
    prevIsOpen.current = isOpen;
  }, [isOpen]);

  const toggleMenu = () => setIsOpen((prev) => !prev);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) return;

    const menuItems = [
      editProfileRef.current,
      integrationsRef.current,
      aiAssistantsRef.current,
      logoutRef.current,
    ].filter((el): el is HTMLButtonElement => Boolean(el));

    if (e.key === "Escape") {
      setIsOpen(false);
      e.preventDefault();
    } else if (e.key === "ArrowDown" && menuItems.length > 0) {
      const idx = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      const nextIdx = idx >= 0 ? (idx + 1) % menuItems.length : 0;
      menuItems[nextIdx].focus();
      e.preventDefault();
    } else if (e.key === "ArrowUp" && menuItems.length > 0) {
      const idx = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      const prevIdx = idx >= 0 ? (idx - 1 + menuItems.length) % menuItems.length : menuItems.length - 1;
      menuItems[prevIdx].focus();
      e.preventDefault();
    } else if (e.key === "Tab" && menuItems.length > 0) {
      // Basic focus trapping for Tab
      const first = menuItems[0];
      const last = menuItems[menuItems.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    }
  };

  // Initials fallback
  const getInitials = () => {
    if (user?.display_name) {
      return user.display_name.slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "US";
  };

  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Trigger Avatar Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t("toolbar.userMenu")}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card hover:ring-2 hover:ring-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary transition-all cursor-pointer overflow-hidden"
      >
        {user?.profile_image_url ? (
          <img
            src={user.profile_image_url}
            alt={user.display_name || user.email}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
            {getInitials()}
          </div>
        )}
      </button>

      {/* Flyout Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-label={t("toolbar.userOptions")}
          className="absolute right-0 mt-2 w-56 origin-top-right rounded-xl border border-border bg-card p-1.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150 z-50 focus:outline-hidden"
        >
          {/* User Display Info (Read-Only) */}
          <div className="px-3 py-2 text-left">
            <p className="text-sm font-semibold truncate text-foreground leading-none mb-1">
              {user?.display_name || user?.email || "User"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email || "email@example.com"}
            </p>
          </div>

          <div className="h-[1px] bg-border my-1" />

          {/* Edit Profile */}
          <button
            ref={editProfileRef}
            role="menuitem"
            onClick={() => {
              onEditProfile();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm rounded-lg text-foreground hover:bg-muted transition-colors cursor-pointer focus-visible:bg-muted focus-visible:outline-hidden"
          >
            {t("toolbar.editProfile")}
          </button>

          {/* Integrations */}
          <button
            ref={integrationsRef}
            role="menuitem"
            onClick={() => {
              if (onIntegrations) {
                onIntegrations();
              }
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm rounded-lg text-foreground hover:bg-muted transition-colors cursor-pointer focus-visible:bg-muted focus-visible:outline-hidden"
          >
            {t("toolbar.integrations")}
          </button>

          {/* AI Assistants */}
          {onAiAssistants && (
            <button
              ref={aiAssistantsRef}
              role="menuitem"
              onClick={() => {
                onAiAssistants();
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm rounded-lg text-foreground hover:bg-muted transition-colors cursor-pointer focus-visible:bg-muted focus-visible:outline-hidden"
            >
              {t("toolbar.aiAssistants")}
            </button>
          )}

          <div className="h-[1px] bg-border my-1" />

          {/* Logout */}
          <button
            ref={logoutRef}
            role="menuitem"
            onClick={() => {
              onLogout();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm rounded-lg text-destructive hover:bg-destructive/10 transition-colors cursor-pointer focus-visible:bg-destructive/10 focus-visible:outline-hidden"
          >
            {t("toolbar.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
