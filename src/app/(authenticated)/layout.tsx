"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import TopToolbar from "@/components/TopToolbar";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    user,
    setUser,
    isAuthenticated,
    isCheckingAuth,
    sharedLinksCount,
    logout,
  } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isCheckingAuth && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isCheckingAuth, isAuthenticated, router]);

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-sm text-muted-foreground font-medium">{t("common.loading")}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Top Toolbar */}
      <TopToolbar
        user={user}
        onLogout={logout}
        onEditProfile={() => router.push("/profile")}
        onNavigateToIntegrations={() => router.push("/profile?tab=integrations")}
        onUserUpdate={setUser}
        onMobileMenuToggle={() => setIsMobileMenuOpen((prev) => !prev)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          isMobileOpen={isMobileMenuOpen}
          onMobileClose={() => setIsMobileMenuOpen(false)}
          sharedLinksCount={sharedLinksCount}
        />

        {/* Main View Container */}
        <main className="flex-1 flex flex-col h-full overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
