# Workspace Agent Rules

## 1. Development & Branching Hierarchy

```
main (Production, tagged releases only)
  ▲
  │ (User-Approved Release PR)
preview (Staging / Integration base)
  ▲
  │ (User-Approved Feature/Fix PR)
feat/* | fix/* | docs/* (Isolated feature branches)
```

- **Branch Hierarchy & PR Targets**:
  - All feature and task development must occur on dedicated feature branches (e.g., `feat/<feature-name>`, `fix/<bug-name>`).
  - Pull Requests from feature branches must **ALWAYS** target the **`preview`** branch (`gh pr create --base preview`).
  - Direct pushes to `main` or `preview` are strictly forbidden.
  - The `main` branch is strictly reserved for release cutovers promoted from `preview`.

- **Semantic Pull Request & Release Titles**:
  - All Pull Request titles must strictly follow Conventional Commits format (`feat:`, `fix:`, `chore:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:`, `revert:`).
  - For Release Pull Requests from `preview` to `main`, always use: `chore(release): v<version> — <summary>` so that PR title semantic validation passes.
  - For GitHub Releases (`gh release create`), the release `--title` must be **strictly the version code** (e.g., `v0.7.0`), with **no descriptive text or subtitle**.

- **Link and Close GitHub Issues**:
  - When creating a feature Pull Request targeting `preview`, include closing keywords (`Closes #<issue_number>`) in the PR description for traceability.
  - Because GitHub only auto-closes issues when a PR targets the default branch (`main`), **every Release Pull Request (`preview` ➔ `main`) must also explicitly list `Closes #<issue_number>` in its body for all issues delivered in that release cycle**.

- **Streamlined Release Cutover Workflow**:
  - Once the user initiates a release and confirms the target version (`vX.Y.Z`), do NOT pause for separate micro-approvals on intermediate commits, branch pushes, or tag creation:
    1. Automatically create `chore/bump-vX.Y.Z` off `preview`, sync `origin/main` ancestry (`git merge --no-edit origin/main`), run `npm run version:bump X.Y.Z`, verify build/tests, commit, push `chore/bump-vX.Y.Z`, and open the PR targeting `preview`. Output the PR URL and wait for the user's manual merge.
    2. As soon as the user confirms the bump PR is merged into `preview`, immediately pull `origin/preview` and open the Release PR (`preview` ➔ `main`). Output the PR URL and wait for the user's manual merge.
    3. As soon as the user confirms the Release PR is merged into `main`, immediately create the GitHub Release and tag (`gh release create vX.Y.Z --target main --title "vX.Y.Z"`).

- **Zero-Polling on Remote CI/CD & GitHub Procedures (Token Conservation)**:
  - Do NOT poll or loop checking status of GitHub Actions workflows, CI runs, PR checks, or release image builds.
  - Once a remote action (`gh pr create`, `gh release create`) is executed, output the relevant GitHub URL to the user and immediately end the turn. The user will monitor remote status asynchronously and return to the agent if any follow-up is needed.

---

## 2. Hard Autonomy Boundaries (The Approval Gates)

| Action                                                      | Allowed Autonomously? | Protocol / Requirement                                                                                                                                                                            |
| :---------------------------------------------------------- | :-------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Researching codebase / reading files**                    |   **YES**       | Proactive exploration.                                                                                                                                                                            |
| **Editing code files locally**                              |    **YES**       | Keep changes isolated and focused on the active task.                                                                                                                                             |
| **Running verification suite (`lint`, `test`, `build`)**    |   **YES**       | Always verify before declaring work complete.                                                                                                                                                     |
| **Creating local feature branch (`fix/*`, `feat/*`)**       |   **YES**       | Always branch off latest `preview`.                                                                                                                                                               |
| **Committing locally on feature branch**                    |   **YES**       | Use Conventional Commits (`feat:`, `fix:`, `chore:`).                                                                                                                                             |
| **Merging feature branch locally into `preview` or `main`** |  **NEVER**      | **Requires explicit written user approval after user testing.**                                                                                                                                   |
| **Pushing & Opening Feature PR (`git push` + `gh pr create`)** | **ON PR APPROVAL** | **Wait for user testing approval (e.g., "pode abrir PR"); once approved, push the branch and open the PR in one step.**                                                                           |
| **Release Bump PR, Release PR & Tag (`vX.Y.Z`)**            | **ON RELEASE START**  | **Once the user requests a release and confirms version `vX.Y.Z`, execute the bump PR (`➔ preview`), Release PR (`➔ main`), and `gh release create vX.Y.Z` automatically after each human merge.** |
| **Merging Pull Requests (`gh pr merge`)**                   |  **NEVER**      | **Human-only. Merges are performed manually by the user — enforced as a hard rule, _not_ as a permission limit (the App does hold `pull_requests: write`, which it needs in order to open PRs).** |

---

## 3. Technical & Architectural Invariants

- **100% Pure Node.js Toolchain (Zero Python)**:
  - The application runtime and developer tooling are strictly Node.js 22+ and TypeScript.
  - Version bumping is managed via `npm run version:bump <version>` (updating `VERSION`, `package.json`, and `Version.tsx`).

- **Database Migrations (Drizzle ORM)**:
  - Schema changes in `src/db/schema.ts` must include corresponding Drizzle migration scripts generated via `npm run db:generate`.
  - Migrations run automatically on startup via `src/instrumentation.ts`. Direct/manual changes to production databases are strictly forbidden.

- **Zero-FOUC, Hydration-Safe i18n & Client Persistence**:
  - All user-facing text, tooltips (`title`), screen reader descriptions (`aria-label`), and menu/button labels must be fully internationalized with exact key parity across `src/locales/{en,pt,es}.json`.
  - Server components (e.g., `src/app/layout.tsx`) must **NEVER** import client-only `react-i18next` modules. Use pure server-safe helpers (`src/lib/locale.ts`) with native `next/headers` (`cookies()`, `headers()`) to prevent React hydration errors (Error #418) and flashes of untranslated content (FOUC).
  - Client components (`AuthProvider`) must only synchronize initial language from SSR props on mount (e.g., in `useEffect` on initial mount) and never perform synchronous render-body resets that overwrite user selections.
  - Browser cookie utilities (`setLanguageCookie`) must condition `;Secure` on HTTPS (`window.location.protocol === 'https:'`) to ensure cookies persist properly on `http://localhost` and HTTP Docker environments.

- **Unit-Aware Spreadsheet & Data Importers**:
  - CSV/XLSX parsers and import utilities must inspect unit tokens (`%`, `kg`, `kcal`, `m²`) during header classification rather than performing strip-only normalization. Metrics sharing common names (e.g., skeletal muscle percentage vs skeletal muscle mass in kg, total muscle mass, muscle rate) must map unambiguously to their respective database fields.

- **Dynamic Runtime Configuration (Zero-Rebuild Flags)**:
  - Feature flags (like `ENABLE_WIP_PAGES`) must be read on the server (`layout.tsx`) and injected into context/props so that environment variable changes in `docker-compose.yml` take effect upon container restart without requiring Docker image rebuilds.

- **Brand Sanitization in Client Storage**:
  - Never use legacy branding identifiers (`fitdays*`) in client-accessible storage (`localStorage`, session cookies, URL query params). Always use active brand namespaces (`recomp_pro_*` / `recomp_*`).

- **Infrastructure & Operational Logging**:
  - All Node.js server logging and Docker container shell commands/init containers must format timestamps with `[YYYY-MM-DD HH:MM:SS]` for observability.
  - Always specify explicit `name` properties for Docker named volumes (e.g., `volumes: recomp_pro_data: name: recomp_pro_data`) to prevent Docker Compose from prefixing project names.

- **GitHub App Authentication & Ephemeral Credentials**:
  - All remote Git operations (`fetch`, `push`, `pull`) and GitHub CLI (`gh`) commands must authenticate exclusively using ephemeral installation tokens derived from GitHub App credentials in `.env` (`GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_PRIVATE_KEY`).
  - Use the harness-independent `github-app` CLI. After cloning, import the project's ignored `.env` settings once with `github-app profile import --name <profile> --env .env --git-name '<app>[bot]' --git-email '<app-id>+<app>[bot]@users.noreply.github.com'`, then run `github-app init --profile <profile>`. This registers the per-project App profile, credential helper, and local commit identity.
  - For a new private clone, use `github-app clone --profile <profile> <https-repo-url> [directory]`; clone cannot inherit destination-repository Git configuration because `.git/config` does not exist yet. Plain `git fetch` / `git push` / `git pull` then use the App helper.
  - `gh` does not read Git credential helpers; wrap it with `github-app run gh <args...>` (or `github-app run --profile <profile> gh <args...>` outside an initialized repo).
  - Never rely on personal host SSH keys, global Git credential helpers, or interactive login prompts.

- **Modal & Drawer Dismissal Ergonomics**:
  - All dialogs, sheets, modals, and slide-over drawers must support dismissal via backdrop/overlay click and the `Escape` keyboard key (with cleaned-up event listeners in `useEffect`), in addition to explicit close buttons.

- **Non-Destructive Background Revalidation**:
  - Re-fetching or syncing data following user actions (e.g., CSV imports, form submissions) must use silent/background revalidation flags rather than setting page-level loading spinners that unmount active modal windows, feedback banners, or summary cards.

- **Data Table Ergonomics & Action Icon Standards**:
  - Table scrolling must be contained within the table container card (`max-h-[...] overflow-y-auto` with sticky headers `sticky top-0 bg-card z-10`) rather than forcing full-page scrolling.
  - Row action icons must use consistent ghost button styling (`hover:bg-muted/80`, no mismatched borders or shadows), and table rows should trigger primary drill-downs on click.
  - Analytical charts and tabular views must share uniform time-horizon filter presets (`All`, `1M`, `3M`, `6M`, `1Y`).

---

## 4. DOs and DON'Ts Reference Table

### DOs

- **DO** keep all active work isolated on dedicated `feat/*` or `fix/*` branches.
- **DO** run and pass the full local verification suite (`npm run lint`, `npm test`, `npm run build`, `docker compose build`) before presenting completed work.
- **DO** leave the testing and validation in the hands of the user before suggesting any branch merges or remote actions.
- **DO** link and close GitHub issues in PR bodies using standard keywords (e.g., `Closes #64`).
- **DO** use `chore(release): vX.Y.Z — ...` for release PR titles to satisfy Semantic PR CI checks.
- **DO** output the GitHub action URL directly upon creating PRs or releases and yield immediately without entering polling loops.
- **DO** ensure Docker volumes use explicit names (e.g., `recomp_pro_data`) and legacy volumes use `external: true` for Portainer compatibility.
- **DO** write comprehensive unit/integration tests for every newly added feature or bug fix.
- **DO** consult [docs/UI_AND_I18N_GUIDELINES.md](file:///home/cfassoni/Projects/RecompPro-core/docs/UI_AND_I18N_GUIDELINES.md) and ai-memory for UI consistency, locale-aware formatting, and integration standards.
- **DO** authenticate remote Git and GitHub CLI operations with ephemeral GitHub App installation tokens: `github-app clone` for private clones, the configured helper for `fetch`/`push`/`pull`, and `github-app run gh ...` for GitHub CLI.

### DON'Ts

- **DON'T EVER** push to `origin` without explicit user permission.
- **DON'T EVER** open or merge a Pull Request without explicit user permission.
- **DON'T EVER** attempt automated PR merges via GitHub App — merges are strictly human. The App _does_ hold `pull_requests: write` (required to open PRs), so this is a hard rule with no technical backstop; honour it unconditionally.
- **DON'T EVER** rely on personal SSH keys or global host credentials for remote Git/GitHub operations.
- **DON'T EVER** merge a feature branch into local `preview` or `main` before the user has finished testing on the feature branch.
- **DON'T EVER** target `main` directly for feature PRs (all feature PRs must target `preview`).
- **DON'T EVER** poll or wait in loops for GitHub Actions, CI checks, or release image builds.
- **DON'T EVER** perform synchronous language resets inside component render bodies based on static SSR props.
- **DON'T EVER** strip unit indicators (`%`, `kg`) before classifying spreadsheet columns with overlapping names.
- **DON'T EVER** introduce Python scripts or `uv` dependencies into the repository.
- **DON'T EVER** import `react-i18next` inside Next.js Server Components.
- **DON'T EVER** delete Git branches without explicit user instruction.
- **DON'T EVER** attempt large "big-bang" architectural changes in a single step; always deliver in testable, incremental milestones.
- **DON'T EVER** run `curl` or probe commands against localhost after starting Docker containers; let the user test directly in their browser.
