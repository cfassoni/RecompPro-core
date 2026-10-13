/**
 * Curated exercise translation dictionary for standard Hevy exercises.
 * Supports PT (Português) and ES (Español) with fallback to original English title.
 */

export const EXERCISE_TRANSLATIONS: Record<string, { pt: string; es: string }> = {
  // Chest / Peitoral / Pecho
  "Bench Press (Barbell)": { pt: "Supino Reto (Barra)", es: "Press de Banca (Barra)" },
  "Bench Press (Dumbbell)": { pt: "Supino Reto (Halter)", es: "Press de Banca (Mancuernas)" },
  "Incline Bench Press (Barbell)": { pt: "Supino Inclinado (Barra)", es: "Press Inclinado (Barra)" },
  "Incline Bench Press (Dumbbell)": { pt: "Supino Inclinado (Halter)", es: "Press Inclinado (Mancuernas)" },
  "Decline Bench Press (Barbell)": { pt: "Supino Declinado (Barra)", es: "Press Declinado (Barra)" },
  "Chest Fly (Dumbbell)": { pt: "Crucifixo (Halter)", es: "Aperturas de Pecho (Mancuernas)" },
  "Chest Fly (Cable)": { pt: "Crucifixo no Crossover (Cabo)", es: "Cruces en Polea (Cable)" },
  "Chest Dip": { pt: "Mergulho nas Paralelas", es: "Fondos de Pecho en Paralelas" },
  "Push Up": { pt: "Flexão de Braço", es: "Flexiones de Brazos" },

  // Back / Costas / Espalda
  "Deadlift (Barbell)": { pt: "Levantamento Terra (Barra)", es: "Peso Muerto (Barra)" },
  "Bent Over Row (Barbell)": { pt: "Remada Curvada (Barra)", es: "Remo con Barra" },
  "Bent Over Row (Dumbbell)": { pt: "Remada Unilateral / Serrote (Halter)", es: "Remo Unilateral (Mancuerna)" },
  "Pull Up": { pt: "Barra Fixa (Pronada)", es: "Dominadas" },
  "Chin Up": { pt: "Barra Fixa (Supinada)", es: "Dominadas Supinas" },
  "Lat Pulldown (Cable)": { pt: "Puxada Frontal (Polia)", es: "Jalón al Pecho (Polea)" },
  "Seated Cable Row": { pt: "Remada Baixa Sentada (Cabo)", es: "Remo Sentado en Polea" },
  "T-Bar Row": { pt: "Remada Cavalinho (Barra T)", es: "Remo en Barra T" },

  // Legs / Membros Inferiores / Piernas
  "Squat (Barbell)": { pt: "Agachamento Livre (Barra)", es: "Sentadilla (Barra)" },
  "Front Squat (Barbell)": { pt: "Agachamento Frontal (Barra)", es: "Sentadilla Frontal (Barra)" },
  "Leg Press": { pt: "Leg Press 45°", es: "Prensa de Piernas (Leg Press)" },
  "Leg Extension (Machine)": { pt: "Cadeira Extensora", es: "Extensión de Cuádriceps (Máquina)" },
  "Leg Curl (Machine)": { pt: "Mesa / Cadeira Flexora", es: "Curl Femoral (Máquina)" },
  "Romanian Deadlift (Barbell)": { pt: "Stiff / Terra Romeno (Barra)", es: "Peso Muerto Rumano (Barra)" },
  "Bulgarian Split Squat": { pt: "Agachamento Búlgaro", es: "Sentadilla Búlgara" },
  "Lunges (Dumbbell)": { pt: "Passada / Afundo (Halter)", es: "Zancadas (Mancuernas)" },
  "Calf Raise (Machine)": { pt: "Gêmeos / Panturrilha (Máquina)", es: "Elevación de Talones (Máquina)" },
  "Standing Calf Raise": { pt: "Panturrilha em Pé", es: "Elevación de Talones de Pie" },
  "Hip Thrust (Barbell)": { pt: "Elevação Pélvica (Barra)", es: "Empuje de Cadera / Hip Thrust" },

  // Shoulders / Ombros / Hombros
  "Overhead Press (Barbell)": { pt: "Desenvolvimento Militar (Barra)", es: "Press Militar (Barra)" },
  "Shoulder Press (Dumbbell)": { pt: "Desenvolvimento de Ombros (Halter)", es: "Press de Hombros (Mancuernas)" },
  "Lateral Raise (Dumbbell)": { pt: "Elevação Lateral (Halter)", es: "Elevaciones Laterales (Mancuernas)" },
  "Lateral Raise (Cable)": { pt: "Elevação Lateral no Cabo", es: "Elevaciones Laterales en Polea" },
  "Front Raise (Dumbbell)": { pt: "Elevação Frontal (Halter)", es: "Elevación Frontal (Mancuernas)" },
  "Face Pull (Cable)": { pt: "Face Pull (Corda no Cabo)", es: "Face Pull (Polea)" },

  // Arms / Braços / Brazos
  "Bicep Curl (Barbell)": { pt: "Rosca Direta (Barra)", es: "Curl de Bíceps (Barra)" },
  "Bicep Curl (Dumbbell)": { pt: "Rosca Direta (Halter)", es: "Curl de Bíceps (Mancuernas)" },
  "Hammer Curl (Dumbbell)": { pt: "Rosca Martelo (Halter)", es: "Curl Martillo (Mancuernas)" },
  "Preacher Curl (Machine)": { pt: "Rosca Scott (Máquina)", es: "Curl Scott / Predicador" },
  "Triceps Pushdown (Cable)": { pt: "Tríceps Pulley / Barra (Polia)", es: "Extensiones de Tríceps (Polea)" },
  "Triceps Rope Pushdown": { pt: "Tríceps Corda (Polia)", es: "Extensiones de Tríceps con Cuerda" },
  "Skull Crusher (Barbell)": { pt: "Tríceps Testa (Barra)", es: "Press Francés / Skull Crusher" },
  "Triceps Dip": { pt: "Mergulho de Tríceps", es: "Fondos de Tríceps" },

  // Core / Abs / Abdominal
  "Crunch": { pt: "Abdominal Tradicional", es: "Crunch Abdominal" },
  "Plank": { pt: "Prancha Isométrica", es: "Plancha Abdominal" },
  "Hanging Leg Raise": { pt: "Elevação de Pernas na Barra", es: "Elevación de Piernas Colgado" },
  "Cable Crunch": { pt: "Abdominal na Polia Alta", es: "Crunch en Polea" },
};

/**
 * Translates an exercise title into the target locale ('pt', 'es', or 'en').
 * Falls back gracefully to original title for unmapped or custom exercises.
 */
export function translateExerciseTitle(title: string, locale?: string | null): string {
  if (!locale || locale === "en") return title;
  const match = EXERCISE_TRANSLATIONS[title];
  if (match) {
    if (locale === "pt") return match.pt;
    if (locale === "es") return match.es;
  }
  return title;
}
