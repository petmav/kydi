# Kydi

Kydi is a self-hosted, open-source invoicing application for freelancers and small businesses. It covers the
full billing loop — customers, items, estimates, invoices, credit notes, recurring invoices, payments, expenses and
reports — with PDF generation, email delivery, a customer portal and a REST API. It is packaged for one-command
previews on [Zenith Hosting](https://zenith.hosting).

## Features

- **Workspaces:** install wizard (first administrator + company), multiple companies per user with a company
  switcher, owner powers, role presets (owner / manager / read-only), custom roles with ability dependencies,
  members with email invitations or direct creation, ownership transfer screen (Settings > Transfer ownership).
  Invitees see pending invitations as a banner with Accept / Decline; a user without any company gets a
  "No company" screen listing invitations and a "Create a company" action.
- **Auth:** Argon2id password hashes, database-backed signed httpOnly session cookies, login throttling, password
  reset by email. Server actions use Next.js origin checks; every action and route is company-scoped and
  ability-checked on the server.
- **Settings:** company profile and logo, preferences (currency lock once data exists, time zone, date/number
  formats, fiscal year), number-format builder with live preview, address formats, email templates with
  placeholders, notifications, tax types (percentage/fixed, compound, sales/purchase), payment modes, units,
  expense categories, custom fields (10 types, validation rules, printed on PDFs), reusable notes, API tokens.
- **Customers:** filtered/sorted/paginated list with bulk delete, portal access, billing/shipping addresses,
  balance and available credit, activity and outstanding statements (HTML + PDF), apply-credit screen. The
  customer screen is a split view (searchable list sorted by name or balance on the left) with a per-customer
  cash-flow chart and period picker.
- **Items** with units and default taxes; snapshots on documents.
- **Invoices and estimates:** shared document editor (per-item or document taxes and discounts, tax-inclusive
  prices, compound taxes, multi-currency with exchange rates, notes, template picker, custom fields, item custom
  fields entered per line) with server-authoritative totals; a "Make recurring" switch on new invoices turns the
  form into a recurring invoice; optional invoice time of day (Preferences > Invoice use time); status machines (draft → sent → viewed → completed; unpaid / partially paid /
  paid / overdue), mark as sent, clone, convert estimate ↔ invoice, accept/reject, partial credit notes.
- **PDF:** three invoice and three estimate layouts plus a payment receipt, rendered with `@react-pdf/renderer`
  (no headless browser). Item custom fields with "Show on document" print as extra line columns. Permanent public PDF links and expiring emailed viewer links that mark documents viewed.
- **Email:** send dialog with preview, placeholders, optional PDF attachment, email log per document.
  Per-company mail drivers (Settings > Mail configuration, owner only): SMTP, Mailgun, Amazon SES (SigV4
  signed API call), Postmark, Sendmail/Mail, with a "Send test mail" dialog. Resolution order: company
  configuration when switched on, then the platform configuration (Administration > Mail), then the `SMTP_*`
  environment variables, then stdout. Passwords, API keys and tokens are encrypted with AES-256-GCM (key derived
  from `SESSION_SECRET`), are never sent to the browser, and blank secret inputs keep the stored value. Company
  SMTP hosts must be public host names.
- **Exchange rates:** providers per company (Settings > Exchange rate provider): Currency Converter (free,
  prepaid, premium or dedicated URL), CurrencyFreaks, Currencylayer, Open Exchange Rates. Each lists the
  currencies it serves (one active provider per currency), keys are encrypted and never shown again, an active
  provider cannot be deleted, and "Check rate" fetches a live quote. Document and payment forms suggest the rate
  from the provider (5 s timeout, 10 min cache), then the last rate used, then manual entry. Dedicated URLs must
  be public http(s) hosts.
- **Payments:** allocations across invoices with row locking, unapplied customer credit, receipts.
- **Expenses:** categories, purchase-tax breakdown, receipt upload stored on the volume-backed `/data/uploads`.
- **Recurring invoices:** cron-expression schedules (presets or custom) in the company time zone, previews,
  count/date limits, pause/resume, auto-send, creator notifications, idempotent run log.
- **Background jobs:** recurring generation and overdue/estimate-expiry sweeps run on boot, every minute in
  process, and on demand via `GET|POST /api/cron/recurring` with `Authorization: Bearer $CRON_SECRET`.
- **Dashboard:** receivables split (overdue / due soon / later), counters, cash-flow chart, recent lists.
- **Reports:** sales by customer, sales by item, expenses, profit & loss (cash basis), tax summary — HTML preview
  and PDF export.
- **Profile photos:** JPG/PNG/GIF/WebP up to 2 MB (signature-checked), stored under `/data/uploads/avatars`
  and served by the authenticated route `/api/files/avatar/{userId}` (self, company co-members, administrator).
- **Administration** (`/admin`, platform administrator only, reachable without a company): overview counters and
  version, companies (edit name/address, change owner, delete), users (create/edit with platform role and a role
  per company, delete), role presets (edit or add presets; saving syncs the role into every company), an empty
  modules registry, and a system page describing fixed behaviour (PDF engine, storage, backups, currencies).
- **Customer portal** at `/portal/<company-slug>`: separate login and sessions, invoices, estimates (accept or
  reject), payments, profile.
- **REST API** under `/api/v1` (see below).
- Out of scope for v1 and shown as labelled pages: purchasing (suppliers, bills), module marketplace, backups,
  file disks, self-updater.

## Known gaps

Not built yet (planned, in this order):

- Mail drivers are not exercised against live provider accounts in the test suite (request signing and form
  validation are unit-tested). Changing `SESSION_SECRET` makes stored mail and rate-provider secrets unreadable;
  re-enter them afterwards.
- Rich-text toolbar for notes and email templates (HTML is typed into a plain text area) and an allow-list HTML
  sanitiser (the current one strips scripts, event handlers and `javascript:` links only).
- Administration: impersonation ("log in as"), backups, remote file disks, currency editing and PDF page setup
  are not implemented (optional per the spec). Profile photos are shown as a square crop but not re-encoded.
- Unicode PDF font: PDFs use the built-in Helvetica, so text outside Latin-1 does not render.
- Purchasing module (suppliers, bills, supplier payments, credits, refunds, recurring costs, purchases report).
- End-to-end smoke test suite.

## Tech stack

Next.js 15 (App Router, React Server Components, Server Actions) · TypeScript (strict) · Tailwind CSS v4 ·
Prisma 6 + PostgreSQL 16 · zod · date-fns · @react-pdf/renderer · nodemailer · vitest.

## Local development

Requirements: Node.js 20.10+, Docker.

```bash
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL 16 on localhost:5432
cp .env.example .env                             # local settings (read by Prisma CLI and Next.js)
npm i
npx prisma migrate dev
npm run db:seed                                  # optional demo data
npm run dev                                      # http://localhost:3000
```

Without seeding, open http://localhost:3000 and the install wizard creates the first administrator and company.

> Local settings live in `.env`. `.env.local` is reserved for preview-safe secrets because `zenith up` uploads it
> to the preview session; a localhost `DATABASE_URL` there would override the preview database.

Scripts: `npm run build`, `npm run lint`, `npm test` (domain tests incl. the spec's worked examples),
`npm run db:seed`, `npm run db:reset`.

## Zenith preview

```bash
zenith auth login
NO_COLOR=1 zenith check --upload-size
zenith up
```

`zenith-compose.yml` runs two services: `app` (built from the root `Dockerfile`) and `db` (`postgres:16-alpine`
with a health check and a named volume). The container runs `prisma migrate deploy`, then the Next.js standalone
server on `0.0.0.0:3000` as a non-root user. Uploads live on the `app-data` volume at `/data/uploads`. With
`KYDI_DEMO_SEED=true` (the preview default) demo data is created on first boot.
`zenith-compose.publish.example.yml` shows the publish-time `x-zenith.env` block.

## Demo credentials

| Area | URL | Email | Password |
| --- | --- | --- | --- |
| Admin app | `/login` | `admin@kydi.test` | `password123` |
| Customer portal | `/portal/northwind-studio/login` | `billing@acme.test` | `password123` |

## REST API

Create a personal token under **Settings → API tokens** (or `POST /api/v1/auth/login` with
`{ "email", "password", "device_name" }`), then send `Authorization: Bearer <token>` and a `company: <id>` header.

- Lists accept `page`, `limit` (10 default, `all` for everything), `orderByField`, `orderBy`, `search` and
  resource filters; responses are `{ data, meta: { current_page, last_page, per_page, total, <resource>_total_count } }`.
- Resources: `customers`, `items`, `invoices`, `estimates`, `payments`, `expenses`, `recurring-invoices` (CRUD +
  `POST /<resource>/delete` with `{ "ids": [] }`), `invoices/{id}/send|send/preview|status|clone|convert-to-estimate|credit-note`,
  `estimates/{id}/send|send/preview|status|clone|convert-to-invoice`, `payments/{id}/send|send/preview`,
  `PUT payments/{id}/allocations` (replace the allocation set), `recurring-invoices/{id}/actions` (pause / resume),
  `recurring-invoice-frequency` (next five runs), `customers/{id}/stats|statement|statement/send|credit-allocations`,
  `dashboard`, `next-number?key=invoice&customer_id=`, `bootstrap`.
- Team and company (owner only unless noted): `members` (CRUD, `POST members/delete` with `{ "users": [] }`), `roles`
  (CRUD), `abilities`, `company` (PUT profile, `POST company/logo` with a base64 data URL, `GET|POST company/settings`,
  `GET company/has-transactions`, `POST company/transfer-ownership/{userId}`), `companies` (list, create, delete),
  `company-invitations` (list, create, delete; `GET pending`, `POST {token}/accept|decline` for the invitee), `me`
  (profile and user settings).
- Read-only lists: `tax-types`, `payment-methods`, `units`, `categories`, `custom-fields`, `notes`.
- Money is integer minor units; dates are `YYYY-MM-DD`. Errors: 401, 403, 404, 422 `{ message, errors }`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SESSION_SECRET` | yes (prod) | 16+ random characters used to sign session cookies |
| `APP_URL` | no | Public base URL for links in emails; derived from request headers when unset |
| `UPLOAD_DIR` | no | Directory for receipts/logos (default `./uploads`, `/data/uploads` in the container) |
| `CRON_SECRET` | no | Bearer secret for `/api/cron/recurring` (route disabled when unset) |
| `KYDI_DEMO_SEED` | no | `true` seeds demo data on boot when the database is empty |
| `KYDI_DISABLE_SCHEDULER` | no | `true` disables the in-process minute timer (boot catch-up still runs) |
| `SMTP_HOST` | no | SMTP server; when empty, emails are printed to stdout |
| `SMTP_PORT` | no | SMTP port (default 587; 465 uses implicit TLS) |
| `SMTP_USER` / `SMTP_PASS` | no | SMTP credentials |
| `SMTP_FROM` | no | Sender address, e.g. `Kydi <billing@example.com>` |

## Cleanroom statement

Kydi was reimplemented from a written behavioural specification only. No source code, assets or documentation
from any existing invoicing product were viewed or reused. Kydi is released under the [MIT License](LICENSE).
