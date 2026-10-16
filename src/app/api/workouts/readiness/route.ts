import { NextResponse } from "next/server";
import { withAuth } from "@/lib/withAuth";
import { db } from "@/db/client";
import { workouts, users, recompRecords } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  computeReadinessSummary,
  calculateAgeInYears,
  MuscleGroupKey,
  WorkoutHistoryItemForRecovery,
} from "@/lib/exercises/recovery";
import type { MuscleReadinessResponse, MuscleReadinessItem } from "@/lib/api";

const MUSCLE_NAMES: Record<MuscleGroupKey, { en: string; pt: string; es: string }> = {
  chest: { en: "Chest", pt: "Peito", es: "Pecho" },
  back: { en: "Back", pt: "Costas", es: "Espalda" },
  shoulders: { en: "Shoulders", pt: "Ombros", es: "Hombros" },
  biceps: { en: "Biceps", pt: "Bíceps", es: "Bíceps" },
  triceps: { en: "Triceps", pt: "Tríceps", es: "Tríceps" },
  quads: { en: "Quadriceps", pt: "Quadríceps", es: "Cuádriceps" },
  hamstrings_glutes: {
    en: "Hamstrings & Glutes",
    pt: "Posteriores e Glúteos",
    es: "Isquiotibiales y Glúteos",
  },
  calves: { en: "Calves", pt: "Panturrilhas", es: "Pantorrillas" },
  core: { en: "Abs & Core", pt: "Abdômen & Core", es: "Abdomen y Core" },
};

function formatMuscleName(group: MuscleGroupKey, lang: string): string {
  const l = (lang === "pt" || lang === "es" ? lang : "en") as "en" | "pt" | "es";
  return MUSCLE_NAMES[group]?.[l] || group;
}

function buildRecommendationMessage(
  recommendationKey: string,
  readyGroups: MuscleGroupKey[],
  recoveringGroups: MuscleGroupKey[],
  muscles: Record<MuscleGroupKey, { remainingRecoveryHours: number }>,
  lang: string
): string {
  const isPt = lang.startsWith("pt");
  const isEs = lang.startsWith("es");

  if (recommendationKey === "all_ready" || recoveringGroups.length === 0) {
    if (isPt) {
      return "Todos os principais grupos musculares estão recuperados (100%). Janela metabólica ideal para treino de alta intensidade ou progressão de carga.";
    }
    if (isEs) {
      return "Todos los principales grupos musculares están recuperados (100%). Ventana metabólica ideal para entrenamiento de alta intensidad o sobrecarga progresiva.";
    }
    return "All major muscle groups are fully recovered (100%). Optimal metabolic window for high-intensity training or progressive overload.";
  }

  if (recommendationKey === "full_recovery_needed" || readyGroups.length === 0) {
    const maxRemaining = Math.max(
      ...recoveringGroups.map((g) => muscles[g]?.remainingRecoveryHours || 0)
    );
    if (isPt) {
      return `Todos os grupos musculares estimulados recentemente estão em fase de reparo tecidual ativo (~${Math.round(maxRemaining)}h restantes). Recomenda-se repouso ou recuperação ativa leve.`;
    }
    if (isEs) {
      return `Todos los grupos musculares entrenados recientemente están en fase de reparación tisular activa (~${Math.round(maxRemaining)}h restantes). Se recomienda descanso o recuperación activa ligera.`;
    }
    return `All recently trained muscle groups are undergoing active tissue repair (~${Math.round(maxRemaining)}h remaining). Prioritize rest or light active recovery.`;
  }

  // partial_ready
  const readyNames = readyGroups.map((g) =>
    formatMuscleName(g, isPt ? "pt" : isEs ? "es" : "en")
  );
  const recNamesWithHours = recoveringGroups.map((g) => {
    const hours = Math.round(muscles[g]?.remainingRecoveryHours || 0);
    const name = formatMuscleName(g, isPt ? "pt" : isEs ? "es" : "en");
    return `${name} (~${hours}h)`;
  });

  const joinList = (arr: string[], conj: string) => {
    if (arr.length === 0) return "";
    if (arr.length === 1) return arr[0];
    return `${arr.slice(0, -1).join(", ")} ${conj} ${arr[arr.length - 1]}`;
  };

  if (isPt) {
    return `${joinList(readyNames, "e")} estão prontos para estímulo. ${joinList(recNamesWithHours, "e")} ainda em janela de recuperação tecidual.`;
  }
  if (isEs) {
    return `${joinList(readyNames, "y")} están listos para entrenar. ${joinList(recNamesWithHours, "y")} aún en ventana de recuperación tisular.`;
  }
  return `${joinList(readyNames, "and")} are ready for training. ${joinList(recNamesWithHours, "and")} still in recovery window.`;
}

export const GET = withAuth(async (req, { user }) => {
  try {
    const userProfile = await db.query.users.findFirst({
      where: eq(users.id, user.id),
    });

    const lang = (
      userProfile?.preferredLanguage ||
      req.headers.get("accept-language")?.slice(0, 2) ||
      "pt"
    ).toLowerCase();

    const latestRecord = await db.query.recompRecords.findFirst({
      where: eq(recompRecords.userId, user.id),
      orderBy: [desc(recompRecords.date)],
    });

    const effectiveWeightKg =
      latestRecord?.weight ?? userProfile?.targetWeightKg ?? 75;

    const userAge = calculateAgeInYears(userProfile?.birthday ?? null);

    const formatGenderLabel = (g?: string | null) => {
      if (!g) return lang === "pt" ? "Não informado" : "Unspecified";
      if (g === "male") {
        return lang === "pt" || lang === "es" ? "Masculino" : "Male";
      }
      if (g === "female") {
        return lang === "pt" ? "Feminino" : lang === "es" ? "Femenino" : "Female";
      }
      return g;
    };

    const recentWorkouts = await db.query.workouts.findMany({
      where: eq(workouts.userId, user.id),
      orderBy: [desc(workouts.startTime)],
      limit: 30,
      with: {
        exercises: {
          with: {
            sets: true,
            template: true,
          },
        },
      },
    });

    if (recentWorkouts.length === 0) {
      const emptyResponse: MuscleReadinessResponse = {
        muscleGroups: [],
        overallReadiness: "ready",
        smartRecommendation: {
          status: "ready",
          readyGroups: [],
          recoveringGroups: [],
          suggestedFocus: [],
          message:
            lang === "pt"
              ? "Nenhum treino de força registrado ainda."
              : "No strength workouts recorded yet.",
        },
        userProfile: {
          gender: formatGenderLabel(userProfile?.gender),
          age: userAge,
          effectiveWeightKg: Math.round(effectiveWeightKg * 10) / 10,
        },
      };
      return NextResponse.json(emptyResponse);
    }

    let caloricState: "deficit" | "surplus" | "maintenance" | null = null;
    if (userProfile?.targetWeightKg && latestRecord?.weight) {
      const diff = latestRecord.weight - userProfile.targetWeightKg;
      if (diff > 0.5) caloricState = "deficit";
      else if (diff < -0.5) caloricState = "surplus";
      else caloricState = "maintenance";
    }

    const mappedHistory: WorkoutHistoryItemForRecovery[] = recentWorkouts.map((w) => ({
      endTime: w.endTime,
      exercises: w.exercises.map((ex) => ({
        title: ex.title,
        notes: ex.notes,
        equipment: ex.template?.equipment ?? null,
        primaryMuscleGroup: ex.template?.primaryMuscleGroup ?? null,
        sets: ex.sets.map((s) => ({
          type: s.type,
          rpe: s.rpe,
          reps: s.reps,
          weightKg: s.weightKg,
        })),
      })),
    }));

    const readiness = computeReadinessSummary(mappedHistory, {
      gender: userProfile?.gender ?? null,
      birthday: userProfile?.birthday ?? null,
      caloricState,
    });

    const muscleGroups: MuscleReadinessItem[] = Object.values(readiness.muscles).map(
      (m) => {
        const remainingHours =
          m.hoursElapsed !== null
            ? Math.max(0, Math.round((m.recommendedRecoveryHours - m.hoursElapsed) * 10) / 10)
            : 0;

        const groupKey = m.group === "quads" ? "quadriceps" : m.group;

        return {
          group: groupKey,
          name: formatMuscleName(m.group, lang),
          status: m.status,
          clinicalStatus: m.clinicalStatus,
          recommendedVolumeMultiplier: m.recommendedVolumeMultiplier,
          muscleCategory: m.muscleCategory,
          readinessScore: m.readinessPercentage,
          lastTrainedAt: m.lastTrainedAt ? m.lastTrainedAt.toISOString() : null,
          hoursSinceLastTrained: m.hoursElapsed,
          recommendedRecoveryHours: m.recommendedRecoveryHours,
          remainingRecoveryHours: remainingHours,
          lastVolumeKg: m.lastSessionVolumeKg ?? 0,
          lastSetCount: m.lastSessionSets ?? 0,
          lastAvgRpe: m.lastSessionAvgRpe ?? null,
        };
      }
    );

    let overallReadiness: "ready" | "recovering" | "exhausted" = "ready";
    if (readiness.recoveringGroups.length > 0) {
      const hasExhausted = Object.values(readiness.muscles).some(
        (m) => m.status === "exhausted"
      );
      overallReadiness = hasExhausted ? "exhausted" : "recovering";
    }

    const readyGroupsMapped = readiness.readyGroups.map((g) =>
      g === "quads" ? "quadriceps" : g
    );
    const recoveringGroupsMapped = readiness.recoveringGroups.map((g) =>
      g === "quads" ? "quadriceps" : g
    );

    const remainingByGroup = Object.fromEntries(
      Object.entries(readiness.muscles).map(([k, v]) => [
        k,
        {
          remainingRecoveryHours:
            v.hoursElapsed !== null
              ? Math.max(0, v.recommendedRecoveryHours - v.hoursElapsed)
              : 0,
        },
      ])
    ) as Record<MuscleGroupKey, { remainingRecoveryHours: number }>;

    const message = buildRecommendationMessage(
      readiness.recommendationKey,
      readiness.readyGroups,
      readiness.recoveringGroups,
      remainingByGroup,
      lang
    );

    const response: MuscleReadinessResponse = {
      muscleGroups,
      overallReadiness,
      smartRecommendation: {
        status: overallReadiness,
        readyGroups: readyGroupsMapped,
        recoveringGroups: recoveringGroupsMapped,
        suggestedFocus:
          readyGroupsMapped.length > 0 ? readyGroupsMapped : ["full_body"],
        message,
      },
      userProfile: {
        gender: formatGenderLabel(userProfile?.gender),
        age: userAge,
        effectiveWeightKg: Math.round(effectiveWeightKg * 10) / 10,
      },
      muscles: readiness.muscles,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to compute readiness:", msg);
    return NextResponse.json(
      { detail: "Failed to compute muscle readiness" },
      { status: 500 }
    );
  }
});
