"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  X,
  ChevronLeft,
  ChevronRight,
  Link2,
  UtensilsCrossed,
  Flame,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Version from "./Version";

interface SidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
  sharedLinksCount: number;
}

export default function Sidebar({
  isMobileOpen,
  onMobileClose,
  sharedLinksCount,
}: SidebarProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { enableWipPages } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const showWipPages = enableWipPages;

  const navItems = [
    { id: "dashboard", href: "/dashboard", icon: LayoutDashboard },
    { id: "biometrics", href: "/biometrics", icon: Activity },
    { id: "activities", href: "/activities", icon: Flame },
  ];

  const wipItems = [
    { id: "nutrition", href: "/nutrition", label: "Nutrition", icon: UtensilsCrossed },
  ];

  return (
    <>
      {/* Mobile Sidebar Overlay Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/55 backdrop-blur-xs"
            onClick={onMobileClose}
          />

          {/* Drawer content */}
          <div className="relative flex flex-col w-72 max-w-xs bg-card border-r border-border h-full p-6 shadow-xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between mb-8">
              <span className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                {t("sidebar.navigation")}
              </span>
              <button
                onClick={onMobileClose}
                className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted cursor-pointer"
                aria-label={t("sidebar.closeMenu")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation links */}
            <nav className="flex-1 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href === "/dashboard" && pathname === "/");
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={onMobileClose}
                    className={`flex items-center w-full gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{t(`sidebar.${item.id}`)}</span>
                  </Link>
                );
              })}

              {sharedLinksCount > 0 && (
                <Link
                  href="/shared-reports"
                  onClick={onMobileClose}
                  className={`flex items-center w-full gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    pathname === "/shared-reports"
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Link2 className="h-5 w-5 shrink-0" />
                  <span>{t("sidebar.sharedReports")}</span>
                </Link>
              )}

              {/* WIP Mockup routes (if enabled) */}
              {showWipPages && (
                <div className="pt-4 mt-4 border-t border-border/50">
                  <span className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 block">
                    {t("sidebar.previewsWip")}
                  </span>
                  {wipItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={onMobileClose}
                        className={`flex items-center w-full gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span>{item.label}</span>
                        <span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                          Mockup
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </nav>

            {/* Version Info */}
            <div className="border-t border-border pt-4 mt-auto">
              <Version />
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-card border-r border-border h-full transition-all duration-300 relative ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted border border-border bg-card shadow-xs absolute right-[-14px] top-4 cursor-pointer z-30 hidden md:block"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-1.5 mt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href === "/dashboard" && pathname === "/");
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center w-full gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                } ${isCollapsed ? "justify-center" : ""}`}
                title={isCollapsed ? t(`sidebar.${item.id}`) : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!isCollapsed && (
                  <span className="animate-in fade-in duration-200">{t(`sidebar.${item.id}`)}</span>
                )}
              </Link>
            );
          })}

          {sharedLinksCount > 0 && (
            <Link
              href="/shared-reports"
              className={`flex items-center w-full gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                pathname === "/shared-reports"
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              } ${isCollapsed ? "justify-center" : ""}`}
              title={isCollapsed ? t("sidebar.sharedReports") : undefined}
            >
              <Link2 className="h-5 w-5 shrink-0" />
              {!isCollapsed && (
                <span className="animate-in fade-in duration-200 text-left">
                  {t("sidebar.sharedReports")}
                </span>
              )}
            </Link>
          )}

          {/* WIP Mockup routes (if enabled) */}
          {showWipPages && (
            <div className={`pt-4 mt-4 border-t border-border/50 ${isCollapsed ? "space-y-2" : "space-y-1"}`}>
              {!isCollapsed && (
                <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 block">
                  {t("sidebar.previewsWip")}
                </span>
              )}
              {wipItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`flex items-center w-full gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    } ${isCollapsed ? "justify-center" : ""}`}
                    title={isCollapsed ? `${item.label} (Mockup)` : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!isCollapsed && (
                      <>
                        <span className="animate-in fade-in duration-200 text-left">{item.label}</span>
                        <span className="ml-auto text-[9px] uppercase font-bold tracking-wider px-1 py-0.2 rounded bg-muted text-muted-foreground border border-border">
                          WIP
                        </span>
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* Version Info */}
        <div className="p-4 border-t border-border mt-auto">
          <Version isCollapsed={isCollapsed} />
        </div>
      </aside>
    </>
  );
}
