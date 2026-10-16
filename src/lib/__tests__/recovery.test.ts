import { describe, it, expect } from "vitest";
import {
  calculateAgeInYears,
  mapToMuscleGroupKey,
  inferMuscleGroup,
  inferMovementCategory,
  isAssistedBodyweightExercise,
  resolveAdaptiveRepBracket,
  deriveRpeFromDoubleProgression,
  sanitizeAndResolveEffectiveRpe,
  calculateUnifiedRecoveryHours,
  evaluateMuscleReadiness,
  prescribeNextLoadStaticDoubleProgression,
  computeReadinessSummary,
  computeHistoricalProgressions,
} from "../exercises/recovery";

describe("Unified Muscle Recovery & Double Progression Engine (recovery.ts)", () => {
  describe("calculateAgeInYears", () => {
    it("should accurately calculate age from birthday", () => {
      const ref = new Date("2026-10-13T12:00:00Z");
      expect(calculateAgeInYears("1996-10-13", ref)).toBe(30);
      expect(calculateAgeInYears("1996-10-14", ref)).toBe(29);
      expect(calculateAgeInYears("1970-01-01", ref)).toBe(56);
      expect(calculateAgeInYears(null, ref)).toBeNull();
      expect(calculateAgeInYears("invalid-date", ref)).toBeNull();
    });
  });

  describe("mapToMuscleGroupKey & inferMuscleGroup", () => {
    it("should map Hevy raw muscle groups to the 9 core categories", () => {
      expect(mapToMuscleGroupKey("Chest")).toBe("chest");
      expect(mapToMuscleGroupKey("Lats")).toBe("back");
      expect(mapToMuscleGroupKey("Quadriceps")).toBe("quads");
      expect(mapToMuscleGroupKey("Glutes")).toBe("hamstrings_glutes");
      expect(mapToMuscleGroupKey("Hamstrings")).toBe("hamstrings_glutes");
      expect(mapToMuscleGroupKey("Shoulders")).toBe("shoulders");
      expect(mapToMuscleGroupKey("Biceps")).toBe("biceps");
      expect(mapToMuscleGroupKey("Triceps")).toBe("triceps");
      expect(mapToMuscleGroupKey("Calves")).toBe("calves");
      expect(mapToMuscleGroupKey("Abs")).toBe("core");
      expect(mapToMuscleGroupKey("Unknown")).toBeNull();
    });

    it("should infer muscle groups from exercise titles when template is missing (bilingual PT/EN)", () => {
      expect(inferMuscleGroup(null, "Supino Reto (Barra)")).toBe("chest");
      expect(inferMuscleGroup(null, "Incline Dumbbell Bench Press")).toBe("chest");
      expect(inferMuscleGroup(null, "Remada Curvada")).toBe("back");
      expect(inferMuscleGroup(null, "Lat Pulldown")).toBe("back");
      expect(inferMuscleGroup(null, "Agachamento Livre")).toBe("quads");
      expect(inferMuscleGroup(null, "Leg Press 45º")).toBe("quads");
      expect(inferMuscleGroup(null, "Cadeira Flexora")).toBe("hamstrings_glutes");
      expect(inferMuscleGroup(null, "Romanian Deadlift (RDL)")).toBe("hamstrings_glutes");
      expect(inferMuscleGroup(null, "Desenvolvimento Halteres")).toBe("shoulders");
      expect(inferMuscleGroup(null, "Overhead Press")).toBe("shoulders");
      expect(inferMuscleGroup(null, "Rosca Direta")).toBe("biceps");
      expect(inferMuscleGroup(null, "Tríceps Corda")).toBe("triceps");
      expect(inferMuscleGroup(null, "Panturrilha Sentado")).toBe("calves");
      expect(inferMuscleGroup(null, "Abdominal Crunch")).toBe("core");
      expect(inferMuscleGroup(null, "Exercício Genérico")).toBeNull();
    });
  });

  describe("inferMovementCategory & isAssistedBodyweightExercise", () => {
    it("should classify 3-tier movement categories accurately", () => {
      expect(inferMovementCategory("Agachamento Livre com Barra")).toBe("free_weight_compound");
      expect(inferMovementCategory("Bench Press (Barbell)")).toBe("free_weight_compound");
      expect(inferMovementCategory("Leg Press 45", "machine")).toBe("machine_cable_compound");
      expect(inferMovementCategory("Lat Pulldown", "cable")).toBe("machine_cable_compound");
      expect(inferMovementCategory("Elevação Lateral", "dumbbell")).toBe("isolation_small");
      expect(inferMovementCategory("Triceps Pushdown", "cable")).toBe("isolation_small");
      expect(inferMovementCategory("Biceps Curl", "dumbbell", "biceps")).toBe("isolation_small");
    });

    it("should detect assisted bodyweight exercises (Graviton)", () => {
      expect(isAssistedBodyweightExercise("Pull Up (Assisted)")).toBe(true);
      expect(isAssistedBodyweightExercise("Chin Up (Assisted)")).toBe(true);
      expect(isAssistedBodyweightExercise("Barra Fixa Assistida")).toBe(true);
      expect(isAssistedBodyweightExercise("Dip no Graviton", "machine")).toBe(true);
      expect(isAssistedBodyweightExercise("Lat Pulldown", "cable")).toBe(false);
      expect(isAssistedBodyweightExercise("Supino Reto", "barbell")).toBe(false);
    });
  });

  describe("Section 6 Acceptance Criteria", () => {
    // Criterion #1: Zero Sets Edge Case
    it("Criterion #1: calculateUnifiedRecoveryHours with 0 sets returns strictly 0", () => {
      expect(calculateUnifiedRecoveryHours(0, { mode: "rpe", avgRpe: 8 })).toBe(0);
      expect(
        calculateUnifiedRecoveryHours(0, {
          mode: "double_progression",
          completedReps: [],
          minRepsTarget: 8,
          maxRepsTarget: 12,
        })
      ).toBe(0);
    });

    // Criterion #2: Invalid Birthday Resilience
    it("Criterion #2: invalid birthday string does not produce NaN and falls back to kAge = 1.00", () => {
      const hoursValidYoung = calculateUnifiedRecoveryHours(
        4,
        { mode: "rpe", avgRpe: 8 },
        { birthday: "2000-01-01" },
        "large"
      );
      const hoursInvalidDate = calculateUnifiedRecoveryHours(
        4,
        { mode: "rpe", avgRpe: 8 },
        { birthday: "invalid-date" },
        "large"
      );

      expect(isNaN(hoursInvalidDate)).toBe(false);
      expect(hoursInvalidDate).toBe(hoursValidYoung);
    });

    // Criterion #3: Small vs Large Muscle Group Differentiation
    it("Criterion #3: 4 sets @ RPE 8.5 for small muscle group yields 8-12 hours shorter recovery than large", () => {
      const largeHours = calculateUnifiedRecoveryHours(
        4,
        { mode: "rpe", avgRpe: 8.5 },
        undefined,
        "large"
      );
      const smallHours = calculateUnifiedRecoveryHours(
        4,
        { mode: "rpe", avgRpe: 8.5 },
        undefined,
        "small"
      );

      const diff = largeHours - smallHours;
      expect(diff).toBeGreaterThanOrEqual(8);
      expect(diff).toBeLessThanOrEqual(12);
      expect(largeHours).toBe(34.5);
      expect(smallHours).toBe(25.7);
    });

    // Criterion #4: Double Progression Ceiling Detection
    it("Criterion #4: completedReps [12, 12, 12] with target ceiling 12 derives RPE 9.5 and prescribes INCREASE_LOAD", () => {
      const rpe = deriveRpeFromDoubleProgression({
        mode: "double_progression",
        completedReps: [12, 12, 12],
        minRepsTarget: 8,
        maxRepsTarget: 12,
      });
      expect(rpe).toBe(9.5);

      const prescription = prescribeNextLoadStaticDoubleProgression(
        50,
        8,
        12,
        [12, 12, 12],
        2.5
      );
      expect(prescription.action).toBe("INCREASE_LOAD");
      expect(prescription.nextLoadKg).toBe(52.5);
      expect(prescription.targetRepBracket).toEqual({ minReps: 8, maxReps: 12 });
    });

    // Criterion #5: 75% Readiness Threshold Gate
    it("Criterion #5: evaluateMuscleReadiness(38, 48, 3) returns status READY and recommendedVolumeMultiplier 1.0", () => {
      const result = evaluateMuscleReadiness(38, 48, 3);
      expect(result.status).toBe("READY");
      expect(result.recommendedVolumeMultiplier).toBe(1.0);
      expect(result.completionPercentage).toBe(79); // 38 / 48 = 79.16%
    });

    // Criterion #6: RPE Noise & Subjectivity Sanitization ([8, 7, 10] Anomaly)
    it("Criterion #6: sanitizes [8, 7, 10] under constant load to [8, 9, 10] with effectiveRpe >= 9.0", () => {
      const sets = [
        { type: "normal", weightKg: 80, reps: 10, rpe: 8 },
        { type: "normal", weightKg: 80, reps: 10, rpe: 7 }, // Erroneous dip before failure
        { type: "normal", weightKg: 80, reps: 10, rpe: 10 }, // Concentric failure anchor
      ];

      const resolution = sanitizeAndResolveEffectiveRpe(
        sets,
        "free_weight_compound"
      );

      expect(resolution.wasSanitized).toBe(true);
      expect(resolution.source).toBe("explicit_sanitized");
      expect(resolution.rawAvgRpe).toBe(8.3);
      expect(resolution.effectiveRpe).toBeGreaterThanOrEqual(9.0);
      expect(resolution.sanitizedSetRpes).toEqual([8, 9, 10]);
    });

    // Criterion #8: Adaptive Rep Brackets (6-10, 10-15, 15-20 & Hevy notes/failure tag)
    it("Criterion #8: resolves adaptive rep brackets for 6-10, 10-15, 15-20 and parses notes", () => {
      // Notes override
      expect(resolveAdaptiveRepBracket("free_weight_compound", [8, 8, 8], "3x 6-10 reps")).toEqual({
        minReps: 6,
        maxReps: 10,
      });
      expect(resolveAdaptiveRepBracket("isolation_small", [16, 16, 16], "Intervalo 15-20")).toEqual({
        minReps: 15,
        maxReps: 20,
      });

      // Adaptive zoning without notes
      // Compound with 10 reps -> [6, 10]
      expect(resolveAdaptiveRepBracket("free_weight_compound", [10, 9, 8])).toEqual({
        minReps: 6,
        maxReps: 10,
      });
      // Small isolation with 14 reps -> [10, 15]
      expect(resolveAdaptiveRepBracket("isolation_small", [14, 13, 12])).toEqual({
        minReps: 10,
        maxReps: 15,
      });
      // Exercise with 17 reps -> [15, 20]
      expect(resolveAdaptiveRepBracket("isolation_small", [18, 16, 15])).toEqual({
        minReps: 15,
        maxReps: 20,
      });

      // Hevy failure tag maps to RPE 10.0
      const setsWithFailure = [
        { type: "normal", weightKg: 50, reps: 12, rpe: 8 },
        { type: "failure", weightKg: 50, reps: 10, rpe: null }, // Hevy "F" tag
      ];
      const res = sanitizeAndResolveEffectiveRpe(setsWithFailure, "machine_cable_compound");
      expect(res.sanitizedSetRpes?.[1]).toBe(10.0);
      expect(res.effectiveRpe).toBeGreaterThanOrEqual(9.0);
    });

    // Criterion #9: Historical PR Detection (Baseline on 1st session, gold medal on 2nd session)
    it("Criterion #9: baseline established on 1st session, gold medals awarded on 2nd session on PR", () => {
      const workouts = [
        {
          id: "w1",
          startTime: "2026-10-01T10:00:00Z",
          exercises: [
            {
              title: "Supino Reto (Barra)",
              sets: [
                { type: "normal", weightKg: 80, reps: 8 },
                { type: "normal", weightKg: 80, reps: 8 },
              ],
            },
          ],
        },
        {
          id: "w2",
          startTime: "2026-10-05T10:00:00Z",
          exercises: [
            {
              title: "Supino Reto (Barra)",
              sets: [
                { type: "normal", weightKg: 80, reps: 10 }, // Reps PR (+2 reps @ 80kg)
                { type: "normal", weightKg: 85, reps: 6 }, // Weight PR (+5kg: 80 -> 85kg)
              ],
            },
          ],
        },
      ];

      const { workoutMap, getPeriodProgressions } = computeHistoricalProgressions(workouts);

      // Workout 1: Baseline -> 0 PRs
      const w1Summary = workoutMap.get("w1");
      expect(w1Summary?.hasProgression).toBe(false);
      expect(w1Summary?.totalPrCount).toBe(0);

      // Workout 2: Has PRs
      const w2Summary = workoutMap.get("w2");
      expect(w2Summary?.hasProgression).toBe(true);
      expect(w2Summary?.totalPrCount).toBe(2);

      const ex2 = w2Summary?.exercises[0];
      expect(ex2?.hasProgression).toBe(true);
      expect(ex2?.setsProgression[0].isProgression).toBe(true);
      expect(ex2?.setsProgression[0].progressionType).toBe("reps_pr");
      expect(ex2?.setsProgression[0].deltaReps).toBe(2);

      expect(ex2?.setsProgression[1].isProgression).toBe(true);
      expect(ex2?.setsProgression[1].progressionType).toBe("weight_pr");
      expect(ex2?.setsProgression[1].deltaWeightKg).toBe(5);

      // Period summary
      const periodItems = getPeriodProgressions(30);
      expect(periodItems.length).toBe(1);
      expect(periodItems[0].title).toBe("Supino Reto (Barra)");
      expect(periodItems[0].startWeightKg).toBe(80);
      expect(periodItems[0].currentWeightKg).toBe(85);
      expect(periodItems[0].deltaWeightKg).toBe(5);
      expect(periodItems[0].prCountInPeriod).toBe(2);
    });

    // Criterion #10: Inverted Polarity for Graviton / Assisted Exercises
    it("Criterion #10: decreasing assistance on Graviton awards gold medal and prescribes load increase by reducing assistance", () => {
      const workouts = [
        {
          id: "w1",
          startTime: "2026-10-01T10:00:00Z",
          exercises: [
            {
              title: "Pull Up (Assisted)",
              sets: [{ type: "normal", weightKg: 35, reps: 10 }],
            },
          ],
        },
        {
          id: "w2",
          startTime: "2026-10-05T10:00:00Z",
          exercises: [
            {
              title: "Pull Up (Assisted)",
              sets: [{ type: "normal", weightKg: 30, reps: 10 }], // Less assistance = Progression!
            },
          ],
        },
      ];

      const { workoutMap } = computeHistoricalProgressions(workouts);
      const w2Summary = workoutMap.get("w2");
      expect(w2Summary?.hasProgression).toBe(true);
      const ex = w2Summary?.exercises[0];
      expect(ex?.isAssisted).toBe(true);
      expect(ex?.setsProgression[0].isProgression).toBe(true);
      expect(ex?.setsProgression[0].progressionType).toBe("weight_pr");
      expect(ex?.setsProgression[0].deltaWeightKg).toBe(-5);

      // Double Progression on Graviton: hitting ceiling prescribes REDUCING assistance
      const prescription = prescribeNextLoadStaticDoubleProgression(
        30,
        6,
        10,
        [10, 10, 10],
        2.5,
        true // isAssisted
      );
      expect(prescription.action).toBe("INCREASE_LOAD");
      expect(prescription.nextLoadKg).toBe(27.5); // 30 - 2.5
      expect(prescription.isAssisted).toBe(true);
    });
  });

  describe("computeReadinessSummary Integration", () => {
    it("should compute enriched muscle readiness states based on workout history", () => {
      const now = new Date("2026-10-13T12:00:00Z");
      const yesterday = new Date("2026-10-12T12:00:00Z"); // 24 hours ago
      const threeDaysAgo = new Date("2026-10-10T12:00:00Z"); // 72 hours ago

      const history = [
        {
          endTime: yesterday,
          exercises: [
            {
              title: "Bench Press",
              primaryMuscleGroup: "Chest",
              sets: [
                { type: "normal", reps: 10, rpe: 8, weightKg: 80 },
                { type: "normal", reps: 8, rpe: 8.5, weightKg: 85 },
                { type: "normal", reps: 8, rpe: 9, weightKg: 90 },
              ],
            },
          ],
        },
        {
          endTime: threeDaysAgo,
          exercises: [
            {
              title: "Squat",
              primaryMuscleGroup: "Quadriceps",
              sets: [
                { type: "normal", reps: 10, rpe: 8, weightKg: 100 },
                { type: "normal", reps: 8, rpe: 8, weightKg: 100 },
              ],
            },
          ],
        },
      ];

      const summary = computeReadinessSummary(
        history,
        { gender: "male", birthday: "1995-01-01" },
        now
      );

      expect(summary.lastWorkoutAt).toEqual(yesterday);
      expect(summary.hoursSinceLastWorkout).toBe(24);

      // Chest was trained 24 hours ago
      expect(summary.muscles.chest.hoursElapsed).toBe(24);
      expect(summary.muscles.chest.lastSessionVolumeKg).toBe(2200);
      expect(summary.muscles.chest.lastSessionSets).toBe(3);
      expect(summary.muscles.chest.muscleCategory).toBe("large");

      // Quads were trained 72 hours ago, should be 100% ready
      expect(summary.muscles.quads.status).toBe("ready");
      expect(summary.muscles.quads.clinicalStatus).toBe("READY");
      expect(summary.muscles.quads.readinessPercentage).toBe(100);
      expect(summary.muscles.quads.recommendedVolumeMultiplier).toBe(1.0);

      // Back was never trained in history, should be ready
      expect(summary.muscles.back.status).toBe("ready");
      expect(summary.muscles.back.clinicalStatus).toBe("READY");

      expect(summary.readyGroups).toContain("quads");
      expect(summary.readyGroups).toContain("back");
      expect(summary.recoveringGroups).toContain("chest");
      expect(summary.recommendationKey).toBe("partial_ready");
    });

    it("should guarantee antagonist independence between biceps and triceps", () => {
      const now = new Date("2026-10-13T12:00:00Z");
      const pushWorkoutTime = new Date("2026-10-13T00:00:00Z"); // 12 hours ago (Push day)

      const history = [
        {
          endTime: pushWorkoutTime,
          exercises: [
            {
              title: "Tríceps Corda no Pulley",
              primaryMuscleGroup: "Triceps",
              sets: [
                { type: "normal", reps: 12, rpe: 9, weightKg: 30 },
                { type: "normal", reps: 10, rpe: 9.5, weightKg: 30 },
                { type: "normal", reps: 8, rpe: 10, weightKg: 30 },
              ],
            },
          ],
        },
      ];

      const summary = computeReadinessSummary(
        history,
        { gender: "male", birthday: "1995-01-01" },
        now
      );

      // Triceps was stimulated in Push day (12h ago, still actively repairing)
      expect(summary.muscles.triceps.hoursElapsed).toBe(12);
      expect(summary.muscles.triceps.lastSessionSets).toBe(3);
      expect(summary.muscles.triceps.muscleCategory).toBe("small");
      expect(summary.recoveringGroups).toContain("triceps");

      // Antagonist Biceps is 100% READY for Pull day!
      expect(summary.muscles.biceps.status).toBe("ready");
      expect(summary.muscles.biceps.clinicalStatus).toBe("READY");
      expect(summary.muscles.biceps.readinessPercentage).toBe(100);
      expect(summary.readyGroups).toContain("biceps");
    });

    it("should track calves and core independently from hamstrings and back", () => {
      const now = new Date("2026-10-13T12:00:00Z");
      const yesterday = new Date("2026-10-12T12:00:00Z"); // 24 hours ago

      const history = [
        {
          endTime: yesterday,
          exercises: [
            {
              title: "Panturrilha no Leg Press",
              primaryMuscleGroup: "Calves",
              sets: [
                { type: "normal", reps: 15, rpe: 8.5, weightKg: 120 },
                { type: "normal", reps: 15, rpe: 9, weightKg: 120 },
                { type: "normal", reps: 12, rpe: 9.5, weightKg: 120 },
              ],
            },
            {
              title: "Abdominal Crunch na Polia",
              primaryMuscleGroup: "Abs",
              sets: [
                { type: "normal", reps: 15, rpe: 8, weightKg: 40 },
                { type: "normal", reps: 12, rpe: 9, weightKg: 40 },
              ],
            },
          ],
        },
      ];

      const summary = computeReadinessSummary(
        history,
        { gender: "male", birthday: "1995-01-01" },
        now
      );

      // Calves stimulated
      expect(summary.muscles.calves.lastSessionSets).toBe(3);
      expect(summary.muscles.calves.muscleCategory).toBe("small");

      // Hamstrings & Glutes remained untouched and 100% ready
      expect(summary.muscles.hamstrings_glutes.status).toBe("ready");
      expect(summary.muscles.hamstrings_glutes.readinessPercentage).toBe(100);

      // Core stimulated
      expect(summary.muscles.core.lastSessionSets).toBe(2);
      expect(summary.muscles.core.muscleCategory).toBe("small");

      // Back remained untouched and 100% ready
      expect(summary.muscles.back.status).toBe("ready");
      expect(summary.muscles.back.readinessPercentage).toBe(100);
    });

    it("should retain peak residual fatigue across multiple sessions within 96h window", () => {
      const now = new Date("2026-10-13T12:00:00Z");
      const heavySession = new Date("2026-10-12T20:00:00Z"); // 16 hours ago (10 heavy sets, ~37.3h recovery, ~21.3h remaining)
      const lightSession = new Date("2026-10-13T08:00:00Z"); // 4 hours ago (1 light set, 20h recovery, 16h remaining)

      const history = [
        {
          endTime: lightSession,
          exercises: [
            {
              title: "Elevação Lateral (Halteres)",
              primaryMuscleGroup: "Shoulders",
              sets: [{ type: "normal", reps: 12, rpe: 6, weightKg: 10 }],
            },
          ],
        },
        {
          endTime: heavySession,
          exercises: [
            {
              title: "Desenvolvimento Militar (Barra)",
              primaryMuscleGroup: "Shoulders",
              sets: Array.from({ length: 10 }, () => ({
                type: "normal",
                reps: 8,
                rpe: 9.5,
                weightKg: 50,
              })),
            },
          ],
        },
      ];

      const summary = computeReadinessSummary(
        history,
        { gender: "male", birthday: "1995-01-01" },
        now
      );

      // The heavy session imposes ~21.3h of remaining recovery vs 16h from the 1-set session.
      // Therefore, the engine retains the peak residual fatigue of the 10-set session!
      expect(summary.muscles.shoulders.lastSessionSets).toBe(10);
      expect(summary.muscles.shoulders.hoursElapsed).toBe(16);
      expect(summary.muscles.shoulders.status).not.toBe("ready");
    });
  });
});
