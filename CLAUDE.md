# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Kydi: a self-hosted, multi-tenant invoicing app (Next.js 15 App Router + Server Actions, TypeScript strict, Tailwind v4, Prisma 6 + PostgreSQL 16, zod, `@react-pdf/renderer`, nodemailer, vitest). `README.md` lists the implemented features and known gaps. `SPEC.md` is the behavioural spec the app was built from; it calls the product "Halyard" (working name). Code comments cite it as `spec §4.5` and so on. When behaviour is in question, the spec is the source of truth. Kydi is a cleanroom reimplementation, so don't pull in code or assets from existing invoicing products.

## Commands

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres 16 on localhost:5432
cp .env.example .env                             # local settings; NOT .env.local (see below)
npm i                                            # postinstall runs prisma generate
npx prisma migrate dev                           # also: npm run db:migrate
npm run db:seed                                  # demo data: admin@kydi.test / password123
npm run dev                                      # http://localhost:3000 (turbopack)

npm test                                         # vitest run (src/**/*.test.ts only)
npx vitest run src/domain/totals.test.ts         # single file
npx vitest run -t "compound"                     # by test name
npm run test:e2e                                 # e2e/ against a running server (E2E_BASE_URL, default :3100) and its DATABASE_URL
npm run test:browser                             # Playwright smoke script
npm run lint
npm run build                                    # standalone output
npm run db:reset                                 # drop + re-migrate (destructive)
```

The tests are pure unit tests over `src/domain` and `src/lib` (plus PDF font and API-helper tests). They don't need a database. `src/domain/appendix-a.test.ts` encodes the spec's Appendix A worked examples verbatim, so a change to arithmetic must keep it green.

`.env.local` is reserved for preview secrets: `npm run zenith:preview -- --up` generates them there and `zenith up` uploads it. A localhost `DATABASE_URL` in it would override the preview database. A production build refuses to start with development or example values for `SESSION_SECRET`, `APP_ENCRYPTION_KEY` or `CRON_SECRET` (see PRODUCTION.md).

## Architecture

Layering, from the outside in:

- **`src/app/**`**: routes. Each feature folder has an `actions.ts` (`"use server"`) whose actions are thin. They call `requireAbility(...)` or `requireOwner()`, validate with `parseForm(schema, formData)`, call into `src/server/*`, then `revalidatePath` and either `setFlash`+`redirect` or return `success`/`failure`. Every action body is wrapped in `guard()` from `src/lib/action.ts`, which turns `ForbiddenError` and unexpected errors into `ActionState` and lets Next redirect/notFound pass through. Route groups: `(app)` is the staff UI, `(auth)` covers login and reset, `admin` is the platform-admin area, `portal/[slug]` is the customer portal (its own sessions in `lib/auth/portal.ts`), `install` is the first-run wizard, `pdf/[kind]/[hash]` and `customer/[kind]/view/[token]` are public document links, and `api/*` holds the route handlers.
- **`src/server/*`**: business operations shared by Server Actions and the REST API (`saveInvoice`, `savePayment`, `customerBalances`, and so on). They take a `CompanyContext` and must scope every query by `ctx.companyId`. They return `{ ok: true, id } | { ok: false, error, fieldErrors?, status? }` instead of throwing. The zod schemas (`itemSchema`, `documentSchema`, ...) live here too. Invoices, estimates and recurring invoices share one document pipeline, `server/documents.ts`.
- **`src/domain/*`**: pure, DB-free logic: document totals and tax order (`totals.ts`), credit notes, status machines, payment allocation, numbering formats, and cron schedules. Totals are server-authoritative, so the client never sends computed amounts that get trusted.
- **`src/lib/*`**: infrastructure. That covers the `db` Prisma singleton, `env`, `money` (integer minor units, the spec's rounding `R`/`Rh`), `dates` (company time-zone conversions), `settings` (company key/value settings with `SETTING_DEFAULTS`), `abilities`/`role-presets`, `secrets` (AES-256-GCM `v2:` values keyed from `APP_ENCRYPTION_KEY`; legacy `v1:` values from `SESSION_SECRET` are re-encrypted at boot by `server/secret-migration.ts`, so a new encrypted column must be added there), `storage` (uploads under `UPLOAD_DIR`), `sanitize-html` (the allow-list HTML sanitiser), `net` (public-host checks for user-supplied SMTP and rate URLs), and `rate-limit`.

Auth and tenancy (`src/lib/auth/context.ts`): `getCompanyContext()` is cached per request. It resolves the session user, their memberships, and the active company (the `kydi_company` cookie, falling back to the first membership), plus abilities and settings. Owners implicitly hold every ability, and `ctx.can(ability)` checks the role's abilities. Users without a company are redirected to `/no-company`. Platform admins have `user.role === "SUPER_ADMIN"`.

REST API: `src/app/api/v1/[...path]/route.ts` is a single catch-all router. The core CRUD resources sit in a `crud` table in that file. Everything else is delegated to the sub-routers `server/v1/sales.ts` and `server/v1/team.ts`, each typed `V1Router`. Helpers are in `server/api.ts`: `apiContext` (Bearer token + `company` header), `need(ctx, ability)`, `listParams`, the `envelope` pagination shape, and `ApiError`. The API speaks snake_case and minor units, and `server/v1/doc-input.ts` maps its bodies onto the shared document input.

Background jobs: `src/instrumentation.ts` calls `server/boot.ts` once per Node process. That step seeds demo data when `KYDI_DEMO_SEED=true`, runs a scheduler catch-up, then ticks `runScheduler()` (from `server/recurring.ts`: recurring invoices plus overdue and estimate-expiry sweeps) every minute unless `KYDI_DISABLE_SCHEDULER=true`. You can also trigger it through `/api/cron/recurring` with `Bearer $CRON_SECRET`. Runs are idempotent through a run log.

PDF: `src/pdf/document-pdf.tsx` and `src/pdf/simple-pdf.tsx` hold the react-pdf templates, and `server/pdf.tsx` renders them. The DejaVu Sans font in `assets/fonts` is read from disk at runtime. That's why `next.config.ts` lists `outputFileTracingIncludes` for the fonts and pdfkit, and why argon2, react-pdf and nodemailer are in `serverExternalPackages`. If you add runtime-read files or native packages, update those lists.

Online payments (`server/online-payments.ts`, `lib/stripe.ts`): the portal "Pay" button creates an `OnlinePayment` row (the idempotency key) and a Stripe Checkout session, or a demo checkout page. `recordOnlinePayment` in `server/payments.ts` turns a confirmed row into a Payment exactly once (row lock), and both the return URL and the webhook `api/payments/stripe/[companyId]` call it. Never mark something paid from the redirect alone; re-read the session from Stripe.

Automatic portal access (`domain/portal-access.ts` rules, `server/portal-access.ts`): every path that makes an invoice sent (`sendDocumentEmail`, `markInvoiceSent`, `saveInvoice` with `send`) calls `ensurePortalAccess`, which enables the customer's portal and emails a setup link (a `PortalResetToken`, 14 days, `?setup=1`) to the customer's own address. Setup links never go into the invoice email itself, because staff can CC others and the email log stores the body. `Customer.portalOptOut` remembers staff switching access off.

Portal sign-in (`server/portal-login.ts`, `lib/auth/login-code.ts`): password and emailed one-time codes (`PortalLoginCode`, keyed HMAC, 10 min, 5 tries) both work for every portal customer. `loginHint(customerId)` is the signed `?u=` parameter that pre-fills the email on `/portal/<slug>/login`; never put the email address itself in a URL.

Email (`server/mailer.ts`, `mail-transport.ts`, `mail-settings.ts`): the driver is picked in this order: company mail config if enabled, then the platform config, then `SMTP_*` env vars, then stdout. Stored secrets are encrypted and never sent to the browser. A blank secret input keeps the stored value.

## Conventions

- Money is always an integer in minor units (×100). Dates are `YYYY-MM-DD` and are interpreted in the company time zone.
- User HTML (notes, email bodies, address formats) is sanitised with `sanitize-html.ts` on save and again when rendered into email or PDF.
- Schema changes need a new Prisma migration (`npx prisma migrate dev --name <name>`). The container runs `prisma migrate deploy` on start (`docker-entrypoint.sh`).

## Deployment (Zenith)

`zenith-compose.yml` is the **publish** manifest: Zenith generates every secret through `x-zenith.env`, and nothing secret is stored in it. Previews use `zenith-compose.preview.yml`, which `npm run zenith:preview` swaps in (`-- --up` to start one), because the preview policy allows literal values only and forbids `x-zenith.env` and `x-zenith.storage`. `ZENITH_NOTES.md` lists the platform constraints, PUBLISHING.md the publishing steps and PRODUCTION.md operations. Never run `zenith publish` or push without explicit user authorization. Run Zenith CLI commands with `NO_COLOR=1`.
