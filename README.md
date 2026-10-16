# Halyard

Halyard is a self-hosted, open-source invoicing application for freelancers and small businesses. It covers the
full billing loop — customers, items, estimates, invoices, recurring invoices, payments, expenses and reports — with
PDF generation, email delivery and a customer portal. It is packaged for one-command previews on
[Zenith Hosting](https://zenith.hosting).

## Features

- Multi-company workspaces with a company switcher, roles and fine-grained abilities
- Install wizard (first administrator + first company)
- Email/password auth with Argon2id hashes, signed httpOnly session cookies, password reset by email
- Customers, items and units, estimates, invoices, recurring invoices, payments and expenses
- PDF generation (`@react-pdf/renderer`, no headless browser) and SMTP email (logs to stdout when SMTP is unset)
- Customer portal with its own login
- REST API under `/api/v1` with bearer tokens
- Reports (sales, expenses, profit & loss, taxes) with PDF export

## Tech stack

Next.js 15 (App Router, React Server Components, Server Actions) · TypeScript (strict) · Tailwind CSS v4 ·
Prisma 6 + PostgreSQL 16 · zod · date-fns · vitest.

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

Without seeding, open http://localhost:3000 and the install wizard will guide you through creating the first
administrator and company.

> Local settings live in `.env`. `.env.local` is reserved for preview-safe secrets because `zenith up` uploads it
> to the preview session; a localhost `DATABASE_URL` there would override the preview database.

Useful scripts: `npm run build`, `npm run lint`, `npm test`, `npm run db:reset`.

## Zenith preview

```bash
zenith auth login
NO_COLOR=1 zenith check --upload-size
zenith up
```

The preview (`zenith-compose.yml`) runs two services: `app` (built from the root `Dockerfile`) and `db`
(`postgres:16-alpine`). The container applies `prisma migrate deploy` on start, then launches the Next.js
standalone server on `0.0.0.0:3000`. With `HALYARD_DEMO_SEED=true` (the preview default) demo data is created on
first boot. `zenith-compose.publish.example.yml` shows the publish-time `x-zenith.env` block.

## Demo credentials

| Area | Email | Password |
| --- | --- | --- |
| Admin app | `admin@halyard.test` | `password123` |

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SESSION_SECRET` | yes (prod) | 16+ random characters used to sign session cookies |
| `APP_URL` | no | Public base URL for links in emails; derived from request headers when unset |
| `UPLOAD_DIR` | no | Directory for receipts/logos (default `./uploads`, `/data/uploads` in the container) |
| `CRON_SECRET` | no | Bearer secret for `/api/cron/recurring` |
| `HALYARD_DEMO_SEED` | no | `true` seeds demo data on boot when the database is empty |
| `SMTP_HOST` | no | SMTP server; when empty, emails are printed to stdout |
| `SMTP_PORT` | no | SMTP port (default 587; 465 uses implicit TLS) |
| `SMTP_USER` / `SMTP_PASS` | no | SMTP credentials |
| `SMTP_FROM` | no | Sender address, e.g. `Halyard <billing@example.com>` |

## Cleanroom statement

Halyard was reimplemented from a written behavioural specification only. No source code, assets or documentation
from any existing invoicing product were viewed or reused. Halyard is released under the [MIT License](LICENSE).
