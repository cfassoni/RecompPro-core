"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Login from "@/views/Login";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

function resolveSafeRedirect(raw: string | null): string {
  if (!raw) return "/dashboard";
  const trimmed = raw.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }
  return "/dashboard";
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = resolveSafeRedirect(searchParams.get("redirect"));
  const { isAuthenticated, isCheckingAuth, checkAuth } = useAuth();

  useEffect(() => {
    if (!isCheckingAuth && isAuthenticated) {
      router.replace(redirectTarget);
    }
  }, [isCheckingAuth, isAuthenticated, router, redirectTarget]);

  const handleLoginSuccess = async () => {
    await checkAuth();
    router.push(redirectTarget);
  };

  return (
    <Login
      onLoginSuccess={handleLoginSuccess}
      onGoToRegister={() => router.push("/register")}
      onGoToVerify={(email) =>
        router.push(`/verify-email${email ? `?email=${encodeURIComponent(email)}` : ""}`)
      }
      onGoToForgotPassword={(email) =>
        router.push(`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`)
      }
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
