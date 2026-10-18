"use client";

import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { api } from "@/lib/api";
import type {
  DashboardSummary,
  WorkoutStatsResponse,
  MuscleReadinessResponse,
} from "@/lib/api";
import WorkoutStatsWidget from "@/components/activities/WorkoutStatsWidget";
import WorkoutCalendarWidget from "@/components/activities/WorkoutCalendarWidget";
import MuscleReadinessWidget from "@/components/activities/MuscleReadinessWidget";
import { formatDate, formatDateTime, formatDecimal, formatDelta } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import {
  Scale,
  Activity,
  Dumbbell,
  Loader2,
  ArrowRight,
  Database,
  Calendar,
  Flame,
  UtensilsCrossed,
  ChevronRight,
  TrendingDown,
  TrendingUp,
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

type PeriodFilter = "all" | "1m" | "3m" | "6m" | "1y";

interface DashboardProps {
  onNavigateToImport: () => void;
}

export default function Dashboard({ onNavigateToImport }: DashboardProps) {
  const { t } = useTranslation();
  const { enableWipPages } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // States for toggling metrics in chart
  const [showWeight, setShowWeight] = useState(true);
  const [showBodyFat, setShowBodyFat] = useState(false);
  const [showMuscle, setShowMuscle] = useState(false);

  // Period filter state for weight evolution
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("all");

  // States for unit toggling on cards & graphs
  const [bodyFatUnit, setBodyFatUnit] = useState<"pct" | "kg">("pct");
  const [muscleUnit, setMuscleUnit] = useState<"kg" | "pct">("kg");

  // Workout stats & calendar state
  const [workoutStats, setWorkoutStats] = useState<WorkoutStatsResponse | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<PeriodFilter>("3m");
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  // Muscle readiness state
  const [readiness, setReadiness] = useState<MuscleReadinessResponse | null>(null);
  const [isReadinessLoading, setIsReadinessLoading] = useState(true);

  const getMuscleGroupName = (group: string) => {
    const normalized = group === "quads" ? "quadriceps" : group;
    const key = `activities.muscleGroups.${normalized}`;
    const translated = t(key);
    return translated !== key ? translated : group;
  };

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
      try {
        const savedFat = window.localStorage.getItem("recomp_pro_body_fat_unit");
        if (savedFat === "pct" || savedFat === "kg") setBodyFatUnit(savedFat);
        const savedMuscle = window.localStorage.getItem("recomp_pro_muscle_unit");
        if (savedMuscle === "kg" || savedMuscle === "pct") setMuscleUnit(savedMuscle);
      } catch {
        // Ignore storage access restrictions
      }
    }
  }, []);

  const handleBodyFatUnitChange = (unit: "pct" | "kg") => {
    setBodyFatUnit(unit);
    try {
      if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem("recomp_pro_body_fat_unit", unit);
      }
    } catch {
      // Ignore storage access restrictions
    }
  };

  const handleMuscleUnitChange = (unit: "kg" | "pct") => {
    setMuscleUnit(unit);
    try {
      if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
        window.localStorage.setItem("recomp_pro_muscle_unit", unit);
      }
    } catch {
      // Ignore storage access restrictions
    }
  };

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setIsLoading(true);
        const data = await api.getSummary();
        setSummary(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "";
        setError(msg || "error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummary();
  }, []);

  useEffect(() => {
    const fetchWorkoutStats = async () => {
      try {
        setIsStatsLoading(true);
        const data = await api.getWorkoutStats(statsPeriod);
        setWorkoutStats(data);
      } catch (err: unknown) {
        console.error("Failed to load workout stats:", err);
      } finally {
        setIsStatsLoading(false);
      }
    };

    fetchWorkoutStats();
  }, [statsPeriod]);

  useEffect(() => {
    const fetchReadiness = async () => {
      try {
        setIsReadinessLoading(true);
        const data = await api.getMuscleReadiness();
        setReadiness(data);
      } catch (err: unknown) {
        console.error("Failed to load muscle readiness:", err);
      } finally {
        setIsReadinessLoading(false);
      }
    };

    fetchReadiness();
  }, []);

  // Filter history data according to selected period
  const filteredHistory = useMemo(() => {
    if (!summary || !summary.weight_history || summary.weight_history.length === 0) {
      return [];
    }

    if (selectedPeriod === "all") {
      return summary.weight_history;
    }

    const latestPoint = summary.weight_history[summary.weight_history.length - 1];
    const latestTs = summary.latest_record_date
      ? new Date(summary.latest_record_date).getTime()
      : new Date(latestPoint.date).getTime();

    let days = 30;
    if (selectedPeriod === "1m") days = 30;
    else if (selectedPeriod === "3m") days = 90;
    else if (selectedPeriod === "6m") days = 180;
    else if (selectedPeriod === "1y") days = 365;

    const cutoffTs = latestTs - days * 24 * 60 * 60 * 1000;
    const filtered = summary.weight_history.filter(
      (point) => new Date(point.date).getTime() >= cutoffTs
    );

    // If filter results in empty or single point, fall back to entire history
    return filtered.length > 0 ? filtered : summary.weight_history;
  }, [summary, selectedPeriod]);

  // Format date ticks for XAxis
  const formattedChartData = useMemo(() => {
    if (!filteredHistory || filteredHistory.length === 0) return [];

    const dateDayCounts = new Map<string, number>();
    for (const point of filteredHistory) {
      const dayLabel = formatDate(point.date, {
        month: "short",
        day: "numeric",
        year: "2-digit",
      });
      dateDayCounts.set(dayLabel, (dateDayCounts.get(dayLabel) ?? 0) + 1);
    }

    return filteredHistory.map((point) => {
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
  }, [filteredHistory]);

  const formatChange = (val: number | null | undefined, unit: string, lowerIsBetter: boolean) => {
    if (val === null || val === undefined) return "0";
    const delta = formatDelta(val, 2, unit);
    const formatted = delta ? delta.formatted : "0";

    let colorClass = "text-muted-foreground bg-muted";
    let IconComponent = null;

    if (val !== 0) {
      const isGood = val < 0 ? lowerIsBetter : !lowerIsBetter;
      colorClass = isGood
        ? "text-emerald-700 bg-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/15"
        : "text-rose-700 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-500/15";
      IconComponent = val > 0 ? TrendingUp : TrendingDown;
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold font-data-mono ${colorClass}`}>
        {IconComponent && <IconComponent className="h-3 w-3" />}
        <span>{formatted}</span>
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">{t("dashboard.loadingSummary")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="bg-destructive/10 border border-destructive/25 text-destructive p-4 rounded-xl flex items-center gap-3">
          <Activity className="h-5 w-5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">{t("dashboard.errorTitle")}</h3>
            <p className="text-xs opacity-90">{error === "error" ? t("dashboard.errorLoad") : error}</p>
          </div>
        </div>
      </div>
    );
  }

  const hasRecords = summary && summary.total_records > 0;

  if (!hasRecords) {
    return (
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full flex flex-col justify-center items-center text-center">
        <div className="max-w-md bg-card border border-border rounded-2xl p-8 shadow-sm flex flex-col items-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
            <Database className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">{t("dashboard.noData")}</h2>
          <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
            {t("dashboard.noDataDesc")}
          </p>
          <button
            onClick={onNavigateToImport}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm transition-all shadow-md shadow-primary/10 hover:shadow-lg cursor-pointer"
          >
            <span>{t("dashboard.importBtn")}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto space-y-8 max-w-7xl mx-auto w-full animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground m-0">
            {t("dashboard.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("dashboard.subtitle", {
              count: summary?.total_records,
              startDate: formatDate(summary?.first_record_date),
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground self-start sm:self-center shadow-xs">
          <Calendar className="h-4 w-4 text-primary" />
          <span>
            {t("dashboard.latestRecord", {
              date: formatDateTime(summary!.latest_record_date),
            })}
          </span>
        </div>
      </div>

      {/* Hero 3 Bento Cards Row: Weight, Body Fat, Skeletal Muscle */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Weight */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <span className="font-label-caps text-muted-foreground">
              {t("dashboard.weight")}
            </span>
            <div className="p-2.5 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 rounded-xl">
              <Scale className="h-5 w-5" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="font-display-metrics text-foreground">
                {formatDecimal(summary?.current_weight, 1)}
              </span>
              <span className="text-sm font-normal text-muted-foreground">kg</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {formatChange(summary!.weight_change, " kg", true)}
              <span className="text-xs text-muted-foreground font-data-mono">
                {t("dashboard.starting")} {formatDecimal(summary?.starting_weight, 1)} kg
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Body Fat */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <span className="font-label-caps text-muted-foreground">
              {t("dashboard.bodyFat")}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex bg-muted p-0.5 rounded-lg border border-border text-[10px]">
                <button
                  type="button"
                  onClick={() => handleBodyFatUnitChange("pct")}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                    bodyFatUnit === "pct"
                      ? "bg-card text-foreground shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => handleBodyFatUnitChange("kg")}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                    bodyFatUnit === "kg"
                      ? "bg-card text-foreground shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  kg
                </button>
              </div>
              <div className="p-2.5 bg-rose-500/10 text-rose-500 dark:text-rose-400 rounded-xl">
                <Activity className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="font-display-metrics text-foreground">
                {bodyFatUnit === "pct"
                  ? formatDecimal(summary?.current_body_fat, 1)
                  : formatDecimal(summary?.current_body_fat_mass, 1)}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {bodyFatUnit === "pct" ? "%" : "kg"}
              </span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {bodyFatUnit === "pct"
                ? formatChange(summary!.body_fat_change, "%", true)
                : formatChange(summary!.body_fat_mass_change, " kg", true)}
              <span className="text-xs text-muted-foreground font-data-mono">
                {t("dashboard.starting")}{" "}
                {bodyFatUnit === "pct"
                  ? `${formatDecimal(summary?.starting_body_fat, 1)}%`
                  : `${formatDecimal(summary?.starting_body_fat_mass, 1)} kg`}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Skeletal Muscle */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <span className="font-label-caps text-muted-foreground">
              {t("dashboard.smmCard")}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex bg-muted p-0.5 rounded-lg border border-border text-[10px]">
                <button
                  type="button"
                  onClick={() => handleMuscleUnitChange("pct")}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                    muscleUnit === "pct"
                      ? "bg-card text-foreground shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => handleMuscleUnitChange("kg")}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
                    muscleUnit === "kg"
                      ? "bg-card text-foreground shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  kg
                </button>
              </div>
              <div className="p-2.5 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 rounded-xl">
                <Dumbbell className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="font-display-metrics text-foreground">
                {muscleUnit === "kg"
                  ? formatDecimal(summary?.current_skeletal_muscle_mass, 1)
                  : formatDecimal(summary?.current_skeletal_muscle_mass_pct, 1)}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                {muscleUnit === "kg" ? "kg" : "%"}
              </span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {muscleUnit === "kg"
                ? formatChange(summary!.skeletal_muscle_mass_change, " kg", false)
                : formatChange(summary!.skeletal_muscle_mass_pct_change, "%", false)}
              <span className="text-xs text-muted-foreground font-data-mono">
                {t("dashboard.starting")}{" "}
                {muscleUnit === "kg"
                  ? `${formatDecimal(summary?.starting_skeletal_muscle_mass, 1)} kg`
                  : `${formatDecimal(summary?.starting_skeletal_muscle_mass_pct, 1)}%`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Bento Grid: Weight Evolution (8 cols when WiP enabled, 12 cols otherwise) + Up Next Workout (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weight Evolution Chart Widget */}
        <div
          className={`${
            enableWipPages ? "lg:col-span-8" : "lg:col-span-12"
          } bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between`}
        >
          <div>
            {/* Chart Header + Controls */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {t("dashboard.weightHistoryTitle")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.metricsToShow")}
                </p>
              </div>

              {/* Controls: Period filters & Metric Multi-Select Toggles */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Period filter pills */}
                <div className="flex bg-muted p-0.5 rounded-lg border border-border text-xs font-semibold">
                  {(["all", "1m", "3m", "6m", "1y"] as PeriodFilter[]).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setSelectedPeriod(period)}
                      className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                        selectedPeriod === period
                          ? "bg-card text-foreground shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t(`history.period_${period}`) || period.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Metric toggles */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowWeight(!showWeight)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      showWeight
                        ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 font-bold"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full bg-indigo-500 ${
                        showWeight ? "scale-100" : "scale-50 opacity-40"
                      }`}
                    />
                    <span>{t("dashboard.weight")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowBodyFat(!showBodyFat)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      showBodyFat
                        ? "bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400 font-bold"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full bg-rose-500 ${
                        showBodyFat ? "scale-100" : "scale-50 opacity-40"
                      }`}
                    />
                    <span>{t("dashboard.bodyFat")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowMuscle(!showMuscle)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      showMuscle
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full bg-emerald-500 ${
                        showMuscle ? "scale-100" : "scale-50 opacity-40"
                      }`}
                    />
                    <span>{t("dashboard.smmCard")}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* The Chart Container */}
            <div className="h-[360px] w-full">
              {!showWeight && !showBodyFat && !showMuscle ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center p-4">
                  {t("dashboard.selectAtLeastOneMetric")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={formattedChartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      opacity={0.6}
                    />
                    <XAxis
                      dataKey="displayDate"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      dy={10}
                    />
                    <YAxis
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      dx={-5}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      formatter={(value: unknown, name?: unknown) => {
                        const valNum =
                          typeof value === "number" ? formatDecimal(value, 1) : String(value);
                        const nameStr = String(name || "");
                        if (nameStr.includes("%")) return [`${valNum}%`, nameStr];
                        if (nameStr.includes("kg")) return [`${valNum} kg`, nameStr];
                        return [valNum, nameStr];
                      }}
                      contentStyle={{
                        backgroundColor: "var(--color-card)",
                        borderColor: "var(--color-border)",
                        borderRadius: "0.75rem",
                        color: "var(--color-foreground)",
                        fontSize: "12px",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                      }}
                      labelStyle={{ fontWeight: "bold", marginBottom: "4px" }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "12px" }}
                    />

                    {showWeight && (
                      <Line
                        name={`${t("dashboard.weight")} (kg)`}
                        type="monotone"
                        dataKey="weight"
                        stroke="#6366f1"
                        strokeWidth={3}
                        dot={{ r: 3, strokeWidth: 1 }}
                        activeDot={{ r: 6 }}
                      />
                    )}

                    {showBodyFat && (
                      <Line
                        name={`${t("dashboard.bodyFat")} (${bodyFatUnit === "pct" ? "%" : "kg"})`}
                        type="monotone"
                        dataKey={bodyFatUnit === "pct" ? "body_fat_pct" : "body_fat_mass"}
                        stroke="#f43f5e"
                        strokeWidth={3}
                        dot={{ r: 3, strokeWidth: 1 }}
                        activeDot={{ r: 6 }}
                      />
                    )}

                    {showMuscle && (
                      <Line
                        name={`${t("dashboard.skeletalMuscle")} (${muscleUnit === "kg" ? "kg" : "%"})`}
                        type="monotone"
                        dataKey={
                          muscleUnit === "kg"
                            ? "skeletal_muscle_mass"
                            : "skeletal_muscle_mass_pct"
                        }
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 3, strokeWidth: 1 }}
                        activeDot={{ r: 6 }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Up Next Workout Bento Card (4 cols) — [Interim Test Lab Mockup] */}
        {enableWipPages && (
          <div className="lg:col-span-4 bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Flame className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {t("dashboard.upNext")}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {readiness?.smartRecommendation?.message ||
                        t("dashboard.upNextSubtitle")}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                  {t("dashboard.mockupBadge")}
                </span>
              </div>

              {/* Routine summary */}
              <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-3 my-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm text-foreground block">
                      {t("dashboard.routineCategory")}
                    </span>
                    {readiness?.smartRecommendation?.suggestedFocus && (
                      <span className="text-[11px] text-primary font-medium">
                        {t("activities.readiness.suggestedFocus")}:{" "}
                        {getMuscleGroupName(
                          typeof readiness.smartRecommendation.suggestedFocus === "string"
                            ? readiness.smartRecommendation.suggestedFocus
                            : readiness.smartRecommendation.suggestedFocus[0]
                        )}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-data-mono font-medium text-muted-foreground">
                    65 min
                  </span>
                </div>
                {/* Intensity indicator */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground font-medium">
                    {t("dashboard.intensity")}:
                  </span>
                  <div className="flex gap-1">
                    <span className="h-2 w-3 rounded-xs bg-emerald-500" />
                    <span className="h-2 w-3 rounded-xs bg-emerald-500" />
                    <span className="h-2 w-3 rounded-xs bg-emerald-500" />
                    <span
                      className={`h-2 w-3 rounded-xs ${
                        readiness?.overallReadiness === "exhausted"
                          ? "bg-muted border border-border"
                          : "bg-emerald-500"
                      }`}
                    />
                    <span
                      className={`h-2 w-3 rounded-xs ${
                        readiness?.overallReadiness === "ready"
                          ? "bg-emerald-500"
                          : "bg-muted border border-border"
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Exercises list preview */}
              <div className="space-y-2">
                <span className="font-label-caps text-muted-foreground block text-[11px]">
                  {t("dashboard.routinePreview")}
                </span>
                <ul className="space-y-2 text-xs">
                  <li className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/50">
                    <span className="font-medium text-foreground">
                      {t("dashboard.workoutExercise1")}
                    </span>
                    <span className="font-data-mono text-muted-foreground">4 × 8-10</span>
                  </li>
                  <li className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/50">
                    <span className="font-medium text-foreground">
                      {t("dashboard.workoutExercise2")}
                    </span>
                    <span className="font-data-mono text-muted-foreground">3 × 6-8</span>
                  </li>
                  <li className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/50">
                    <span className="font-medium text-foreground">
                      {t("dashboard.workoutExercise3")}
                    </span>
                    <span className="font-data-mono text-muted-foreground">4 × 10-12</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-border">
              <Link
                href="/activities"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-xl shadow-md shadow-primary/10 transition-colors"
              >
                <span>{t("dashboard.startWorkout")}</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Strength Workouts & Calendar Bento Grid Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <WorkoutStatsWidget
            stats={workoutStats}
            selectedPeriod={statsPeriod}
            onPeriodChange={(p) => setStatsPeriod(p)}
            isLoading={isStatsLoading}
          />
        </div>
        <div className="lg:col-span-5">
          <WorkoutCalendarWidget
            calendarDays={workoutStats?.calendarDays || {}}
            isLoading={isStatsLoading}
          />
        </div>
      </div>

      {/* Muscle Group Readiness Widget */}
      <MuscleReadinessWidget
        readiness={readiness}
        isLoading={isReadinessLoading}
        compact={true}
      />

      {/* Nutrition Today Card (Bottom Wide Bento Card) — [Interim Test Lab Mockup] */}
      {enableWipPages && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <UtensilsCrossed className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    {t("dashboard.nutritionToday")}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.nutritionSubtitle")}
                  </p>
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                {t("dashboard.mockupBadge")}
              </span>
            </div>

            {/* Calories summary & Macro bars */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              {/* Calories circular/progress summary (4 cols) */}
              <div className="md:col-span-4 p-5 bg-muted/30 border border-border rounded-xl text-center space-y-2">
                <span className="font-label-caps text-muted-foreground block text-[11px]">
                  {t("dashboard.caloricBudget")}
                </span>
                <div className="font-display-metrics text-foreground text-3xl">
                  2,150 <span className="text-sm font-normal text-muted-foreground">/ 2,500 kcal</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-2.5 rounded-full"
                    style={{ width: "86%" }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  350 kcal {t("dashboard.remainingCalories")}
                </p>
              </div>

              {/* Macros breakdown bars (8 cols) */}
              <div className="md:col-span-8 space-y-3">
                {/* Protein */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {t("dashboard.macroProtein")} (89%)
                    </span>
                    <span className="font-data-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      160g / 180g
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{ width: "89%" }}
                    />
                  </div>
                </div>

                {/* Carbs */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {t("dashboard.macroCarbs")} (70%)
                    </span>
                    <span className="font-data-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      210g / 300g
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-2 rounded-full"
                      style={{ width: "70%" }}
                    />
                  </div>
                </div>

                {/* Fats */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">
                      {t("dashboard.macroFats")} (80%)
                    </span>
                    <span className="font-data-mono font-semibold text-amber-600 dark:text-amber-500">
                      52g / 65g
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-amber-500 h-2 rounded-full"
                      style={{ width: "80%" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-6 border-t border-border flex justify-end">
            <Link
              href="/nutrition"
              className="flex items-center gap-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <span>{t("dashboard.viewNutrition")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
