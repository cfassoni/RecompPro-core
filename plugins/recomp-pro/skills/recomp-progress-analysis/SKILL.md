---
name: recomp-progress-analysis
description: "Structured workflow combining body composition trends, segmental balance, target weight delta, and strength training volume/progression into an evidence-based body recomposition progress review."
compatibility: "Recomp Pro MCP Server (v1)"
required_scopes:
  - biometrics:read
  - workouts:read
---

# Body Recomposition Progress Analysis

Use this playbook when the user asks for a body recomposition review, progress check-in, or correlation between weight/body-fat/muscle changes and strength training volume.

## Workflow

1. **Gather Authoritative Context (Read-Only):**
   - Call `get_user_profile` (if `profile:read` is granted) to obtain `target_weight_kg`, `height_cm`, and `preferred_language`.
   - Call `get_biometrics_summary` with the user's requested `period` (`all`, `1m`, `3m`, `6m`, or `1y`; default `3m`).
   - Call `list_biometric_records` (`limit: 10`, `include_segmental: true`) to inspect recent scan quality, bilateral segmental balance, and visceral fat trends.
   - Call `get_workout_stats` (same `period`) and `get_workout_progression` (same `period`) to inspect workout consistency, weekly volume (kg), caloric expenditure (`sessionCaloriesBurned`, `epocCaloriesBurned`, `totalCaloriesBurned`), and exercise PRs.

2. **Analyze Recomposition Signals:**
   - **Body Composition vs. Scale Weight:** Compare `weight_change`, `body_fat_change`, `body_fat_mass_change`, `skeletal_muscle_mass_change`, and `skeletal_muscle_mass_pct_change`. Highlight recomposition when fat mass decreases while skeletal muscle mass holds steady or increases, even if total scale weight changes slowly.
   - **Target Weight Gap:** Compare `current_weight` against `target_weight_kg` from the user profile.
   - **Training Stimulus Alignment:** Correlate weekly volume (`chartData`), average session frequency, and top exercise PRs (`items`) with lean-mass retention or gain.

3. **Reporting Guardrails:**
   - Always cite exact units (`kg`, `%`, `kcal`, `kg/m²`) directly from tool outputs.
   - Never fabricate missing measurements or clinical diagnoses. If a period has zero scans or zero workouts, state that explicitly and recommend syncing Fitdays/Hevy or adjusting the time horizon.
   - Respond in the user's `preferred_language` (or the language of the prompt).
