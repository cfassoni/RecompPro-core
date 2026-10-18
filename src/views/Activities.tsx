"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import {
  api,
  type WorkoutItem,
  type MuscleReadinessResponse,
} from "@/lib/api";
import MuscleReadinessWidget from "@/components/activities/MuscleReadinessWidget";
import LoadProgressionWidget from "@/components/activities/LoadProgressionWidget";
import WorkoutCard from "@/components/activities/WorkoutCard";
import { formatDate, formatDateTime } from "@/lib/i18n";
import {
  Dumbbell,
  Activity,
  Flame,
  Zap,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Link2,
  CheckCircle2,
  AlertCircle,
  Search,
  X,
  Trophy,
} from "lucide-react";

type PeriodFilter = "all" | "1m" | "3m" | "6m" | "1y";

export default function Activities() {
  const { t } = useTranslation();

  const [workouts, setWorkouts] = useState<WorkoutItem[]>([]);
  const [readiness, setReadiness] = useState<MuscleReadinessResponse | null>(null);
  const [isLoadingWorkouts, setIsLoadingWorkouts] = useState(true);
  const [isLoadingReadiness, setIsLoadingReadiness] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Top KPI Overview State
  const [kpiPeriod, setKpiPeriod] = useState<PeriodFilter>("all");
  const [isKpiCollapsed, setIsKpiCollapsed] = useState(false);

  // Workouts History Toolbar & Pagination State
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true);
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [filterPrOnly, setFilterPrOnly] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<PeriodFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [historySearchTerm, filterPrOnly, historyPeriod, pageSize]);

  const fetchWorkouts = useCallback(async () => {
    try {
      setIsLoadingWorkouts(true);
      const data = await api.getWorkouts(1, "all");
      setWorkouts(data.workouts || []);
    } catch (err: unknown) {
      console.error("Failed to load workouts:", err);
    } finally {
      setIsLoadingWorkouts(false);
    }
  }, []);

  const fetchReadiness = useCallback(async () => {
    try {
      setIsLoadingReadiness(true);
      const data = await api.getMuscleReadiness();
      setReadiness(data);
    } catch (err: unknown) {
      console.error("Failed to load readiness:", err);
    } finally {
      setIsLoadingReadiness(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkouts();
  }, [fetchWorkouts]);

  useEffect(() => {
    fetchReadiness();
  }, [fetchReadiness]);

  const handleSync = async () => {
    setIsSyncing(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await api.syncHevy(1, 20);
      setFeedbackSuccess(
        t("activities.syncSuccess", {
          synced: res.syncedWorkouts ?? res.inserted ?? 0,
          total: res.totalWorkouts ?? res.total ?? 0,
        })
      );
      // Non-destructive background revalidation
      await Promise.all([fetchWorkouts(), fetchReadiness()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  // Top KPI calculations filtered by selected period
  const kpiFilteredWorkouts = useMemo(() => {
    if (workouts.length === 0) return [];
    if (kpiPeriod === "all") return workouts;

    const referenceTime = Math.max(...workouts.map((w) => new Date(w.startTime).getTime()));
    let days = 30;
    if (kpiPeriod === "1m") days = 30;
    else if (kpiPeriod === "3m") days = 90;
    else if (kpiPeriod === "6m") days = 180;
    else if (kpiPeriod === "1y") days = 365;

    const cutoffTime = referenceTime - days * 24 * 60 * 60 * 1000;
    return workouts.filter((w) => new Date(w.startTime).getTime() >= cutoffTime);
  }, [workouts, kpiPeriod]);

  const kpiTotalSessions = kpiFilteredWorkouts.length;
  const kpiTotalVolumeKg = kpiFilteredWorkouts.reduce((sum, w) => sum + (w.totalVolumeKg || 0), 0);
  const kpiTotalCalories = kpiFilteredWorkouts.reduce((sum, w) => sum + (w.totalCaloriesBurned || 0), 0);
  const kpiTotalEpoc = kpiFilteredWorkouts.reduce((sum, w) => sum + (w.epocCaloriesBurned || 0), 0);
  const kpiRpeWorkouts = kpiFilteredWorkouts.filter((w) => w.avgRpe !== null && w.avgRpe > 0);
  const kpiAvgRpe =
    kpiRpeWorkouts.length > 0
      ? kpiRpeWorkouts.reduce((sum, w) => sum + (w.avgRpe || 0), 0) / kpiRpeWorkouts.length
      : null;

  // History filtering & pagination logic
  const filteredHistoryWorkouts = useMemo(() => {
    if (workouts.length === 0) return [];
    const referenceTime = Math.max(...workouts.map((w) => new Date(w.startTime).getTime()));

    return workouts.filter((w) => {
      if (filterPrOnly && !w.hasProgression) {
        return false;
      }

      if (historyPeriod !== "all") {
        let days = 30;
        if (historyPeriod === "1m") days = 30;
        else if (historyPeriod === "3m") days = 90;
        else if (historyPeriod === "6m") days = 180;
        else if (historyPeriod === "1y") days = 365;

        const cutoffTime = referenceTime - days * 24 * 60 * 60 * 1000;
        if (new Date(w.startTime).getTime() < cutoffTime) {
          return false;
        }
      }

      if (historySearchTerm.trim()) {
        const term = historySearchTerm.toLowerCase();
        const formattedDate = formatDate(w.startTime).toLowerCase();
        const formattedDateTimeStr = formatDateTime(w.startTime).toLowerCase();
        const titleMatch = (w.title || "").toLowerCase().includes(term);
        const dateMatch = formattedDate.includes(term) || formattedDateTimeStr.includes(term);
        const exerciseMatch =
          w.exercises?.some((ex) => (ex.title || "").toLowerCase().includes(term)) ?? false;
        return titleMatch || dateMatch || exerciseMatch;
      }

      return true;
    });
  }, [workouts, filterPrOnly, historyPeriod, historySearchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredHistoryWorkouts.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedWorkouts = useMemo(() => {
    return filteredHistoryWorkouts.slice(
      (safeCurrentPage - 1) * pageSize,
      safeCurrentPage * pageSize
    );
  }, [filteredHistoryWorkouts, safeCurrentPage, pageSize]);

  const periodOptions: PeriodFilter[] = ["all", "1m", "3m", "6m", "1y"];

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-background space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {t("activities.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("activities.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSync}
            disabled={isSyncing}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
            <span>{isSyncing ? t("activities.syncing") : t("activities.syncNow")}</span>
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {feedbackSuccess && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs animate-in fade-in duration-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedbackSuccess}</span>
        </div>
      )}

      {feedbackError && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/25 text-destructive rounded-xl text-xs animate-in fade-in duration-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{feedbackError}</span>
        </div>
      )}

      {/* 1. TOP KPI SUMMARY GROUP */}
      <div className={`bg-card border border-border rounded-2xl p-6 shadow-xs transition-all ${isKpiCollapsed ? "" : "space-y-6"}`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isKpiCollapsed ? "" : "border-b border-border pb-4"}`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {t("activities.kpiOverviewTitle")}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("activities.kpiOverviewSubtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Period Pills: Todos, 1M, 3M, 6M, 1A */}
            <div className="flex bg-muted/60 p-0.5 rounded-xl border border-border/50 text-xs font-semibold">
              {periodOptions.map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setKpiPeriod(period)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    kpiPeriod === period
                      ? "bg-card text-foreground shadow-xs font-bold border border-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(`history.period_${period}`) || period.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsKpiCollapsed(!isKpiCollapsed)}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
              aria-label={isKpiCollapsed ? t("common.expand") : t("common.collapse")}
              title={isKpiCollapsed ? t("common.expand") : t("common.collapse")}
            >
              {isKpiCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {!isKpiCollapsed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Sessions */}
            <div className="p-5 rounded-2xl border border-border bg-background shadow-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase">
                <span>{t("activities.totalSessions")}</span>
                <Dumbbell className="h-4 w-4 text-primary" />
              </div>
              <div className="font-display-metrics text-3xl font-bold text-foreground">
                {kpiTotalSessions}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("activities.recordedWorkouts")}
              </p>
            </div>

            {/* Total Volume */}
            <div className="p-5 rounded-2xl border border-border bg-background shadow-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase">
                <span>{t("activities.totalVolume")}</span>
                <Activity className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="font-display-metrics text-3xl font-bold text-foreground">
                {kpiTotalVolumeKg.toLocaleString()}{" "}
                <span className="text-sm font-normal text-muted-foreground">kg</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("activities.volumeSum")}
              </p>
            </div>

            {/* Total Energy with EPOC */}
            <div className="p-5 rounded-2xl border border-border bg-background shadow-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase">
                <span>{t("activities.totalEnergy")}</span>
                <Flame className="h-4 w-4 text-rose-500" />
              </div>
              <div className="font-display-metrics text-3xl font-bold text-foreground">
                {kpiTotalCalories.toFixed(0)}{" "}
                <span className="text-sm font-normal text-muted-foreground">kcal</span>
              </div>
              <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1 font-semibold">
                <Sparkles className="h-3 w-3" />
                <span>+{kpiTotalEpoc.toFixed(0)} kcal {t("activities.epocDecomposition")}</span>
              </p>
            </div>

            {/* Training Intensity (Average RPE) */}
            <div className="p-5 rounded-2xl border border-border bg-background shadow-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase">
                <span>{t("activities.avgRpe")}</span>
                <Zap className="h-4 w-4 text-amber-500" />
              </div>
              <div className="font-display-metrics text-3xl font-bold text-foreground">
                {kpiAvgRpe !== null ? kpiAvgRpe.toFixed(1) : "—"}
              </div>
              <p className="text-xs text-muted-foreground">
                {kpiAvgRpe !== null ? t("activities.rpeOptimal") : t("activities.noRpeData")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. MUSCLE READINESS WIDGET (COLLAPSED BY DEFAULT) */}
      <MuscleReadinessWidget
        readiness={readiness}
        isLoading={isLoadingReadiness}
        defaultCollapsed={true}
      />

      {/* 3. LOAD PROGRESSION WIDGET (COLLAPSED BY DEFAULT) */}
      <LoadProgressionWidget defaultCollapsed={true} />

      {/* 4. WORKOUTS HISTORY GROUP (COLLAPSED BY DEFAULT) */}
      <div className={`bg-card border border-border rounded-2xl p-6 shadow-xs transition-all ${isHistoryCollapsed ? "" : "space-y-6"}`}>
        {/* Header & Controls */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isHistoryCollapsed ? "" : "border-b border-border pb-4"}`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  {t("activities.workoutsHistory")}
                </h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted border border-border font-data-mono text-muted-foreground">
                  {workouts.length}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("activities.historySubtitle")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer self-start sm:self-auto"
            aria-label={isHistoryCollapsed ? t("common.expand") : t("common.collapse")}
            title={isHistoryCollapsed ? t("common.expand") : t("common.collapse")}
          >
            {isHistoryCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>

        {!isHistoryCollapsed && (
          <>
            {/* Toolbar: Search, PR filter, Period Pills, Items Per Page */}
            <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search Input */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute inset-y-0 left-0 pl-3 h-full w-4 text-muted-foreground flex items-center pointer-events-none" />
                  <input
                    type="text"
                    placeholder={t("activities.historySearchPlaceholder")}
                    value={historySearchTerm}
                    onChange={(e) => setHistorySearchTerm(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-muted-foreground transition-all"
                  />
                  {historySearchTerm && (
                    <button
                      type="button"
                      onClick={() => setHistorySearchTerm("")}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* PR Filter Pill */}
                <button
                  type="button"
                  onClick={() => setFilterPrOnly((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer shrink-0 ${
                    filterPrOnly
                      ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400 shadow-xs"
                      : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  title={filterPrOnly ? t("activities.filterAllWorkouts") : t("activities.filterPrOnly")}
                  aria-label={filterPrOnly ? t("activities.filterAllWorkouts") : t("activities.filterPrOnly")}
                >
                  <Trophy
                    className={`h-3.5 w-3.5 ${
                      filterPrOnly ? "fill-amber-400 text-amber-400" : ""
                    }`}
                  />
                  <span>{t("activities.filterPrOnly")}</span>
                </button>

                {/* Period Pills: Todos, 1M, 3M, 6M, 1A */}
                <div className="flex bg-muted p-0.5 rounded-lg border border-border text-xs font-semibold shrink-0">
                  {periodOptions.map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setHistoryPeriod(period)}
                      className={`px-2.5 py-1.5 rounded-md transition-all cursor-pointer ${
                        historyPeriod === period
                          ? "bg-card text-foreground shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t(`history.period_${period}`) || period.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right side: Items per page selector + Showing summary */}
              <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{t("history.perPageLabel")}</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer font-medium"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <div className="text-xs text-muted-foreground font-medium">
                  {t("activities.showingCount", {
                    count: paginatedWorkouts.length,
                    total: filteredHistoryWorkouts.length,
                  })}
                </div>
              </div>
            </div>

            {/* Workout Feed Content */}
            {isLoadingWorkouts ? (
              <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs">{t("common.loading")}</span>
              </div>
            ) : workouts.length === 0 ? (
              <div className="p-10 rounded-2xl border border-border bg-muted/20 text-center space-y-4">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <Dumbbell className="h-7 w-7" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="text-base font-bold text-foreground">
                    {t("activities.noWorkoutsTitle")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("activities.noWorkoutsDesc")}
                  </p>
                </div>
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold shadow-xs cursor-pointer transition-all"
                >
                  <Link2 className="h-4 w-4" />
                  <span>{t("activities.connectHevyBtn")}</span>
                </Link>
              </div>
            ) : filteredHistoryWorkouts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm bg-muted/20 rounded-xl border border-border/60">
                {t("history.noMatch")}
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedWorkouts.map((w) => (
                  <WorkoutCard key={w.id} workout={w} />
                ))}

                {/* Numbered Pagination Footer */}
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border">
                    <div className="text-xs text-muted-foreground font-data-mono">
                      {t("history.pagination.showingRange", {
                        start: (safeCurrentPage - 1) * pageSize + 1,
                        end: Math.min(safeCurrentPage * pageSize, filteredHistoryWorkouts.length),
                        total: filteredHistoryWorkouts.length,
                      })}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={safeCurrentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-border bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title={t("history.pagination.previous")}
                        aria-label={t("history.pagination.previous")}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>

                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                        if (
                          totalPages > 7 &&
                          page !== 1 &&
                          page !== totalPages &&
                          Math.abs(page - safeCurrentPage) > 1
                        ) {
                          if (page === 2 || page === totalPages - 1) {
                            return (
                              <span key={page} className="px-1.5 text-xs text-muted-foreground select-none">
                                ...
                              </span>
                            );
                          }
                          return null;
                        }

                        return (
                          <button
                            key={page}
                            type="button"
                            onClick={() => setCurrentPage(page)}
                            className={`min-w-8 h-8 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                              safeCurrentPage === page
                                ? "bg-primary text-primary-foreground shadow-xs font-bold"
                                : "border border-border bg-background hover:bg-muted text-foreground"
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        disabled={safeCurrentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="p-1.5 rounded-lg border border-border bg-background text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title={t("history.pagination.next")}
                        aria-label={t("history.pagination.next")}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
