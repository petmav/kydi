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
- **Auth:** Argon2id password hashes, password policy, database-backed signed httpOnly session cookies (rotated at
  sign-in and on password change), per-IP and per-account throttling, single-use password reset by email, and an
  install wizard bound to the owner's email or a one-time token. Server actions use Next.js origin checks, and
  cookie-authenticated API writes must be same-origin. Every action and route is company-scoped and
  ability-checked on the server (covered by a two-tenant e2e test). `src/middleware.ts` sets the browser security
  headers (nonce-based CSP, frame and content-type protection, HSTS behind https). See PRODUCTION.md, "Security
  posture".
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
- **Rich text:** notes (documents, payments, note templates), email bodies and address formats use a small
  built-in editor (bold, italic, underline, lists, links, clear formatting, HTML source view, placeholder
  buttons; no editor dependency). An allow-list sanitiser (`src/lib/sanitize-html.ts`) keeps only basic
  formatting tags, drops script-capable elements with their content, strips all event handlers and styles, and
  allows only http(s), mailto, tel, relative and `{PLACEHOLDER}` links. It runs in the editor, on save (UI and
  API) and again when emails and PDFs are rendered.
- **PDF:** three invoice and three estimate layouts plus a payment receipt, rendered with `@react-pdf/renderer`
  (no headless browser), using the bundled DejaVu Sans font (`assets/fonts`, Bitstream Vera licence in
  `assets/fonts/DejaVu-LICENSE.txt`) so Latin Extended, Greek and Cyrillic text renders. Item custom fields with "Show on document" print as extra line columns. Permanent public PDF links and expiring emailed viewer links that mark documents viewed.
- **Email:** send dialog with preview, placeholders, optional PDF attachment, email log per document.
  Per-company mail drivers (Settings > Mail configuration, owner only): SMTP, Mailgun, Amazon SES (SigV4
  signed API call), Postmark, Sendmail/Mail, with a "Send test mail" dialog. Resolution order: company
  configuration when switched on, then the platform configuration (Administration > Mail), then the `SMTP_*`
  environment variables, then stdout. Passwords, API keys and tokens are encrypted with AES-256-GCM (key derived
  from `APP_ENCRYPTION_KEY`), are never sent to the browser, and blank secret inputs keep the stored value. Company
  SMTP hosts must be public host names.
- **Exchange rates:** providers per company (Settings > Exchange rate provider): Currency Converter (free,
  prepaid, premium or dedicated URL), CurrencyFreaks, Currencylayer, Open Exchange Rates. Each lists the
  currencies it serves (one active provider per currency), keys are encrypted and never shown again, an active
  provider cannot be deleted, and "Check rate" fetches a live quote. Document and payment forms suggest the rate
  from the provider (5 s timeout, 10 min cache), then the last rate used, then manual entry. Dedicated URLs must
  be public http(s) hosts.
- **Payments:** allocations across invoices with row locking, unapplied customer credit, receipts.
- **Expenses:** categories, purchase-tax breakdown, receipt upload stored on the volume-backed `/data/uploads`.
- **Purchasing:** suppliers (currency, default category, payment terms, address, enable/disable; currency locked
  once documents exist) with a detail screen showing the payables split, bills, credits and payments. Bills with a
  lines editor (category, description, quantity, price, per-line discount and purchase taxes, prices including
  tax), draft / open / void lifecycle (void needs a reason and is refused while payments or credits apply), and
  a financial lock once anything is applied (then only reference, due date and notes change). Supplier payments
  allocated to open bills of the same supplier and currency (oldest-first helper, row locking, void removes the
  allocations). Supplier credits (standalone or raised against a bill, applied to that bill automatically,
  re-allocatable to other bills), supplier refunds against a payment or credit up to its unused balance, and
  recurring costs that generate a bill (optionally draft) or an expense on a daily-or-slower schedule from the
  in-process scheduler. Own number formats (Settings > Customization > Purchases), purchasing abilities in the
  role editor (manager and read-only presets updated by migration), a payables card on the dashboard, supplier
  payments and refunds in cash flow and profit & loss, bill taxes in the tax summary, a Purchases report tab
  (by supplier and status plus payables, HTML and PDF), an optional supplier on expenses, and a `/purchases`
  overview page.
- **Recurring invoices:** cron-expression schedules (presets or custom) in the company time zone, previews,
  count/date limits, pause/resume, auto-send, creator notifications, idempotent run log.
- **Background jobs:** recurring generation and overdue/estimate-expiry sweeps run on boot, every minute in
  process, and on demand via `GET|POST /api/cron/recurring` with `Authorization: Bearer $CRON_SECRET`.
- **Dashboard:** receivables split (overdue / due soon / later), counters, cash-flow chart, recent lists.
- **Reports:** sales by customer, sales by item, expenses, profit & loss (cash basis), tax summary, purchases —
  HTML preview and PDF export.
- **Profile photos:** JPG/PNG/GIF/WebP up to 2 MB (signature-checked), stored under `/data/uploads/avatars`
  and served by the authenticated route `/api/files/avatar/{userId}` (self, company co-members, administrator).
- **Administration** (`/admin`, platform administrator only, reachable without a company): overview counters and
  version, companies (edit name/address, change owner, delete), users (create/edit with platform role and a role
  per company, delete), role presets (edit or add presets; saving syncs the role into every company), an empty
  modules registry, and a system page describing fixed behaviour (PDF engine, storage, backups, currencies).
- **Customer portal** at `/portal/<company-slug>`: separate login and sessions, invoices, estimates (accept or
  reject), payments, profile.
- **REST API** under `/api/v1` (see below).
- Out of scope for v1 and shown as labelled pages: module marketplace, backups, file disks, self-updater.

## Known gaps

Not built yet (planned, in this order):

- Mail drivers are not exercised against live provider accounts in the test suite (request signing and form
  validation are unit-tested). Changing `APP_ENCRYPTION_KEY` makes stored mail and rate-provider secrets
  unreadable; re-enter them afterwards. Changing `SESSION_SECRET` only signs everybody out.
- The editor uses the browser's `execCommand`, which is deprecated but still supported by current browsers.
- Administration: impersonation ("log in as"), backups, remote file disks, currency editing and PDF page setup
  are not implemented (optional per the spec). Profile photos are shown as a square crop but not re-encoded.
- PDFs embed DejaVu Sans, which has no CJK glyphs, and right-to-left scripts (Arabic, Hebrew) are not shaped.
- Purchasing: no bill attachments, no bill PDF, no supplier credits raised against expenses, no line-quantity
  tracking for partial credits (the credit total is capped instead), recurring costs do not email the creator,
  and purchasing has no REST API endpoints or custom fields yet.
- The end-to-end suites drive the HTTP API, render pages with a session cookie and call server functions
  directly; browser coverage is a Playwright smoke script (`npm run test:browser`: sign-in, page loads, CSP
  violations, console errors, unlabeled inputs), not a full click-through UI suite.

## Tech stack

Next.js 15 (App Router, React Server Components, Server Actions) · TypeScript (strict) · Tailwind CSS v4 ·
Prisma 6 + PostgreSQL 16 · zod · date-fns · @react-pdf/renderer · nodemailer · vitest.

## Local development

Requirements: Node.js 22+ (the container uses Node.js 24 LTS), Docker.

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

Scripts: `npm run build`, `npm run lint`, `npm test` (domain tests incl. the spec's worked examples, sanitiser,
mail signing, exchange rates, purchasing maths, a Unicode PDF render and the production-hardening checks),
`npm run test:e2e` and `npm run test:browser` (see below), `npm run db:seed` (refused with `NODE_ENV=production`
unless `KYDI_DEMO_SEED=true`), `npm run db:reset`, `npm run zenith:preview` (see "Zenith").

### End-to-end smoke tests

`npm run test:e2e` runs the suites in `e2e/` against a running server and the same database. It reads
`DATABASE_URL`, `SESSION_SECRET` and `CRON_SECRET` from the environment or `.env`. `next start` runs in production
mode, so it needs production-grade secrets. Use a disposable database:

```bash
export DATABASE_URL=postgresql://...disposable...  SESSION_SECRET=$(openssl rand -hex 32)
export APP_ENCRYPTION_KEY=$(openssl rand -hex 32) CRON_SECRET=$(openssl rand -hex 32)
npx prisma migrate deploy && npm run build
npx next start -p 3100 &          # or set E2E_BASE_URL to another server
npm run test:e2e
KYDI_EMAIL=... KYDI_PASSWORD=... npm run test:browser   # Playwright: CSP violations, console errors, unlabeled inputs
```

`e2e/tenancy.test.ts` provisions two tenants and proves that neither can read or change the other's records. It
covers the REST API (also with a spoofed `company` header), pages (also with a spoofed company cookie), PDFs,
receipts, avatars, statements, reports and the customer portal. It also checks the CSRF guard and the security
headers. `e2e/install.test.ts` checks that the install wizard stays closed, that the cron secret is enforced and
that the retention sweep runs.

It creates a throw-away administrator and company, then covers: login page and API login, create customer,
create invoice (server totals), mark sent and record a payment that settles it, invoice PDF download, saving an
invoice with "Make recurring" switched on (it must create a recurring invoice and no invoice), the purchasing
rules (bill totals, payment allocation, void, credit against a bill, refund limits) and 32 screens rendered with a
session cookie. Everything it created is deleted at the end.

## Zenith

The repository has two manifests, because the preview policy (`zenith check` / `zenith up`) is stricter than the
publish policy:

- `zenith-compose.yml` (repository root) is the **publish manifest**. `zenith publish` reads it from the pinned
  commit.
  - Zenith generates `POSTGRES_PASSWORD`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY` and `CRON_SECRET` for each
    deployment (`x-zenith.env`) and derives `DATABASE_URL`.
  - It maps `ZENITH_PUBLIC_URL`, `ZENITH_OWNER_EMAIL` and `ZENITH_SMTP_*` to Kydi's variables.
  - Uploads are kept in private storage.
  - Both services run with health checks, resource limits, numeric users, read-only root filesystems and no
    capabilities.
  - Demo data is off.
- `zenith-compose.preview.yml` is the **preview manifest**: literal values only, demo data on.
  - `npm run zenith:preview` copies it over `zenith-compose.yml`, runs `zenith check --upload-size`, then restores
    the publish manifest byte for byte, also on Ctrl+C.
  - `npm run zenith:preview -- --up` also runs `zenith up`. First, it adds random `SESSION_SECRET` and
    `APP_ENCRYPTION_KEY` values to the gitignored `.env.local`.

```bash
zenith auth login
npm run zenith:preview            # check only
npm run zenith:preview -- --up    # 20-minute preview with demo data
```

The container runs `prisma migrate deploy` (protected by an advisory lock), then starts the Next.js standalone
server on `0.0.0.0:3000` as uid 1001. `GET /api/health` backs the health check. For the publishing steps, see
PUBLISHING.md. For operating a deployment (variables, backups, upgrades, monitoring, troubleshooting), see
PRODUCTION.md.

## Demo credentials

These accounts exist only when demo data is enabled (`KYDI_DEMO_SEED=true`), which is meant for local development
and previews, never for a real instance. The login page shows the credentials only in that case and never
pre-fills them in production.

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
| `SESSION_SECRET` | yes (prod) | 32+ random characters used to sign session cookies; production refuses known example values |
| `APP_ENCRYPTION_KEY` | yes (prod) | 32+ random characters, different from `SESSION_SECRET`, that encrypt stored credentials; never change it |
| `APP_URL` | no | Public base URL for links in emails; derived from request headers when unset |
| `KYDI_OWNER_EMAIL` | no | Only this email may create the first administrator (Zenith: alias of `ZENITH_OWNER_EMAIL`) |
| `KYDI_INSTALL_REQUIRE_TOKEN` | no | `true` also requires the boot-time install token when an owner email is set |
| `UPLOAD_DIR` | no | Directory for receipts and logos (default `./uploads`, `/data/uploads` in the container) |
| `CRON_SECRET` | no | Bearer secret for `/api/cron/recurring` (route disabled when unset; 24+ characters) |
| `KYDI_DEMO_SEED` | no | `true` seeds demo data on boot when the database is empty |
| `KYDI_DISABLE_SCHEDULER` | no | `true` disables the in-process minute timer (boot catch-up still runs) |
| `KYDI_TRUST_PROXY_HOPS` | no | Reverse proxies appending to `X-Forwarded-For` (default 1) |
| `KYDI_LOG_FORMAT` | no | `json` for one JSON object per log line |
| `SMTP_HOST` | no | SMTP server; when empty, emails are logged (production logs withhold bodies) |
| `SMTP_PORT` | no | SMTP port (default 587; 465 uses implicit TLS) |
| `SMTP_USER` / `SMTP_PASS` | no | SMTP credentials |
| `SMTP_FROM` / `SMTP_FROM_NAME` | no | Sender address, e.g. `Kydi <billing@example.com>`, and optional display name |

For the full reference, including `KYDI_LEGACY_SESSION_SECRET`, `KYDI_LOG_MAIL_BODIES` and `KYDI_SKIP_MIGRATIONS`,
see PRODUCTION.md.

## Privacy and data

Kydi stores what you enter:

- user accounts: name, email, Argon2id password hash and an optional profile photo
- company settings
- customers and suppliers: contact details and an optional portal password hash
- documents, payments, and expenses with receipt files
- email logs of sent documents
- encrypted third-party credentials

Everything stays in your own database and upload volume. Kydi sends no analytics or telemetry; Next.js and Prisma
telemetry are disabled in the image. Emails go only to the addresses you choose, through the mail configuration
you set. Expired sessions and reset tokens are removed automatically. Business records stay until you delete
them. For details, see PRODUCTION.md, "Data stored and retention".

## Security

To report a vulnerability, follow SECURITY.md (private reporting only). Third-party licences are listed in
THIRD_PARTY_NOTICES.md.

## Cleanroom statement

Kydi was reimplemented from a written behavioural specification only. No source code, assets or documentation
from any existing invoicing product were viewed or reused. Kydi is released under the [MIT License](LICENSE).
