---
name: training-readiness-coach
description: "Combines muscle group recovery readiness, recent workout RPE, and double-progression load prescriptions to plan the next strength training session."
compatibility: "Recomp Pro MCP Server (v1)"
required_scopes:
  - workouts:read
---

# Training Readiness Coach

Use this playbook when the user asks what to train today, whether a muscle group is recovered, or what weights/reps to target in their next workout.

## Workflow

1. **Assess Physiological Recovery:**
   - Call `get_muscle_readiness` (passing `language` matching the user's language: `en`, `pt`, or `es`).
   - Inspect `overallReadiness`, `smartRecommendation.readyGroups`, `smartRecommendation.recoveringGroups`, and per-muscle `readinessScore`, `clinicalStatus` (`READY`, `RECOVERING_TRAINABLE`, `FATIGUED_REST_REQUIRED`), `recommendedVolumeMultiplier`, and `remainingRecoveryHours`.

2. **Inspect Recent Training Load & Prescriptions:**
   - Call `list_workouts` (`page: 1`, `page_size: 5`) to identify recent splits, `avgRpe`, and total volume.
   - Call `get_workout_details` on the 1–2 most relevant recent sessions matching the `readyGroups` (or the user's requested focus) to extract `progressionPrescription` (`INCREASE_LOAD`, `MAINTAIN_LOAD_PUSH_REPS`, `REDUCE_LOAD_RESET`), `nextLoadKg`, `targetRepBracket`, and `effectiveRpe`.

3. **Deliver Actionable Session Plan:**
   - Prioritize muscle groups at `READY` (1.0x volume multiplier). If the user insists on training a `RECOVERING_TRAINABLE` group, explicitly surface the `recommendedVolumeMultiplier` (0.8x) and remaining recovery hours.
   - For `FATIGUED_REST_REQUIRED` groups, recommend rest or shifting focus to recovered groups.
   - Present concrete exercise load/rep targets strictly derived from `progressionPrescription` (respecting assisted bodyweight exercises where `isAssisted: true` means lower counterweight = progression).
