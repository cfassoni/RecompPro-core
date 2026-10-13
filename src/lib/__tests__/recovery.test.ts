import { describe, it, expect } from "vitest";
import {
  calculateAgeInYears,
  mapToMuscleGroupKey,
  calculateRecoveryWindowHours,
  computeReadinessSummary,
} from "../exercises/recovery";

describe("Muscle Recovery & Readiness Engine (recovery.ts)", () => {
  describe("calculateAgeInYears", () => {
    it("should accurately calculate age from birthday", () => {
      const ref = new Date("2026-10-13T12:00:00Z");
      expect(calculateAgeInYears("1996-10-13", ref)).toBe(30);
      expect(calculateAgeInYears("1996-10-14", ref)).toBe(29); // Birthday tomorrow
      expect(calculateAgeInYears("1970-01-01", ref)).toBe(56);
      expect(calculateAgeInYears(null, ref)).toBeNull();
      expect(calculateAgeInYears("invalid-date", ref)).toBeNull();
    });
  });

  describe("mapToMuscleGroupKey", () => {
    it("should map Hevy raw muscle groups to the 6 core categories", () => {
      expect(mapToMuscleGroupKey("Chest")).toBe("chest");
      expect(mapToMuscleGroupKey("Lats")).toBe("back");
      expect(mapToMuscleGroupKey("Quadriceps")).toBe("quads");
      expect(mapToMuscleGroupKey("Glutes")).toBe("hamstrings_glutes");
      expect(mapToMuscleGroupKey("Hamstrings")).toBe("hamstrings_glutes");
      expect(mapToMuscleGroupKey("Shoulders")).toBe("shoulders");
      expect(mapToMuscleGroupKey("Biceps")).toBe("arms");
      expect(mapToMuscleGroupKey("Triceps")).toBe("arms");
      expect(mapToMuscleGroupKey("Unknown")).toBeNull();
    });
  });

  describe("calculateRecoveryWindowHours", () => {
    it("should clamp recovery window between 24h and 72h", () => {
      expect(calculateRecoveryWindowHours(0, null)).toBe(24);
      expect(calculateRecoveryWindowHours(2, 6)).toBeGreaterThanOrEqual(24);
      expect(calculateRecoveryWindowHours(20, 10)).toBeLessThanOrEqual(72);
    });

    it("should apply 10% faster recovery for females in submaximal resistance training", () => {
      const maleHours = calculateRecoveryWindowHours(8, 8, { gender: "male" });
      const femaleHours = calculateRecoveryWindowHours(8, 8, { gender: "female" });

      expect(femaleHours).toBeLessThan(maleHours);
      expect(femaleHours).toBe(Math.round(maleHours * 0.9));
    });

    it("should scale recovery hours for older adults (> 40 years)", () => {
      const youngHours = calculateRecoveryWindowHours(8, 8, { birthday: "2000-01-01" }); // ~26 yo
      const masterHours = calculateRecoveryWindowHours(8, 8, { birthday: "1970-01-01" }); // ~56 yo

      expect(masterHours).toBeGreaterThan(youngHours);
    });
  });

  describe("computeReadinessSummary", () => {
    it("should compute muscle readiness states based on workout history", () => {
      const now = new Date("2026-10-13T12:00:00Z");
      const yesterday = new Date("2026-10-12T12:00:00Z"); // 24 hours ago
      const threeDaysAgo = new Date("2026-10-10T12:00:00Z"); // 72 hours ago

      const history = [
        {
          endTime: yesterday,
          exercises: [
            {
              primaryMuscleGroup: "Chest",
              sets: [
                { type: "normal", reps: 10, rpe: 8 },
                { type: "normal", reps: 8, rpe: 8.5 },
                { type: "normal", reps: 8, rpe: 9 },
              ],
            },
          ],
        },
        {
          endTime: threeDaysAgo,
          exercises: [
            {
              primaryMuscleGroup: "Quadriceps",
              sets: [
                { type: "normal", reps: 10, rpe: 8 },
                { type: "normal", reps: 8, rpe: 8 },
              ],
            },
          ],
        },
      ];

      const summary = computeReadinessSummary(history, { gender: "male", birthday: "1995-01-01" }, now);

      expect(summary.lastWorkoutAt).toEqual(yesterday);
      expect(summary.hoursSinceLastWorkout).toBe(24);

      // Chest was trained 24 hours ago with high RPE, should be recovering
      expect(summary.muscles.chest.status).toBe("recovering");
      expect(summary.muscles.chest.hoursElapsed).toBe(24);

      // Quads were trained 72 hours ago, should be 100% ready
      expect(summary.muscles.quads.status).toBe("ready");
      expect(summary.muscles.quads.readinessPercentage).toBe(100);

      // Back was never trained in history, should be ready
      expect(summary.muscles.back.status).toBe("ready");
      expect(summary.muscles.back.readinessPercentage).toBe(100);

      expect(summary.readyGroups).toContain("quads");
      expect(summary.readyGroups).toContain("back");
      expect(summary.recoveringGroups).toContain("chest");
      expect(summary.recommendationKey).toBe("partial_ready");
    });
  });
});
