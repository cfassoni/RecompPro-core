"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { api, getAuthToken, removeAuthToken, type User } from "@/lib/api";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  isAuthenticated: boolean;
  isCheckingAuth: boolean;
  sharedLinksCount: number;
  setSharedLinksCount: React.Dispatch<React.SetStateAction<number>>;
  enableWipPages: boolean;
  enableMcpServer: boolean;
  checkAuth: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
  initialLang,
  enableWipPages = false,
  enableMcpServer = true,
}: {
  children: React.ReactNode;
  initialLang?: "en" | "pt" | "es";
  enableWipPages?: boolean;
  enableMcpServer?: boolean;
}) {
  const { i18n } = useTranslation();
  const router = useRouter();

  // Ensure initial language alignment with SSR on mount
  useEffect(() => {
    if (initialLang && i18n.language !== initialLang) {
      i18n.changeLanguage(initialLang);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [sharedLinksCount, setSharedLinksCount] = useState<number>(0);
  const [lastSyncedLang, setLastSyncedLang] = useState<string | null>(null);

  // Sync preferred language from user profile
  useEffect(() => {
    if (user?.preferred_language) {
      let lang = user.preferred_language.toLowerCase();
      if (lang.startsWith("pt")) lang = "pt";
      else if (lang.startsWith("es")) lang = "es";
      else lang = "en";

      if (lastSyncedLang !== lang) {
        i18n.changeLanguage(lang);
        setLastSyncedLang(lang);
      }
    } else if (!user) {
      if (lastSyncedLang !== null) {
        setLastSyncedLang(null);
      }
    }
  }, [user, lastSyncedLang, i18n]);

  const checkAuth = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setIsCheckingAuth(false);
      setIsAuthenticated(false);
      setUser(null);
      return;
    }

    try {
      const currentUser = await api.getMe();
      setUser(currentUser);
      setIsAuthenticated(true);

      const links = await api.getSharedLinks();
      const activeCount = links.filter(
        (l) => !l.expires_at || new Date(l.expires_at) > new Date()
      ).length;
      setSharedLinksCount(activeCount);
    } catch {
      removeAuthToken();
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  const logout = useCallback(() => {
    removeAuthToken();
    setIsAuthenticated(false);
    setUser(null);
    setLastSyncedLang(null);
    router.push("/login");
  }, [router]);

  useEffect(() => {
    checkAuth();

    const handleExpired = () => {
      setIsAuthenticated(false);
      setUser(null);
      router.push("/login");
    };

    window.addEventListener("auth-session-expired", handleExpired);
    return () => {
      window.removeEventListener("auth-session-expired", handleExpired);
    };
  }, [checkAuth, router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        isAuthenticated,
        isCheckingAuth,
        sharedLinksCount,
        setSharedLinksCount,
        enableWipPages,
        enableMcpServer,
        checkAuth,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
