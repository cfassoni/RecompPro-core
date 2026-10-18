"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { SharedLinkPublicMetadata, SharedLinkPublicData, RecompRecord } from "@/lib/api";
import { formatDate, formatDateTime, formatDecimal, formatDelta, formatInteger } from "@/lib/i18n";

import LanguageMenu from "@/components/LanguageMenu";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";
import {
  Loader2,
  AlertTriangle,
  Scale,
  Activity,
  Dumbbell,
  Layers,
  Lock,
  Eye,
  X,
  Paperclip,
  ExternalLink,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface GuestSharedReportProps {
  token: string;
}

export default function GuestSharedReport({ token }: GuestSharedReportProps) {
  const { t } = useTranslation();

  // App loading and error states
  const [metadata, setMetadata] = useState<SharedLinkPublicMetadata | null>(null);
  const [reportData, setReportData] = useState<SharedLinkPublicData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Password verification states
  const [password, setPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Dashboard toggles & units
  const [showWeight, setShowWeight] = useState(true);
  const [showBodyFat, setShowBodyFat] = useState(false);
  const [showMuscle, setShowMuscle] = useState(false);

  const [bodyFatUnit, setBodyFatUnit] = useState<"pct" | "kg">("pct");
  const [muscleUnit, setMuscleUnit] = useState<"kg" | "pct">("kg");

  // Record details drawer state
  const [selectedRecord, setSelectedRecord] = useState<RecompRecord | null>(null);

  // Sorting state for table
  const [sortField, setSortField] = useState<"date" | "weight" | "bmi" | "body_fat_pct" | "skeletal_muscle_mass" | "body_score">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const fetchReportData = async (guestToken: string | null) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getPublicSharedLinkData(token, guestToken);
      setReportData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg && msg.includes("Password required")) {
        setIsUnlocked(false);
        sessionStorage.removeItem(`guest_token_${token}`);
      } else {
        setError(msg || t("sharing.errorLoadGuest"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const meta = await api.getPublicSharedLinkMetadata(token);
      setMetadata(meta);

      if (!meta.has_password) {
        setIsUnlocked(true);
        await fetchReportData(null);
      } else {
        const savedToken = sessionStorage.getItem(`guest_token_${token}`);
        if (savedToken) {
          setIsUnlocked(true);
          await fetchReportData(savedToken);
        } else {
          setIsLoading(false);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setError(msg || t("sharing.errorLinkNotFound"));
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetadata();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setVerificationError(t("common.required"));
      return;
    }

    try {
      setIsVerifying(true);
      setVerificationError(null);

      const res = await api.verifyPublicSharedLinkPassword(token, password);
      sessionStorage.setItem(`guest_token_${token}`, res.guest_token);
      setIsUnlocked(true);

      await fetchReportData(res.guest_token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg || msg.toLowerCase().includes("incorrect password")) {
        setVerificationError(t("sharing.errorIncorrectPassword"));
      } else {
        setVerificationError(msg);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const formatChange = (val: number | null | undefined, unit: string, lowerIsBetter: boolean) => {
    if (val === null || val === undefined) return "0";
    const delta = formatDelta(val, 2, unit);
    const formatted = delta ? delta.formatted : "0";

    let colorClass = "text-muted-foreground bg-muted";
    if (val !== 0) {
      const isGood = val < 0 ? lowerIsBetter : !lowerIsBetter;
      colorClass = isGood
        ? "text-emerald-700 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/15"
        : "text-rose-700 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-500/15";
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${colorClass}`}>
        {formatted}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-foreground">
        <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-sm text-muted-foreground font-medium">{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    const isExpired = error.includes("expired");
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-foreground">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 shadow-2xl text-center">
          <div className="h-16 w-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">
            {isExpired ? t("sharing.expiredLink") : t("sharing.invalidToken")}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-6">
            {isExpired
              ? "This secure sharing link has expired. Please ask the owner to generate a new temporary link."
              : "The link you are trying to open is invalid, revoked, or does not exist."}
          </p>
          <div className="flex items-center justify-center gap-3">
            <LanguageMenu user={null} />
            <ThemeToggle variant="icon" />
          </div>
        </div>
      </div>
    );
  }

  // Password Unlock Gate
  if (metadata && metadata.has_password && !isUnlocked) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6 text-foreground">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight m-0">{t("sharing.passwordPromptTitle")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{metadata.description}</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed mb-6 text-center">
            {t("sharing.passwordPromptSubtitle")}
          </p>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5" htmlFor="pwd">
                {t("sharing.passwordInputLabel")}
              </label>
              <input
                id="pwd"
                type="password"
                required
                placeholder={t("sharing.passwordInputPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-muted-foreground transition-all"
              />
            </div>

            {verificationError && (
              <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{verificationError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/95 text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>{t("sharing.passwordSubmit")}</span>
            </button>
          </form>

          <div className="flex items-center justify-center gap-3 border-t border-border mt-6 pt-4">
            <LanguageMenu user={null} />
            <ThemeToggle variant="icon" />
          </div>
        </div>
      </div>
    );
  }

  if (!metadata || !reportData) return null;

  const summary = reportData.dashboard;

  const sortedEntries = [...reportData.entries].sort((a, b) => {
    let aVal: string | number | null = (a as unknown as Record<string, unknown>)[sortField] as string | number | null;
    let bVal: string | number | null = (b as unknown as Record<string, unknown>)[sortField] as string | number | null;

    if (sortField === "date") {
      aVal = new Date(a.date).getTime();
      bVal = new Date(b.date).getTime();
    }

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const dateDayCounts = new Map<string, number>();
  for (const point of summary.weight_history) {
    const dayLabel = formatDate(point.date, {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
    dateDayCounts.set(dayLabel, (dateDayCounts.get(dayLabel) ?? 0) + 1);
  }

  const formattedChartData = summary.weight_history.map((point) => {
    const dayLabel = formatDate(point.date, {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
    const hasSameDayMultiple = (dateDayCounts.get(dayLabel) ?? 0) > 1;
    return {
      ...point,
      displayDate: hasSameDayMultiple
        ? formatDateTime(point.date, {
            month: "short",
            day: "numeric",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : dayLabel,
    };
  });

  const getAttachmentUrl = (url: string) => {
    const guestToken = sessionStorage.getItem(`guest_token_${token}`);
    if (guestToken) {
      return `${url}?guest_token=${encodeURIComponent(guestToken)}`;
    }
    return url;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-x-hidden">
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row h-auto sm:h-16 w-full items-start sm:items-center justify-between border-b border-border bg-card p-4 md:px-6 gap-3 z-40 sticky top-0">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold uppercase tracking-wider">
            {t("sharing.guestTitle")}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 text-xs text-muted-foreground w-full sm:w-auto">
          <div className="text-left">
            <p className="font-semibold text-foreground">
              {t("sharing.guestHeaderInfo", { name: metadata.owner_name, email: metadata.owner_email })}
            </p>
            {metadata.latest_measurement_date && (
              <p className="mt-0.5 text-muted-foreground">
                {t("sharing.guestLatestMeasurement", { date: formatDate(metadata.latest_measurement_date) })}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center ml-auto sm:ml-0">
            <LanguageMenu user={null} />
            <ThemeToggle variant="icon" />
          </div>
        </div>
      </header>

      {/* Main View Container */}
      <main className="flex-1 p-6 space-y-8 max-w-7xl mx-auto w-full">
        {/* Subheader */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground m-0">{metadata.description}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("sharing.reviewingMeasurements", { count: summary.total_records })}
          </p>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card: Total Records */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-xs flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.totalLogs")}</p>
              <h3 className="text-3xl font-bold">{summary.total_records}</h3>
              <p className="text-xs text-muted-foreground">{t("dashboard.totalLogsDesc")}</p>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 rounded-lg">
              <Layers className="h-5 w-5" />
            </div>
          </div>

          {/* Card: Weight */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-xs flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.weight")}</p>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold">
                  {summary.current_weight} <span className="text-sm font-normal text-muted-foreground">kg</span>
                </h3>
                {formatChange(summary.weight_change, " kg", true)}
              </div>
              <p className="text-xs text-muted-foreground">{t("dashboard.starting")} {summary.starting_weight} kg</p>
            </div>
            <div className="p-3 bg-violet-500/10 text-violet-500 dark:text-violet-400 rounded-lg">
              <Scale className="h-5 w-5" />
            </div>
          </div>

          {/* Card: Body Fat */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-xs flex items-start justify-between">
            <div className="space-y-2 flex-1 mr-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.bodyFat")}</p>
                <div className="flex bg-muted p-0.5 rounded-md border border-border text-[10px]">
                  <button
                    onClick={() => setBodyFatUnit("pct")}
                    className={`px-2 py-0.5 rounded-sm font-semibold transition-all cursor-pointer ${
                      bodyFatUnit === "pct" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground"
                    }`}
                  >
                    %
                  </button>
                  <button
                    onClick={() => setBodyFatUnit("kg")}
                    className={`px-2 py-0.5 rounded-sm font-semibold transition-all cursor-pointer ${
                      bodyFatUnit === "kg" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground"
                    }`}
                  >
                    kg
                  </button>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold">
                  {bodyFatUnit === "pct" ? (
                    <>
                      {summary.current_body_fat} <span className="text-sm font-normal text-muted-foreground">%</span>
                    </>
                  ) : (
                    <>
                      {summary.current_body_fat_mass} <span className="text-sm font-normal text-muted-foreground">kg</span>
                    </>
                  )}
                </h3>
                {bodyFatUnit === "pct"
                  ? formatChange(summary.body_fat_change, "%", true)
                  : formatChange(summary.body_fat_mass_change, " kg", true)}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("dashboard.starting")}{" "}
                {bodyFatUnit === "pct" ? `${summary.starting_body_fat}%` : `${summary.starting_body_fat_mass} kg`}
              </p>
            </div>
            <div className="p-3 bg-rose-500/10 text-rose-500 dark:text-rose-400 rounded-lg shrink-0">
              <Activity className="h-5 w-5" />
            </div>
          </div>

          {/* Card: Skeletal Muscle */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-xs flex items-start justify-between">
            <div className="space-y-2 flex-1 mr-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.smmCard")}</p>
                <div className="flex bg-muted p-0.5 rounded-md border border-border text-[10px]">
                  <button
                    onClick={() => setMuscleUnit("pct")}
                    className={`px-2 py-0.5 rounded-sm font-semibold transition-all cursor-pointer ${
                      muscleUnit === "pct" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground"
                    }`}
                  >
                    %
                  </button>
                  <button
                    onClick={() => setMuscleUnit("kg")}
                    className={`px-2 py-0.5 rounded-sm font-semibold transition-all cursor-pointer ${
                      muscleUnit === "kg" ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground"
                    }`}
                  >
                    kg
                  </button>
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-bold">
                  {muscleUnit === "kg" ? (
                    <>
                      {summary.current_skeletal_muscle_mass} <span className="text-sm font-normal text-muted-foreground">kg</span>
                    </>
                  ) : (
                    <>
                      {summary.current_skeletal_muscle_mass_pct} <span className="text-sm font-normal text-muted-foreground">%</span>
                    </>
                  )}
                </h3>
                {muscleUnit === "kg"
                  ? formatChange(summary.skeletal_muscle_mass_change, " kg", false)
                  : formatChange(summary.skeletal_muscle_mass_pct_change, "%", false)}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("dashboard.starting")}{" "}
                {muscleUnit === "kg"
                  ? `${summary.starting_skeletal_muscle_mass} kg`
                  : `${summary.starting_skeletal_muscle_mass_pct}%`}
              </p>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 rounded-lg shrink-0">
              <Dumbbell className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h3 className="text-lg font-bold text-foreground">{t("dashboard.weightHistoryTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("dashboard.metricsToShow")}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowWeight(!showWeight)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  showWeight
                    ? "bg-violet-500/10 border-violet-500/40 text-violet-600 dark:text-violet-400 font-bold"
                    : "bg-background border-border text-muted-foreground"
                }`}
              >
                <div
                  className={`h-2.5 w-2.5 rounded-full bg-violet-500 ${
                    showWeight ? "scale-100" : "scale-50 opacity-40"
                  } transition-transform`}
                />
                <span>{t("dashboard.weight")} (kg)</span>
              </button>

              <button
                onClick={() => setShowBodyFat(!showBodyFat)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  showBodyFat
                    ? "bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold"
                    : "bg-background border-border text-muted-foreground"
                }`}
              >
                <div
                  className={`h-2.5 w-2.5 rounded-full bg-rose-500 ${
                    showBodyFat ? "scale-100" : "scale-50 opacity-40"
                  } transition-transform`}
                />
                <span>{t("dashboard.bodyFat")} ({bodyFatUnit === "pct" ? "%" : "kg"})</span>
              </button>

              <button
                onClick={() => setShowMuscle(!showMuscle)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  showMuscle
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold"
                    : "bg-background border-border text-muted-foreground"
                }`}
              >
                <div
                  className={`h-2.5 w-2.5 rounded-full bg-emerald-500 ${
                    showMuscle ? "scale-100" : "scale-50 opacity-40"
                  } transition-transform`}
                />
                <span>{t("dashboard.smmCard")} ({muscleUnit === "kg" ? "kg" : "%"})</span>
              </button>
            </div>
          </div>

          <div className="h-[350px] w-full">
            {!showWeight && !showBodyFat && !showMuscle ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Please select at least one metric above to display the chart lines.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formattedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.6} />
                  <XAxis dataKey="displayDate" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-card)",
                      borderColor: "var(--color-border)",
                      borderRadius: "12px",
                      color: "var(--color-foreground)",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                  {showWeight && (
                    <Line
                      type="monotone"
                      dataKey="weight"
                      name={t("dashboard.weight")}
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      activeDot={{ r: 6 }}
                      dot={{ r: 3 }}
                    />
                  )}
                  {showBodyFat && (
                    <Line
                      type="monotone"
                      dataKey={bodyFatUnit === "pct" ? "body_fat_pct" : "body_fat_mass"}
                      name={`${t("dashboard.bodyFat")} (${bodyFatUnit === "pct" ? "%" : "kg"})`}
                      stroke="#f43f5e"
                      strokeWidth={2.5}
                      activeDot={{ r: 6 }}
                      dot={{ r: 3 }}
                    />
                  )}
                  {showMuscle && (
                    <Line
                      type="monotone"
                      dataKey={muscleUnit === "kg" ? "skeletal_muscle_mass" : "skeletal_muscle_mass_pct"}
                      name={`${t("dashboard.smmCard")} (${muscleUnit === "kg" ? "kg" : "%"})`}
                      stroke="#10b981"
                      strokeWidth={2.5}
                      activeDot={{ r: 6 }}
                      dot={{ r: 3 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Shared Scans Table */}
        <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-bold text-foreground m-0">{t("sharing.sharedHistoryEntries")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-foreground">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground font-semibold text-xs tracking-wider uppercase">
                <tr>
                  <th
                    onClick={() => handleSort("date")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/30 select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t("history.table.date")}</span>
                      <span
                        className={`text-[10px] transition-opacity ${
                          sortField === "date" ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-40"
                        }`}
                      >
                        {sortField === "date" && sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("weight")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/30 select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t("history.table.weight")}</span>
                      <span
                        className={`text-[10px] transition-opacity ${
                          sortField === "weight" ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-40"
                        }`}
                      >
                        {sortField === "weight" && sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("bmi")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/30 select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t("history.table.bmi")}</span>
                      <span
                        className={`text-[10px] transition-opacity ${
                          sortField === "bmi" ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-40"
                        }`}
                      >
                        {sortField === "bmi" && sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("body_fat_pct")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/30 select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t("history.table.bodyFat")}</span>
                      <span
                        className={`text-[10px] transition-opacity ${
                          sortField === "body_fat_pct" ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-40"
                        }`}
                      >
                        {sortField === "body_fat_pct" && sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("skeletal_muscle_mass")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/30 select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t("history.table.skeletalMuscle")}</span>
                      <span
                        className={`text-[10px] transition-opacity ${
                          sortField === "skeletal_muscle_mass"
                            ? "opacity-100 text-primary"
                            : "opacity-0 group-hover:opacity-40"
                        }`}
                      >
                        {sortField === "skeletal_muscle_mass" && sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("body_score")}
                    className="px-6 py-4 cursor-pointer hover:bg-muted/30 select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{t("history.table.bodyScore")}</span>
                      <span
                        className={`text-[10px] transition-opacity ${
                          sortField === "body_score" ? "opacity-100 text-primary" : "opacity-0 group-hover:opacity-40"
                        }`}
                      >
                        {sortField === "body_score" && sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right">{t("history.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedEntries.map((record) => (
                  <tr key={record.id} className="hover:bg-muted/15 transition-colors">
                    <td className="px-6 py-4 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>
                          {formatDateTime(record.date, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {record.report && (
                          <a
                            href={getAttachmentUrl(record.report.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary hover:text-primary-hover p-0.5 rounded-md hover:bg-primary/10 transition-colors inline-flex items-center cursor-pointer"
                            title={t("sharing.downloadReport")}
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{formatDecimal(record.weight, 1)} kg</td>
                    <td className="px-6 py-4 whitespace-nowrap">{record.bmi !== null && record.bmi !== undefined ? formatDecimal(record.bmi, 1) : "-"}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{record.body_fat_pct !== null && record.body_fat_pct !== undefined ? `${formatDecimal(record.body_fat_pct, 1)}%` : "-"}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{record.skeletal_muscle_mass !== null && record.skeletal_muscle_mass !== undefined ? `${formatDecimal(record.skeletal_muscle_mass, 1)} kg` : "-"}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          record.body_score >= 80
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {record.body_score}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => setSelectedRecord(record)}
                        className="inline-flex items-center p-1.5 rounded-lg border border-border hover:bg-muted text-foreground transition-colors cursor-pointer"
                        title={t("sharing.guestViewDetailsTooltip")}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Guest Details Drawer (Simplified Details Side Sheet) */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedRecord(null)}
          />
          <div className="relative w-full max-w-2xl bg-card border-l border-border h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 z-10 text-foreground overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <div>
                <h2 className="text-xl font-bold tracking-tight m-0">
                  {t("sharing.detailsHeader", { date: formatDate(selectedRecord.date) })}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(selectedRecord.date)}</p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                aria-label={t("common.closeModal")}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 p-6 space-y-6">
              {/* Report download button (if sharing attachments is enabled) */}
              {selectedRecord.report && (
                <div className="p-4 bg-muted/20 border border-border rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 text-primary rounded-lg">
                      <Paperclip className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <h4 className="text-sm font-semibold">{selectedRecord.report.filename}</h4>
                      <p className="text-xs text-muted-foreground">
                        {formatDecimal(selectedRecord.report.file_size / (1024 * 1024), 2)} MB
                      </p>
                    </div>
                  </div>
                  <a
                    href={getAttachmentUrl(selectedRecord.report.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-sm"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{t("sharing.downloadReport")}</span>
                  </a>
                </div>
              )}

              {/* Core Body metrics Grid */}
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  {t("history.drawer.coreIndicators")}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-muted/10 p-3 rounded-lg border border-border text-center">
                    <span className="text-xs text-muted-foreground">{t("dashboard.weight")}</span>
                    <p className="text-lg font-bold mt-1 text-foreground">{formatDecimal(selectedRecord.weight, 1)} kg</p>
                  </div>
                  <div className="bg-muted/10 p-3 rounded-lg border border-border text-center">
                    <span className="text-xs text-muted-foreground">{t("history.table.bmi")}</span>
                    <p className="text-lg font-bold mt-1 text-foreground">{formatDecimal(selectedRecord.bmi, 1)}</p>
                  </div>
                  <div className="bg-muted/10 p-3 rounded-lg border border-border text-center">
                    <span className="text-xs text-muted-foreground">{t("dashboard.bodyFat")}</span>
                    <p className="text-lg font-bold mt-1 text-foreground">{formatDecimal(selectedRecord.body_fat_pct, 1)}%</p>
                  </div>
                  <div className="bg-muted/10 p-3 rounded-lg border border-border text-center">
                    <span className="text-xs text-muted-foreground">{t("history.table.bodyScore")}</span>
                    <p className="text-lg font-bold mt-1 text-foreground">{selectedRecord.body_score}</p>
                  </div>
                </div>
              </div>

              {/* Detailed metrics table */}
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  {t("history.drawer.bodyCompositionDetails")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm border-t border-border pt-3">
                  <div className="flex justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">{t("history.drawer.subcutaneousFat")}</span>
                    <span className="font-semibold">{formatDecimal(selectedRecord.subcutaneous_fat_pct, 1)}%</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">{t("history.drawer.visceralFatLevel")}</span>
                    <span className="font-semibold">{selectedRecord.visceral_fat}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">{t("history.drawer.bodyWaterPct")}</span>
                    <span className="font-semibold">{formatDecimal(selectedRecord.body_water_pct, 1)}%</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">{t("history.drawer.muscleMass")}</span>
                    <span className="font-semibold">{formatDecimal(selectedRecord.muscle_mass, 1)} kg</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">{t("history.drawer.boneMass")}</span>
                    <span className="font-semibold">{formatDecimal(selectedRecord.bone_mass, 1)} kg</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">{t("history.drawer.proteinPct")}</span>
                    <span className="font-semibold">{formatDecimal(selectedRecord.protein_pct, 1)}%</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">{t("history.drawer.bmr")}</span>
                    <span className="font-semibold">{formatInteger(selectedRecord.bmr)} kcal</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/40">
                    <span className="text-muted-foreground">{t("history.drawer.metabolicAge")}</span>
                    <span className="font-semibold">{selectedRecord.metabolic_age}</span>
                  </div>
                </div>
              </div>

              {/* Arm/Leg Segmental analysis (if values exist) */}
              {selectedRecord.right_arm_fat_mass !== null && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                    {t("history.drawer.segmentalTitle")}
                  </h3>
                  <div className="bg-card border border-border rounded-xl overflow-hidden text-xs">
                    <div className="grid grid-cols-5 bg-muted/40 font-semibold p-2 border-b border-border text-center">
                      <span className="text-left pl-2">{t("history.drawer.segment")}</span>
                      <span>{t("history.drawer.fatMass")}</span>
                      <span>{t("history.drawer.fatPct")}</span>
                      <span>{t("history.drawer.muscleMass")}</span>
                      <span>{t("history.drawer.musclePct")}</span>
                    </div>
                    <div className="divide-y divide-border/60">
                      {[
                        {
                          name: t("history.drawer.segments.rightArm"),
                          fatM: selectedRecord.right_arm_fat_mass,
                          fatP: selectedRecord.right_arm_fat_pct,
                          musM: selectedRecord.right_arm_muscle_mass,
                          musP: selectedRecord.right_arm_muscle_pct,
                        },
                        {
                          name: t("history.drawer.segments.leftArm"),
                          fatM: selectedRecord.left_arm_fat_mass,
                          fatP: selectedRecord.left_arm_fat_pct,
                          musM: selectedRecord.left_arm_muscle_mass,
                          musP: selectedRecord.left_arm_muscle_pct,
                        },
                        {
                          name: t("history.drawer.segments.trunk"),
                          fatM: selectedRecord.trunk_fat_mass,
                          fatP: selectedRecord.trunk_fat_pct,
                          musM: selectedRecord.trunk_muscle_mass,
                          musP: selectedRecord.trunk_muscle_pct,
                        },
                        {
                          name: t("history.drawer.segments.rightLeg"),
                          fatM: selectedRecord.right_leg_fat_mass,
                          fatP: selectedRecord.right_leg_fat_pct,
                          musM: selectedRecord.right_leg_muscle_mass,
                          musP: selectedRecord.right_leg_muscle_pct,
                        },
                        {
                          name: t("history.drawer.segments.leftLeg"),
                          fatM: selectedRecord.left_leg_fat_mass,
                          fatP: selectedRecord.left_leg_fat_pct,
                          musM: selectedRecord.left_leg_muscle_mass,
                          musP: selectedRecord.left_leg_muscle_pct,
                        },
                      ].map((seg) => (
                        <div key={seg.name} className="grid grid-cols-5 p-2 text-center items-center hover:bg-muted/10">
                          <span className="text-left font-medium pl-2">{seg.name}</span>
                          <span>{seg.fatM !== null && seg.fatM !== undefined ? `${formatDecimal(seg.fatM, 1)} kg` : "—"}</span>
                          <span>{seg.fatP !== null && seg.fatP !== undefined ? `${formatDecimal(seg.fatP, 1)}%` : "—"}</span>
                          <span>{seg.musM !== null && seg.musM !== undefined ? `${formatDecimal(seg.musM, 1)} kg` : "—"}</span>
                          <span>{seg.musP !== null && seg.musP !== undefined ? `${formatDecimal(seg.musP, 1)}%` : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
