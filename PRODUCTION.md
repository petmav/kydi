# Kydi production runbook

This runbook is for operators of a Kydi deployment, on Zenith Hosting (from the catalogue, using
`zenith-compose.yml`) or on any Docker host. Release notes are in CHANGELOG.md. To report a vulnerability, see
SECURITY.md.

## 1. Architecture

| Service | Image | Data | Notes |
| --- | --- | --- | --- |
| `app` | Built from the root `Dockerfile` (Node.js 24 LTS, Next.js standalone server) | volume `app-data` at `/data` (uploads under `/data/uploads`) | Port 3000. Runs as uid 1001 with a read-only root filesystem and no Linux capabilities. Runs `prisma migrate deploy` at every start, then the server. |
| `db` | `postgres:16.15-alpine3.24`, pinned by digest | volume `db-data` (`PGDATA=/var/lib/postgresql/data/pgdata`) | Runs as uid 70 (`postgres`), read-only root filesystem, no capabilities. Not exposed outside the deployment. |

The app answers `GET /api/health` with `{"status":"ok"}` (HTTP 200) when it can reach the database, or
`{"status":"unavailable"}` (HTTP 503) otherwise and during shutdown. Both services have Compose health checks;
`app` starts only after `db` is healthy.

Background work (recurring invoices, recurring costs, overdue and expiry sweeps, removal of expired sessions
and reset tokens) runs in the app process every minute and once at boot. It runs under a Postgres advisory
lock, so only one process does it at a time. Optionally, an external scheduler can call
`GET|POST /api/cron/recurring` with `Authorization: Bearer $CRON_SECRET`.

## 2. Environment variables

On Zenith, the publish manifest generates or derives every variable marked "Zenith". Other hosts must set the
required variables themselves.

| Variable | Required | Zenith | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | template | PostgreSQL connection string. URL-encode special characters in the password. |
| `SESSION_SECRET` | yes (production) | generated | Signs session and portal cookies. 32 or more random characters, not a known example value. Changing it signs everybody out. Stored credentials are not affected. |
| `APP_ENCRYPTION_KEY` | yes (production) | generated | Encrypts stored mail and exchange-rate credentials (AES-256-GCM). 32 or more random characters, different from `SESSION_SECRET`. **Never change it after the first start**: stored credentials would become unreadable. |
| `CRON_SECRET` | no | generated | Bearer secret for `/api/cron/recurring`. The route is disabled when the variable is unset. If set, it must have 24 or more random characters. |
| `APP_URL` | recommended | alias of `ZENITH_PUBLIC_URL` | Public base URL for links in emails and PDFs. When unset, the URL comes from request headers. |
| `KYDI_OWNER_EMAIL` | no | alias of `ZENITH_OWNER_EMAIL` | When set, only this email address can create the first administrator. `ZENITH_OWNER_EMAIL` is also read. |
| `KYDI_INSTALL_REQUIRE_TOKEN` | no | input, default `false` | `true` requires the install token even when an owner email is set. |
| `KYDI_LEGACY_SESSION_SECRET` | no | not set | The previous session secret, only if `SESSION_SECRET` was rotated before upgrading from 0.1.0. Kydi uses it once to re-encrypt old stored credentials. |
| `UPLOAD_DIR` | no | `/data/uploads` | Directory for logos, profile photos and receipts. |
| `KYDI_DEMO_SEED` | no | input, default `false` | `true` creates demo data with a publicly known password on an empty database. Production refuses demo seeding without this explicit value. Never enable it for real data. |
| `KYDI_DISABLE_SCHEDULER` | no | input, default `false` | `true` stops the in-process minute timer. The catch-up at boot still runs. Use with an external cron call. |
| `KYDI_TRUST_PROXY_HOPS` | no | `1` | Number of reverse proxies in front of the app that append to `X-Forwarded-For`. Used for the client IP (rate limits) and the scheme (Secure cookies, HSTS). Zenith terminates TLS in one hop. `0` ignores forwarding headers. |
| `KYDI_LOG_FORMAT` | no | input, default `text` | `json` writes one JSON object per line (`time`, `level`, `msg`). |
| `KYDI_LOG_MAIL_BODIES` | no | not set | Without SMTP, emails go to the log. Production writes only the recipient and subject. `true` adds the bodies, which contain sign-in and reset links: use it only temporarily. |
| `KYDI_SKIP_MIGRATIONS` | no | not set | `true` skips `prisma migrate deploy` at start, for example when migrations run as a separate job. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | no | aliases of `ZENITH_SMTP_*` | Platform SMTP server. When `SMTP_HOST` is empty, emails go to the log. Port 465 uses implicit TLS; other ports upgrade with STARTTLS when the server offers it. |
| `SMTP_FROM`, `SMTP_FROM_NAME` | no | aliases of `ZENITH_SMTP_FROM`, `ZENITH_SMTP_DISPLAY` | Sender address and display name. |
| `POSTGRES_PASSWORD` | yes (db) | generated | Database password for the `db` service. Also injected into `app`, which uses it only through `DATABASE_URL`. |
| `PORT`, `HOSTNAME` | no | image defaults | `3000` and `0.0.0.0`. |

In production (`NODE_ENV=production`, the image default), the app checks its configuration at start. It exits
with `configuration error: ...` lines when `SESSION_SECRET` or `APP_ENCRYPTION_KEY` is missing, shorter than 32
characters, a known development, example or preview value, or not random. It also exits when the two values are
equal or when `CRON_SECRET` is weak. Missing `APP_URL`, `CRON_SECRET` or `KYDI_DEMO_SEED=true` only log warnings.

## 3. Secrets handling

- Zenith generates the secrets once per deployment and keeps them stable. Owners can view or replace them in
  the deployment editor. They are never stored in the repository or the image.
- Rotating:
  - `SESSION_SECRET`: everybody is signed out. Nothing else is affected.
  - `CRON_SECRET`: update any external caller.
  - `APP_ENCRYPTION_KEY`: not supported. If it changes, stored mail passwords and API keys cannot be read. Re-enter
    them in Settings > Mail configuration, Settings > Exchange rate provider and Administration > Mail.
  - `POSTGRES_PASSWORD`: the database keeps the password it was initialised with. To change it, run
    `ALTER USER kydi PASSWORD '...'` in the database first, then change the variable.
- Logs never contain configured secret values. Kydi redacts them, as well as bearer and API tokens, database URL
  passwords and credential-like fields, from all output.
- Passwords are hashed with Argon2id. API tokens and session, reset and portal tokens are stored only as SHA-256
  hashes. Third-party credentials are encrypted with `APP_ENCRYPTION_KEY` and never sent to the browser.

## 4. First start and installation

1. On first start, the app applies all migrations and logs a banner, for example `[kydi] Kydi 0.2.0 starting:
   ..., install owner email, ...`.
2. Open the public URL. The install wizard creates the first administrator, then the first company.
   - **Owner email mode** (Zenith supplies `ZENITH_OWNER_EMAIL`): only that email address can be used. Other
     addresses get "This instance is reserved for its owner".
   - **Install token mode** (no owner email in production, or `KYDI_INSTALL_REQUIRE_TOKEN=true`): copy the token
     from the log. On Zenith: `zenith logs --source runtime`, or the deployment's log view. The token looks like
     `XXXXX-XXXXX-XXXXX-XXXXX`, is single-use and changes on every restart until installation is complete.
3. Once any user exists, the wizard is closed for good. More people join through invitations (Members).

## 5. Backups and restore

Back up both volumes. Run `pg_dump` from the `db` service for a consistent database copy. Do not copy the raw
data directory of a running database.

Example commands for Docker Compose. Replace `<project>` with the Compose project name (`docker volume ls`
lists the volume names). On Zenith Hosting, use the platform's backup or volume tools if they are available.
Otherwise, run the same commands where the deployment allows command execution.

```bash
# Database: custom-format dump (compressed, restorable with pg_restore)
docker compose exec -T db pg_dump -U kydi -d kydi -Fc > kydi-$(date +%F).dump

# Uploads volume (logos, profile photos, receipts)
docker run --rm -v <project>_app-data:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/kydi-uploads-$(date +%F).tar.gz -C /data .
```

Restore into a stopped app:

```bash
docker compose stop app
docker compose exec -T db pg_restore -U kydi -d kydi --clean --if-exists --no-owner < kydi-YYYY-MM-DD.dump
docker run --rm -v <project>_app-data:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/uploads && tar xzf /backup/kydi-uploads-YYYY-MM-DD.tar.gz -C /data && chown -R 1001:1001 /data'
docker compose start app
```

Keep the same `APP_ENCRYPTION_KEY` (and ideally `SESSION_SECRET`) with a backup. Stored credentials can only be
decrypted with the key that encrypted them. Store backups encrypted: they contain customer data and password
hashes. Test a restore regularly.

## 6. Upgrades

1. Read CHANGELOG.md for the target version.
2. Back up both volumes (section 5).
3. Deploy the new version. On Zenith, the maintainer publishes a new commit with `zenith publish update-code`.
   Elsewhere, rebuild the image or pull the new one, then run `docker compose up -d`.
4. At start, `prisma migrate deploy` applies pending migrations. It holds a Postgres advisory lock, so containers
   that start at the same time cannot apply a migration twice. The entrypoint is idempotent.
5. Check `GET /api/health` and the log banner for the new version.

Migrations only move forward. To roll back, restore the backup taken in step 2 and deploy the previous version.
Upgrading from 0.1.0 to 0.2.0: set `APP_ENCRYPTION_KEY` (and `KYDI_LEGACY_SESSION_SECRET` if `SESSION_SECRET` has
changed since). At boot, Kydi re-encrypts the stored credentials and logs how many it migrated.

## 7. Scaling and resource limits

- Run **one** `app` replica (the manifest pins `replicas: 1`). Sign-in rate limits live in memory per process,
  and uploads are on a local volume. The scheduler is safe with several replicas thanks to its advisory lock, but
  more replicas need shared upload storage and a shared rate limiter, which Kydi does not provide.
- Manifest limits: app 1 CPU and 768 MiB (256 MiB reserved), db 1 CPU and 512 MiB (128 MiB reserved). PDF
  rendering is the heaviest operation. Raise the app memory first if you see restarts under load.
- Uploads: receipts up to 20 MB, logos and profile photos up to 2 MB. Server action bodies are limited to 21 MB.
- Prisma opens a small connection pool (CPU count x 2 + 1). The scheduler holds one connection while it runs.

## 8. Monitoring

- Health: `GET /api/health` (no authentication, no details). The container health check calls it every 15 s.
- Logs: stdout and stderr. Set `KYDI_LOG_FORMAT=json` for log processors. Useful lines:
  - `[kydi] Kydi <version> starting: ...` is the configuration summary at boot (no secrets).
  - `[kydi] configuration error: ...` means the app refused to start (see section 2).
  - `[kydi] scheduler catch-up {...}` and `[kydi] scheduler tick failed` report background jobs.
  - `[kydi] stored credentials re-encrypted ...` reports the credential migration.
  - `[kydi] SIGTERM received ...` and `database connections closed, exiting` report a graceful shutdown.
- Alert on repeated container restarts, health check failures and `scheduler tick failed`.

## 9. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Container exits right after start with `configuration error` | Fix the listed variables. On Zenith, the generated values always pass. Check that nobody pasted an example value into the deployment editor. |
| `database not ready or migration failed, retrying` | The database is starting, or `DATABASE_URL` is wrong. After 20 attempts the container exits and restarts. |
| Lost the install token | Restart the app: a new token is logged. The old one stops working. |
| "This instance is reserved for its owner" | Use the email address of the account that deployed the app. Otherwise set `KYDI_OWNER_EMAIL` to the right address and restart. |
| Emails are not delivered | Without SMTP, emails go to the log. Production logs show only the recipient and subject. Check Administration > Mail, the company mail configuration and `SMTP_*`. |
| "The stored API key cannot be read" or mail authentication failures after a restore or migration | `APP_ENCRYPTION_KEY` differs from the key that encrypted the values. Restore the original key, or re-enter the credentials. |
| A company SMTP host or exchange-rate URL is refused | Tenant-supplied hosts must resolve only to public addresses. Private, loopback, link-local, CGNAT, unique-local and single-label hosts (for example `db`) are refused. |
| Login says "Too many sign-in attempts" | The limits are 10 attempts per minute per client IP and 20 per 15 minutes per account. Wait for the window to pass. Behind several proxies, set `KYDI_TRUST_PROXY_HOPS`. |
| Browser console shows Content-Security-Policy errors | Report them as a bug, with the page and the browser version. |

## 10. Security posture summary

- **Configuration**: unsafe production secrets are refused at boot. Secrets come only from the environment and
  are redacted from logs. The start-up banner shows no secrets.
- **Install**: bound to the deployment owner's email, or to a one-time token from the log. Attempts are
  serialised, and the wizard is closed once a user exists.
- **Authentication**: Argon2id (m=19 MiB, t=2, p=1). Passwords need 10 or more characters, and common or
  personal passwords are refused. Throttling applies per IP and per account, for staff, API and portal
  sign-in. Responses and timing are the same for unknown accounts. Reset tokens are single-use, expire after 60
  minutes and are hashed. A reset revokes all sessions and API tokens. Sessions rotate at sign-in and on password
  change. API tokens are hashed and can be revoked (including `POST /api/v1/auth/logout`).
- **Authorisation and tenant isolation**: every page, server action, route handler and API endpoint checks the
  session, company membership and role abilities. The REST API, pages, PDFs, receipts, avatars, statements,
  reports and the customer portal are covered by a two-tenant end-to-end test (`e2e/tenancy.test.ts`).
- **Browser**: nonce-based CSP (`script-src 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`), `X-Frame-Options: DENY` (`SAMEORIGIN` only for PDF previews), `nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, a minimal `Permissions-Policy`, COOP, and HSTS behind https.
  Cookies are `HttpOnly`, `SameSite=Lax` and `Secure` behind https. Cookie-authenticated API writes must come
  from the same origin.
- **Outbound requests**: tenant-supplied SMTP hosts and exchange-rate URLs are resolved, and every address is
  checked at connect time. Redirects are not followed, responses are capped in size, and requests time out.
- **Uploads**: type is checked by content (magic bytes), size is limited, files get random names in per-company
  folders with path traversal checks, and downloads are authorised with explicit content types. Office files are
  always downloaded, never displayed.
- **Rich text**: an allow-list sanitiser runs on save and again when emails and PDFs are rendered. Raw SQL is
  limited to tagged-template (parameterised) row locks, advisory locks and health checks.
- **Container**: non-root numeric users, read-only root filesystems, all capabilities dropped, pinned base
  images, no development dependencies in the runtime image.

## 11. Known limitations

- Single replica only (see section 7). Rate limits reset when the app restarts.
- In owner email mode, anyone who knows the owner's email address could finish installation before the owner
  does. The window lasts from the first start until the owner installs. Set `KYDI_INSTALL_REQUIRE_TOKEN=true` to
  also require the token from the log.
- CSP allows inline styles (`style-src 'unsafe-inline'`), which React style attributes need. Scripts stay
  nonce-only.
- Invitation tokens and emailed document-viewer tokens are stored in plain text (they are capability links).
  Permanent public PDF links (`/pdf/<kind>/<hash>`) work for anyone who has the link, by design.
- Sessions are not bound to an IP address or device. There is no two-factor authentication yet.
- PDFs embed DejaVu Sans (no CJK glyphs; right-to-left scripts are not shaped).
- Development-only dependencies (`eslint-config-next` uses `braces`) have open `npm audit` advisories without
  upstream fixes. They are not part of the runtime image.

## 12. Data stored and retention

- **Stored**: user accounts (name, email, Argon2id hash, optional profile photo), companies and their settings,
  customers and suppliers (contact and address details, optional portal password hash), items, estimates,
  invoices, payments, expenses with receipts, bills, email logs (recipient, subject and rendered body of each
  sent document email), exchange-rate history, and encrypted third-party credentials.
- **Location**: the `db-data` and `app-data` volumes of the deployment. No analytics or telemetry. Next.js and
  Prisma telemetry are disabled in the image.
- **Retention**: business records stay until a user deletes them. Deleting a company removes its data. Expired
  sessions, portal sessions and reset tokens are removed by the scheduler. Email viewer links expire after the
  configured number of days (default 7). Backups follow your own retention policy.
- Operators are responsible for the lawful processing of the personal data in their deployment, including
  answering data-subject requests. Exports and deletion use the application screens or the REST API.
