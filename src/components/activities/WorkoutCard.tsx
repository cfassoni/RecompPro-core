"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { WorkoutItem, WorkoutDetail } from "@/lib/api";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/i18n";
import {
  Dumbbell,
  Flame,
  Zap,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Layers,
} from "lucide-react";

interface WorkoutCardProps {
  workout: WorkoutItem;
}

export default function WorkoutCard({ workout }: WorkoutCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [details, setDetails] = useState<WorkoutDetail | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const toggleExpand = async () => {
    if (!isExpanded && !details) {
      try {
        setIsLoadingDetails(true);
        const data = await api.getWorkoutDetails(workout.id);
        setDetails(data);
      } catch (err: unknown) {
        console.error("Failed to fetch workout details:", err);
      } finally {
        setIsLoadingDetails(false);
      }
    }
    setIsExpanded(!isExpanded);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  const getMuscleGroupName = (group: string) => {
    const key = `activities.muscleGroups.${group}`;
    const translated = t(key);
    return translated !== key ? translated : group;
  };

  const getSetTypeBadge = (type: string) => {
    switch (type.toLowerCase()) {
      case "warmup":
        return <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">{t("activities.setsType.warmup")}</span>;
      case "drop":
      case "dropset":
        return <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">{t("activities.setsType.drop")}</span>;
      case "failure":
        return <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">{t("activities.setsType.failure")}</span>;
      default:
        return null;
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden transition-all hover:border-border/80">
      {/* Primary Card Summary */}
      <div className="p-5 cursor-pointer select-none" onClick={toggleExpand}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-base text-foreground">
                  {workout.title}
                </h4>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                  {workout.source}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(workout.startTime)} • {formatDuration(workout.durationSeconds)}
              </p>
            </div>
          </div>

          {/* Quick Metrics Header */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Calories with EPOC pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-xs" title={`${t("activities.sessionCalories")}: ${workout.sessionCaloriesBurned.toFixed(0)} kcal | ${t("activities.epocCalories")}: ${workout.epocCaloriesBurned.toFixed(0)} kcal`}>
              <Flame className="h-3.5 w-3.5 text-rose-500 shrink-0" />
              <span className="font-data-mono font-bold text-foreground">
                {workout.totalCaloriesBurned.toFixed(0)} kcal
              </span>
              {workout.epocCaloriesBurned > 0 && (
                <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1 rounded flex items-center gap-0.5">
                  <Sparkles className="h-2.5 w-2.5" />
                  +{workout.epocCaloriesBurned.toFixed(0)} EPOC
                </span>
              )}
            </div>

            {/* Volume */}
            <div className="px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-xs">
              <span className="text-muted-foreground mr-1.5">{t("activities.volume")}:</span>
              <strong className="font-data-mono text-foreground">
                {workout.totalVolumeKg.toLocaleString()} kg
              </strong>
            </div>

            {/* Avg RPE */}
            {workout.avgRpe !== null && (
              <div className="px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-xs flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-muted-foreground mr-1">RPE:</span>
                <strong className="font-data-mono text-foreground">
                  {workout.avgRpe.toFixed(1)}
                </strong>
              </div>
            )}

            {/* Expand / Collapse button */}
            <button
              type="button"
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors ml-auto md:ml-0"
              aria-label={isExpanded ? t("common.collapse") : t("common.expand")}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Targeted Muscle Groups */}
        {workout.primaryMuscleGroups && workout.primaryMuscleGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-muted-foreground mr-1">
              {t("activities.targetedGroups")}:
            </span>
            {workout.primaryMuscleGroups.map((mg) => (
              <span
                key={mg}
                className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20"
              >
                {getMuscleGroupName(mg)}
              </span>
            ))}
          </div>
        )}

        {workout.description && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            &ldquo;{workout.description}&rdquo;
          </p>
        )}
      </div>

      {/* Expanded Exercises Breakdown */}
      {isExpanded && (
        <div className="border-t border-border bg-muted/10 p-5 space-y-4 animate-in fade-in duration-200">
          {isLoadingDetails ? (
            <div className="py-6 flex items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs">{t("common.loading")}</span>
            </div>
          ) : details && details.exercises ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  {t("activities.exercises")} ({details.exercises.length})
                </span>
              </div>

              <div className="space-y-3">
                {details.exercises.map((ex, exIdx) => (
                  <div
                    key={ex.id || exIdx}
                    className="p-4 rounded-xl border border-border bg-card space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          {ex.title}
                        </span>
                        {ex.primaryMuscleGroup && (
                          <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                            {getMuscleGroupName(ex.primaryMuscleGroup)}
                          </span>
                        )}
                      </div>
                      {ex.equipment && (
                        <span className="text-[11px] text-muted-foreground capitalize">
                          {ex.equipment}
                        </span>
                      )}
                    </div>

                    {ex.notes && (
                      <p className="text-[11px] text-muted-foreground italic">
                        {ex.notes}
                      </p>
                    )}

                    {/* Sets Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border/60 text-[11px] text-muted-foreground uppercase">
                            <th className="py-1.5 pr-3 font-semibold">{t("activities.set")}</th>
                            <th className="py-1.5 px-3 font-semibold">{t("activities.weight")}</th>
                            <th className="py-1.5 px-3 font-semibold">{t("activities.reps")}</th>
                            <th className="py-1.5 px-3 font-semibold">RPE</th>
                            <th className="py-1.5 pl-3 font-semibold">{t("activities.type")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {ex.sets.map((s, sIdx) => (
                            <tr key={s.id || sIdx} className="font-data-mono">
                              <td className="py-1.5 pr-3 text-muted-foreground font-sans">
                                #{s.index + 1}
                              </td>
                              <td className="py-1.5 px-3 text-foreground font-semibold">
                                {s.weightKg !== null ? `${s.weightKg} kg` : "—"}
                              </td>
                              <td className="py-1.5 px-3 text-foreground">
                                {s.reps !== null ? s.reps : "—"}
                              </td>
                              <td className="py-1.5 px-3 text-muted-foreground">
                                {s.rpe !== null ? s.rpe : "—"}
                              </td>
                              <td className="py-1.5 pl-3 font-sans">
                                {getSetTypeBadge(s.type)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t("activities.noExerciseDetails")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
