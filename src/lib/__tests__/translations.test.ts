import { describe, it, expect } from "vitest";
import { translateExerciseTitle, EXERCISE_TRANSLATIONS } from "../exercises/translations";

describe("Exercise Translations (translations.ts)", () => {
  it("should return the original English title when locale is 'en' or omitted", () => {
    expect(translateExerciseTitle("Bench Press (Barbell)", "en")).toBe("Bench Press (Barbell)");
    expect(translateExerciseTitle("Bench Press (Barbell)", null)).toBe("Bench Press (Barbell)");
  });

  it("should translate known exercise to Portuguese (pt)", () => {
    expect(translateExerciseTitle("Bench Press (Barbell)", "pt")).toBe("Supino Reto (Barra)");
    expect(translateExerciseTitle("Squat (Barbell)", "pt")).toBe("Agachamento Livre (Barra)");
    expect(translateExerciseTitle("Deadlift (Barbell)", "pt")).toBe("Levantamento Terra (Barra)");
  });

  it("should translate known exercise to Spanish (es)", () => {
    expect(translateExerciseTitle("Bench Press (Barbell)", "es")).toBe("Press de Banca (Barra)");
    expect(translateExerciseTitle("Squat (Barbell)", "es")).toBe("Sentadilla (Barra)");
    expect(translateExerciseTitle("Deadlift (Barbell)", "es")).toBe("Peso Muerto (Barra)");
  });

  it("should fallback gracefully to original title for unmapped or custom exercises", () => {
    expect(translateExerciseTitle("My Custom Curl", "pt")).toBe("My Custom Curl");
    expect(translateExerciseTitle("My Custom Curl", "es")).toBe("My Custom Curl");
  });

  it("should have valid translations for all mapped exercises in pt and es", () => {
    for (const trans of Object.values(EXERCISE_TRANSLATIONS)) {
      expect(trans.pt).toBeTruthy();
      expect(trans.es).toBeTruthy();
      expect(typeof trans.pt).toBe("string");
      expect(typeof trans.es).toBe("string");
    }
  });
});
