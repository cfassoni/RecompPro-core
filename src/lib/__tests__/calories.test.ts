import { describe, it, expect } from "vitest";
import {
  calculateWorkoutCalories,
  getBaseMetForMuscleGroup,
  resolveSetDynamicMet,
  getRpeMultiplier,
  calculateEffectiveWeight,
} from "../exercises/calories";

describe("Caloric Expenditure Engine (calories.ts)", () => {
  describe("Base MET mapping & Dynamic 3-Tier MET", () => {
    it("should assign baseline METs correctly", () => {
      expect(getBaseMetForMuscleGroup("legs")).toBe(10.0);
      expect(getBaseMetForMuscleGroup("chest")).toBe(7.5);
      expect(getBaseMetForMuscleGroup("biceps")).toBe(5.0);
    });

    it("should assign 3-tier biomechanical METs accurately", () => {
      // free_weight_compound
      expect(resolveSetDynamicMet("free_weight_compound", 9.0)).toBe(6.0);
      expect(resolveSetDynamicMet("free_weight_compound", 7.5)).toBe(5.2);
      expect(resolveSetDynamicMet("free_weight_compound", 6.0)).toBe(4.5);

      // machine_cable_compound
      expect(resolveSetDynamicMet("machine_cable_compound", 9.0)).toBe(5.5);
      expect(resolveSetDynamicMet("machine_cable_compound", 7.5)).toBe(4.6);
      expect(resolveSetDynamicMet("machine_cable_compound", 6.0)).toBe(4.0);

      // isolation_small
      expect(resolveSetDynamicMet("isolation_small", 9.0)).toBe(4.5);
      expect(resolveSetDynamicMet("isolation_small", 7.5)).toBe(3.5);
      expect(resolveSetDynamicMet("isolation_small", 6.0)).toBe(3.0);

      // warmup
      expect(resolveSetDynamicMet("free_weight_compound", 6.0, true)).toBe(2.8);
    });
  });

  describe("RPE Multiplier", () => {
    it("should return 1.15 when RPE is missing or null", () => {
      expect(getRpeMultiplier(null)).toBe(1.15);
      expect(getRpeMultiplier(undefined)).toBe(1.15);
    });

    it("should scale with RPE intensity", () => {
      expect(getRpeMultiplier(5)).toBe(1.0);
      expect(getRpeMultiplier(8)).toBe(1.18);
      expect(getRpeMultiplier(10)).toBe(1.3);
    });
  });

  describe("Effective Metabolic Weight (FFM Calibration)", () => {
    it("should compute Weff based on FFM + 0.2*FM", () => {
      const weff = calculateEffectiveWeight(100, 70, 30);
      expect(weff).toBe(70 + 0.2 * 30); // 76kg
    });

    it("should fallback to 85% of total weight when FFM is absent", () => {
      expect(calculateEffectiveWeight(80, null, null)).toBe(80 * 0.85);
    });
  });

  describe("Session Caloric Calculation & EPOC", () => {
    it("should compute active and rest phases with EPOC afterburn", () => {
      const result = calculateWorkoutCalories({
        weightKg: 80,
        fatFreeMassKg: 65,
        fatMassKg: 15,
        durationSeconds: 3600, // 60 minutes
        exercises: [
          {
            title: "Agachamento Livre",
            primaryMuscleGroup: "quadriceps",
            sets: [
              { type: "normal", reps: 10, weightKg: 100, rpe: 8 },
              { type: "normal", reps: 10, weightKg: 100, rpe: 8.5 },
              { type: "normal", reps: 8, weightKg: 110, rpe: 9 },
            ],
          },
          {
            title: "Supino Reto",
            primaryMuscleGroup: "chest",
            sets: [
              { type: "warmup", reps: 15, weightKg: 40 },
              { type: "normal", reps: 10, weightKg: 80, rpe: 8 },
              { type: "normal", reps: 8, weightKg: 85, rpe: 8.5 },
            ],
          },
        ],
      });

      expect(result.activeSeconds).toBeGreaterThan(0);
      expect(result.restSeconds).toBeGreaterThan(0);
      expect(result.activeKcal).toBeGreaterThan(0);
      expect(result.restKcal).toBeGreaterThan(0);
      expect(result.sessionKcal).toBe(
        Math.round((result.activeKcal + result.restKcal) * 10) / 10
      );
      expect(result.epocKcal).toBeGreaterThan(0);
      expect(result.totalKcal).toBe(
        Math.round((result.sessionKcal + result.epocKcal) * 10) / 10
      );
      expect(result.epocPercentage).toBeGreaterThanOrEqual(3.0);
      expect(result.epocPercentage).toBeLessThanOrEqual(13.0);
      expect(result.avgRpe).toBeCloseTo(8.4, 0.5);
    });

    // Criterion #7: 3-Tier MET & Muscle-Mass Weighted EPOC
    it("Criterion #7: free_weight_compound of large muscle group burns more active kcal and generates higher EPOC than small isolation", () => {
      const sets = [
        { type: "normal" as const, reps: 10, weightKg: 80 },
        { type: "normal" as const, reps: 10, weightKg: 80 },
        { type: "normal" as const, reps: 8, weightKg: 80 },
      ];

      // Session A: Heavy Squat (free_weight_compound + large group)
      const compoundLarge = calculateWorkoutCalories({
        weightKg: 80,
        fatFreeMassKg: 68,
        durationSeconds: 1800,
        exercises: [
          {
            title: "Agachamento Livre com Barra",
            primaryMuscleGroup: "quadriceps",
            sets,
          },
        ],
      });

      // Session B: Biceps Curl (isolation_small + small group)
      const isolationSmall = calculateWorkoutCalories({
        weightKg: 80,
        fatFreeMassKg: 68,
        durationSeconds: 1800,
        exercises: [
          {
            title: "Rosca Direta com Halteres",
            primaryMuscleGroup: "biceps",
            sets,
          },
        ],
      });

      expect(compoundLarge.activeKcal).toBeGreaterThan(isolationSmall.activeKcal);
      expect(compoundLarge.epocKcal).toBeGreaterThan(isolationSmall.epocKcal);
      expect(compoundLarge.epocPercentage).toBeGreaterThan(isolationSmall.epocPercentage);
      // Both derive avgRpe via Double Progression without manual RPE
      expect(compoundLarge.avgRpe).not.toBeNull();
      expect(isolationSmall.avgRpe).not.toBeNull();
    });

    it("should prevent unrealistic caloric inflation for long idle rests", () => {
      const sets = Array.from({ length: 4 }, () => ({
        type: "normal" as const,
        reps: 10,
        weightKg: 80,
        rpe: 8,
      }));

      const exercises = [
        { primaryMuscleGroup: "chest", sets },
        { primaryMuscleGroup: "back", sets },
        { primaryMuscleGroup: "quadriceps", sets },
        { primaryMuscleGroup: "shoulders", sets },
      ];

      const focusedSession = calculateWorkoutCalories({
        weightKg: 80,
        fatFreeMassKg: 68,
        durationSeconds: 2700, // 45 min
        exercises,
      });

      const delayedSession = calculateWorkoutCalories({
        weightKg: 80,
        fatFreeMassKg: 68,
        durationSeconds: 5400, // 90 min
        exercises,
      });

      expect(focusedSession.activeKcal).toBe(delayedSession.activeKcal);
      expect(delayedSession.sessionKcal).toBeLessThan(focusedSession.sessionKcal * 1.85);
      expect(delayedSession.sessionKcal).toBeLessThan(focusedSession.sessionKcal * 2.0);
    });
  });
});
