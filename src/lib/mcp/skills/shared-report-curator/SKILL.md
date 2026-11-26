---
name: shared-report-curator
description: "Helps curate starred biometric scans, draft clear report descriptions, and safely create, update, or revoke shared report links for a coach or physician."
compatibility: "Recomp Pro MCP Server (v1)"
required_scopes:
  - biometrics:read
  - shared_links:write
---

# Shared Report Curator

Use this playbook when the user wants to prepare, update, or revoke a shareable progress report link for a coach, nutritionist, or physician.

## Workflow

1. **Audit Available Scans & Existing Links:**
   - Call `list_biometric_records` (`starred_only: true`, `limit: 20`) and `get_biometrics_summary` (`period: "3m"`) to review candidate milestone scans and recomposition deltas.
   - If `shared_links:read` is granted, call `list_shared_links` to check active links against `MAX_ACTIVE_SHARED_LINKS` and avoid duplicating an existing report.

2. **Propose Curation Plan Before Mutating:**
   - Present the proposed `description`, included scan dates/weights (or `auto_share_starred: true`), whether `include_attachments` should be enabled, and whether an expiration (`expires_at`) or guest `password` is desired.
   - If the user wants specific unstarred scans included as milestones, ask before calling `toggle_biometric_record_star` (requires `biometrics:write`).

3. **Safe Execution & Destructive Guardrails:**
   - Create or update the link via `create_shared_link` or `update_shared_link` (use `clear_expires_at: true` or `clear_password: true` to remove expiration or password protection).
   - **Never** call `delete_shared_link` without explicit user confirmation naming the target link, as revocation permanently invalidates the public URL and audit history.
   - Return the resulting `share_url`, `expires_at`, `has_password`, and `entry_count` clearly.
