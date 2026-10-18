# Deployment Guide

Recomp Pro is built as a single-container Next.js 16 (Node.js 22) monolith with embedded SQLite persistence (`@libsql/client` + Drizzle ORM). It is optimized for self-hosting via **Docker Compose** and **Portainer** using multi-architecture container images (`linux/amd64` and `linux/arm64`) published to GitHub Container Registry (`ghcr.io`).

---

## 1. Fresh Installation (Docker Compose & Portainer)

### Option A: Docker Compose CLI

1. Ensure Docker Engine and Docker Compose are installed on your host.
2. Create or review your `docker-compose.prod.yml` definition:
   ```yaml
   name: recomp-pro

   services:
     app:
       image: ghcr.io/cfassoni/recomppro-core/app:latest
       container_name: recomp-pro-app
       ports:
         - "80:3000"
       environment:
         - NODE_ENV=production
         - DOCKER_MODE=true
         - DATABASE_URL=file:/app/data/recomp_pro.db
         - UPLOAD_DIR=/app/data/uploads/profile_pics
         - REPORTS_DIR=/app/data/uploads/reports
         - JWT_SECRET=${SECRET_KEY:-recomp_pro_super_secret_key_12345_change_in_production}
         - ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES:-1440}
         - INTEGRATIONS_ENCRYPTION_KEY=${INTEGRATIONS_ENCRYPTION_KEY:-}
         - MAILGUN_API_KEY=${MAILGUN_API_KEY:-}
         - MAILGUN_DOMAIN=${MAILGUN_DOMAIN:-}
         - MAILGUN_API_BASE_URL=${MAILGUN_API_BASE_URL:-https://api.mailgun.net/v3}
         - MAIL_FROM_ADDRESS=${MAIL_FROM_ADDRESS:-Recomp Pro <noreply@recomppro.local>}
         - NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost}
         - ENABLE_WIP_PAGES=${ENABLE_WIP_PAGES:-false}
       volumes:
         - recomp_pro_data:/app/data
       restart: unless-stopped

   volumes:
     recomp_pro_data:
       name: recomp_pro_data
   ```
3. Start the stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
4. Access the application at `http://<your-server-ip>` or `http://localhost`.

### Option B: Portainer Stack Deployment

1. Open Portainer and navigate to **Stacks ➔ Add stack**.
2. Name the stack `recomp-pro` and paste the YAML definition from **Option A** into the **Web editor**.
3. Under **Environment variables**, define your production secrets (at minimum `SECRET_KEY` and `NEXT_PUBLIC_APP_URL`; optionally `MAILGUN_API_KEY` and `MAILGUN_DOMAIN`).
4. Click **Deploy the stack**.
5. Because the `recomp_pro_data` volume specifies an explicit `name: recomp_pro_data`, Portainer will always bind to the exact named volume `recomp_pro_data` without prefixing the stack name.

---

## 2. Runtime Environment Configuration (Zero-Rebuild Flags)

All runtime configuration variables are read dynamically on the server at request/startup time (`src/app/layout.tsx` and API routes). Changing environment variables in `docker-compose.prod.yml` or Portainer only requires restarting the container (`docker compose up -d` or **Update the stack** in Portainer) — **no image rebuild is required**.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DOCKER_MODE` | `true` | Enables container storage paths (`/app/data`) and startup directory initialization. |
| `DATABASE_URL` | `file:/app/data/recomp_pro.db` | SQLite database file URI inside the persistent volume. |
| `UPLOAD_DIR` | `/app/data/uploads/profile_pics` | Directory for user profile avatars. |
| `REPORTS_DIR` | `/app/data/uploads/reports` | Directory for PDF/image bioimpedance reports attached to scan records. |
| `JWT_SECRET` / `SECRET_KEY` | *(fallback dev key)* | Secret key used to sign JWT session and guest share tokens. **Always set a strong random string in production.** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` (24h) | Session JWT expiration window in minutes. |
| `INTEGRATIONS_ENCRYPTION_KEY` | *(derived from `JWT_SECRET`)* | Optional dedicated key or passphrase for AES-256-GCM envelope encryption of third-party integration credentials at rest. If omitted, securely derived from `JWT_SECRET` via HKDF-SHA256. |
| `ENABLE_WIP_PAGES` | `false` (`true` in dev) | Dynamically toggles preview/WIP navigation items and dashboard cards (`Nutrition`, `Activities`) without rebuilding the image. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost` | Base URL used when generating email verification and password reset links. |
| `MAILGUN_API_KEY` | *(empty)* | Mailgun API key for transactional emails (verification codes, password resets, security alerts). When empty, emails are logged to container stdout. |
| `MAILGUN_DOMAIN` | *(empty)* | Mailgun sending domain. |
| `MAILGUN_API_BASE_URL` | `https://api.mailgun.net/v3` | Mailgun API base endpoint (`https://api.eu.mailgun.net/v3` for EU domains). |
| `MAIL_FROM_ADDRESS` | `Recomp Pro <noreply@recomppro.local>` | Sender address for transactional emails. |

---

## 3. Database Backup, Restore & Maintenance (SQLite)

All persistent state — both the SQLite database (`recomp_pro.db`) and uploaded files (`uploads/profile_pics`, `uploads/reports`) — resides inside the `recomp_pro_data` Docker volume mounted at `/app/data`.

### Full Volume Backup (Database + Uploaded Media)

Run a temporary Alpine container to archive `/app/data` into a timestamped `.tar.gz` file on your host:

```bash
docker run --rm \
  -v recomp_pro_data:/data:ro \
  -v "$(pwd)":/backup \
  alpine tar czf "/backup/recomp_pro_backup_$(date +%Y%m%d_%H%M%S).tar.gz" -C /data .
```

### Full Volume Restore

1. Stop the running application container to release SQLite file locks:
   ```bash
   docker stop recomp-pro-app
   ```
2. Extract your backup archive into the `recomp_pro_data` volume:
   ```bash
   docker run --rm \
     -v recomp_pro_data:/data \
     -v "$(pwd)":/backup:ro \
     alpine sh -c "rm -rf /data/* && tar xzf /backup/<your_backup_file.tar.gz> -C /data"
   ```
3. Start the application container again:
   ```bash
   docker start recomp-pro-app
   ```

### Database Integrity Check & Compaction (`VACUUM`)

You can verify SQLite integrity and compact the database directly inside the running container using the bundled `@libsql/client`:

```bash
docker exec recomp-pro-app node -e '
const { createClient } = require("@libsql/client");
(async () => {
  const c = createClient({ url: "file:/app/data/recomp_pro.db" });
  const check = await c.execute("PRAGMA integrity_check");
  console.log("Integrity check:", check.rows[0]);
  await c.execute("VACUUM");
  console.log("VACUUM completed successfully.");
})();
'
```

---

## 4. Upgrading from Legacy v0.3.0 (Volume Migration Procedure)

Upgrading from the legacy Python/FastAPI multi-container architecture (`v0.3.0`) to the single-container Next.js monolith (`v0.4.0+`) involves copying your existing SQLite database (`fitdays.db`) and uploaded media from the legacy volume to `recomp_pro_data`. On startup, `recomp-pro-app` automatically renames `fitdays.db` to `recomp_pro.db` and migrates the internal tables (`fitdays_records` ➔ `recomp_records`, `fitdays_reports` ➔ `recomp_reports`).

### Step 1: Initial Transitional Deployment

Deploy once with the temporary `data-migrator` init service attached to your legacy volume:

```yaml
services:
  data-migrator:
    image: alpine
    restart: "no"
    volumes:
      - fitdays-db-data-legacy:/from
      - recomp_pro_data:/to
    command: sh -c "if [ ! -f /to/recomp_pro.db ] && [ ! -f /to/fitdays.db ] && [ -f /from/fitdays.db ]; then echo '[Migration] Migrating legacy data to new volume...'; cp -av /from/. /to/; echo '[Migration] Migration complete.'; else echo '[Migration] No migration needed.'; fi"

  app:
    depends_on:
      - data-migrator
    image: ghcr.io/cfassoni/recomppro-core/app:latest
    container_name: recomp-pro-app
    ports:
      - "80:3000"
    environment:
      - NODE_ENV=production
      - DOCKER_MODE=true
      - DATABASE_URL=file:/app/data/recomp_pro.db
      - UPLOAD_DIR=/app/data/uploads/profile_pics
      - REPORTS_DIR=/app/data/uploads/reports
      - JWT_SECRET=${SECRET_KEY:-recomp_pro_super_secret_key_12345_change_in_production}
      - ACCESS_TOKEN_EXPIRE_MINUTES=${ACCESS_TOKEN_EXPIRE_MINUTES:-1440}
      - MAILGUN_API_KEY=${MAILGUN_API_KEY:-}
      - MAILGUN_DOMAIN=${MAILGUN_DOMAIN:-}
      - MAILGUN_API_BASE_URL=${MAILGUN_API_BASE_URL:-https://api.mailgun.net/v3}
      - MAIL_FROM_ADDRESS=${MAIL_FROM_ADDRESS:-Recomp Pro <noreply@recomppro.local>}
      - NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL:-http://localhost}
      - ENABLE_WIP_PAGES=${ENABLE_WIP_PAGES:-false}
    volumes:
      - recomp_pro_data:/app/data
    restart: unless-stopped

volumes:
  fitdays-db-data-legacy:
    external: true
    name: fitdays-web_fitdays-db-data  # Adjust if your legacy volume name differs (e.g., fitdaysweb_fitdays-db-data)
  recomp_pro_data:
    name: recomp_pro_data
```

### Step 2: Verification & Cleanup

1. Inspect the container logs (`docker logs recomp-pro-app`) and confirm:
   - `Checking and applying Drizzle database migrations...`
   - `Drizzle migrations verified successfully.`
2. Log in to the web interface and verify your historical records and profile media.
3. Switch your Compose file or Portainer stack back to the permanent definition in **Section 1** (removing `data-migrator` and `fitdays-db-data-legacy`) and redeploy.
