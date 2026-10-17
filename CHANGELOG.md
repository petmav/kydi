# Changelog

All notable changes to Kydi are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/)
and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-10-17

Production hardening for a Zenith Hosting catalogue listing.

### Security

- Production refuses to start when `SESSION_SECRET` or the new `APP_ENCRYPTION_KEY` is missing, shorter than 32
  characters or a known development/example/preview value; a weak `CRON_SECRET` is refused too.
- Stored mail and exchange-rate credentials are encrypted with `APP_ENCRYPTION_KEY` (AES-256-GCM, HKDF key).
  Values written by 0.1.0 (key derived from `SESSION_SECRET`) are re-encrypted automatically at boot, so rotating
  `SESSION_SECRET` no longer breaks stored credentials. `KYDI_LEGACY_SESSION_SECRET` helps when the session secret
  was rotated before upgrading.
- Install wizard: only `ZENITH_OWNER_EMAIL` (via `KYDI_OWNER_EMAIL`) may create the first administrator; without an
  owner email, production requires a one-time install token printed to the log at boot. Concurrent attempts are
  serialised; the wizard is closed once any user exists.
- Demo credentials are shown only when `KYDI_DEMO_SEED=true` and are never pre-filled in production; demo seeding
  is refused in production unless explicitly enabled.
- Browser security headers on every response: nonce-based Content-Security-Policy, `X-Frame-Options`/
  `frame-ancestors` (same-origin only for PDF previews), `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy` and HSTS behind https. Cookies get `Secure` behind https.
- Authentication: password policy (10+ characters, common passwords refused), explicit Argon2id parameters,
  per-IP and per-account throttling for staff, API and portal sign-in, equal timing for unknown accounts, atomic
  single-use reset tokens (other tokens, sessions and API tokens revoked on reset), session rotation on sign-in
  and password change, `POST /api/v1/auth/logout` revokes the bearer token, credential hashes omitted from every
  query by default.
- Cookie-authenticated REST API writes require a same-origin request (CSRF protection).
- SSRF protection for tenant-supplied SMTP hosts and exchange-rate URLs: resolved addresses are checked at
  connect time (loopback, private, link-local, CGNAT, unique-local, NAT64, Compose service names), redirects are
  not followed; company configurations cannot use the local sendmail binary.
- Uploads: content (magic-byte) validation for logos and receipts, SVG logos no longer accepted, safe
  `Content-Disposition`, office documents always downloaded.
- Cron endpoint compares secret digests in constant time.
- Logs redact configured secrets, bearer and API tokens, database passwords and credential fields; production
  logs withhold email bodies when SMTP is not configured.

### Added

- `GET /api/health` (unauthenticated, minimal) used by the container health check.
- Optional JSON logs (`KYDI_LOG_FORMAT=json`) and a start-up banner without secrets.
- Scheduler runs under a Postgres advisory lock (safe with several replicas); graceful SIGTERM shutdown closes
  database connections after in-flight requests finish.
- Zenith publish manifest with generated secrets, owner-bound install, private storage, health checks, resource
  limits, numeric users, read-only root filesystems and dropped capabilities; separate preview manifest and
  `npm run zenith:preview` swap script.
- Two-tenant end-to-end isolation suite, install and header tests, browser CSP/accessibility smoke script,
  screenshot script, PRODUCTION.md, PUBLISHING.md, SECURITY.md and THIRD_PARTY_NOTICES.md.

### Changed

- Container: Node.js 24 LTS and PostgreSQL 16.15 pinned by digest; Prisma CLI in its own stage; unused `sharp`
  binaries removed; application files read-only for the runtime user.
- Dependency overrides clear the production `npm audit` findings (postcss via Next.js, deepmerge-ts via Prisma).

## [0.1.0] - 2026-10-17

Initial release: customers, items, estimates, invoices, credit notes, recurring invoices, payments, expenses,
purchasing, reports, PDF generation, email delivery, customer portal, REST API, administration and the Zenith
preview manifest.
