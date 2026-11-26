"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  KeyRound,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  X,
  Loader2,
  Lock,
} from "lucide-react";
import {
  api,
  type CreatedMcpPatResponse,
  type McpOverviewResponse,
} from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import { formatDateTime, formatInteger } from "@/lib/i18n";

interface McpTabProps {
  enableMcpServer?: boolean;
}

type QuickClientKey = "claude" | "chatgpt" | "gemini" | "ide";

const DOMAIN_SCOPES: Array<{ scope: string; isWrite: boolean }> = [
  { scope: "profile:read", isWrite: false },
  { scope: "profile:write", isWrite: true },
  { scope: "biometrics:read", isWrite: false },
  { scope: "biometrics:write", isWrite: true },
  { scope: "workouts:read", isWrite: false },
  { scope: "workouts:write", isWrite: true },
  { scope: "integrations:read", isWrite: false },
  { scope: "integrations:write", isWrite: true },
  { scope: "shared_links:read", isWrite: false },
  { scope: "shared_links:write", isWrite: true },
];

export default function McpTab({ enableMcpServer = true }: McpTabProps) {
  const { t } = useTranslation();

  const [overview, setOverview] = useState<McpOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Endpoint, Bundles & Quick-Connect state
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [downloadingBundle, setDownloadingBundle] = useState<"antigravity" | "claude" | "chatgpt" | null>(null);
  const [selectedClient, setSelectedClient] = useState<QuickClientKey>("claude");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Create PAT modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patName, setPatName] = useState("");
  const [patAccessMode, setPatAccessMode] = useState<"read_only" | "read_write">("read_only");
  const [useCustomScopes, setUseCustomScopes] = useState(false);
  const [customScopes, setCustomScopes] = useState<string[]>(["biometrics:read"]);
  const [patExpiryDays, setPatExpiryDays] = useState<string>("90");
  const [isCreatingPat, setIsCreatingPat] = useState(false);
  const [createPatError, setCreatePatError] = useState<string | null>(null);

  // One-time secret reveal modal state
  const [createdToken, setCreatedToken] = useState<CreatedMcpPatResponse | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Revoke confirmation modal state
  const [revokeTarget, setRevokeTarget] = useState<{
    kind: "grant" | "pat";
    id: string;
    name: string;
  } | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  // Collapsible Audit Log card (defaults to collapsed per UI guidelines)
  const [isAuditExpanded, setIsAuditExpanded] = useState(false);

  const fetchOverview = useCallback(async (silent = false) => {
    if (!enableMcpServer) {
      setIsLoading(false);
      return;
    }

    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await api.getMcpOverview();
      setOverview(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "__LOAD_ERROR__";
      setFeedbackError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [enableMcpServer]);

  useEffect(() => {
    fetchOverview(false);
  }, [fetchOverview]);

  // Escape key dismissal for all active modals
  useEffect(() => {
    const hasOpenModal = showCreateModal || Boolean(createdToken) || Boolean(revokeTarget);
    if (!hasOpenModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (revokeTarget && !isRevoking) setRevokeTarget(null);
        else if (createdToken) {
          setCreatedToken(null);
          setCopiedSecret(false);
        } else if (showCreateModal && !isCreatingPat) {
          setShowCreateModal(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCreateModal, createdToken, revokeTarget, isCreatingPat, isRevoking]);

  const showTempSuccess = (msg: string) => {
    setFeedbackError(null);
    setFeedbackSuccess(msg);
    setTimeout(() => setFeedbackSuccess(null), 4000);
  };

  if (!enableMcpServer) {
    return (
      <div
        id="panel-mcp"
        role="tabpanel"
        aria-labelledby="tab-mcp"
        className="bg-card border border-border rounded-xl p-6 shadow-xs animate-in fade-in-50 duration-200"
      >
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <h3 className="text-sm font-semibold">{t("profile.mcp.disabledTitle")}</h3>
            <p className="text-xs opacity-90 mt-1">{t("profile.mcp.disabledDesc")}</p>
          </div>
        </div>
      </div>
    );
  }

  const endpointUrl =
    overview?.endpointUrl ||
    (typeof window !== "undefined" ? `${window.location.origin}/mcp` : "http://localhost:3000/mcp");

  const getSnippetForClient = (client: QuickClientKey): string => {
    if (client === "claude") {
      return JSON.stringify(
        {
          mcpServers: {
            "recomp-pro": {
              type: "http",
              url: endpointUrl,
            },
          },
        },
        null,
        2
      );
    }
    if (client === "chatgpt") {
      return `MCP Server URL: ${endpointUrl}\nAuthentication: OAuth 2.1 (PKCE S256)`;
    }
    if (client === "gemini") {
      return JSON.stringify(
        {
          mcpServers: {
            "recomp-pro": {
              httpUrl: endpointUrl,
            },
          },
        },
        null,
        2
      );
    }
    return JSON.stringify(
      {
        mcpServers: {
          "recomp-pro": {
            url: endpointUrl,
          },
        },
      },
      null,
      2
    );
  };

  const handleCopyEndpoint = async () => {
    const ok = await copyTextToClipboard(endpointUrl);
    if (ok) {
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
    }
  };

  const handleCopySnippet = async () => {
    const ok = await copyTextToClipboard(getSnippetForClient(selectedClient));
    if (ok) {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  const handleDownloadBundle = async (target: "antigravity" | "claude" | "chatgpt") => {
    if (downloadingBundle) return;
    setDownloadingBundle(target);
    setFeedbackError(null);
    try {
      const { blob, filename } = await api.downloadMcpBundle(target);
      if (typeof window !== "undefined" && typeof URL.createObjectURL === "function") {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("profile.mcp.bundles.downloadError");
      setFeedbackError(msg);
    } finally {
      setDownloadingBundle(null);
    }
  };

  const handleCopySecret = async () => {
    if (!createdToken?.token) return;
    const ok = await copyTextToClipboard(createdToken.token);
    if (ok) {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2500);
    }
  };

  const handleToggleCustomScope = (scope: string) => {
    setCustomScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreatePat = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = patName.trim();
    if (!trimmedName || isCreatingPat) return;

    setIsCreatingPat(true);
    setCreatePatError(null);
    try {
      const expiresInDays = patExpiryDays ? parseInt(patExpiryDays, 10) : null;
      const scopes = useCustomScopes && customScopes.length > 0 ? customScopes : undefined;
      const created = await api.createMcpToken({
        name: trimmedName,
        accessMode: patAccessMode,
        scopes,
        expiresInDays,
      });

      setShowCreateModal(false);
      setPatName("");
      setPatAccessMode("read_only");
      setUseCustomScopes(false);
      setCopiedSecret(false);
      setCreatedToken(created);
      await fetchOverview(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("profile.mcp.pats.modal.createError");
      setCreatePatError(msg);
    } finally {
      setIsCreatingPat(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget || isRevoking) return;
    setIsRevoking(true);
    setFeedbackError(null);
    try {
      if (revokeTarget.kind === "grant") {
        await api.revokeMcpGrant(revokeTarget.id);
        showTempSuccess(t("profile.mcp.grants.revokedSuccess"));
      } else {
        await api.revokeMcpToken(revokeTarget.id);
        showTempSuccess(t("profile.mcp.pats.revokedSuccess"));
      }
      setRevokeTarget(null);
      await fetchOverview(true);
    } catch (err: unknown) {
      const fallback =
        revokeTarget.kind === "grant"
          ? t("profile.mcp.grants.revokeError")
          : t("profile.mcp.pats.revokeError");
      setFeedbackError(err instanceof Error ? err.message : fallback);
      setRevokeTarget(null);
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div
      id="panel-mcp"
      role="tabpanel"
      aria-labelledby="tab-mcp"
      className="space-y-6 animate-in fade-in-50 duration-200"
    >
      {/* Header Banner Card */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">{t("profile.mcp.title")}</h3>
              <p className="text-xs text-muted-foreground">{t("profile.mcp.subtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fetchOverview(true)}
            disabled={isLoading || isRefreshing}
            title={t("profile.mcp.audit.refresh")}
            aria-label={t("profile.mcp.audit.refresh")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {feedbackSuccess && (
          <div className="flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{feedbackSuccess}</span>
          </div>
        )}

        {feedbackError && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {feedbackError === "__LOAD_ERROR__"
                ? t("profile.mcp.loadError")
                : feedbackError}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Endpoint URL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="mcp-endpoint-url"
                  className="text-sm font-medium text-foreground"
                >
                  {t("profile.mcp.endpointCard.label")}
                </label>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {t("profile.mcp.endpointCard.title")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("profile.mcp.endpointCard.desc")}
              </p>
              <div className="flex items-center gap-2">
                <input
                  id="mcp-endpoint-url"
                  type="text"
                  readOnly
                  value={endpointUrl}
                  className="flex-1 px-3 py-2 rounded-lg border border-input bg-muted/40 text-foreground text-xs font-mono select-all focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleCopyEndpoint}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium transition-colors cursor-pointer shrink-0"
                >
                  {copiedEndpoint ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span>{t("profile.mcp.copied")}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t("profile.mcp.copy")}</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("profile.mcp.endpointCard.oauthNote")}
              </p>
            </div>

            {/* One-Click Plugin Bundles (.zip) */}
            <div className="pt-4 border-t border-border space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {t("profile.mcp.bundles.title")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t("profile.mcp.bundles.desc")}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(["antigravity", "claude", "chatgpt"] as const).map((target) => {
                  const isDownloading = downloadingBundle === target;
                  return (
                    <button
                      key={target}
                      type="button"
                      disabled={Boolean(downloadingBundle)}
                      onClick={() => handleDownloadBundle(target)}
                      className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-border bg-background/60 hover:bg-muted/60 text-left transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-foreground">
                          {t(`profile.mcp.bundles.targets.${target}`)}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">
                          recomp-pro-{target}.zip
                        </div>
                      </div>
                      {isDownloading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                      ) : (
                        <Download className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick-Connect Client Snippets */}
            <div className="pt-4 border-t border-border space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {t("profile.mcp.quickConnect.title")}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {t("profile.mcp.quickConnect.desc")}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("profile.mcp.quickConnect.title")}>
                {(["claude", "chatgpt", "gemini", "ide"] as QuickClientKey[]).map((clientKey) => {
                  const active = selectedClient === clientKey;
                  return (
                    <button
                      key={clientKey}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setSelectedClient(clientKey);
                        setCopiedSnippet(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {t(`profile.mcp.quickConnect.clients.${clientKey}`)}
                    </button>
                  );
                })}
              </div>

              <div className="p-3.5 rounded-xl border border-border bg-background/60 space-y-2.5">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(`profile.mcp.quickConnect.instructions.${selectedClient}`)}
                </p>
                <div className="relative">
                  <pre className="p-3 pr-20 rounded-lg bg-muted/50 border border-border text-xs font-mono text-foreground overflow-x-auto">
                    {getSnippetForClient(selectedClient)}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopySnippet}
                    className="absolute top-2 right-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-card border border-border hover:bg-muted text-foreground text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    {copiedSnippet ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span>{t("profile.mcp.copied")}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>{t("profile.mcp.copy")}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Connected AI Applications (OAuth Grants) */}
      {!isLoading && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {t("profile.mcp.grants.title")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("profile.mcp.grants.desc")}
              </p>
            </div>
          </div>

          {!overview?.grants.length ? (
            <p className="text-xs text-muted-foreground py-2">
              {t("profile.mcp.grants.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              {overview.grants.map((grant) => (
                <div
                  key={grant.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-background/50"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">
                        {grant.clientName}
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {grant.registrationType === "cimd"
                          ? t("profile.mcp.grants.badgeCimd")
                          : t("profile.mcp.grants.badgeDcr")}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          grant.readOnly
                            ? "bg-primary/10 text-primary"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {grant.readOnly
                          ? t("profile.mcp.grants.badgeReadOnly")
                          : t("profile.mcp.grants.badgeReadWrite")}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {grant.scopes.map((scope) => (
                        <code
                          key={scope}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono"
                        >
                          {scope}
                        </code>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t("profile.mcp.grants.createdAt", {
                        date: formatDateTime(grant.createdAt),
                      })}{" "}
                      ·{" "}
                      {grant.lastUsedAt
                        ? t("profile.mcp.grants.lastUsed", {
                            date: formatDateTime(grant.lastUsedAt),
                          })
                        : t("profile.mcp.grants.neverUsed")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRevokeTarget({
                        kind: "grant",
                        id: grant.id,
                        name: grant.clientName,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-muted/80 transition-colors cursor-pointer self-start sm:self-center shrink-0"
                    title={t("profile.mcp.grants.revoke")}
                    aria-label={`${t("profile.mcp.grants.revoke")} ${grant.clientName}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{t("profile.mcp.grants.revoke")}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Personal Access Tokens (PATs) */}
      {!isLoading && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-border flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {t("profile.mcp.pats.title")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("profile.mcp.pats.desc")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setCreatePatError(null);
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t("profile.mcp.pats.createBtn")}</span>
            </button>
          </div>

          {!overview?.tokens.length ? (
            <p className="text-xs text-muted-foreground py-2">
              {t("profile.mcp.pats.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              {overview.tokens.map((pat) => (
                <div
                  key={pat.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-background/50"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">
                        {pat.name}
                      </span>
                      <code className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        {pat.tokenPrefix}…
                      </code>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          pat.readOnly
                            ? "bg-primary/10 text-primary"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {pat.readOnly
                          ? t("profile.mcp.grants.badgeReadOnly")
                          : t("profile.mcp.grants.badgeReadWrite")}
                      </span>
                      {pat.isExpired && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
                          {t("profile.mcp.pats.expiredBadge")}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {pat.scopes.map((scope) => (
                        <code
                          key={scope}
                          className="text-[11px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-mono"
                        >
                          {scope}
                        </code>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {pat.expiresAt
                        ? t("profile.mcp.pats.expiresLabel", {
                            date: formatDateTime(pat.expiresAt),
                          })
                        : t("profile.mcp.pats.neverExpires")}{" "}
                      ·{" "}
                      {pat.lastUsedAt
                        ? t("profile.mcp.pats.lastUsed", {
                            date: formatDateTime(pat.lastUsedAt),
                          })
                        : t("profile.mcp.pats.neverUsed")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRevokeTarget({
                        kind: "pat",
                        id: pat.id,
                        name: pat.name,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-destructive hover:bg-muted/80 transition-colors cursor-pointer self-start sm:self-center shrink-0"
                    title={t("profile.mcp.pats.revoke")}
                    aria-label={`${t("profile.mcp.pats.revoke")} ${pat.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{t("profile.mcp.pats.revoke")}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Recent MCP Activity (Audit Log) */}
      {!isLoading && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                <Terminal className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground">
                  {t("profile.mcp.audit.title")}
                </h3>
                <p className="text-xs text-muted-foreground truncate">
                  {t("profile.mcp.audit.desc")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => fetchOverview(true)}
                disabled={isRefreshing}
                title={t("profile.mcp.audit.refresh")}
                aria-label={t("profile.mcp.audit.refresh")}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
              <button
                type="button"
                aria-expanded={isAuditExpanded}
                aria-label={
                  isAuditExpanded
                    ? t("profile.mcp.audit.collapse")
                    : t("profile.mcp.audit.expand")
                }
                title={
                  isAuditExpanded
                    ? t("profile.mcp.audit.collapse")
                    : t("profile.mcp.audit.expand")
                }
                onClick={() => setIsAuditExpanded((prev) => !prev)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
              >
                {isAuditExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {isAuditExpanded && (
            <div className="pt-2 border-t border-border">
              {!overview?.auditLogs.length ? (
                <p className="text-xs text-muted-foreground py-3">
                  {t("profile.mcp.audit.empty")}
                </p>
              ) : (
                <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-card z-10 border-b border-border text-muted-foreground">
                      <tr>
                        <th className="py-2.5 px-3 font-medium">
                          {t("profile.mcp.audit.columns.time")}
                        </th>
                        <th className="py-2.5 px-3 font-medium">
                          {t("profile.mcp.audit.columns.client")}
                        </th>
                        <th className="py-2.5 px-3 font-medium">
                          {t("profile.mcp.audit.columns.primitive")}
                        </th>
                        <th className="py-2.5 px-3 font-medium">
                          {t("profile.mcp.audit.columns.mode")}
                        </th>
                        <th className="py-2.5 px-3 font-medium">
                          {t("profile.mcp.audit.columns.status")}
                        </th>
                        <th className="py-2.5 px-3 font-medium text-right">
                          {t("profile.mcp.audit.columns.duration")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {overview.auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-foreground truncate max-w-[140px]">
                              {log.clientLabel}
                            </div>
                            <span className="text-[10px] uppercase text-muted-foreground">
                              {t(`profile.mcp.audit.authValues.${log.authMethod}`)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <code className="font-mono text-foreground">
                              {log.primitiveName}
                            </code>
                            <div className="text-[10px] text-muted-foreground uppercase">
                              {log.primitiveType}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                log.accessMode === "write"
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                  : "bg-primary/10 text-primary"
                              }`}
                            >
                              {t(`profile.mcp.audit.modeValues.${log.accessMode}`)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                log.status === "success"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : log.status === "denied"
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                  : "bg-destructive/15 text-destructive"
                              }`}
                            >
                              {t(`profile.mcp.audit.statusValues.${log.status}`)}
                            </span>
                            {log.errorCode && (
                              <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                {log.errorCode}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground whitespace-nowrap font-mono">
                            {formatInteger(log.durationMs)} {t("profile.mcp.audit.msUnit")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Personal Access Token */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => {
            if (!isCreatingPat) setShowCreateModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-pat-modal-title"
            className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                if (!isCreatingPat) setShowCreateModal(false);
              }}
              aria-label={t("common.closeModal")}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 id="create-pat-modal-title" className="text-lg font-bold text-foreground">
                  {t("profile.mcp.pats.modal.title")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("profile.mcp.pats.modal.subtitle")}
                </p>
              </div>
            </div>

            {createPatError && (
              <div className="mb-4 flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{createPatError}</span>
              </div>
            )}

            <form onSubmit={handleCreatePat} className="space-y-4">
              <div>
                <label
                  htmlFor="pat-name-input"
                  className="block text-xs font-medium text-foreground mb-1.5"
                >
                  {t("profile.mcp.pats.modal.nameLabel")}
                </label>
                <input
                  id="pat-name-input"
                  type="text"
                  required
                  maxLength={80}
                  value={patName}
                  onChange={(e) => setPatName(e.target.value)}
                  placeholder={t("profile.mcp.pats.modal.namePlaceholder")}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-medium text-foreground">
                  {t("profile.mcp.pats.modal.accessModeLabel")}
                </span>
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-background/60 cursor-pointer">
                  <input
                    type="radio"
                    name="patAccessMode"
                    checked={patAccessMode === "read_only"}
                    onChange={() => setPatAccessMode("read_only")}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-primary" />
                      <span>{t("profile.mcp.pats.modal.readOnlyOption")}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t("profile.mcp.pats.modal.readOnlyOptionDesc")}
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-background/60 cursor-pointer">
                  <input
                    type="radio"
                    name="patAccessMode"
                    checked={patAccessMode === "read_write"}
                    onChange={() => setPatAccessMode("read_write")}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <div className="text-xs font-semibold text-foreground">
                      {t("profile.mcp.pats.modal.readWriteOption")}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t("profile.mcp.pats.modal.readWriteOptionDesc")}
                    </p>
                  </div>
                </label>
              </div>

              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomScopes}
                    onChange={(e) => setUseCustomScopes(e.target.checked)}
                    className="rounded accent-primary"
                  />
                  <span>{t("profile.mcp.pats.modal.customScopesToggle")}</span>
                </label>
                {!useCustomScopes ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t("profile.mcp.pats.modal.customScopesHint")}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl border border-border bg-muted/20">
                    {DOMAIN_SCOPES.filter(
                      (item) => patAccessMode === "read_write" || !item.isWrite
                    ).map((item) => (
                      <label
                        key={item.scope}
                        className="inline-flex items-center gap-2 text-xs font-mono text-foreground cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={customScopes.includes(item.scope)}
                          onChange={() => handleToggleCustomScope(item.scope)}
                          className="rounded accent-primary"
                        />
                        <span>{item.scope}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="pat-expiry-select"
                  className="block text-xs font-medium text-foreground mb-1.5"
                >
                  {t("profile.mcp.pats.modal.expiryLabel")}
                </label>
                <select
                  id="pat-expiry-select"
                  value={patExpiryDays}
                  onChange={(e) => setPatExpiryDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                >
                  <option value="30">{t("profile.mcp.pats.modal.expiry30")}</option>
                  <option value="90">{t("profile.mcp.pats.modal.expiry90")}</option>
                  <option value="365">{t("profile.mcp.pats.modal.expiry365")}</option>
                  <option value="">{t("profile.mcp.pats.modal.expiryNever")}</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreatingPat}
                  className="flex-1 py-2.5 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-xs font-medium cursor-pointer disabled:opacity-50"
                >
                  {t("profile.mcp.pats.modal.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isCreatingPat || !patName.trim()}
                  className="flex-1 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isCreatingPat ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{t("profile.mcp.pats.modal.creating")}</span>
                    </>
                  ) : (
                    <span>{t("profile.mcp.pats.modal.submit")}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: One-Time Secret Reveal */}
      {createdToken && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => {
            setCreatedToken(null);
            setCopiedSecret(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reveal-pat-modal-title"
            className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setCreatedToken(null);
                setCopiedSecret(false);
              }}
              aria-label={t("common.closeModal")}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 id="reveal-pat-modal-title" className="text-lg font-bold text-foreground">
                  {t("profile.mcp.pats.revealModal.title")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("profile.mcp.pats.revealModal.subtitle")}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs">
              {t("profile.mcp.pats.revealModal.warning")}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="revealed-pat-secret"
                className="block text-xs font-medium text-foreground"
              >
                {t("profile.mcp.pats.revealModal.secretLabel")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="revealed-pat-secret"
                  type="text"
                  readOnly
                  value={createdToken.token}
                  className="flex-1 px-3 py-2 rounded-lg border border-input bg-muted/40 text-foreground text-xs font-mono select-all focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleCopySecret}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted text-foreground text-xs font-medium cursor-pointer shrink-0"
                >
                  {copiedSecret ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      <span>{t("profile.mcp.copied")}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t("profile.mcp.copy")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setCreatedToken(null);
                  setCopiedSecret(false);
                }}
                className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold cursor-pointer"
              >
                {t("profile.mcp.pats.revealModal.done")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Grant / PAT Revocation */}
      {revokeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => {
            if (!isRevoking) setRevokeTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-mcp-modal-title"
            className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                if (!isRevoking) setRevokeTarget(null);
              }}
              aria-label={t("common.closeModal")}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 id="revoke-mcp-modal-title" className="text-base font-bold text-foreground">
                  {revokeTarget.kind === "grant"
                    ? t("profile.mcp.grants.revoke")
                    : t("profile.mcp.pats.revoke")}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {revokeTarget.kind === "grant"
                    ? t("profile.mcp.grants.revokeConfirm", { name: revokeTarget.name })
                    : t("profile.mcp.pats.revokeConfirm", { name: revokeTarget.name })}
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                disabled={isRevoking}
                className="flex-1 py-2.5 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-xs font-medium cursor-pointer disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={isRevoking}
                className="flex-1 py-2.5 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isRevoking ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>
                      {revokeTarget.kind === "grant"
                        ? t("profile.mcp.grants.revoking")
                        : t("profile.mcp.pats.revoking")}
                    </span>
                  </>
                ) : (
                  <span>
                    {revokeTarget.kind === "grant"
                      ? t("profile.mcp.grants.revoke")
                      : t("profile.mcp.pats.revoke")}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
