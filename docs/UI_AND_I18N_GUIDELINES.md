# UI Consistency, Locale-Aware Formatting & Integration Guidelines

This document outlines the standard frontend conventions, number/locale formatting rules, and third-party integration resilience requirements for **Recomp Pro**.

---

## 1. Locale-Aware Number & Metric Formatting

### The Invariant
Never use raw `.toFixed()`, raw string concatenation, or unconditioned `.toLocaleString()` in user-facing components.
- **Language differences**: Portuguese and Spanish use `,` for decimals and `.` for thousands (e.g. `1.234,50`), while English uses `.` for decimals and `,` for thousands (e.g. `1,234.50`).
- **Single Source of Truth**: All numerical values must be formatted using the central helpers from `@/lib/locale.ts` (server-safe) and `@/lib/i18n.ts` (client-safe):
  - `formatNumber(value, locale, options)`: General number formatting.
  - `formatInteger(value, locale)`: Integer with thousands separators.
  - `formatDecimal(value, locale, decimals)`: Floating-point numbers with specified decimal places.
  - `formatDelta(delta, locale, decimals)`: Signed difference values (`+1,2` or `-0,8`).

### Scale Ergonomics for Large Physical Quantities
Large cumulative metrics (such as cumulative weight lifted in strength training):
- When values exceed 1000 kg, present them in tonnes (`t`) with mathematical rounding to integers without trailing decimals (e.g., `12 t` instead of `12,345 kg` or `12.3 t`).
- Caloric quantities should always be formatted with thousands separators (`formatInteger(calories)`).

---

## 2. Visual & Theming Consistency

### Semantic Design Tokens
- Always use the semantic Tailwind classes defined in the theme (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `bg-primary/10`, `text-primary`, etc.).
- Never introduce hardcoded colors or mismatched styling (e.g. dark borders in light mode or custom background colors that clash with adjacent cards).

### Card Ergonomics & Collapsible Sections
- Long or data-dense analytical cards (e.g. *Muscle Group Readiness*, *Load Progression & PRs*, *Workouts History*) must include a collapsible toggle button (`^` chevron) in the top-right corner of their header.
- Secondary or detail-oriented cards should default to the **collapsed** state on initial load so the user is not overwhelmed and can immediately focus on the primary KPIs.

### Toolbars & Filter Parity
- Analytical views, charts, and history tables must maintain functional and visual parity across views:
  - Standard time-horizon presets: `All`, `1M`, `3M`, `6M`, `1Y`.
  - Consistent layout: Horizon filter on the right, search input and page-size selector on the left (e.g. *Activities* history table mirroring the *Biometrics* table layout).

### Elimination of Navigation Redundancy
- Functional data tabs must not duplicate configuration or connection buttons that already have a dedicated home in the user profile (e.g. no "Integration" button in *Activities*, as integration management belongs in *Profile > Integrations*).

---

## 3. Webhook & Third-Party Integration Resilience

### External UI Compatibility
- Developer settings in third-party services often require two distinct inputs: a **Notification URL** and an **Authorization Header** (`Bearer <token>`).
- Our interface in *Profile > Integrations* must mirror these two inputs with copyable fields, password toggles, and token regeneration controls.
- The backend webhook handler must support both the standard `Authorization: Bearer <token>` header and route path parameters (`/api/integrations/<provider>/webhook/[token]`).

### Response SLA (< 5 Seconds)
- External webhook services (like Hevy) mandate responses within **5 seconds**; otherwise, the delivery is marked as failed.
- Webhook handlers must use strict request timeouts (`AbortSignal.timeout(3500)`) and limit retry attempts (maximum 1 retry) so processing and SQLite upserts finish well within 5 seconds.

### Dynamic Metadatas Resolution
- Third-party webhook events may reference new entities created immediately before the event (such as a new custom exercise template created during a workout).
- Webhook sync routines must gracefully fetch unknown entity templates on-the-fly and cache them locally, preventing `null` muscle group or equipment categorizations.
