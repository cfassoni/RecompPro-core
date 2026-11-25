"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  AlertCircle,
  ArrowRightLeft,
  Check,
  X,
  Lock,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getAuthToken, removeAuthToken } from "@/lib/api";
import LanguageSelector from "@/components/LanguageSelector";

interface ValidatedClientInfo {
  clientId: string;
  clientName: string;
  registrationType: "cimd" | "dcr";
  clientUri: string | null;
  logoUri: string | null;
}

interface ValidationResponse {
  valid: boolean;
  client?: ValidatedClientInfo;
  scopes?: string[];
  hasWriteScopes?: boolean;
  resource?: string | null;
  error?: string;
  error_description?: string;
}

export default function OAuthConsent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isCheckingAuth, enableMcpServer, checkAuth } = useAuth();

  const [validating, setValidating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ValidatedClientInfo | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [hasWriteScopes, setHasWriteScopes] = useState(false);
  const [readOnlyToggle, setReadOnlyToggle] = useState(false);

  const queryString = searchParams.toString();
  const currentAuthorizePath = `/oauth/authorize${queryString ? `?${queryString}` : ""}`;

  useEffect(() => {
    if (!isCheckingAuth && !isAuthenticated && enableMcpServer) {
      router.replace(`/login?redirect=${encodeURIComponent(currentAuthorizePath)}`);
    }
  }, [isCheckingAuth, isAuthenticated, enableMcpServer, router, currentAuthorizePath]);

  useEffect(() => {
    if (!enableMcpServer) {
      setValidating(false);
      return;
    }

    let cancelled = false;
    async function validateRequest() {
      setValidating(true);
      setError(null);
      try {
        const res = await fetch(
          `/oauth/authorize/validate${queryString ? `?${queryString}` : ""}`
        );
        const data = (await res.json()) as ValidationResponse;
        if (cancelled) return;
        if (!res.ok || !data.valid || !data.client) {
          setError(data.error_description || data.error || t("oauthConsent.invalidRequest"));
        } else {
          setClient(data.client);
          setScopes(data.scopes || ["recomp:read"]);
          setHasWriteScopes(Boolean(data.hasWriteScopes));
        }
      } catch {
        if (!cancelled) {
          setError(t("oauthConsent.invalidRequest"));
        }
      } finally {
        if (!cancelled) {
          setValidating(false);
        }
      }
    }

    validateRequest();
    return () => {
      cancelled = true;
    };
  }, [enableMcpServer, queryString, t]);

  const handleSwitchAccount = async () => {
    removeAuthToken();
    await checkAuth();
    router.replace(`/login?redirect=${encodeURIComponent(currentAuthorizePath)}`);
  };

  const handleDecision = async (approved: boolean) => {
    const token = getAuthToken();
    if (!token || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/oauth/authorize/decision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          approved,
          readOnly: readOnlyToggle,
          client_id: searchParams.get("client_id") || "",
          redirect_uri: searchParams.get("redirect_uri") || "",
          response_type: searchParams.get("response_type") || "",
          code_challenge: searchParams.get("code_challenge") || "",
          code_challenge_method: searchParams.get("code_challenge_method") || "",
          scope: searchParams.get("scope") || "",
          state: searchParams.get("state") || "",
          resource: searchParams.get("resource") || "",
        }),
      });

      const data = (await res.json()) as {
        redirectUrl?: string;
        error_description?: string;
        detail?: string;
      };

      if (!res.ok || !data.redirectUrl) {
        setError(data.error_description || data.detail || t("oauthConsent.decisionError"));
        setSubmitting(false);
        return;
      }

      window.location.assign(data.redirectUrl);
    } catch {
      setError(t("oauthConsent.decisionError"));
      setSubmitting(false);
    }
  };

  const displayedScopes = readOnlyToggle
    ? scopes.filter((s) => !s.endsWith(":write"))
    : scopes;

  const effectiveScopes = displayedScopes.length > 0 ? displayedScopes : ["recomp:read"];

  if (!enableMcpServer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 relative">
        <LanguageSelector variant="floating" />
        <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 shadow-xl text-center space-y-3">
          <ShieldAlert className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold text-foreground">{t("oauthConsent.disabledTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("oauthConsent.disabledDesc")}</p>
        </div>
      </div>
    );
  }

  if (isCheckingAuth || !isAuthenticated || validating) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("oauthConsent.loading")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 relative">
      <LanguageSelector variant="floating" />
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl p-8 shadow-xl space-y-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-primary to-indigo-500 rounded-b-full" />

        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              {t("oauthConsent.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("oauthConsent.subtitle")}
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-4 bg-destructive/10 border border-destructive/25 text-destructive rounded-xl text-sm">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {client && (
          <>
            {/* Client Card */}
            <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-base font-semibold text-foreground">
                  {client.clientName}
                </span>
                <span
                  className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                    client.registrationType === "cimd"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                  }`}
                >
                  {client.registrationType === "cimd"
                    ? t("oauthConsent.badgeCimd")
                    : t("oauthConsent.badgeDcr")}
                </span>
              </div>
              {client.clientUri && (
                <a
                  href={client.clientUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <span>{client.clientUri}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <p className="text-xs text-muted-foreground break-all font-mono">
                {client.clientId}
              </p>
            </div>

            {/* Signed-in Account Banner */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-background">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t("oauthConsent.signedInAs")}</p>
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.display_name ? `${user.display_name} (${user.email})` : user?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSwitchAccount}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors shrink-0 cursor-pointer disabled:opacity-50"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>{t("oauthConsent.switchAccount")}</span>
              </button>
            </div>

            {/* Requested Permissions */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">
                {t("oauthConsent.permissionsHeading")}
              </h2>
              <ul className="space-y-2">
                {effectiveScopes.map((scope) => {
                  const isWrite = scope.endsWith(":write");
                  return (
                    <li
                      key={scope}
                      className="flex items-start gap-2.5 text-sm p-2.5 rounded-lg border border-border bg-background/60"
                    >
                      <span
                        className={`mt-0.5 text-[11px] font-semibold px-2 py-0.5 rounded uppercase shrink-0 ${
                          isWrite
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {isWrite ? t("oauthConsent.modeWrite") : t("oauthConsent.modeRead")}
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {t(`oauthConsent.scopes.${scope.replace(":", "_")}`, {
                            defaultValue: scope,
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">{scope}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Read-Only Downgrade Toggle */}
            {hasWriteScopes && (
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-muted/30 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={readOnlyToggle}
                  onChange={(e) => setReadOnlyToggle(e.target.checked)}
                  disabled={submitting}
                  className="mt-1 h-4 w-4 accent-primary rounded"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    <span>{t("oauthConsent.readOnlyToggleLabel")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("oauthConsent.readOnlyToggleDesc")}
                  </p>
                </div>
              </label>
            )}

            {/* Security Exclusion Notice */}
            <p className="text-xs text-muted-foreground">
              {t("oauthConsent.securityExclusionNote")}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleDecision(false)}
                disabled={submitting}
                className="flex-1 py-2.5 px-4 rounded-xl border border-border bg-background hover:bg-muted text-foreground font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                <span>{t("oauthConsent.deny")}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDecision(true)}
                disabled={submitting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>{t("oauthConsent.approve")}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
