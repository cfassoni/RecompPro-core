"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import type { MuscleReadinessResponse } from "@/lib/api";
import { formatDecimal, formatInteger } from "@/lib/i18n";
import {
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  ArrowRight,
  Info,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface MuscleReadinessWidgetProps {
  readiness: MuscleReadinessResponse | null;
  isLoading?: boolean;
  compact?: boolean;
  defaultCollapsed?: boolean;
}

export default function MuscleReadinessWidget({
  readiness,
  isLoading = false,
  compact = false,
  defaultCollapsed = false,
}: MuscleReadinessWidgetProps) {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const getStatusBadge = (status: "ready" | "recovering" | "exhausted") => {
    switch (status) {
      case "ready":
        return {
          bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
          barBg: "bg-emerald-500",
          icon: CheckCircle2,
          label: t("activities.readiness.statusReady"),
        };
      case "recovering":
        return {
          bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
          barBg: "bg-amber-500",
          icon: Clock,
          label: t("activities.readiness.statusRecovering"),
        };
      case "exhausted":
        return {
          bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
          barBg: "bg-rose-500",
          icon: AlertTriangle,
          label: t("activities.readiness.statusExhausted"),
        };
    }
  };

  const getMuscleGroupName = (group: string) => {
    const normalized = group === "quads" ? "quadriceps" : group;
    const key = `activities.muscleGroups.${normalized}`;
    const translated = t(key);
    return translated !== key ? translated : group;
  };

  if (isLoading) {
    return (
      <div className={`bg-card border border-border rounded-2xl p-6 shadow-xs animate-pulse ${compact ? "h-full flex flex-col justify-between" : ""}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-40 bg-muted rounded" />
          <div className="h-5 w-20 bg-muted rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-muted/60 rounded" />
          <div className="h-4 w-3/4 bg-muted/60 rounded" />
          <div className="h-16 w-full bg-muted/40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!readiness || !readiness.muscleGroups || readiness.muscleGroups.length === 0) {
    return (
      <div className={`bg-card border border-border rounded-2xl p-6 shadow-xs ${compact ? "h-full flex flex-col justify-between" : ""}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {t("activities.readiness.title")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("activities.readiness.subtitle")}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-muted/20 border border-border/60 rounded-xl text-center space-y-2 my-2">
          <Flame className="h-6 w-6 text-muted-foreground mx-auto" />
          <p className="text-xs text-muted-foreground">
            {t("activities.readiness.noData")}
          </p>
        </div>

        {compact && (
          <div className="pt-3 mt-auto border-t border-border">
            <Link
              href="/activities"
              className="flex items-center justify-center gap-1.5 w-full py-2 px-3 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              <span>{t("activities.viewWorkouts")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    );
  }

  const overallBadge = getStatusBadge(readiness.overallReadiness);
  const OverallIcon = overallBadge.icon;

  // COMPACT VIEW (DASHBOARD)
  if (compact) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col justify-between relative overflow-hidden">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {t("activities.readiness.title")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("activities.readiness.subtitle")}
                </p>
              </div>
            </div>

            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${overallBadge.bg}`}>
              <OverallIcon className="h-3.5 w-3.5" />
              <span>{overallBadge.label}</span>
            </div>
          </div>

          {/* Smart Recommendation */}
          <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl mb-4">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-foreground leading-relaxed">
                {readiness.smartRecommendation.message}
              </p>
            </div>
          </div>

          {/* Mini Muscle Bars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 my-2">
            {readiness.muscleGroups.map((mg) => {
              const mgBadge = getStatusBadge(mg.status);
              return (
                <div key={mg.group} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground text-[11px]">
                      {getMuscleGroupName(mg.group)}
                    </span>
                    <span className="font-data-mono text-[11px] font-semibold text-muted-foreground">
                      {mg.readinessScore}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full ${mgBadge.barBg}`}
                      style={{ width: `${mg.readinessScore}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Link */}
        <div className="pt-4 mt-4 border-t border-border">
          <Link
            href="/activities"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-xl shadow-md shadow-primary/10 transition-colors"
          >
            <span>{t("activities.viewWorkouts")}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  // FULL VIEW (ACTIVITIES PAGE)
  return (
    <div className={`bg-card border border-border rounded-2xl p-6 shadow-xs transition-all ${isCollapsed ? "" : "space-y-6"}`}>
      {/* Top Banner: Overall Status + Scientific context */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 ${isCollapsed ? "" : "border-b border-border pb-5"}`}>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-foreground">
                {t("activities.readiness.title")}
              </h3>
              <div className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${overallBadge.bg}`}>
                <OverallIcon className="h-3.5 w-3.5" />
                <span>{overallBadge.label}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("activities.readiness.scientificNotice")}
            </p>
          </div>
        </div>

        {/* User Biometric Adaptation Badge & Collapse Button */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground">
            <Info className="h-4 w-4 text-primary shrink-0" />
            <span>
              {t("activities.readiness.biometricModulation", {
                gender: readiness.userProfile.gender,
                age: readiness.userProfile.age ?? "—",
                weight: formatDecimal(readiness.userProfile.effectiveWeightKg, 1),
              })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            aria-label={isCollapsed ? t("common.expand") : t("common.collapse")}
            title={isCollapsed ? t("common.expand") : t("common.collapse")}
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Smart Recommendation Banner */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
            {t("activities.readiness.recommendationTitle")}
          </h4>
          <p className="text-sm text-foreground leading-relaxed">
            {readiness.smartRecommendation.message}
          </p>
          {readiness.smartRecommendation.suggestedFocus.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground">
                {t("activities.readiness.suggestedFocus")}:
              </span>
              {readiness.smartRecommendation.suggestedFocus.map((f) => (
                <span
                  key={f}
                  className="px-2 py-0.5 rounded-md text-xs font-semibold bg-primary/10 text-primary border border-primary/25"
                >
                  {getMuscleGroupName(f)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 6 Muscle Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {readiness.muscleGroups.map((mg) => {
          const badge = getStatusBadge(mg.status);
          const Icon = badge.icon;
          const isFull = mg.readinessScore === 100;

          return (
            <div
              key={mg.group}
              className="p-4 rounded-xl border border-border bg-card/60 hover:bg-muted/20 transition-all space-y-3"
            >
              {/* Group Name & Status Badge */}
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-foreground">
                  {getMuscleGroupName(mg.group)}
                </span>
                <div className="flex items-center gap-1.5">
                  {typeof mg.recommendedVolumeMultiplier === "number" && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        mg.recommendedVolumeMultiplier === 1.0
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
                          : mg.recommendedVolumeMultiplier === 0.8
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25"
                      }`}
                      title={t("activities.readiness.volumeMultiplierTooltip", {
                        pct: Math.round(mg.recommendedVolumeMultiplier * 100),
                      })}
                    >
                      {mg.recommendedVolumeMultiplier === 1.0
                        ? "100% Vol"
                        : mg.recommendedVolumeMultiplier === 0.8
                        ? "80% Vol"
                        : "Rest"}
                    </span>
                  )}
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.bg}`}>
                    <Icon className="h-3 w-3" />
                    <span>{badge.label}</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground text-[11px]">
                    {t("activities.readiness.readiness")}
                  </span>
                  <span className="font-data-mono font-bold text-foreground text-xs">
                    {mg.readinessScore}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${badge.barBg}`}
                    style={{ width: `${mg.readinessScore}%` }}
                  />
                </div>
              </div>

              {/* Training History & Recovery Stats */}
              <div className="pt-2 border-t border-border/50 text-[11px] space-y-1 text-muted-foreground">
                {mg.lastTrainedAt ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span>{t("activities.readiness.lastTrained")}:</span>
                      <strong className="text-foreground font-data-mono">
                        {mg.hoursSinceLastTrained !== null
                          ? `${Math.round(mg.hoursSinceLastTrained)}h ${t("activities.readiness.ago")}`
                          : "—"}
                      </strong>
                    </div>

                    {!isFull && mg.remainingRecoveryHours > 0 && (
                      <div className="flex items-center justify-between">
                        <span>{t("activities.readiness.recoveryRemaining")}:</span>
                        <strong className="text-amber-600 dark:text-amber-400 font-data-mono">
                          ~{Math.round(mg.remainingRecoveryHours)}h / {Math.round(mg.recommendedRecoveryHours)}h
                        </strong>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span>{t("activities.readiness.lastVolume")}:</span>
                      <span className="font-data-mono">
                        {formatInteger(mg.lastVolumeKg)} kg ({mg.lastSetCount} {t("activities.sets")})
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-1 text-muted-foreground/80 italic">
                    {t("activities.readiness.fullyRested")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
