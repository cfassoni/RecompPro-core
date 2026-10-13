"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import {
  api,
  type WorkoutItem,
  type MuscleReadinessResponse,
} from "@/lib/api";
import MuscleReadinessWidget from "@/components/activities/MuscleReadinessWidget";
import WorkoutCard from "@/components/activities/WorkoutCard";
import {
  Dumbbell,
  Activity,
  Flame,
  Zap,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Link2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function Activities() {
  const { t } = useTranslation();

  const [workouts, setWorkouts] = useState<WorkoutItem[]>([]);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [readiness, setReadiness] = useState<MuscleReadinessResponse | null>(null);
  const [isLoadingWorkouts, setIsLoadingWorkouts] = useState(true);
  const [isLoadingReadiness, setIsLoadingReadiness] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const fetchWorkouts = useCallback(async (pageNum: number) => {
    try {
      const data = await api.getWorkouts(pageNum, pageSize);
      setWorkouts(data.workouts);
      setTotalWorkouts(data.total);
    } catch (err: unknown) {
      console.error("Failed to load workouts:", err);
    } finally {
      setIsLoadingWorkouts(false);
    }
  }, [pageSize]);

  const fetchReadiness = useCallback(async () => {
    try {
      const data = await api.getMuscleReadiness();
      setReadiness(data);
    } catch (err: unknown) {
      console.error("Failed to load readiness:", err);
    } finally {
      setIsLoadingReadiness(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkouts(page);
  }, [fetchWorkouts, page]);

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
      await Promise.all([fetchWorkouts(1), fetchReadiness()]);
      setPage(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedbackError(msg);
    } finally {
      setIsSyncing(false);
    }
  };

  // Calculate summary metrics across currently visible/all workouts
  const totalVolumeKg = workouts.reduce((sum, w) => sum + (w.totalVolumeKg || 0), 0);
  const totalCalories = workouts.reduce((sum, w) => sum + (w.totalCaloriesBurned || 0), 0);
  const totalEpoc = workouts.reduce((sum, w) => sum + (w.epocCaloriesBurned || 0), 0);
  const rpeWorkouts = workouts.filter((w) => w.avgRpe !== null && w.avgRpe > 0);
  const avgRpe =
    rpeWorkouts.length > 0
      ? rpeWorkouts.reduce((sum, w) => sum + (w.avgRpe || 0), 0) / rpeWorkouts.length
      : null;

  const totalPages = Math.ceil(totalWorkouts / pageSize) || 1;

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-background space-y-8 max-w-7xl mx-auto">
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
          <Link
            href="/profile"
            className="px-3.5 py-2 rounded-xl border border-input bg-background hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span>{t("activities.integrationsLink")}</span>
          </Link>

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

      {/* Muscle Readiness Widget */}
      <MuscleReadinessWidget readiness={readiness} isLoading={isLoadingReadiness} />

      {/* Summary KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sessions */}
        <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase">
            <span>{t("activities.totalSessions")}</span>
            <Dumbbell className="h-4 w-4 text-primary" />
          </div>
          <div className="font-display-metrics text-3xl font-bold text-foreground">
            {totalWorkouts}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("activities.recordedWorkouts")}
          </p>
        </div>

        {/* Total Volume */}
        <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase">
            <span>{t("activities.totalVolume")}</span>
            <Activity className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="font-display-metrics text-3xl font-bold text-foreground">
            {totalVolumeKg.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">kg</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("activities.volumeSum")}
          </p>
        </div>

        {/* Calories with EPOC Decomposition */}
        <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase">
            <span>{t("activities.totalEnergy")}</span>
            <Flame className="h-4 w-4 text-rose-500" />
          </div>
          <div className="font-display-metrics text-3xl font-bold text-foreground">
            {totalCalories.toFixed(0)} <span className="text-sm font-normal text-muted-foreground">kcal</span>
          </div>
          <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1 font-semibold">
            <Sparkles className="h-3 w-3" />
            <span>+{totalEpoc.toFixed(0)} kcal {t("activities.epocDecomposition")}</span>
          </p>
        </div>

        {/* Training Intensity / Average RPE */}
        <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase">
            <span>{t("activities.avgRpe")}</span>
            <Zap className="h-4 w-4 text-amber-500" />
          </div>
          <div className="font-display-metrics text-3xl font-bold text-foreground">
            {avgRpe !== null ? avgRpe.toFixed(1) : "—"}
          </div>
          <p className="text-xs text-muted-foreground">
            {avgRpe !== null ? t("activities.rpeOptimal") : t("activities.noRpeData")}
          </p>
        </div>
      </div>

      {/* Workouts History Feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">
            {t("activities.workoutsHistory")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t("activities.showingCount", { count: workouts.length, total: totalWorkouts })}
          </span>
        </div>

        {isLoadingWorkouts ? (
          <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs">{t("common.loading")}</span>
          </div>
        ) : workouts.length === 0 ? (
          <div className="p-10 rounded-2xl border border-border bg-card text-center space-y-4">
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
        ) : (
          <div className="space-y-3">
            {workouts.map((w) => (
              <WorkoutCard key={w.id} workout={w} />
            ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-border text-xs">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border border-input bg-background hover:bg-muted text-foreground flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>{t("common.previous")}</span>
                </button>

                <span className="text-muted-foreground font-data-mono">
                  {t("activities.pageIndicator", { current: page, total: totalPages })}
                </span>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-input bg-background hover:bg-muted text-foreground flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <span>{t("common.next")}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
