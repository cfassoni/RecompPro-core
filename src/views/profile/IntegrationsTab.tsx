"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { UserIntegration, IntegrationProfile } from "@/lib/api";
import { formatDate } from "@/lib/i18n";
import {
  Link2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Scale,
  Smartphone,
  Trash2,
  X,
  User as UserIcon,
  Layers,
  Dumbbell,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";

interface IntegrationsTabProps {
  onDataChanged?: () => void;
}

export default function IntegrationsTab({ onDataChanged }: IntegrationsTabProps) {
  const { t } = useTranslation();

  const [integrations, setIntegrations] = useState<UserIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Active Provider Tab ("fitdays" | "hevy")
  const [activeProvider, setActiveProvider] = useState<"fitdays" | "hevy">("fitdays");

  // FITDAYS: Connection form state
  const [fitdaysEmail, setFitdaysEmail] = useState("");
  const [fitdaysPassword, setFitdaysPassword] = useState("");
  const [fitdaysRegion, setFitdaysRegion] = useState("us");
  const [showPassword, setShowPassword] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // FITDAYS: Profile binding state
  const [showProfileSelector, setShowProfileSelector] = useState(false);
  const [discoveredProfiles, setDiscoveredProfiles] = useState<IntegrationProfile[]>([]);
  const [selectedSuid, setSelectedSuid] = useState<number | null>(null);
  const [isBinding, setIsBinding] = useState(false);

  // FITDAYS: Syncing & Disconnect state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFullSyncing, setIsFullSyncing] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);

  // HEVY: Connection form state
  const [hevyApiKey, setHevyApiKey] = useState("");
  const [showHevyApiKey, setShowHevyApiKey] = useState(false);
  const [isConnectingHevy, setIsConnectingHevy] = useState(false);

  // HEVY: Sync & Webhook & Disconnect state
  const [isSyncingHevy, setIsSyncingHevy] = useState(false);
  const [showHevyDisconnectModal, setShowHevyDisconnectModal] = useState(false);
  const [isDisconnectingHevy, setIsDisconnectingHevy] = useState(false);
  const [deleteHevyDataOnDisconnect, setDeleteHevyDataOnDisconnect] = useState(false);
  const [isRegeneratingWebhook, setIsRegeneratingWebhook] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const fetchIntegrations = useCallback(async () => {
    try {
      const data = await api.getIntegrations();
      setIntegrations(data);
    } catch (err: unknown) {
      console.error("Failed to load integrations:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Modal Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDisconnectModal) setShowDisconnectModal(false);
        if (showProfileSelector) setShowProfileSelector(false);
        if (showHevyDisconnectModal) setShowHevyDisconnectModal(false);
      }
    };
    if (showDisconnectModal || showProfileSelector || showHevyDisconnectModal) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDisconnectModal, showProfileSelector, showHevyDisconnectModal]);

  const fitdaysIntegration = integrations.find((i) => i.provider === "fitdays");
  const isFitdaysConnected = fitdaysIntegration && fitdaysIntegration.status === "connected";

  const hevyIntegration = integrations.find((i) => i.provider === "hevy");
  const isHevyConnected = hevyIntegration && hevyIntegration.status === "connected";

  // ---------------------------------------------------------------------------
  // FITDAYS HANDLERS
  // ---------------------------------------------------------------------------
  const handleConnectFitdays = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fitdaysEmail || !fitdaysPassword) return;

    setIsConnecting(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await api.connectFitdays({
        email: fitdaysEmail,
        password: fitdaysPassword,
        region: fitdaysRegion,
      });

      if (res.profiles && res.profiles.length > 0) {
        setDiscoveredProfiles(res.profiles);
        setSelectedSuid(res.activeSuid ?? res.profiles[0].suid);
        setShowProfileSelector(true);
        setFitdaysPassword("");
      } else {
        setFitdaysPassword("");
        await fetchIntegrations();
        setFeedbackSuccess(t("profile.integrations.fitdays.syncSuccess", { inserted: 0, updated: 0 }));
        if (onDataChanged) onDataChanged();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConfirmProfileBinding = async () => {
    if (selectedSuid === null) return;
    setIsBinding(true);
    setFeedbackError(null);

    try {
      const res = await api.selectFitdaysProfile(selectedSuid, true);
      setShowProfileSelector(false);
      setFeedbackSuccess(
        t("profile.integrations.fitdays.syncSuccess", {
          inserted: res.result?.inserted || 0,
          updated: res.result?.updated || 0,
        })
      );
      await fetchIntegrations();
      if (onDataChanged) onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsBinding(false);
    }
  };

  const handleSyncFitdays = async (forceFull = false) => {
    if (forceFull) setIsFullSyncing(true);
    else setIsSyncing(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await api.syncFitdays(forceFull);
      setFeedbackSuccess(
        t("profile.integrations.fitdays.syncSuccess", {
          inserted: res.result.inserted,
          updated: res.result.updated,
        })
      );
      await fetchIntegrations();
      if (onDataChanged) onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsSyncing(false);
      setIsFullSyncing(false);
    }
  };

  const handleDisconnectFitdays = async () => {
    setIsDisconnecting(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      await api.disconnectFitdays();
      setShowDisconnectModal(false);
      setFeedbackSuccess(t("profile.integrations.fitdays.disconnectSuccess"));
      await fetchIntegrations();
      if (onDataChanged) onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleToggleSkipWeightOnly = async () => {
    if (!fitdaysIntegration) return;
    setIsUpdatingConfig(true);
    const currentVal = Boolean(fitdaysIntegration.config?.skipWeightOnly);
    try {
      await api.updateFitdaysConfig({ skipWeightOnly: !currentVal });
      await fetchIntegrations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  // ---------------------------------------------------------------------------
  // HEVY HANDLERS
  // ---------------------------------------------------------------------------
  const handleConnectHevy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hevyApiKey.trim()) return;

    setIsConnectingHevy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await api.connectHevy(hevyApiKey.trim());
      setFeedbackSuccess(
        t("profile.integrations.hevy.connectSuccess", {
          user: res.accountIdentifier,
          templates: res.templateCount,
        })
      );
      setHevyApiKey("");
      await fetchIntegrations();
      if (onDataChanged) onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsConnectingHevy(false);
    }
  };

  const handleSyncHevy = async (pageSize = 10) => {
    setIsSyncingHevy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await api.syncHevy(1, pageSize);
      setFeedbackSuccess(
        t("profile.integrations.hevy.syncSuccess", {
          synced: res.syncedWorkouts,
          total: res.totalWorkouts,
        })
      );
      await fetchIntegrations();
      if (onDataChanged) onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsSyncingHevy(false);
    }
  };

  const handleRegenerateWebhook = async () => {
    setIsRegeneratingWebhook(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      await api.regenerateHevyWebhook();
      setFeedbackSuccess(t("profile.integrations.hevy.webhookRegenerated"));
      await fetchIntegrations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsRegeneratingWebhook(false);
    }
  };

  const handleDisconnectHevy = async () => {
    setIsDisconnectingHevy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await api.disconnectHevy(deleteHevyDataOnDisconnect);
      setFeedbackSuccess(res.message || t("profile.integrations.hevy.disconnectSuccess"));
      setShowHevyDisconnectModal(false);
      setDeleteHevyDataOnDisconnect(false);
      await fetchIntegrations();
      if (onDataChanged) onDataChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsDisconnectingHevy(false);
    }
  };

  const getHevyWebhookUrl = () => {
    if (!hevyIntegration) return "";
    const rawConfig = hevyIntegration.config as Record<string, unknown> | undefined;
    const token = rawConfig?.webhookToken as string | undefined;
    if (!token) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/integrations/hevy/webhook/${token}`;
  };

  const handleCopyWebhookUrl = () => {
    const url = getHevyWebhookUrl();
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div
      id="panel-integrations"
      role="tabpanel"
      aria-labelledby="tab-integrations"
      className="bg-card border border-border rounded-xl p-6 shadow-xs animate-in fade-in-50 duration-200"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Link2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {t("profile.integrations.title")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("profile.integrations.subtitle")}
          </p>
        </div>
      </div>

      {/* Provider Selector Sub-Tabs */}
      <div className="flex border-b border-border mb-6 gap-2">
        <button
          type="button"
          onClick={() => setActiveProvider("fitdays")}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors cursor-pointer ${
            activeProvider === "fitdays"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Scale className="h-4 w-4" />
          <span>Fitdays</span>
          {isFitdaysConnected && (
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveProvider("hevy")}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors cursor-pointer ${
            activeProvider === "hevy"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Dumbbell className="h-4 w-4" />
          <span>Hevy</span>
          {isHevyConnected && (
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          )}
        </button>
      </div>

      {/* Success Notification */}
      {feedbackSuccess && (
        <div className="mb-6 flex items-start gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs animate-in fade-in duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{feedbackSuccess}</span>
        </div>
      )}

      {/* Error Notification */}
      {feedbackError && (
        <div className="mb-6 flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-lg text-xs animate-in fade-in duration-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{feedbackError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs">{t("common.loading")}</span>
        </div>
      ) : activeProvider === "fitdays" ? (
        /* =================================================================== */
        /* FITDAYS PROVIDER TAB                                                */
        /* =================================================================== */
        isFitdaysConnected && fitdaysIntegration ? (
          /* CONNECTED FITDAYS STATE */
          <div className="space-y-6">
            <div className="p-5 rounded-xl border border-border bg-muted/20 space-y-5">
              {/* Top row: Brand + Status badge */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-lg">
                    <Scale className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-foreground">
                      {t("profile.integrations.fitdays.title")}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {t("profile.integrations.fitdays.description")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold shrink-0">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{t("profile.integrations.fitdays.statusConnected")}</span>
                </div>
              </div>

              {/* Account & Profile metadata grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-card border border-border rounded-lg">
                  <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    {t("profile.integrations.fitdays.connectedAccount")}
                  </span>
                  <span className="text-sm font-semibold text-foreground truncate block">
                    {fitdaysIntegration.accountIdentifier}
                  </span>
                </div>

                <div className="p-3 bg-card border border-border rounded-lg">
                  <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    {t("profile.integrations.fitdays.boundProfile")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground truncate">
                      {fitdaysIntegration.config?.selectedProfileName ||
                        `Profile #${fitdaysIntegration.config?.selectedSuid}`}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-card border border-border rounded-lg">
                  <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    {t("profile.integrations.fitdays.boundDevice")}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground truncate">
                      {fitdaysIntegration.config?.devices?.[0]?.name ||
                        t("profile.integrations.fitdays.noDevice")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Last Synced info & error */}
              <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border gap-2">
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>
                    {t("profile.integrations.fitdays.lastSynced")}:{" "}
                    <strong className="text-foreground">
                      {fitdaysIntegration.lastSyncedAt
                        ? formatDate(fitdaysIntegration.lastSyncedAt)
                        : t("profile.integrations.fitdays.lastSyncedNever")}
                    </strong>
                  </span>
                </div>

                {fitdaysIntegration.lastSyncError && (
                  <span className="text-destructive font-medium">
                    {fitdaysIntegration.lastSyncError}
                  </span>
                )}
              </div>

              {/* Sync Controls */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleSyncFitdays(false)}
                  disabled={isSyncing || isFullSyncing}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{t("profile.integrations.fitdays.syncing")}</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>{t("profile.integrations.fitdays.syncNow")}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSyncFitdays(true)}
                  disabled={isSyncing || isFullSyncing}
                  className="px-3 py-2 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isFullSyncing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{t("profile.integrations.fitdays.syncing")}</span>
                    </>
                  ) : (
                    <>
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{t("profile.integrations.fitdays.forceFullSync")}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Configuration Card: Ignore Weight-Only Scans Toggle */}
            <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-4">
              <div className="space-y-0.5 max-w-xl">
                <h5 className="text-sm font-semibold text-foreground">
                  {t("profile.integrations.fitdays.skipWeightOnlyLabel")}
                </h5>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("profile.integrations.fitdays.skipWeightOnlyDesc")}
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggleSkipWeightOnly}
                disabled={isUpdatingConfig}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  fitdaysIntegration.config?.skipWeightOnly ? "bg-primary" : "bg-muted"
                }`}
                role="switch"
                aria-checked={fitdaysIntegration.config?.skipWeightOnly}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                    fitdaysIntegration.config?.skipWeightOnly ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Revoke / Disconnect Button */}
            <div className="pt-2 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(true)}
                className="px-3.5 py-2 rounded-lg border border-destructive/30 hover:bg-destructive/10 text-destructive text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t("profile.integrations.fitdays.disconnectBtn")}</span>
              </button>
            </div>
          </div>
        ) : (
          /* UNCONNECTED FITDAYS FORM */
          <div className="space-y-6">
            <div className="p-5 rounded-xl border border-border bg-muted/10 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-lg">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground">
                    {t("profile.integrations.fitdays.title")}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {t("profile.integrations.fitdays.description")}
                  </p>
                </div>
              </div>

              <form onSubmit={handleConnectFitdays} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="fitdays-email">
                      {t("profile.integrations.fitdays.emailLabel")}
                    </label>
                    <input
                      id="fitdays-email"
                      type="email"
                      required
                      value={fitdaysEmail}
                      onChange={(e) => setFitdaysEmail(e.target.value)}
                      placeholder="account@fitdays.com"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="fitdays-pwd">
                      {t("profile.integrations.fitdays.passwordLabel")}
                    </label>
                    <div className="relative">
                      <input
                        id="fitdays-pwd"
                        type={showPassword ? "text" : "password"}
                        required
                        value={fitdaysPassword}
                        onChange={(e) => setFitdaysPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="max-w-xs">
                  <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="fitdays-region">
                    {t("profile.integrations.fitdays.regionLabel")}
                  </label>
                  <select
                    id="fitdays-region"
                    value={fitdaysRegion}
                    onChange={(e) => setFitdaysRegion(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                  >
                    <option value="us">{t("profile.integrations.fitdays.regionUS")}</option>
                    <option value="eu">{t("profile.integrations.fitdays.regionEU")}</option>
                    <option value="cn">{t("profile.integrations.fitdays.regionCN")}</option>
                  </select>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isConnecting || !fitdaysEmail || !fitdaysPassword}
                    className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 shadow-xs"
                  >
                    {isConnecting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>{t("profile.integrations.fitdays.connecting")}</span>
                      </>
                    ) : (
                      <span>{t("profile.integrations.fitdays.connectBtn")}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      ) : (
        /* =================================================================== */
        /* HEVY PROVIDER TAB                                                   */
        /* =================================================================== */
        isHevyConnected && hevyIntegration ? (
          /* CONNECTED HEVY STATE */
          <div className="space-y-6">
            <div className="p-5 rounded-xl border border-border bg-muted/20 space-y-5">
              {/* Top row: Brand + Status badge */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                    <Dumbbell className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-foreground">
                      {t("profile.integrations.hevy.title")}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {t("profile.integrations.hevy.description")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold shrink-0">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{t("profile.integrations.hevy.statusConnected")}</span>
                </div>
              </div>

              {/* Account metadata grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-card border border-border rounded-lg">
                  <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    {t("profile.integrations.hevy.connectedAccount")}
                  </span>
                  <span className="text-sm font-semibold text-foreground truncate block">
                    {hevyIntegration.accountIdentifier}
                  </span>
                </div>

                <div className="p-3 bg-card border border-border rounded-lg">
                  <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                    {t("profile.integrations.hevy.status")}
                  </span>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 capitalize block">
                    {hevyIntegration.status}
                  </span>
                </div>
              </div>

              {/* Webhook Configuration Section */}
              <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      {t("profile.integrations.hevy.webhookTitle")}
                    </h5>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("profile.integrations.hevy.webhookDesc")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getHevyWebhookUrl()}
                    className="flex-1 px-3 py-2 text-xs font-data-mono rounded-lg border border-input bg-muted/40 text-foreground"
                  />
                  <button
                    type="button"
                    onClick={handleCopyWebhookUrl}
                    className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {copiedWebhook ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>{t("common.copied")}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>{t("common.copy")}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleRegenerateWebhook}
                    disabled={isRegeneratingWebhook}
                    className="px-3 py-2 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title={t("profile.integrations.hevy.regenerateWebhook")}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRegeneratingWebhook ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline">{t("profile.integrations.hevy.regenerateWebhook")}</span>
                  </button>
                </div>
              </div>

              {/* Last Synced info & error */}
              <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border gap-2">
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>
                    {t("profile.integrations.hevy.lastSynced")}:{" "}
                    <strong className="text-foreground">
                      {hevyIntegration.lastSyncedAt
                        ? formatDate(hevyIntegration.lastSyncedAt)
                        : t("profile.integrations.hevy.lastSyncedNever")}
                    </strong>
                  </span>
                </div>

                {hevyIntegration.lastSyncError && (
                  <span className="text-destructive font-medium">
                    {hevyIntegration.lastSyncError}
                  </span>
                )}
              </div>

              {/* Sync Controls */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleSyncHevy(10)}
                  disabled={isSyncingHevy}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {isSyncingHevy ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{t("profile.integrations.hevy.syncing")}</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>{t("profile.integrations.hevy.syncRecentBtn")}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSyncHevy(50)}
                  disabled={isSyncingHevy}
                  className="px-4 py-2 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-xs font-medium transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{t("profile.integrations.hevy.syncFullBtn")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowHevyDisconnectModal(true)}
                  className="ml-auto px-3.5 py-2 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t("profile.integrations.hevy.disconnectBtn")}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* UNCONNECTED HEVY FORM */
          <div className="space-y-6">
            <div className="p-5 rounded-xl border border-border bg-muted/10 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                  <Dumbbell className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-foreground">
                    {t("profile.integrations.hevy.title")}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {t("profile.integrations.hevy.description")}
                  </p>
                </div>
              </div>

              {/* Instructions banner */}
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-xs text-foreground space-y-1.5 leading-relaxed">
                <div className="font-semibold flex items-center gap-1.5 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span>{t("profile.integrations.hevy.instructionsTitle")}</span>
                </div>
                <p className="text-muted-foreground">
                  {t("profile.integrations.hevy.instructionsDesc")}
                </p>
              </div>

              <form onSubmit={handleConnectHevy} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5" htmlFor="hevy-api-key">
                    {t("profile.integrations.hevy.apiKeyLabel")}
                  </label>
                  <div className="relative">
                    <input
                      id="hevy-api-key"
                      type={showHevyApiKey ? "text" : "password"}
                      required
                      value={hevyApiKey}
                      onChange={(e) => setHevyApiKey(e.target.value)}
                      placeholder="api_..."
                      className="w-full px-3 py-2 pr-10 text-sm font-data-mono rounded-lg border border-input bg-background text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowHevyApiKey(!showHevyApiKey)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      tabIndex={-1}
                    >
                      {showHevyApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isConnectingHevy || !hevyApiKey.trim()}
                    className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 shadow-xs"
                  >
                    {isConnectingHevy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>{t("profile.integrations.hevy.connecting")}</span>
                      </>
                    ) : (
                      <span>{t("profile.integrations.hevy.connectBtn")}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      )}

      {/* MEMBER PROFILE SELECTOR MODAL (FITDAYS) */}
      {showProfileSelector && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
          onClick={() => setShowProfileSelector(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setShowProfileSelector(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-5">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <UserIcon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                {t("profile.integrations.fitdays.selectMemberProfile")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("profile.integrations.fitdays.selectMemberProfileDesc")}
              </p>
            </div>

            <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
              {discoveredProfiles.map((p) => {
                const isSelected = selectedSuid === p.suid;
                return (
                  <div
                    key={p.suid}
                    onClick={() => setSelectedSuid(p.suid)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        {p.nickname.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-semibold text-sm text-foreground block">
                          {p.nickname}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {p.birthday ? formatDate(p.birthday.split(" ")[0]) : "—"}
                          {p.height ? ` • ${p.height} cm` : ""}
                          {p.sex === 0
                            ? ` • ${t("common.male")}`
                            : p.sex === 1
                            ? ` • ${t("common.female")}`
                            : ""}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-background" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowProfileSelector(false)}
                className="flex-1 py-2.5 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-xs font-semibold cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmProfileBinding}
                disabled={isBinding || selectedSuid === null}
                className="flex-1 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 shadow-xs"
              >
                {isBinding ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{t("profile.integrations.fitdays.binding")}</span>
                  </>
                ) : (
                  <span>{t("profile.integrations.fitdays.bindProfileBtn")}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISCONNECT CONFIRMATION MODAL (FITDAYS) */}
      {showDisconnectModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
          onClick={() => setShowDisconnectModal(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setShowDisconnectModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-5">
              <div className="h-12 w-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                {t("profile.integrations.fitdays.disconnectConfirmTitle")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("profile.integrations.fitdays.disconnectConfirmText")}
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                disabled={isDisconnecting}
                className="flex-1 py-2 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-xs font-medium cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleDisconnectFitdays}
                disabled={isDisconnecting}
                className="flex-1 py-2 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDisconnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span>{t("profile.integrations.fitdays.disconnectBtn")}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DISCONNECT CONFIRMATION MODAL (HEVY) */}
      {showHevyDisconnectModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
          onClick={() => setShowHevyDisconnectModal(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setShowHevyDisconnectModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-5">
              <div className="h-12 w-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                {t("profile.integrations.hevy.disconnectConfirmTitle")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("profile.integrations.hevy.disconnectConfirmText")}
              </p>
            </div>

            {/* Checkbox: Also delete imported data */}
            <div className="mb-5 p-3 rounded-xl border border-destructive/20 bg-destructive/5 flex items-start gap-2.5">
              <input
                id="delete-hevy-data"
                type="checkbox"
                checked={deleteHevyDataOnDisconnect}
                onChange={(e) => setDeleteHevyDataOnDisconnect(e.target.checked)}
                className="mt-0.5 rounded border-input text-destructive focus:ring-destructive cursor-pointer"
              />
              <label htmlFor="delete-hevy-data" className="text-xs text-foreground cursor-pointer select-none">
                <span className="font-semibold block">{t("profile.integrations.hevy.deleteDataCheckboxTitle")}</span>
                <span className="text-muted-foreground block mt-0.5">{t("profile.integrations.hevy.deleteDataCheckboxDesc")}</span>
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowHevyDisconnectModal(false)}
                disabled={isDisconnectingHevy}
                className="flex-1 py-2 rounded-lg border border-input bg-background hover:bg-muted text-foreground text-xs font-medium cursor-pointer"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleDisconnectHevy}
                disabled={isDisconnectingHevy}
                className="flex-1 py-2 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-semibold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDisconnectingHevy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span>{t("profile.integrations.hevy.disconnectBtn")}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
