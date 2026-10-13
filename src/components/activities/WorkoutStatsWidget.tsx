"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { WorkoutStatsResponse, WorkoutChartPoint } from "@/lib/api";
import { Dumbbell, Flame } from "lucide-react";

interface WorkoutStatsWidgetProps {
  stats: WorkoutStatsResponse | null;
  selectedPeriod: "all" | "1m" | "3m" | "6m" | "1y";
  onPeriodChange: (period: "all" | "1m" | "3m" | "6m" | "1y") => void;
  isLoading?: boolean;
}

type MetricTab = "duration" | "reps" | "volume";

export default function WorkoutStatsWidget({
  stats,
  selectedPeriod,
  onPeriodChange,
  isLoading = false,
}: WorkoutStatsWidgetProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<MetricTab>("duration");

  const formatDurationText = (seconds: number) => {
    const totalMins = Math.round(seconds / 60);
    if (totalMins < 60) return `${totalMins} min`;
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
  };

  const periodOptions: ("all" | "1m" | "3m" | "6m" | "1y")[] = [
    "all",
    "1m",
    "3m",
    "6m",
    "1y",
  ];

  // Headline value & label based on active tab
  const headlineStat = useMemo(() => {
    if (!stats || !stats.summary) {
      return { value: "—", label: t("dashboard.workoutStats.thisWeek") };
    }

    if (activeTab === "duration") {
      return {
        value: formatDurationText(stats.summary.currentWeekDurationSeconds),
        label: t("dashboard.workoutStats.thisWeek"),
      };
    } else if (activeTab === "reps") {
      return {
        value: stats.summary.currentWeekReps.toLocaleString(),
        label: t("dashboard.workoutStats.thisWeek"),
      };
    } else {
      return {
        value: `${stats.summary.currentWeekVolumeKg.toLocaleString()} kg`,
        label: t("dashboard.workoutStats.thisWeek"),
      };
    }
  }, [stats, activeTab, t]);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 shadow-xs animate-pulse flex flex-col justify-between h-[360px]">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-36 bg-muted rounded" />
          <div className="h-7 w-48 bg-muted rounded-lg" />
        </div>
        <div className="h-8 w-44 bg-muted/80 rounded my-2" />
        <div className="h-[200px] w-full bg-muted/30 rounded-xl mt-auto" />
      </div>
    );
  }

  const chartData = stats?.chartData || [];
  const hasData = chartData.some(
    (d) =>
      d.durationSeconds > 0 ||
      (d.reps && d.reps > 0) ||
      (d.volumeKg && d.volumeKg > 0)
  );

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between relative overflow-hidden">
      <div>
        {/* Top Header: Title & Period Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Dumbbell className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-foreground">
              {t("dashboard.workoutStats.title")}
            </h3>
          </div>

          {/* Horizon Presets: All, 1M, 3M, 6M, 1Y */}
          <div className="bg-muted/60 p-0.5 rounded-lg border border-border flex items-center text-xs font-medium self-start sm:self-auto">
            {periodOptions.map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => onPeriodChange(period)}
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
        </div>

        {/* Metric Selector Tabs */}
        <div className="flex items-center gap-6 border-b border-border/70 mb-4 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("duration")}
            className={`pb-2.5 transition-all cursor-pointer border-b-2 -mb-[1px] ${
              activeTab === "duration"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dashboard.workoutStats.durationTab")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reps")}
            className={`pb-2.5 transition-all cursor-pointer border-b-2 -mb-[1px] ${
              activeTab === "reps"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dashboard.workoutStats.repsTab")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("volume")}
            className={`pb-2.5 transition-all cursor-pointer border-b-2 -mb-[1px] ${
              activeTab === "volume"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("dashboard.workoutStats.volumeTab")}
          </button>
        </div>

        {/* Highlight Stat Display */}
        <div className="flex items-baseline gap-2 mb-4">
          <span className="font-display-metrics text-foreground text-3xl">
            {headlineStat.value}
          </span>
          <span className="text-xs text-muted-foreground font-medium">
            {headlineStat.label}
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-[210px] w-full mt-2">
        {!hasData ? (
          <div className="h-full flex flex-col items-center justify-center p-4 bg-muted/20 border border-border/50 rounded-xl text-center">
            <Flame className="h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground max-w-sm">
              {t("dashboard.workoutStats.noWorkouts")}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="hsl(var(--border))"
                opacity={0.4}
              />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val: number) => {
                  if (activeTab === "duration") return `${val}h`;
                  if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                  return `${val}`;
                }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as WorkoutChartPoint;
                    return (
                      <div className="bg-popover border border-border rounded-xl p-3 shadow-lg text-xs space-y-1.5 min-w-[140px]">
                        <div className="font-semibold text-foreground border-b border-border pb-1">
                          {data.label}
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground gap-3">
                          <span>{t("dashboard.workoutStats.durationTab")}:</span>
                          <span className="font-data-mono font-medium text-foreground">
                            {formatDurationText(data.durationSeconds)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground gap-3">
                          <span>{t("dashboard.workoutStats.repsTab")}:</span>
                          <span className="font-data-mono font-medium text-foreground">
                            {data.reps.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground gap-3">
                          <span>{t("dashboard.workoutStats.volumeTab")}:</span>
                          <span className="font-data-mono font-medium text-foreground">
                            {data.volumeKg.toLocaleString()} kg
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground gap-3 pt-1 border-t border-border/50 text-[11px]">
                          <span>{t("activities.totalSessions")}:</span>
                          <span className="font-data-mono font-medium text-primary">
                            {data.workoutsCount}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey={
                  activeTab === "duration"
                    ? "durationHours"
                    : activeTab === "reps"
                    ? "reps"
                    : "volumeKg"
                }
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
