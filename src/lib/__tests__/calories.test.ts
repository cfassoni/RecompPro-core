import { describe, it, expect } from "vitest";
import {
  calculateWorkoutCalories,
  getBaseMetForMuscleGroup,
  getRpeMultiplier,
  calculateEffectiveWeight,
} from "../exercises/calories";

describe("Caloric Expenditure Engine (calories.ts)", () => {
  describe("Base MET mapping", () => {
    it("should assign 10.0 METs to multi-joint lower body movements", () => {
      expect(getBaseMetForMuscleGroup("legs")).toBe(10.0);
      expect(getBaseMetForMuscleGroup("quadriceps")).toBe(10.0);
      expect(getBaseMetForMuscleGroup("glutes")).toBe(10.0);
      expect(getBaseMetForMuscleGroup("hamstrings")).toBe(10.0);
    });

    it("should assign 7.5 METs to multi-joint upper body/torso movements", () => {
      expect(getBaseMetForMuscleGroup("chest")).toBe(7.5);
      expect(getBaseMetForMuscleGroup("back")).toBe(7.5);
      expect(getBaseMetForMuscleGroup("shoulders")).toBe(7.5);
      expect(getBaseMetForMuscleGroup("lats")).toBe(7.5);
    });

    it("should assign 5.0 METs to isolated or smaller muscle groups", () => {
      expect(getBaseMetForMuscleGroup("biceps")).toBe(5.0);
      expect(getBaseMetForMuscleGroup("triceps")).toBe(5.0);
      expect(getBaseMetForMuscleGroup("calves")).toBe(5.0);
      expect(getBaseMetForMuscleGroup("abs")).toBe(5.0);
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
      expect(getRpeMultiplier(10)).toBe(1.30);
    });
  });

  describe("Effective Metabolic Weight (FFM Calibration)", () => {
    it("should compute Weff based on FFM + 0.2*FM", () => {
      // User with 100kg total, 70kg FFM, 30kg FM
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
            primaryMuscleGroup: "quadriceps",
            sets: [
              { type: "normal", reps: 10, weightKg: 100, rpe: 8 },
              { type: "normal", reps: 10, weightKg: 100, rpe: 8.5 },
              { type: "normal", reps: 8, weightKg: 110, rpe: 9 },
            ],
          },
          {
            primaryMuscleGroup: "chest",
            sets: [
              { type: "warmup", reps: 15, weightKg: 40 }, // Warmup should be ignored
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
      expect(result.sessionKcal).toBe(Math.round((result.activeKcal + result.restKcal) * 10) / 10);
      expect(result.epocKcal).toBeGreaterThan(0);
      expect(result.totalKcal).toBe(Math.round((result.sessionKcal + result.epocKcal) * 10) / 10);
      expect(result.epocPercentage).toBeGreaterThanOrEqual(6.0);
      expect(result.epocPercentage).toBeLessThanOrEqual(18.0);
      expect(result.avgRpe).toBeCloseTo(8.4, 0.5);
    });

    it("should prevent unrealistic caloric inflation for long idle rests", () => {
      // 16 working sets performed in 45 min vs same 16 sets taking 90 min due to idle rest
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
        durationSeconds: 5400, // 90 min (doubled duration due to idle phone rest)
        exercises,
      });

      // Active calories must be identical regardless of session duration
      expect(focusedSession.activeKcal).toBe(delayedSession.activeKcal);
      // In a naive linear model, 90 min would double the calories (2.0x = ~414 kcal).
      // In our bi-phasic model, rest only accumulates at 2.2 METs, dampening the inflation to ~1.59x.
      expect(delayedSession.sessionKcal).toBeLessThan(focusedSession.sessionKcal * 1.7);
      expect(delayedSession.sessionKcal).toBeLessThan(focusedSession.sessionKcal * 2.0);
    });
  });
});
