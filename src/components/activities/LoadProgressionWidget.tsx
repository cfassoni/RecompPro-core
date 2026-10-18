"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { PeriodExerciseProgressionItem, WorkoutProgressionsResponse } from "@/lib/api";
import { api } from "@/lib/api";
import {
  Trophy,
  ArrowUpRight,
  Loader2,
  Sparkles,
  Dumbbell,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type PeriodOption = "all" | "1m" | "3m" | "6m" | "1y";

const PERIODS: PeriodOption[] = ["1m", "3m", "6m", "1y", "all"];

interface LoadProgressionWidgetProps {
  defaultCollapsed?: boolean;
}

export default function LoadProgressionWidget({
  defaultCollapsed = false,
}: LoadProgressionWidgetProps = {}) {
  const { t } = useTranslation();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>("1m");
  const [data, setData] = useState<WorkoutProgressionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    let isMounted = true;
    const fetchProgressions = async () => {
      try {
        setIsLoading(true);
        const res = await api.getWorkoutProgressions(selectedPeriod);
        if (isMounted) {
          setData(res);
        }
      } catch (err) {
        console.error("Failed to load workout progressions:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchProgressions();
    return () => {
      isMounted = false;
    };
  }, [selectedPeriod]);

  const getMuscleGroupName = (group: string | null) => {
    if (!group) return null;
    const key = `activities.muscleGroups.${group}`;
    const translated = t(key);
    return translated !== key ? translated : group;
  };

  return (
    <div className={`bg-card border border-border rounded-2xl p-6 shadow-xs transition-all ${isCollapsed ? "" : "space-y-5"}`}>
      {/* Header & Controls */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isCollapsed ? "" : "border-b border-border pb-4"}`}>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">
                {t("activities.progression.widgetTitle")}
              </h3>
              {data && data.totalPrsInPeriod > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  <Sparkles className="h-2.5 w-2.5" />
                  {data.totalPrsInPeriod} {t("activities.progression.prPlural")}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("activities.progression.widgetSubtitle")}
            </p>
          </div>
        </div>

        {/* Time Horizon Filter Buttons & Collapse Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/50">
            {PERIODS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedPeriod(key)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  selectedPeriod === key
                    ? "bg-card text-foreground shadow-xs border border-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`history.period_${key}`) || key.toUpperCase()}
              </button>
            ))}
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
          {/* Content */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          <span className="text-xs">{t("common.loading")}</span>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="py-8 text-center space-y-2 bg-muted/20 border border-border/60 rounded-xl p-6">
          <Dumbbell className="h-8 w-8 text-muted-foreground/60 mx-auto" />
          <h4 className="text-sm font-semibold text-foreground">
            {t("activities.progression.emptyTitle")}
          </h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {t("activities.progression.emptySubtitle")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary Badges Bar */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground px-1">
            <span>
              {t("activities.progression.exercisesProgressed", {
                count: data.exercisesProgressedCount,
              })}
            </span>
            <span>•</span>
            <span>
              {t("activities.progression.totalMilestones", {
                count: data.totalPrsInPeriod,
              })}
            </span>
          </div>

          {/* Exercises Progression List */}
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {data.items.map((item: PeriodExerciseProgressionItem) => {
              const mgName = getMuscleGroupName(item.primaryMuscleGroup);
              const isAssisted = item.isAssisted;

              return (
                <div
                  key={item.canonicalKey}
                  className="p-3.5 rounded-xl border border-border bg-card/60 hover:bg-muted/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">
                        {item.title}
                      </span>
                      {mgName && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {mgName}
                        </span>
                      )}
                      {item.prCountInPeriod > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                          <Trophy className="h-2.5 w-2.5 text-amber-500" />
                          <span>{item.prCountInPeriod}x PR</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {t("activities.progression.periodRange")}:{" "}
                        <strong className="text-foreground font-data-mono">
                          {item.startWeightKg} kg ➔ {item.currentWeightKg} kg
                          {isAssisted ? ` (${t("activities.progression.assistedLabel")})` : ""}
                        </strong>
                      </span>
                      {item.bestEst1RmKg > 0 && !isAssisted && (
                        <>
                          <span>•</span>
                          <span>
                            1RM:{" "}
                            <strong className="text-foreground font-data-mono">
                              {item.bestEst1RmKg} kg
                            </strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Delta & Improvement Badge */}
                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold font-data-mono">
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {isAssisted
                          ? `${item.deltaWeightKg} kg assist. (+${item.pctChange}%)`
                          : `+${item.deltaWeightKg} kg (+${item.pctChange}%)`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
