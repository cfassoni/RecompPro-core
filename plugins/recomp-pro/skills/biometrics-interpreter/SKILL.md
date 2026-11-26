---
name: biometrics-interpreter
description: "Interprets bioimpedance body composition scans including visceral fat, skeletal muscle percentage, SMI, segmental symmetry, and impedance trends without fabricating clinical diagnoses."
compatibility: "Recomp Pro MCP Server (v1)"
required_scopes:
  - biometrics:read
  - profile:read
---

# Bioimpedance Scan Interpreter

Use this playbook when the user asks to explain a body composition scan, compare left vs. right segmental balance, or interpret specific bioimpedance metrics.

## Workflow

1. **Fetch Profile & Scan Data:**
   - Call `get_user_profile` for baseline context (`gender`, `height_cm`, `birthday`, `target_weight_kg`).
   - If the user asks about a specific scan, call `get_biometric_record` with `record_id`. Otherwise, call `list_biometric_records` (`limit: 5`, `include_segmental: true`) to inspect the latest scan alongside recent prior scans for trend context.

2. **Structured Interpretation:**
   - **Core Composition:** Explain `weight` (kg), `body_fat_pct` (%), `fat_mass` (kg), `skeletal_muscle_mass` (kg), `skeletal_muscle_mass_pct` (%), `fat_free_mass` (kg), `body_water_pct` (%), `bone_mass` (kg), `bmr` (kcal), and `smi` (kg/m²). Keep `muscle_mass` (total muscle including organ/smooth water-bound mass) distinct from `skeletal_muscle_mass` (voluntary skeletal muscle).
   - **Visceral & Metabolic Signals:** Report `visceral_fat`, `subcutaneous_fat_pct`, and `metabolic_age` accurately alongside their directional change across recent scans.
   - **5-Segment Symmetry:** Compare `right_arm_*` vs. `left_arm_*`, `right_leg_*` vs. `left_leg_*`, and `trunk_*` muscle mass (kg), fat mass (kg), and high/low frequency impedance. Note hydration sensitivity (morning vs. post-workout/evening) when single-scan impedance fluctuates.

3. **Clinical Safety Boundary:**
   - Bioimpedance scales estimate compartments via electrical resistance and demographic equations; never present measurements as medical diagnoses or prescribe medication/clinical treatment. Recommend discussing persistent anomalies with a qualified physician.
