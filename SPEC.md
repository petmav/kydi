# Halyard — Product Specification (Behavioral)

Status legend per section: [DONE] = complete and safe to build from. All sections 1-11 and the appendices are DONE.

Notation: `*` after a field label = required. "Minor units" = integer amount × 100 (see 3.0). Section references like §4.5 point inside this document.

## 1. Product overview [DONE]

**Halyard** (working name) is a self-hosted, web-based invoicing and bookkeeping application for small businesses and freelancers. One installation hosts **many companies (tenants)**; each staff user can belong to several companies and switches between them. Inside a company, a team of members works under **per-company roles with fine-grained abilities** (owner, manager, read-only, custom). Core sales flow: maintain **customers** and a catalogue of **items**, issue **estimates** (quotes) that convert into **invoices**, schedule **recurring invoices**, record **payments** and apply them to invoices, issue **credit notes**, and email every document as a branded **PDF** (three layout templates each) with a tracked public link. Spending side: **expenses** with receipts and categories, plus an optional **purchasing** module (suppliers, bills, supplier payments/credits/refunds, recurring costs). Supporting features: taxes (percentage/fixed, compound, per line or per document, prices inclusive or exclusive of tax), discounts, **multi-currency** with exchange rates, custom fields, note templates, configurable document numbering, dashboard and **financial reports** (sales, expenses, profit & loss, tax summary, customer statements). Customers get a **customer portal** (per-company login) to view/download their invoices, estimates and payment receipts, accept or reject estimates, and maintain their profile. A **platform administrator** manages the installation (companies, users, mail, PDF engine, file storage, backups, currencies, role presets). Everything is exposed through a token-authenticated JSON REST API that the single-page web UI itself uses.

## 2. Auth & onboarding [DONE]

### 2.1 Installation wizard (first run only)

Shown when the installation is not yet complete (global setting `profile_complete` ≠ `COMPLETED`); every other route redirects to it. After completion the wizard is unreachable. Steps (progress indicator across the top, "Save & continue" per step):

| # | Step | Fields / behavior |
|---|---|---|
| 1 | Language | Pick installer/UI language (English required for v1). |
| 2 | System requirements | Shows runtime version and required extensions with pass/fail badges; Continue only when all pass. (A rebuild may show its own checks or skip.) |
| 3 | Permissions | Shows writable-folder checks with pass/fail. (May be skipped by a rebuild.) |
| 4 | Database | Connection type (SQLite, MySQL, MariaDB, PostgreSQL); for server DBs: host, port, database name, username, password; for SQLite: file path. If the target DB already has tables, confirm "overwrite". Runs migrations + seeds (countries, currencies). (A rebuild using a fixed DB may skip.) |
| 5 | Domain | Application domain (used for session cookies/CSRF); must be a bare domain (no scheme, no path). Verify button. |
| 6 | Mail | Platform mail driver configuration (same form as §5.12 mail config). |
| 7 | Account | Name*, Email*, Password* (min 8), Confirm password*, optional profile picture → creates the first user with platform role `super admin` and signs them in. |
| 8 | Company | Company name*, logo (optional), Country*, State, City, Address line 1/2, Zip, Phone, VAT id, Tax id → creates the first company (seeding per 3.1). |
| 9 | Preferences | Currency* (warning: cannot be changed later), Language*, Time zone*, Date format*, Financial year* → saves company settings, marks installation complete, redirects to the dashboard. |

### 2.2 Staff login / logout

- Login screen: Email*, Password*, "Forgot password?" link. Error message is identical for unknown email and wrong password. Throttle: max 10 attempts per minute per client.
- Two mechanisms (both must work): (a) browser **session** login for the web UI (cookie + CSRF); (b) **API token** login: POST credentials + a device name → returns a personal access token (no expiry) used as a Bearer token. Users can list their tokens/devices and revoke any (Account settings › Devices).
- After login: redirect to a validated same-origin `next` path if supplied, else the dashboard of the active company. A user with no companies goes to the "No company" screen (pending invitations / create company). The platform admin with no company goes to the Administration area.
- Logout invalidates the session (and current token when token-based).
- Active company: stored client-side; sent with every API call (see §9). If the requested company is not one of the user's, the server silently uses the user's first company.

### 2.3 Forgot / reset password

- Forgot screen: Email* → always responds success-style; if the account exists, emails a reset link containing a single-use token (valid 60 minutes).
- Reset screen (from link): Email*, Password* (min 8), Confirm* → sets password, then redirect to login with success toast.
- Same flow exists separately for portal customers (§6), scoped to the company.

### 2.4 Invitations & registration

- Owner invites by email (§5.10) → invitee receives an email with the company name, inviter, role, and Accept / Decline links (decline works without login).
- Existing account: after login sees the pending invitation and accepts/declines in-app.
- New person: invitation link opens "Register with invitation": shows company + role, email fixed, Name*, Password*, Confirm* → creates the account (platform role `user`), accepts the invitation, logs in.
- Invitation expires after 7 days; expired/answered links show an error page.

### 2.5 First company & additional companies

- The first company is created by the wizard. Owners can create more companies from the company switcher ("Add company": name*, currency*, address with country*) — seeding per 3.1; the creator becomes owner. Users who own no company cannot create one (unless platform admin via Administration).
- Transfer ownership (Company settings, owner only): choose another member → that member becomes owner (gets owner role); previous owner keeps membership.

### 2.6 User profile (Account settings)

- General: Name*, Email* (unique), Password + Confirm (optional; min 8), UI language (default = company language), profile photo upload (image, cropped square; remove).
- Notifications (owner; company-level): notification email, invoice viewed, estimate viewed toggles (see 3.2).
- Devices / connected apps: list of tokens (name/device, last used, created) with Revoke.
- Default PDF templates (invoice/estimate) are remembered per user when "Mark as default" is ticked in the template picker.

## 3. Data model [DONE]

### 3.0 Conventions (apply to every entity)

| Concept | Rule |
|---|---|
| Money | Every monetary amount is stored as a signed 64-bit **integer of minor units = major amount × 100**, regardless of the currency's display precision. UI shows/accepts major units; API sends/receives minor units unless stated. Max document total 999,999,999,999 minor units. |
| Quantity | Decimal, 2 fractional digits (e.g. 2.50). |
| Percent | Decimal, 2 fractional digits, 0–100 (tax percent field allows up to 999.99 storage, UI limits to 100). |
| Exchange rate | Decimal, 6 fractional digits. Meaning: **1 unit of the document's currency = `exchange_rate` units of the company's base currency**. Rate is exactly 1 when document currency = company currency. |
| Base amounts | Many money fields have a `base_*` twin = the same amount converted to the company currency: `base_x = round(x × exchange_rate)` (nearest integer). Reports and dashboards aggregate `base_*` values. |
| Company scoping | Every business record carries `company_id`. All reads/writes are restricted to the "active company" chosen by the caller (see §9). Records of another company are never visible (404). |
| Creator | Most business records carry `creator_id` (user who created it). Informational only. |
| Timestamps | Every table has `created_at`, `updated_at`. |
| Public token | Invoices, estimates, payments, transactions and email-log rows carry an unguessable random token (`unique_hash` / `token`, ≥ 32 url-safe chars) used in shareable links. Never sequential. |
| Ids | Integer auto-increment primary keys. |
| Deletion | Hard delete unless stated. Deletion guards (refuse when in use) are listed per entity. |

### 3.1 Company

A tenant. A user may belong to several companies; all business data belongs to exactly one company.

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| name | string | yes | — | Unique across the installation. |
| slug | string | no | slug of name | Generated on create. |
| logo | image file | no | null | Stored as a file attachment (see 3.19); exposed as a URL. Upload accepts an image (also base64 data from a cropper). |
| unique_hash | string | auto | — | Short opaque public id generated from the numeric id. |
| owner_id | user ref | yes | creator | The single owner. Ownership can be transferred to another member. |
| vat_id | string | no | null | Printed via `{COMPANY_VAT}`. |
| tax_id | string | no | null | Printed via `{COMPANY_TAX}`. |
| address | one Address (3.5.2) | country required | — | name, street 1, street 2, city, state, country, zip, phone, fax. |
| custom fields | answers | per definitions | — | Custom fields of model type `Company`. |

Relations: members (users, many-to-many), settings (key/value), roles (scoped), all business records.

On create (by the install wizard, by an owner via "new company", or by the platform admin) the system:
1. Creates the company with the creator as owner and member.
2. Copies every role preset into the company (owner role holds all abilities) and assigns the creator the owner role.
3. Seeds payment methods: Cash, Check, Credit Card, Bank Transfer.
4. Seeds units: box, cm, dz, ft, g, in, kg, km, lb, mg, pc.
5. Writes the default settings sheet (3.2) with the chosen currency.

On delete (owner only, must type the exact company name to confirm; mismatch → error `company_name_must_match_with_given_name`): every record of the company (documents, customers, items, payments, expenses, purchases, files, custom fields, notes, settings, roles) is purged; member accounts survive, only their membership is removed. Afterwards the UI switches to the user's next company, or shows the "No company" screen when none is left.

### 3.2 Company settings (key → value, per company)

Values are strings unless noted; booleans use `YES` / `NO`.

| Key | Default | Meaning |
|---|---|---|
| currency | chosen at creation | Base currency id. Cannot be changed once any document/payment exists in the company (UI disables it). |
| time_zone | `Asia/Kolkata` (UI should default to installer's choice) | IANA zone used for "today", schedules, date bounds. |
| language | `en` | Language for PDFs/emails. |
| fiscal_year | `1-12` | Start-end month pair; options `1-12`, `2-1`, `3-2`, `4-3`, `5-4`, `6-5`, `7-6`, `8-7`, `9-8`, `10-9`, `11-10`, `12-11`. Drives dashboard/report "this fiscal year". |
| carbon_date_format | `Y/m/d` | Server date display format (see §10 for the option list). |
| moment_date_format | `YYYY/MM/DD` | Same format expressed for the client. Saved together with the above. |
| carbon_time_format | `H:i` | Server time format. |
| moment_time_format | `HH:mm` | Client time format. |
| invoice_use_time | `NO` | When YES, invoice dates carry a time (`YYYY-MM-DD HH:MM`) and print with time. |
| notification_email | a no-reply address | Where "document viewed" notifications go. |
| notify_invoice_viewed | `NO` | Email notification_email when a customer opens an invoice link. |
| notify_estimate_viewed | `NO` | Same for estimates. |
| tax_per_item | `NO` | YES = taxes chosen per line; NO = taxes chosen for the whole document. |
| discount_per_item | `NO` | YES = discount per line; NO = one document discount. |
| tax_included | `NO` (unset) | Enables "prices include tax" mode toggle on documents. |
| tax_included_by_default | `NO` (unset) | When tax_included is YES, new documents start with prices-include-tax switched on. |
| sales_tax_type / sales_tax_address_type | null | Reserved for a sales-tax module; copied onto documents unchanged. |
| invoice_email_attachment | `NO` | Attach PDF to invoice emails. |
| estimate_email_attachment | `NO` | Attach PDF to estimate emails. |
| payment_email_attachment | `NO` | Attach PDF to payment receipt emails. |
| invoice_mail_body | short HTML greeting telling the customer they received a new invoice from `{COMPANY_NAME}` and to use the button below | Default body of the send-invoice dialog. |
| estimate_mail_body | same idea for estimates | |
| payment_mail_body | thanks-for-payment text pointing to the receipt button | |
| invoice_company_address_format | HTML block: bold company name, street 1, street 2, city + state, country + zip, phone (using `{COMPANY_*}` placeholders) | Printed "From" block on invoices. |
| invoice_billing_address_format | HTML block: billing name heading, street 1, street 2, city + state, country + zip, phone (`{BILLING_*}`) | "Bill to" block. |
| invoice_shipping_address_format | Same with `{SHIPPING_*}` | "Ship to" block. |
| estimate_company_address_format / estimate_billing_address_format / estimate_shipping_address_format | same as invoice ones | |
| payment_company_address_format | same as company one | |
| payment_from_customer_address_format | billing block, but city + state + zip on one line and country on its own line | "Received from" block on receipts. |
| invoice_number_format | `{{SERIES:INV}}{{DELIMITER:-}}{{SEQUENCE:6}}` | Renders e.g. `INV-000001`. See 3.21. |
| credit_note_number_format | `{{SERIES:CN}}{{DELIMITER:-}}{{SEQUENCE:6}}` | |
| estimate_number_format | `{{SERIES:EST}}{{DELIMITER:-}}{{SEQUENCE:6}}` | |
| payment_number_format | `{{SERIES:PAY}}{{DELIMITER:-}}{{SEQUENCE:6}}` | |
| bill_number_format | `{{SERIES:BILL}}{{DELIMITER:-}}{{SEQUENCE:6}}` | Purchasing. |
| supplier_credit_number_format | `{{SERIES:SC}}{{DELIMITER:-}}{{SEQUENCE:6}}` | Purchasing. |
| supplier_payment_number_format | `{{SERIES:SP}}{{DELIMITER:-}}{{SEQUENCE:6}}` | Purchasing. |
| supplier_refund_number_format | `{{SERIES:SR}}{{DELIMITER:-}}{{SEQUENCE:6}}` | Purchasing. |
| invoice_set_due_date_automatically | `YES` | New invoice due date = invoice date + invoice_due_date_days. |
| invoice_due_date_days | `7` | |
| estimate_set_expiry_date_automatically | `YES` | New estimate expiry = estimate date + estimate_expiry_date_days. |
| estimate_expiry_date_days | `7` | |
| estimate_convert_action | `no_action` | After converting an estimate to an invoice: `no_action`, `delete_estimate`, `mark_estimate_as_accepted`. |
| retrospective_edits | `allow` | Invoice edit lock policy: `allow`, `disable_on_invoice_sent`, `disable_on_invoice_partial_paid`, `disable_on_invoice_paid` (§4.6). |
| automatically_expire_public_links | `YES` | Emailed document links expire. |
| link_expiry_days | `7` | Lifetime of emailed links, counted from the email send time. |
| bulk_exchange_rate_configured | `YES` | Internal flag; when NO the UI prompts to back-fill exchange rates after currency changes. |
| default_invoice_template / default_estimate_template | unset | Stored per user, not per company (see 3.3); listed here because the template picker reads it. |
| customer_portal_theme / customer_portal_logo / customer_portal_page_title | unset | Optional portal branding. |
| save_pdf_to_disk / pdf_disk_id | unset | Optional: persist generated PDFs to a file disk. |
| Mail keys (`mail_driver`, `mail_host`, `mail_port`, `mail_username`, `mail_password`, `mail_encryption`, `from_mail`, `from_name`, `mail_mailgun_*`, `mail_ses_*`, …) | unset (falls back to platform mail config) | Per-company outgoing mail config (§5.12). |

Global (installation-wide, not per company) settings: `version`, `profile_complete` (install wizard progress marker; value `COMPLETED` when done), `admin_page_title`, `updater_channel`, `media_disk_id`, `backup_disk_id`, PDF engine settings (driver, paper size, orientation, margins, page numbers, font), platform mail config.

### 3.3 User (staff account)

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| name | string | yes | — | |
| email | email | yes | — | Unique installation-wide. Login identifier. |
| phone | string | no | null | |
| password | hashed | yes on create | — | Min 8 chars; confirm field in UI. |
| role | enum `super admin` / `user` | yes | `user` | `super admin` = platform administrator (first installer account). |
| avatar | image | no | null | Upload via profile photo screen. |
| currency_id | ref | no | null | Legacy, unused. |
| companies | many-to-many | ≥1 | — | Membership. |
| settings | key/value per user | — | — | `language` (UI language, default company language), `default_invoice_template`, `default_estimate_template`, `timezone`, UI preferences. |
| custom fields | answers | — | — | model type `User`. |

Role assignment is per company: a user holds exactly one role in each company they belong to.

**Company invitation** (how members join):

| Field | Type | Notes |
|---|---|---|
| company_id | ref | |
| email | email | Invitee address. |
| user_id | ref, nullable | Filled when an account with that email exists / once accepted. |
| role_id | ref | Role to grant on acceptance. |
| token | string (64 random chars) | Unique. Used in the invitation link. |
| status | enum `pending`, `accepted`, `declined`, `expired` | default `pending`. |
| invited_by | user ref | |
| expires_at | timestamp | created + 7 days. |

Rules: cannot invite an email that already has a pending invitation for this company, or an existing member. Only the addressed user (matching email) can accept/decline. Accepting adds membership + role; declining marks declined. Expired/answered invitations cannot be used. An invitee without an account registers through the invitation link (name + password; email fixed) and is then a member.

Impersonation log (platform admin "log in as user"): admin_id, user_id, ip_address, token_id, stopped_at. Optional feature.

### 3.4 Roles & abilities

Roles are per company. Each role = name + title + set of abilities. Three presets exist installation-wide and are copied into every company:

| Preset | Abilities |
|---|---|
| `owner` (title Owner) | Every ability, plus owner-only powers (below). Assigned to the company owner. Cannot be edited/deleted inside a company. |
| `manager` (Manager) | All view/create/edit/delete/send abilities for customers, items, tax types, estimates, invoices, recurring invoices, payments, expenses, suppliers, bills, supplier payments/credits/refunds, recurring costs; view-custom-field; view-financial-reports; view-exchange-rate-provider; dashboard; view-all-notes; manage-all-notes. (Not: create/edit/delete custom fields or exchange-rate providers.) |
| `read-only` (Read only) | All `view-*` abilities above + view-financial-reports + view-exchange-rate-provider + dashboard + view-all-notes. |

The platform admin can edit preset ability sets (applied to all companies' copies) and add new presets. Company owners can additionally create custom roles (name unique per company) with any ability subset; a custom role in use by a member cannot be deleted.

**Ability catalogue** (ability → implied dependencies; selecting an ability in the role editor auto-selects its dependencies and they cannot be unticked while it is selected):

| Group | Ability | Depends on |
|---|---|---|
| Customer | view-customer | — |
| | create-customer, edit-customer | view-customer, view-custom-field |
| | delete-customer | view-customer |
| Item | view-item | — |
| | create-item | view-item, view-tax-type |
| | edit-item, delete-item | view-item |
| Tax type | view-tax-type | — |
| | create-/edit-/delete-tax-type | view-tax-type |
| Estimate | view-estimate | — |
| | create-estimate, edit-estimate | view-estimate, view-item, view-tax-type, view-customer, view-custom-field, view-all-notes |
| | delete-estimate | view-estimate |
| | send-estimate | — |
| Invoice | view-invoice | — |
| | create-invoice, edit-invoice | view-invoice, view-item, view-tax-type, view-customer, view-custom-field, view-all-notes |
| | delete-invoice | view-invoice |
| | send-invoice | — |
| Recurring invoice | view-recurring-invoice | — |
| | create-/edit-recurring-invoice | view-recurring-invoice, view-item, view-tax-type, view-customer, view-all-notes, send-invoice |
| | delete-recurring-invoice | view-recurring-invoice |
| Payment | view-payment | — |
| | create-payment, edit-payment | view-payment, view-customer, view-invoice, view-custom-field, view-all-notes |
| | delete-payment | view-payment |
| | send-payment | — |
| Expense | view-expense | — |
| | create-expense, edit-expense | view-expense, view-customer, view-custom-field |
| | delete-expense | view-expense |
| Custom field | view-custom-field | — |
| | create-/edit-/delete-custom-field | view-custom-field |
| Reports | view-financial-reports | — |
| Exchange-rate provider | view-exchange-rate-provider | — |
| | create-/edit-/delete-exchange-rate-provider | view-exchange-rate-provider |
| Dashboard | dashboard | — |
| Notes | view-all-notes | — |
| | manage-all-notes | view-all-notes |
| Supplier | view-supplier; create-/edit-/delete-supplier | view-supplier |
| Bill | view-bill; create-/edit-bill | view-bill, view-supplier |
| | delete-bill | view-bill |
| Supplier payment | view-supplier-payment; create-/edit- | view-supplier-payment, view-supplier, view-bill |
| | delete-supplier-payment | view-supplier-payment |
| Supplier credit | view-supplier-credit; create-/edit- | view-supplier-credit, view-supplier, view-bill |
| | delete-supplier-credit | view-supplier-credit |
| Supplier refund | view-supplier-refund; create- | view-supplier-refund, view-supplier, view-supplier-payment, view-supplier-credit |
| | edit-supplier-refund | view-supplier-refund, view-supplier |
| | delete-supplier-refund | view-supplier-refund |
| Recurring cost | view-recurring-cost; create-/edit- | view-recurring-cost, view-supplier |
| | delete-recurring-cost | view-recurring-cost |

Module add-ons may register more abilities.

**Owner-only powers** (not grantable via abilities; only the company's recorded owner): edit company profile & logo, all company settings pages (preferences, customization, notifications, mail config, PDF/number formats, tax-included options), manage members & invitations, manage roles, create another company, transfer ownership, delete company. Reference data follows the related abilities: **Units** — list needs view-item; create needs create-item or edit-item; rename/delete need edit-item. **Payment methods** — list needs view-payment; create needs create-payment or edit-payment; rename/delete need edit-payment. **Expense categories** — list needs view-expense; create needs create-expense or edit-expense; rename/delete need edit-expense. **Notes** — list/use needs view-all-notes; create/edit/delete need manage-all-notes. **Exchange-rate providers** — own abilities; an active provider cannot be deleted (deactivate first, error `provider_active`).

**Platform admin** (`super admin`): access to the Admin area — all companies (list, edit, delete), all users (list, create, edit, delete, impersonate), global settings (mail, PDF engine, file disks, backups, currencies, role presets, appearance/fonts, updates, modules). The platform admin does NOT automatically get owner powers inside a company they don't own.

Authorization outcomes: missing ability → HTTP 403; UI hides menu items, buttons and routes the user lacks abilities for.

### 3.5 Customer

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| name | string | yes | — | "Display name". |
| email | email | no | null | Unique per company when present. Needed for portal + emailing. |
| phone | string | no | null | |
| contact_name | string | no | null | "Primary contact name". |
| company_name | string | no | null | |
| website | url string | no | null | |
| prefix | string | no | null | Customer series code used by `{{CUSTOMER_SERIES}}` numbering token; when empty renders `CST`. |
| tax_id | string | no | null | Printed via `{CONTACT_TAX_ID}`. |
| currency_id | currency ref | no (UI requires) | company currency | All documents/payments of the customer are in this currency. **Cannot be changed** once the customer has any estimate, invoice, payment or recurring invoice. |
| enable_portal | boolean | no | false | Grants customer-portal login. |
| password | hashed | when portal enabled (UI) | null | Portal password; min 8 on set; blank on edit = unchanged. |
| billing | Address | no | — | Created only if at least one field is non-empty. |
| shipping | Address | no | — | UI offers "copy from billing". |
| custom fields | answers | per definitions | — | model type `Customer`. |
| avatar | image | no | — | Portal profile photo. |

Computed (list/detail): `due_amount` (sum of due amounts of its invoices, base currency for totals, customer currency for display), `formatted_created_at`, invoice/estimate/payment/expense counts.

Delete (single or bulk): cascades — deletes all of the customer's estimates, invoices (and their transactions), payments, expenses, recurring invoices (and their run logs), line items, applied taxes, addresses. UI must warn "this deletes all related documents".

#### 3.5.1 Country
Seeded reference list: id, ISO code, name, phone code. Read-only.

#### 3.5.2 Address
Fields: name, address_street_1, address_street_2, city, state, country_id, zip, phone, fax, type (`billing` / `shipping`, null for company/user addresses). Owner: one of customer, company, user.

### 3.6 Item (catalogue) and Unit

Item:

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| name | string | yes | — | |
| description | text | no | null | |
| price | money (company currency) | yes | — | ≥ 0. |
| unit_id | Unit ref | no | null | |
| currency_id | ref | auto | company currency | |
| tax_per_item | boolean | no | false | Informational. |
| taxes | list of tax types | no | [] | Default taxes applied to a line when this item is picked (only used when company tax_per_item = YES). Stored as applied-tax rows linked to the item. |
| custom fields | answers | — | — | model type `Item`; when a field has placement `document`, its answer is copied onto document lines and printed as an extra column. |

Items are snapshots: picking an item copies name, description, price, unit name and taxes into the document line; later item edits do not affect existing documents. Delete (single/bulk) is always allowed (lines keep their copied data, item link becomes dangling/null).

Unit: name (required, unique per company). Delete refused if any item uses it ("unit in use").

### 3.7 Tax Type (tax definition)

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| name | string | yes | — | Unique per company among general tax types. |
| calculation_type | enum `percentage` / `fixed` | yes | `percentage` | |
| percent | decimal(5,2) | when percentage | null | 0–100. |
| fixed_amount | money | when fixed | null | Flat amount in minor units. |
| compound_tax | boolean | no | false | Compound = charged on (base + simple taxes); see §4.2. |
| collective_tax | boolean | no | false | Legacy flag, no behavior. |
| description | text | no | null | |
| transaction_type | enum `sales` / `purchases` | no | `sales` | Sales taxes appear on invoices/estimates/recurring; purchase taxes on expenses/bills. |
| type | enum `GENERAL` / `MODULE` | auto | `GENERAL` | MODULE = owned by an add-on, hidden from the editor. |

Delete refused if any applied tax row references it ("taxes attached"). Editing a tax type never changes taxes already applied on documents (they keep their snapshot).

### 3.8 Tax (applied tax row)

A snapshot of a tax type applied to something. Fields: tax_type_id, name, calculation_type, percent, fixed_amount, compound_tax, amount (money, computed), base_amount, exchange_rate, currency_id, plus exactly one owner link: invoice (document-level), invoice line, estimate, estimate line, recurring invoice (document-level or line), item (default taxes), expense.

### 3.9 Invoice (and Credit Note)

Credit notes are stored as invoices with `type = CREDIT_NOTE` (see 3.9.3).

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| type | enum `INVOICE` / `CREDIT_NOTE` | auto | `INVOICE` | Never settable by the client. |
| invoice_number | string | yes | next number | Unique per company (across both types). Editable by the user. |
| sequence_number | int | auto | — | Company-wide sequence within the type (see 3.21). |
| customer_sequence_number | int | auto | — | Per-customer sequence within the type. |
| reference_number | string | no | null | Free text ("Ref #"). |
| invoice_date | date (or date-time if invoice_use_time) | yes | today (company tz) | |
| due_date | date | no | invoice_date + N days if auto due date on | |
| customer_id | ref | yes | — | |
| currency_id | ref | auto | customer's currency | Always the customer's currency. |
| exchange_rate | decimal | when foreign currency | 1 | Required if customer currency ≠ company currency. |
| status | enum `DRAFT`, `SENT`, `VIEWED`, `COMPLETED` | auto | `DRAFT` (or `SENT` if saved with "save & send") | Delivery status (§4.5). |
| paid_status | enum `UNPAID`, `PARTIALLY_PAID`, `PAID` | auto | `UNPAID` | Collection status. |
| overdue | boolean | auto | false | Set by daily job (§4.5). Shown as "Overdue". |
| sent | boolean | auto | false | Has ever been sent. |
| viewed | boolean | auto | false | Has ever been viewed by customer. |
| tax_per_item | `YES`/`NO` | auto | company setting at save time | Frozen per document. |
| discount_per_item | `YES`/`NO` | auto | company setting at save time | Frozen per document. |
| tax_included | boolean | no | per settings | Prices include tax. |
| discount_type | `fixed` / `percentage` | no | `fixed` | Document discount type (when discount_per_item = NO). |
| discount | decimal | yes | 0 | Percentage value, or fixed value stored ×100 (minor units). |
| discount_val | money | yes | computed | Document discount amount. |
| sub_total | money | computed | | Σ line totals (after line discounts). |
| tax | money | computed | | Σ all tax amounts (simple + compound). |
| total | money | computed | | §4.1. |
| due_amount | money | computed | total | Outstanding balance. |
| base_sub_total, base_discount_val, base_tax, base_total, base_due_amount | money | computed | | Company-currency twins. |
| notes | rich text (HTML) | no | default invoice note | Printed under items. Supports placeholders. |
| template_name | string | yes | user default or `invoice1` | One of the PDF templates (`invoice1`, `invoice2`, `invoice3`, + custom). |
| recurring_invoice_id | ref | no | null | Set when generated by a schedule. |
| related_invoice_id | ref | credit notes only | null | Invoice being reversed. |
| credit_reason | text | no | null | Credit notes only. |
| sales_tax_type, sales_tax_address_type | string | no | from settings | Module passthrough. |
| unique_hash | token | auto | | Public PDF link. |
| custom fields | answers | per definitions | | model type `Invoice`. |

Computed/derived fields exposed: `allow_edit` (§4.6), formatted dates (company format), formatted due amount, public PDF URL, `payment_module_enabled`, credit notes list, remaining creditable quantities.

#### 3.9.1 Invoice line (also used for estimates and recurring invoices)

| Field | Type | Req | Notes |
|---|---|---|---|
| item_id | ref | no | Catalogue item the line came from (nullable; free-text lines allowed). |
| name | string | yes | ≤ 255. |
| description | text | no | |
| unit_name | string | no | Snapshot of unit name. |
| quantity | decimal(15,2) | yes | |
| price | money | yes | Unit price in document currency. Negative only on credit notes. |
| discount_type | `fixed` / `percentage` | yes | default `fixed`. |
| discount | decimal | no | Percent, or fixed ×100. |
| discount_val | money | yes | Line discount amount (0 when discounts are per document). |
| tax | money | yes | Σ line tax rows (0 when taxes are per document). |
| total | money | yes | round(price × quantity) − discount_val. **Excludes tax.** |
| base_price, base_discount_val, base_tax, base_total | money | | Company-currency twins. |
| exchange_rate | decimal | | |
| source_invoice_item_id | ref | credit-note lines only | The original line being credited. |
| taxes | applied tax rows | | When tax_per_item = YES. |
| custom fields | answers | | Item-type custom fields copied from the item / entered on the line. |

#### 3.9.2 Invoice deletion
- Refused if any payment allocation points at the invoice ("invoice has payment allocations" — user must remove allocations / delete payments first).
- Deletes its transactions, lines, taxes, custom-field answers.
- Deleting a credit note recalculates the balance of the invoice it reversed (§4.8). Credit notes pointing at a deleted invoice lose their link.

#### 3.9.3 Credit note specifics
- Created only via the "Create credit note" action on an existing invoice that is (a) of type INVOICE (a credit note cannot be credited), (b) not DRAFT (drafts are edited/deleted instead), and (c) still has creditable quantity and unpaid balance (§4.8). Never through the normal invoice form. Requires create-invoice ability. A credit note cannot be cloned or converted to an estimate.
- Number from `credit_note_number_format`; own sequence (separate from invoices).
- `reference_number` = original invoice number; `related_invoice_id` = original; `due_date` null; `status` DRAFT; `paid_status` PAID; `due_amount` 0; amounts negative; currency, exchange rate, tax/discount modes, template, notes and document custom fields copied from the original.
- Credit-note lines: positive quantity, negative price/total/tax.
- An invoice that has any credit note becomes non-editable (`allow_edit` = false).

### 3.10 Estimate

Same shape as Invoice except:

| Field | Difference |
|---|---|
| estimate_number | Unique per company; format `estimate_number_format`. |
| estimate_date | date (never time). |
| expiry_date | date, nullable; default estimate_date + estimate_expiry_date_days when auto expiry on. |
| status | enum `DRAFT`, `SENT`, `VIEWED`, `EXPIRED`, `ACCEPTED`, `REJECTED` (§4.7). |
| no paid_status, due_amount, overdue, sent/viewed flags, type, recurring link | — |
| template_name | `estimate1`, `estimate2`, `estimate3`, + custom. |
| custom fields | model type `Estimate`. |

Lines identical to 3.9.1 (without source link). Delete: always allowed (bulk too); deletes lines, taxes, answers.

### 3.11 Recurring Invoice (schedule / template)

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| customer_id | ref | yes | | |
| starts_at | date-time | yes | today | First possible run. |
| frequency | string (5-field cron expression) | yes | monthly preset | Presets in §4.9. |
| status | enum `ACTIVE`, `ON_HOLD`, `COMPLETED` | yes | `ACTIVE` | |
| next_invoice_at | date-time | auto | first occurrence ≥ starts_at | Next scheduled run. |
| limit_by | enum `NONE`, `COUNT`, `DATE` | yes | `NONE` | |
| limit_count | int | when COUNT | null | Max invoices to generate. |
| limit_date | date | when DATE | null | No invoice dated after this. |
| send_automatically | boolean | no | false | Email each generated invoice to the customer. |
| notify_creator | boolean | no | false | Email the schedule's creator on each generation and on new failures. |
| last_error | string code | auto | null | Reason the last run failed (e.g. customer missing, currency changed, required custom field unanswered, send failed, template invalid). Cleared on successful run or on save. |
| template fields | | | | Same document fields as invoice: currency_id, exchange_rate, tax_per_item, discount_per_item, tax_included, discount_type, discount, discount_val, sub_total, tax, total, due_amount, notes, template_name, sales_tax_* ; lines; document taxes; custom fields (model type `Invoice`). No number, no dates of its own. |

Relations: generated invoices (keep existing after schedule deletion, link nulled), run log.

Run log ("occurrence"): schedule ref, scheduled_for (local date), scheduled_at (moment, unique per schedule), record ref (generated invoice). Survives deletion of the generated invoice, so limit counts stay correct.

### 3.12 Payment (customer payment), Payment Allocation, Payment Method, Transaction

Payment:

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| payment_number | string | yes | next number | Unique per company; `payment_number_format`. |
| sequence_number / customer_sequence_number | int | auto | | |
| payment_date | date | yes | today | |
| customer_id | ref | yes | | Must belong to the company. |
| amount | money, integer ≥ 1 | yes | | In customer's currency. |
| currency_id | ref | auto | customer's currency | |
| exchange_rate | decimal > 0 | when foreign currency | 1 | |
| base_amount | money | auto | round(amount × rate) | |
| payment_method_id | ref | no | null | |
| notes | rich text | no | default payment note | |
| allocations | list of {invoice_id, amount} | no | [] | How the payment is applied to invoices (§4.10). |
| unique_hash | token | auto | | |
| transaction_id | ref | no | | Online-payment transaction (module). |
| custom fields | | | | model type `Payment`. |

Derived: `allocated_amount` = Σ allocations; `unapplied_amount` = amount − allocated (customer credit available to apply later).

Payment allocation: payment_id, invoice_id (unique pair), amount (≥1), base_amount (proportional share of payment base_amount; the last row of a fully allocated payment absorbs rounding so Σ base = payment base).

Payment Method (a.k.a. payment mode): name (required, unique per company), type `GENERAL`/`MODULE` (module = online gateway, has driver, settings JSON, active, use_test_env). Delete refused when used by any payment, expense, supplier payment/refund or recurring-cost template.

Transaction (online payment attempt, module-driven): transaction_id (gateway ref), unique_hash, type, status, transaction_date, invoice_id. Public transaction links obey link expiry. Core app only stores/displays; gateways are add-ons.

### 3.13 Expense, Expense Category, Receipt

Expense:

| Field | Type | Req | Default | Notes |
|---|---|---|---|---|
| expense_date | date | yes | today | |
| expense_number | string ≤255 | no | null | Free text. |
| expense_category_id | ref | yes | | |
| amount | money ≥ 0 | yes | | Gross amount in expense currency. |
| currency_id | ref | yes | company currency | Any currency. |
| exchange_rate | decimal | when currency ≠ company | 1 | |
| base_amount | money | auto | | |
| payment_method_id | ref | no | | |
| customer_id | ref | no | | Optional: expense billable to/related to a customer. |
| supplier_id | ref | no | | Must be the company's supplier. |
| notes | text | no | | |
| taxes | list {tax_type_id, amount} | no | [] | Purchase-type tax types only, each at most once, amount ≥ 0 entered by user (informational breakdown of the amount). |
| attachment_receipt | file | no | | jpg, png, pdf, doc, docx, xls, xlsx, ppt, pptx; ≤ 20 MB. Replace or remove on edit. Downloadable/viewable. |
| custom fields | | | | model type `Expense`. |

Expense Category: name (required), description. Delete refused if used by any expense, bill line, supplier credit line, supplier default, or recurring-cost template ("expense attached").

### 3.14 Custom Field (definition) and answers

| Field | Type | Req | Notes |
|---|---|---|---|
| name | string | yes | Internal name. |
| label | string | yes | Shown on forms. |
| slug | string | auto | `CUSTOM_<MODEL>_<NAME>` upper-cased, non-alphanumerics → `_`; if taken, suffix `_1`…`_10`. Used as placeholder `{CUSTOM_…}` in address formats, notes, email bodies. |
| model_type | enum | yes | `Customer`, `Invoice`, `Estimate`, `Payment`, `Expense`, `Item`, `Company`, `User`, `Supplier`, `Bill` (modules may add). |
| type | enum | yes | `Input` (single-line text), `TextArea`, `Phone`, `Url`, `Number`, `Dropdown`, `Switch` (boolean), `Date`, `Time`, `DateTime`. |
| placeholder | string | no | |
| options | list of strings | Dropdown | Choices. |
| default answer | value of matching type | no | Pre-fills new records. |
| is_required | boolean | yes | Enforced server-side on save of the owning record. |
| order | int | yes | Display order (ascending). |
| placement | enum `internal` / `document` | no | default `internal`; `document` = printed on PDF (document-level fields in the details block; `Item` fields as extra line columns). |
| validation | object, nullable | no | min_length, max_length (text); min, max (number); earliest, latest (date/time; literal date or `today` meaning company-today); pattern (regex ≤255 chars, text). |

Answer storage by type: Number/Phone → number; Switch → boolean; Date → date; Time → time; DateTime → date-time; others → text. Dropdown answer must be one of the options. Blank optional answers are allowed and skip validation. `in_use` (has answers) shown in UI to warn before delete; delete removes all answers.

Answer row: custom field ref, owner record (polymorphic), typed value.

### 3.15 Note (reusable note templates)

| Field | Type | Req | Notes |
|---|---|---|---|
| type | enum `Invoice`, `Estimate`, `Payment` | yes | Which documents may use it. |
| name | string | yes | Unique per company + type. |
| notes | rich text | yes | Supports placeholders. |
| is_default | boolean | yes | At most one default per type per company: setting one clears the others. The default note pre-fills the notes field of new documents of that type. |

Document forms offer "Insert note" (pick a template → replaces/appends to the notes editor).

### 3.16 Currency, Exchange-rate log, Exchange-rate provider

Currency (installation-wide reference list, seeded with world currencies, editable by platform admin): name, code (ISO, unique), symbol, precision (display decimals), thousand_separator, decimal_separator, swap_currency_symbol (true = symbol after amount).

Exchange-rate log (per company): base_currency_id (foreign currency), currency_id (company currency), exchange_rate, created_at. A row is written each time a document/payment/expense in a foreign currency is saved, recording the rate used; the latest row is the fallback suggestion next time.

Exchange-rate provider (per company): driver (`currency_converter`, `currency_freak`, `currency_layer`, `open_exchange_rate`), key (API key, required), currencies (list of currency codes this provider serves; a currency may be served by only one active provider per company), driver_config (e.g. plan type and custom URL for currency_converter: must be a public http(s) URL), active (bool, default true). Rate lookup order: live quote from an active provider listing the currency → last logged rate → none (user must type the rate).

### 3.17 Email log

One row per outgoing document email: from, to, cc, bcc, subject, body, mailable (polymorphic: invoice, estimate, payment, credit note, customer statement), token (unique random), created_at. The token is the credential of the "View document" link in the email. `is_expired` = automatically_expire_public_links = YES and now > created_at + link_expiry_days. Detail screens list a document's email history (date, to, subject).

### 3.18 Notifications
Stored in-app notifications for staff (type, data, read_at). Mainly used for invitations pending acceptance. Email notifications are separate (§7).

### 3.19 Files / attachments and File disks

Attachment (media): owner record (polymorphic), collection (`logo`, `avatar`, `receipts`, `pdf`/document files, purchase attachments), original name, file name, mime type, size, disk, order. Served through authenticated download endpoints (company-scoped) except public logos.

File disk (installation-wide, admin-managed): name, type (`SYSTEM` / `REMOTE`), driver (`local`, `s3`, `s3compat`, `doSpaces`, `dropbox`), credentials (JSON: root, key, secret, region, bucket, endpoint, token, app, …), set_as_default (exactly one default). Seeded system disks: `public` (local, public URLs) and `local_private` (local, default). System disks cannot be deleted. Which disk stores media, PDFs and backups is configurable.

### 3.20 Purchasing (suppliers & payables)

Supplier: name (req), contact_name, email, phone, website, tax_id, currency_id (req), expense_category_id (default category for its lines), payment_terms (days, default 30 → bill due date = bill date + terms), addresses (structured text), notes, enabled (default true; disabled suppliers cannot receive new documents), custom fields (`Supplier`).

Bill / Supplier credit (same document shape): supplier_id, currency_id, exchange_rate (default 1), number (unique per company; formats in 3.2; own sequence), reference, status (bill: `DRAFT` → `OPEN` → `VOID`; supplier credit: `OPEN` / `VOID`), document_date, due_date (bill), tax_included, financial_locked_at, sub_total, tax, total, base_total, due_amount, base_due_amount, notes, voided_at, void_reason, supplier_snapshot (supplier details frozen at save), source_bill_id / source_expense_id (credit raised against a bill or an expense), lines, attachments, custom fields (`Bill`).

Bill/credit line: expense_category_id (req), description (≤1000, req), quantity, price, discount, discount_type (default percentage), sub_total, discount_val, tax, total, base_total, taxes (purchase tax snapshots), source_bill_item_id. Line math = §4.1 with per-line discount and per-line tax always on. Total must be > 0 and ≤ max.

Supplier payment / Supplier refund: supplier_id, currency_id, exchange_rate, number, reference, status (`OPEN` / `VOID`), payment_date, amount, base_amount, payment_method_id, notes, voided_at, void_reason; refund also links the supplier payment or supplier credit it returns money from.

Allocations: supplier payment → bills, supplier credit → bills (amount, base_amount; unique pair). Bill due = total − Σ payment allocations − Σ credit allocations (never negative).

Recurring cost: supplier_id, name, mode (`BILL` / `EXPENSE`), status (`ACTIVE`/`ON_HOLD`/`COMPLETED`), frequency (daily-or-slower presets only), starts_at, next_run_at, limit_by/limit_count/limit_date, due_days (default 30), create_as_draft (bills), notify_creator, template (the bill or expense to generate), last_error.

### 3.21 Document numbering scheme

A number format is a sequence of tokens `{{NAME}}` or `{{NAME:value}}`; text outside tokens is ignored. Tokens:

| Token | Renders |
|---|---|
| `SERIES:x` | literal x (e.g. INV). Value up to 6 word characters, or one arbitrary character. |
| `DELIMITER:x` | literal x (e.g. `-`, `/`). |
| `SEQUENCE:n` | company-wide sequence number, left-padded with zeros to n digits (default 6). |
| `CUSTOMER_SEQUENCE:n` | per-customer sequence, zero-padded to n. |
| `CUSTOMER_SERIES` | the customer's `prefix`, or `CST` when empty. |
| `DATE_FORMAT:f` | current date in format f (e.g. `Y`, `y`, `m`, `Ymd`); default year. |
| `RANDOM_SEQUENCE:n` | n random hex characters (default 6). |

Sequences: next company sequence = (highest `sequence_number` among the company's documents of that kind) + 1; next customer sequence = highest among that customer's documents of that kind + 1. Invoices and credit notes keep independent sequences. On edit a document keeps its company sequence; its customer sequence is kept unless the customer changed (then renumbered for the new customer). The UI fetches the suggested next number from the server when opening a new-document form (per selected customer); the user may overwrite it, but the final number must be unique per company (validation error otherwise). The settings "Customization" page provides a token builder with live preview of the next number.

### 3.22 Modules (add-ons)
Installation-wide registry: name, slug, version, installed, enabled, state, last_error. Modules can add menu items, abilities, custom-field model types, payment gateways, tax types and PDF templates. Marketplace install/update is out of scope for v1 (§11); keep only the registry and an empty "Modules" screen.

## 4. Business rules [DONE]

### 4.1 Document arithmetic (invoices, estimates, recurring invoices)

All values in integer minor units. Two per-company switches decide the layout, frozen onto each document when saved:
- `discount_per_item` YES → each line has its own discount; NO → one document-level discount.
- `tax_per_item` YES → each line has its own tax list; NO → one document-level tax list.

Per line:
1. `line_subtotal = R(price × quantity)`.
2. `line_discount_val` (only when discount_per_item = YES, else 0):
   - percentage: `R(|line_subtotal| × discount% / 100)`
   - fixed: `min(R(discount_major × 100), |line_subtotal|)` (fixed discount never exceeds the line).
3. `line.total = line_subtotal − line_discount_val` (pre-tax).

Document:
4. `sub_total = Σ line.total`.
5. `discount_val` (only when discount_per_item = NO, else 0):
   - percentage: `R(sub_total × discount% / 100)`
   - fixed: `R(discount_major × 100)` (no cap in the form; UI should prevent > sub_total).
6. Taxes (see 4.2):
   - tax_per_item = NO: one charge pass on base `sub_total − discount_val` with the document tax list.
   - tax_per_item = YES: each line charged on its own base. Line base = `line.total`, except when a document-level discount exists (discount_per_item = NO and discount > 0): `line_base = line.total − R(D × p)` where `p = line.total / sub_total` rounded to 2 decimals first, and `D` = fixed discount in minor units or `sub_total × discount% / 100`. `line.tax = Σ` its tax rows.
7. `simple = Σ amounts of non-compound tax rows`; `compound = Σ amounts of compound rows` (over document rows, or over all line rows when per item).
8. `tax = simple + compound`.
9. `total`:
   - prices exclude tax (tax_included = false): `sub_total − discount_val + simple + compound`
   - prices include tax (tax_included = true): `sub_total − discount_val + compound` (simple taxes are already inside the prices; compound taxes are added on top).
10. `due_amount = total` on create (invoices); `base_*` = `R(x × exchange_rate)`.

Server authority: the server recomputes `sub_total`, `tax`, `total` (and `due_amount` on create) from the submitted lines (price, quantity, line discount_val), document discount_val and submitted tax-row amounts; client-sent totals are ignored. Tax-row amounts and discount values themselves are computed by the client using the rules above (the server may recompute them identically; a v1 rebuild should compute everything server-side with these exact formulas).

Line validation: at least one line; each line needs name, numeric quantity, numeric price. A tax type may appear only once per line / per document. Only `GENERAL` sales tax types of the company may be applied to sales documents.

### 4.2 Tax amount rules (order of calculation)

For a set of tax rows on one base:
1. Charge every **simple** (non-compound) row first, in list order:
   - fixed tax: amount = its `fixed_amount` (charged **once per row/document, regardless of quantity**).
   - percentage, prices exclude tax: `R(base × percent / 100)`.
   - percentage, prices include tax: `R(base − base / (1 + percent/100))` (tax backed out of the base).
   - percent 0 or base 0 → 0.
2. Then every **compound** row:
   - fixed: its fixed amount.
   - prices exclude tax: `R((base + Σ simple amounts) × percent / 100)`.
   - prices include tax: `R(base × percent / 100)` (added on top, not backed out).
3. Rows keep their original order for display.

PDF/summary display: when taxes are per line, rows of the same tax type are summed into one summary line per tax type ("VAT 10% … 12.00").

### 4.3 Rounding

- `R(x)` = round half up toward +∞ (nearest integer; exact .5 goes up, so −2.5 → −2).
- Line share proportion `p` rounded to exactly 2 decimals (half away from zero) before use.
- Base-currency conversion: nearest integer.
- Payment allocation base amounts: floor of the proportional share; the last row of a fully allocated payment takes the remainder.
- Credit-note pro-rating: half away from zero (see 4.8).
- Display: amounts formatted with the currency's precision, separators and symbol position (§10).

### 4.4 Date defaults

| Document | Date default | Closing date default |
|---|---|---|
| Invoice | today in company time zone (with current HH:MM when invoice_use_time = YES) | due_date = invoice_date + invoice_due_date_days when invoice_set_due_date_automatically = YES (fallback 7 days), else empty |
| Estimate | today | expiry_date = estimate_date + estimate_expiry_date_days when estimate_set_expiry_date_automatically = YES, else empty |
| Invoice from estimate / clone | today | today + invoice_due_date_days if auto due date on, else empty |
| Estimate from invoice | today | today + 30 days |
| Recurring-generated invoice | the run's local date | run date + invoice_due_date_days (7 if unset/0) |
| Payment, expense | today | — |

The UI recomputes due/expiry date when the document date changes (only while the auto setting is on and the user has not manually edited the closing date).

### 4.5 Invoice status machine

Two independent status axes plus an overdue flag.

**Delivery `status`:** `DRAFT → SENT → VIEWED → COMPLETED`.

| Event | Effect |
|---|---|
| Create with "Save" | status DRAFT, paid_status UNPAID, sent = false. |
| Create with "Save & Send" (client flag) | status SENT; UI then opens the send dialog. |
| "Mark as sent" (only from DRAFT) | status SENT, sent = true. No email. |
| Send by email | if status was DRAFT → SENT and sent = true; other statuses unchanged. |
| Customer opens the emailed link or views it in the portal | if status is DRAFT or SENT → VIEWED, viewed = true; email notification to notification_email if notify_invoice_viewed = YES. |
| Balance reaches 0 (payments/credit notes) | status COMPLETED, paid_status PAID, overdue = false. |
| Balance rises above 0 again (payment deleted/reduced, credit note deleted, total edited up) | status reverts to the furthest delivery step reached: VIEWED if viewed, else SENT if sent, else DRAFT. |
| "Mark as completed" (manual, status endpoint) | allowed only when outstanding = total − paid − credited = 0 and stored due amounts are 0; otherwise error "invoice must be settled before completion". |

**Collection `paid_status`:** derived from balance after every change:
- due_amount = 0 → PAID
- allocated payments = 0 (nothing paid) → UNPAID
- otherwise → PARTIALLY_PAID

(On direct edits where no allocation recount happens: due = total → UNPAID; 0 < due < total → PARTIALLY_PAID.)

**Balance:** `due_amount = max(0, total − Σ payment allocations − Σ |credit note totals|)`; `base_due_amount = R(due × rate)`.

**Overdue flag:** a background sweep (runs at most once per day, retried hourly if missed) sets `overdue = true` on every invoice where type = INVOICE, status ∉ {DRAFT, COMPLETED}, overdue = false, and due_date < today (date-only compare; due today is not overdue). Full payment clears it. UI shows an "Overdue" badge (paid-status column) whenever the flag is true; the "Due" filter/tab means paid_status ∈ {UNPAID, PARTIALLY_PAID}.

Credit notes: born DRAFT/PAID with due 0; can be sent (DRAFT → SENT) and viewed; never overdue, never payable, never in due/aging views.

### 4.6 Invoice editing rules

`allow_edit` (Edit action hidden and update refused when false):
1. false if the invoice has any credit note.
2. Else by company `retrospective_edits`:
   - `allow` → true.
   - `disable_on_invoice_sent` → false when paid_status ∈ {PARTIALLY_PAID, PAID} (and status is any of DRAFT/SENT/VIEWED/COMPLETED).
   - `disable_on_invoice_partial_paid` → false when paid_status ∈ {PARTIALLY_PAID, PAID}.
   - `disable_on_invoice_paid` → false when paid_status = PAID.

Update constraints:
- If any amount has been paid, the customer cannot be changed ("customer cannot be changed after payment is added").
- New total must be ≥ amount already paid ("total invoice amount must be more than paid amount").
- New due_amount = old due_amount + (new total − old total); statuses re-derived from it.
- Lines and document taxes are replaced wholesale on every save.
- Number stays unless edited; customer sequence re-assigned if customer changed.

### 4.7 Estimate status machine & conversions

Statuses: `DRAFT`, `SENT`, `VIEWED`, `ACCEPTED`, `REJECTED`, `EXPIRED`.

| Event | Allowed from | Result |
|---|---|---|
| Create | — | DRAFT (or SENT with Save & Send) |
| Mark as sent | any except SENT (UI) | SENT |
| Send email | any | DRAFT → SENT; others unchanged |
| Customer opens link / views in portal | DRAFT, SENT | VIEWED (+ notification if notify_estimate_viewed = YES) |
| Mark as accepted (staff) | not ACCEPTED, not REJECTED | ACCEPTED |
| Mark as rejected (staff) | not ACCEPTED, not REJECTED | REJECTED |
| Customer accepts / rejects in portal | any visible (portal shows buttons while not ACCEPTED/REJECTED/EXPIRED) | ACCEPTED / REJECTED |
| Daily expiry sweep | any status ∉ {ACCEPTED, REJECTED, EXPIRED} (drafts included) with expiry_date < today | EXPIRED |
| Convert to invoice | any except REJECTED (UI) | invoice created; then per `estimate_convert_action`: `no_action` (unchanged), `mark_estimate_as_accepted` (→ ACCEPTED), `delete_estimate` (estimate deleted) |

Convert estimate → invoice: new invoice for same customer/currency/exchange rate; copies lines (with taxes and line custom answers), document taxes, discount settings, sub_total/discount/tax/total, notes, document custom answers; invoice_date today; due date per 4.4; next invoice number; `reference_number` = a second rendering of the invoice number format (i.e., same as the new number for plain formats); template = invoice template with the same suffix number as the estimate template (estimate2 → invoice2), else first invoice template; status DRAFT, paid UNPAID, due = total. Opens the new invoice.

Convert invoice → estimate (not for credit notes): mirror of the above; estimate_date today, expiry today + 30 days, status DRAFT, estimate number next, template mapped back (invoiceN → estimateN).

Clone (invoice or estimate; not credit notes): new DRAFT copy dated today, next number, due/expiry per auto settings, same customer, lines, taxes, custom answers; invoice clone is UNPAID with due = total. After cloning, the UI navigates to the new document's edit page. After conversion, the UI navigates to the new document's detail page.

### 4.8 Credit notes (full and partial reversal)

Input: source invoice, optional reason (≤1000 chars), optional list of `{line_id, quantity > 0}`. Empty list = credit everything still creditable (full reversal).

Guards (in order, each a validation error):
1. Source must be type INVOICE and not DRAFT.
2. Remaining creditable quantity over all lines = 0, or `total − paid − already credited ≤ 0` → "already fully credited".
3. Requested cumulative credited quantity for a line > invoiced quantity → "credit quantity exceeds remaining".
4. Nothing new credited → "credit note must credit something".
5. Already credited + this credit total > total − paid → "credit amount exceeds invoice balance". (You cannot credit money that has been paid; delete/reduce payments first.)

Amounts — cumulative-difference model, so many partial credits sum exactly to a full credit:
- Work in hundredths of quantity. For each line with invoiced qty Q and cumulative credited qty q: ratio = q/Q.
- `cum_line_amount = Rh(price × q)`; `cum_line_discount = Rh(line.discount_val × ratio)` (only per-line discount mode); each line tax row `Rh(row.amount × ratio)`; line total = amount − discount.
- `cum_sub_total = Σ line totals`; document ratio = cum_sub_total / original sub_total; document discount and each document tax row = `Rh(original × ratio)`.
- `cum_tax` = Σ line taxes (per-line mode) or Σ document tax rows; `cum_total = cum_sub_total − cum_discount + cum_tax` (or without `+ cum_tax` when tax included).
- Base amounts scale proportionally from the original's stored base figures.
- This credit note's amounts = cumulative(after) − cumulative(before). `Rh` = round half away from zero.
- Fixed taxes are pro-rated like percentage taxes.

Effects: credit note stored with negated amounts (see 3.9.3); the original invoice's balance is recomputed (due = total − paid − credited; status COMPLETED/PAID when 0). The original invoice becomes non-editable and its PDF shows a "credited/cancelled" banner listing credit-note numbers. `credited_status` of an invoice: NONE / PARTIAL / FULL (credited total = invoice total). Deleting a credit note returns its quantities and recomputes the original's balance.

### 4.9 Recurring invoices

**Frequency presets** (stored as 5-field cron expressions, evaluated in the company time zone):

| Label | Expression |
|---|---|
| Every week (Sunday 00:00) | `0 0 * * 0` |
| Every 2 weeks (approx: days 1, 15, 29 of month) | `0 0 */14 * *` |
| Every month (1st, 00:00) | `0 0 1 * *` |
| Every 2 months | `0 0 1 */2 *` |
| Every quarter | `0 0 1 */3 *` |
| Every 6 months | `0 0 1 */6 *` |
| Every year (1 Jan) | `0 0 1 1 *` |
| Every day | `0 0 * * *` |
| Every 15 days at 00:05 | `0 5 */15 * *` |
| Every hour | `0 * * * *` |
| Every minute | `* * * * *` |
| Custom | user types any valid cron expression (validated) |

The form shows the next 5 upcoming run dates for the chosen frequency and start date (server preview endpoint).

**Next run:** `next_invoice_at` = first cron occurrence strictly after the start moment (a bare start date means 00:00 of that day in company tz; so a monthly schedule starting on the 1st first runs the next month's 1st). After each run: next = first occurrence strictly after the run's moment. If the cron yields the same local wall-clock minute (DST fall-back), skip to the following occurrence.

**Generation** (scheduler checks every minute): for each ACTIVE schedule with next_invoice_at ≤ now:
1. Lock the schedule; re-check active and due.
2. No catch-up: if several occurrences were missed, generate ONE invoice dated the latest missed occurrence, then jump next run to the first future occurrence.
3. Limit check for the occurrence's local date: COUNT → completed when generated count ≥ limit_count (count = logged runs incl. ones whose invoice was later deleted); DATE → completed when run date > limit_date. If reached: status COMPLETED, no invoice.
4. Skip if a run is already logged for that exact moment (idempotent).
5. Validate template: customer still exists in company; customer currency still equals schedule currency; every required Invoice custom field has an answer. Failure → no invoice, `last_error` set to a code, creator emailed if notify_creator and the reason is new; schedule stays due and is retried no sooner than 1 hour later.
6. Create invoice: number from invoice format, date = run local date, due date per 4.4, status DRAFT, UNPAID, copies totals/lines/taxes/custom answers/notes/template/discount/tax modes/exchange rate from template, `recurring_invoice_id` set.
7. Log the run; clear last_error; move next run; if the next run's date already exceeds the limit → COMPLETED.
8. After commit: if send_automatically → email the invoice to the customer with the company's default invoice subject/body (DRAFT → SENT). Send failure keeps the invoice as draft and sets last_error "send failed". If notify_creator → email the creator "invoice generated".

**Statuses & actions:**
| Action | From | Result |
|---|---|---|
| Create | — | status ACTIVE or ON_HOLD (chosen in form) |
| Pause | ACTIVE | ON_HOLD (else error "not active") |
| Resume | ON_HOLD | ACTIVE; next run = first occurrence today or later if the stored one is in the past (missed periods are skipped, today's kept); then limit re-check |
| Edit | any | if frequency or start date changed: next run recomputed from now (or from a future start date); if status changed to ACTIVE from ON_HOLD/COMPLETED: restart from today; raising a limit re-activates a COMPLETED schedule; reaching a limit completes it; last_error cleared and retry allowed immediately |
| Delete (bulk) | any | schedule, its lines, taxes, run log deleted; generated invoices kept (link removed) |

Limit validation: limit_count integer 1–10000; limit_date ≥ starts_at.

### 4.10 Payments and allocations

- A payment belongs to one customer and is in that customer's currency. Amount ≥ 1 minor unit. exchange_rate required (> 0) when customer currency ≠ company currency; base_amount = R(amount × rate).
- A payment may be applied (allocated) to one or more invoices of the **same company, same customer, same currency**, each invoice at most once per payment. Only type INVOICE, non-DRAFT invoices can receive allocations (credit notes and drafts cannot be paid).
- Σ allocations ≤ payment amount. The unallocated rest is **customer credit** (unapplied amount), which can later be applied to invoices via "Apply credit" (adds allocations to existing payments, never removes them).
- Per invoice: allocation ≤ `total − credited − allocations from other payments`.
- Create flow from an invoice ("Record payment"): payment form pre-selects the customer and invoice, amount defaults to the invoice's due amount, allocation = that amount.
- Edit: allocations are replaced as a full set (if the request carries them) or kept. Changing the customer is only allowed when the payment has no allocations.
- Delete (single/bulk): removes the payment's allocations first, then the payment.
- After every allocation change, each affected invoice (old and new) is recalculated: due = max(0, total − Σ allocations − credited); statuses per 4.5.
- Payment number from `payment_number_format`; unique per company.
- Concurrency: allocation changes lock the payment and affected invoices (ordered by id) so balances cannot be over-spent.

### 4.11 Sending documents by email

Common send dialog fields: from (default: company mail "from" address), to (default: customer email; required, valid email), cc, bcc (optional), subject (default "New Invoice"/"New Estimate"/"Payment Receipt" style text), body (rich text, default from company `*_mail_body`, placeholders allowed). A "Preview" button renders the exact email HTML.
On send:
1. Placeholders in subject/body replaced (§7.4); unknown placeholders removed.
2. An email-log row is written; its token builds the "View <document>" link (public, expiring per link settings).
3. If `<doc>_email_attachment` = YES, the PDF is attached (filename = document number + `.pdf`).
4. Uses the company mail configuration (falls back to platform config).
5. Status effects: invoice/estimate DRAFT → SENT (+ invoice sent flag). Payments have no status.
Credit notes use a credit-note email variant (same dialog).

### 4.12 Multi-currency rules

- Company has one base currency (set at creation; locked once data exists).
- A customer has one currency, locked once it has documents/payments/schedules.
- Every customer document/payment is in the customer's currency; if that differs from the company currency, the form shows an exchange-rate field ("1 <FOREIGN> = x <BASE>") prefilled from the lookup (provider → last logged rate), editable, required.
- Catalogue item prices (company currency) are converted to the document currency when picked: `R(item.price / rate)`.
- Every save of a foreign-currency document/payment/expense logs the rate used.
- Dashboard, reports and statements aggregate `base_*` amounts (company currency).
- Expenses may be in any currency (independent of customer), rate required when ≠ company currency.

### 4.13 Expenses

- Required: date, category, amount (≥0), currency. Optional supplier, customer, payment method, notes, number, receipt file, purchase-tax breakdown.
- Receipt upload replaces any existing receipt; a "remove receipt" flag clears it.
- If a supplier credit was raised against an expense, its tax breakdown can no longer change (error if attempted) and the expense cannot be deleted while the credit exists.

### 4.14 Purchasing rules (bills, supplier payments/credits/refunds, recurring costs)

- Bill lifecycle: DRAFT (editable) → "Open" (status OPEN; becomes payable) → optionally VOID (requires a reason; refused while any payment/credit allocation or non-void credit references it). Once a bill has any settlement or credit its financial fields lock; only reference, due date, notes and custom fields remain editable.
- Bill totals = §4.1 with per-line discount and per-line purchase taxes; base amounts split across lines proportionally.
- Supplier payment: amount allocated to OPEN bills of the same supplier and currency; Σ allocations ≤ payment amount; bill due = total − payments − credits ≥ 0. Void (reason required) removes allocations; refused while an open refund references it.
- Supplier credit: raised against a bill (lines/quantities from the bill, ≤ remaining) or an expense, or standalone; allocate to bills; void refused while allocated or refunded.
- Supplier refund: money returned by the supplier against a payment or a credit; ≤ remaining balance.
- Recurring cost: same scheduler as recurring invoices (daily-or-slower frequencies), generates a bill (optionally as draft, due = date + due_days) or an expense; same limit/pause/resume/failure rules; supplier cannot be changed after first run.

### 4.15 Background jobs

| Job | Cadence | Behavior |
|---|---|---|
| Overdue sweep | once per day (checked hourly, catches up after downtime) | 4.5 |
| Estimate expiry sweep | once per day (same) | 4.7 |
| Recurring invoice generation | every minute | 4.9 |
| Recurring cost generation | every minute | 4.14 |
| Legacy exchange-rate backfill | on demand | Only for databases migrated from old versions (setting bulk_exchange_rate_configured = NO); not needed in a fresh build. |
| PDF pre-generation | on document save/credit (queue) | Optional: regenerate stored PDF when save_pdf_to_disk is on |

### 4.16 Action → required permission

| Action | Requires |
|---|---|
| List / view invoices (incl. credit notes) | view-invoice |
| Create invoice, clone invoice | create-invoice (+ view of the source for clone) |
| Edit invoice | edit-invoice and allow_edit |
| Delete invoices (bulk) | delete-invoice |
| Send / preview email, mark as sent, mark as completed (status endpoint) | send-invoice |
| Convert invoice → estimate | view-invoice + create-estimate |
| Create credit note | create-invoice (source invoice must be in the active company) |
| List / view / create / edit / delete / send estimates | view- / create- / edit- / delete- / send-estimate |
| Estimate status change (sent / accepted / rejected) | send-estimate |
| Clone estimate | view-estimate + create-estimate |
| Convert estimate → invoice | view-estimate + create-invoice |
| Recurring invoices list / view / create / edit / pause-resume / delete | view- / create- / edit- / edit- / delete-recurring-invoice |
| Payments list / view / create / edit (incl. replacing allocations) / delete / send receipt | view- / create- / edit- / edit- / delete- / send-payment |
| Apply customer credit | view-customer + edit-payment on every payment used |
| Customer statement view / download / send | view-customer + view-financial-reports |
| Customers, items, tax types, expenses, custom fields, exchange-rate providers CRUD | the matching view-/create-/edit-/delete- ability |
| Dashboard | dashboard (recent-invoice / recent-estimate lists additionally need view-invoice / view-estimate; payables card needs view-bill) |
| Reports | view-financial-reports |
| Company profile, settings, mail config, members, invitations, roles, new company, ownership transfer, company delete | company owner only |
| Administration area | platform admin only |

### 4.17 Deletion & cascade summary

| Deleting | Guard | Cascades / side effects |
|---|---|---|
| Company | owner + typed name | Purges all company data; memberships removed; accounts kept. |
| Member (user) | owner; not self, not owner (UI) | Account deleted; authored records keep a null creator. |
| Customer | — | Deletes the customer's estimates, invoices (+ transactions), payments, expenses, recurring invoices (+ run log), addresses. |
| Invoice | no payment allocations | Lines, taxes, custom answers, transactions deleted; deleting a credit note recalculates its original invoice; credit notes of a deleted invoice lose their link. |
| Estimate | — | Lines, taxes, answers. |
| Recurring invoice | — | Lines, taxes, answers, run log; generated invoices kept (unlinked). |
| Payment | — | Allocations removed first; affected invoices recalculated. |
| Expense | not referenced by a supplier credit | Receipt file and taxes removed. |
| Item | — | Item taxes removed; document lines keep their copied data. |
| Unit | not used by items | — |
| Tax type | no applied tax rows | — |
| Payment method | not used by payments, expenses, supplier payments/refunds, recurring-cost templates | — |
| Expense category | not used by expenses, bill/credit lines, suppliers, recurring-cost templates | — |
| Custom field | — (UI warns when in use) | All answers deleted. |
| Note | — | — |
| Role (custom) | not assigned to members | — |
| Exchange-rate provider | not active | — |
| Bill / supplier credit / supplier payment / refund | never hard-deleted once posted; use Void (reason) | Void releases allocations where allowed (4.14). Drafts may be deleted. |

## 5. Screens & flows [DONE]

### 5.0 Global layout & conventions

- **Shell:** left sidebar (collapsible; bottom sheet/drawer on mobile) + top header. Header: global search box, "+" quick-create menu (invoice, estimate, payment, customer, expense — per abilities), company switcher (lists the user's companies; "Add company" for owners), user avatar menu (Profile/Account settings, Administration (platform admin only), Logout). A keyboard command palette (Ctrl/Cmd+K) lists navigation targets and quick actions (optional for v1).
- **Sidebar groups & items** (each hidden unless the user has the ability; owner-only items only for the owner):

| Group | Item | Visibility |
|---|---|---|
| Main | Dashboard | dashboard |
| Main | Items | view-item |
| Documents (sales) | Customers | view-customer |
| | Estimates | view-estimate |
| | Invoices (tabs: one-time / recurring) | view-invoice |
| | Payments | view-payment |
| Purchases | Suppliers | view-supplier |
| | Bills (tabs: bills, supplier credits, recurring bills) | view-bill / view-supplier-credit / view-recurring-cost |
| | Expenses (tabs: expenses, recurring expenses) | view-expense |
| | Supplier payments (tabs: payments, refunds) | view-supplier-payment / view-supplier-refund |
| Admin | Members | owner only |
| | Reports | view-financial-reports |
| | Settings | everyone (pages inside filtered) |

- **Global search:** typing ≥1 char shows matching customers (name/email/phone/contact) of the active company, newest first, and — for owners — matching members; clicking navigates to the record.
- **List screens (common pattern):** page header with title, breadcrumb, primary "New X" button; a "Filter" toggle revealing a filter bar; a "Clear all" link; data table with server-side pagination (default 10 rows; page-size selector 10/25/50/100), sortable column headers (asc/desc, server-side), row checkbox + "select all" for bulk delete (confirmation dialog "Are you sure? … cannot be recovered"), row action menu ("⋯"). Empty state (one short sentence and a create button, no artwork) when the company has zero records of that kind. A "no matching results" state when filters exclude everything. Mobile: rows render as cards (title = customer/name, subtitle = number, badge = status).
- **Forms:** inline validation messages under fields; required fields marked; save button shows a spinner and is disabled while saving; success toast ("X created/updated successfully"); error toast with server message; leaving a dirty form asks for confirmation (optional).
- **Money inputs:** formatted with the relevant currency (symbol, separators, precision); entered in major units.
- **Dates:** date picker; displayed in the company date format.
- **Confirmation dialogs** for every destructive or irreversible action (delete, convert, mark as sent, void).
- **Toasts** for success/failure of every async action.

### 5.1 Dashboard

Period picker (top right): "This year" (current fiscal year, default), "Previous year" (previous fiscal year), "Last 12 months", or a custom date range (max 5 years). The picker shows the resolved range ("1 Apr 2026 – 31 Mar 2027").

Widgets:
1. **Receivables summary:** total outstanding (Σ base_due_amount of non-draft invoices, company currency) and count of open invoices ("on N invoices"); split bar/legend into **Overdue** (due_date < today; with count), **Due soon** (due today … +30 days), **Due later** (beyond 30 days or no due date). Link "View invoices". Empty state: "nothing owed" / hint to create first invoice.
2. **Payables card** (only with view-bill): same split for open bills (outstanding, count, overdue, due soon, due later).
3. **Counters:** number of customers, number of invoices (type INVOICE only), number of estimates. Each links to its list.
4. **Cash-flow chart:** per bucket (by day if the range ≤ 62 days, else by calendar month; month labels "May", or "May 26" when > 12 months) four series: **Sales** (Σ invoice base_total by invoice_date, credit notes net negative), **Receipts** (Σ payment base_amount by payment_date), **Expenses** (Σ expense base_amount by expense_date + supplier payments − supplier refunds), **Net income** (receipts − expenses). Totals for the period shown as legend chips: Total sales, Total receipts, Total expenses, Net income. Toggle chart style: bars / area.
5. **Recent due invoices** (requires view-invoice): latest 5 invoices with base_due_amount > 0 — columns: due on (due date), customer, amount due; "View all" link. Empty state.
6. **Recent estimates** (requires view-estimate): latest 5 estimates — date, customer, amount; "View all". Empty state.

Counters/money are visible to anyone with the `dashboard` ability. A user without `dashboard` is redirected to the first menu item they can see.

### 5.2 Customers

**List** columns: display name (with avatar initial and company/contact sub-line), phone, account balance (amount due in customer currency), created date (added on), actions. Filters: display name, contact name, phone. Search via filters only. Sort: name, phone, balance (due), created date. Bulk delete (warn that all related documents are deleted). Row actions: Edit, View, Delete.

**Create/Edit form** sections:
- Basic info: Display name* (min 3 chars), Primary contact name, Email (valid), Phone, Primary currency* (searchable select; disabled with explanation once the customer has documents), Website (valid URL), Prefix (customer series), Tax ID.
- Portal access: toggle "Enable portal"; when on: Password and Confirm password (min 8; required on first enable; on edit blank = keep), info box with the portal login URL + copy button.
- Billing address: Name, Country (select), State, City, Address line 1, Address line 2 (each max 255), Phone, Zip.
- Shipping address: same fields + "Copy from billing" button.
- Custom fields (Customer) rendered by type.
Validation errors from server mapped to fields (e.g. email taken in this company).

**Detail view** (split layout): left = searchable, sortable list of customers (name, balance) for quick switching; right = selected customer:
- Header: name, actions (New invoice, New estimate, New payment, New expense, Edit, Delete, Send statement, Download statement).
- Overview cards: Account balance (invoice due − available credit), Invoice due, Available credit (unapplied payments) with **Apply credit** button.
- Basic info panel: display name, contact, email, phone, currency, website, tax id, portal access status + URL, addresses, custom field values.
- Cash-flow chart for the customer (same period picker/series as dashboard, scoped to the customer).
- **Account activity / Statement** panel: statement type switch:
  - *Activity* (requires from/to dates): opening balance (before from date), chronological entries — date, type (Invoice / Credit note / Payment), reference number, debit (invoice total), credit (credit-note amount or payment amount), running balance — closing balance; paginated (≤100/page). Draft invoices excluded.
  - *Outstanding* (as of date): open invoices (number, date, due date, original amount, applied = allocated + credited, remaining) and unapplied payments (number, date, amount, allocated, available); totals.
  - Download statement PDF; Send statement by email (dialog: to*, cc, bcc, subject*, body*; PDF attached).
- **Apply credit dialog:** lists the customer's payments with available credit and the customer's open (non-draft, due > 0) invoices; user adds rows {payment, invoice, amount}; "Allocate oldest first" auto-fills by oldest due invoice; validation: amount ≤ payment available and ≤ invoice remaining. Saves through the apply-credit endpoint.

### 5.3 Items

**List** columns: name, unit, price (company currency), added on, actions. Filters: name, unit (select), price. Sort by name, price, created. Bulk delete. Meta: total item count; list response also returns sales tax types for the item form.
**Form** (page or modal from the document line "Add new item"): Name* (min 3), Price* (money, max 20 chars input), Unit (select with inline "Add unit" — opens unit modal), Taxes (multi-select of sales tax types; shown only when company tax_per_item = YES), Description (max 65,000), custom fields (Item).
Units are also managed in Settings › Customization › Items (list: name, edit, delete; delete blocked when in use).

### 5.4 Invoices

**List** — header view switcher "One-time | Recurring" (recurring visible with view-recurring-invoice).
One-time tabs: Draft, Due, Sent, All (Due = paid_status UNPAID/PARTIALLY_PAID). Filters: customer (searchable select), status (Draft, Due, Sent, Viewed, Completed; and paid-status group Unpaid, Paid, Partially paid), from date, to date (both required to apply), invoice number (contains). Columns: checkbox, date (invoice_date), number, customer (name), status badge (delivery status; "Cancelled" badge if fully credited, "Credit note" marker for credit notes), amount due (customer currency) + paid-status badge (UNPAID/PARTIALLY_PAID/PAID, or OVERDUE when overdue flag), total, actions. Default sort: sequence number desc. Bulk delete (fails per invoice with allocations → error toast).
Row actions (per conditions):
| Action | Shown when |
|---|---|
| Edit | edit-invoice and allow_edit |
| View | view-invoice |
| Send invoice | status DRAFT and send-invoice |
| Resend invoice | status SENT or VIEWED and send-invoice |
| Record payment | type INVOICE, status SENT or VIEWED, due > 0, create-payment (reference UI shows it only for SENT; the server accepts payments on any non-draft invoice) |
| Mark as sent | status DRAFT and send-invoice (confirm) |
| Clone invoice | create-invoice (not credit notes) |
| Convert to estimate | create-estimate (not credit notes; confirm) |
| Create credit note | create-invoice, type INVOICE, not fully credited, not DRAFT |
| Copy PDF URL (detail only) | always; copies public PDF link |
| Delete | delete-invoice (confirm) |

Recurring tab: tabs Active, On hold, All. Filters: customer, status (Active/On hold/Completed), from/to (starts between). Columns: checkbox, starts at, customer, frequency (preset label or "Custom"), next invoice date, status badge, total, actions (Edit, View, Pause/Resume, Delete). Bulk delete.

**Create/Edit form** (shared document form; also estimates and recurring invoices):
- Header actions: "View PDF" (edit only), "Save" (primary; dropdown "Save & send" for new), "Make recurring" switch (create only; turns form into a recurring invoice form).
- Customer card: searchable customer select with inline "Add new customer" (modal with basic fields); once picked shows billing/shipping addresses with "Edit" link and a "Change customer" link. Required.
- Basic fields: Invoice date* (date picker; with time when invoice_use_time), Due date (auto-filled per settings), Invoice number* (prefilled from server next-number for the chosen customer; editable; max 255), Reference number. For recurring: Starts at*, Frequency* (preset select + custom cron input with validation), "Next invoice date" preview (next 5 dates), Limit by (None / Date / Count) with Limit date or Limit count, Status (Active / On hold), Send automatically switch, Notify creator switch.
- Exchange-rate row (only when customer currency ≠ company currency): "1 USD = [rate] EUR" input, "Fetch latest" button (calls the rate lookup), help text. Required.
- **Items table:** columns Item (searchable item picker or free text name, with description textarea below; inline "Add new item"), Quantity* (numeric > 0, max 20 chars), Price* (money), Discount (only when discount_per_item: value + type toggle fixed/percentage; percentage 0–100), Amount (computed line total), row action menu (move up/down, drag-reorder, remove; at least one row must remain). When tax_per_item: under each line a tax chooser row per applied tax (select tax type, shows computed amount; "Add tax"); item's default taxes pre-fill. "Add new item" row button at the bottom. Custom fields of type Item with placement document appear as extra inputs per line.
- **Notes:** rich-text editor (max 65,000), "Insert note" popup (choose a saved Note of type Invoice; pre-filled with the default note on create), "Add new note" link.
- **Totals panel:** Sub total; Discount (document level when not per item: input + fixed/percentage toggle); taxes: when per document, a list of chosen taxes each showing its amount, "Add tax" popup (search tax types, link to settings to create one); when per item, a read-only summary per tax type; "Prices include tax" switch (only when company tax_included = YES); compound taxes labelled; **Total amount** (customer currency).
- **Template selector:** button showing current PDF template thumbnail → modal grid of template images (invoice1/2/3 + custom); "Mark as default" checkbox saves the user's default template.
- Custom fields (Invoice) section.
- Validation: customer required; date required; number required/unique; at least one line with name, quantity, price; exchange rate required when shown; totals ≤ 999,999,999,999 minor.
- On save: navigate to detail view. "Save & send" saves then opens the send dialog.

**Detail view:** left: searchable list (search by customer/number; sort by date / number / amount due; status filter) of invoices for quick switching; right:
- Header: number, status badges (delivery + paid/overdue), actions: Send / Resend, Record payment, Mark as sent (draft), dropdown (Edit, Clone, Convert to estimate, Create credit note, Copy PDF URL, Delete).
- Banners: for a fully credited invoice, a notice that it is cancelled, naming the credit note number; for a partially credited invoice, a notice giving the credited amount and the credit note numbers; for a credit note, a notice linking to the original invoice and showing the credit reason.
- Allocated payments panel: list of payment allocations (payment number, date, amount) linking to payments.
- Main area: embedded PDF preview of the invoice (generated live), "Open PDF" button.
- Email history (optional).

**Credit note dialog** (from Create credit note): reason textarea (optional, ≤1000); table of the invoice lines: item, price, original qty, already credited qty, remaining qty, "quantity to credit" input (default = remaining; 0 allowed to skip; must be ≤ remaining and > 0 for at least one line), computed credited sub-total; note that tax/discount are pro-rated proportionally. Fully credited lines are disabled. Submit → creates credit note, toast, navigates to the credit note.

**Send dialog:** see 4.11 (From, To*, CC, BCC, Subject*, Body rich text with placeholder chips/dropdown); Preview toggles to the rendered email; Send.

### 5.5 Estimates

**List** tabs: Draft, Sent, All. Filters: customer, status (Draft, Sent, Viewed, Expired, Accepted, Rejected), from/to date, estimate number. Columns: checkbox, date, number, customer, status badge, total, actions. Bulk delete.
Row actions: Edit (edit-estimate), View, Clone, Convert to invoice (create-invoice; not REJECTED; confirm), Mark as sent (status ≠ SENT), Send estimate (status ≠ SENT), Resend (SENT/VIEWED), Mark as accepted / Mark as rejected (not ACCEPTED/REJECTED; edit-estimate), Copy PDF URL (detail), Delete.
**Form:** same as invoice form with Estimate date*, Expiry date, Estimate number*, Reference; notes use Estimate notes; templates estimate1/2/3; no recurring toggle.
**Detail view:** list + PDF preview; header actions: Mark as sent, Send estimate, Convert to invoice, dropdown.

### 5.6 Recurring invoice detail

Header: customer, status badge (Active/On hold/Completed), actions: Edit, Pause/Resume, Delete. If last_error set: red alert "Last run failed: <human message for the code>" with hint to edit & save.
Info panel: starts at, next invoice date, frequency, limit by + count/date, send automatically (Yes/No), notify creator (Yes/No), amount.
Generated invoices table: date, number, customer, status, total (links to invoices). Empty state "No generated invoices yet".

### 5.7 Payments

**List** columns: date, payment number, customer, payment mode, amount (customer currency), allocations summary (invoice numbers / "Unapplied" credit), actions. Filters: customer, payment number, payment mode. Sort by date, number, amount (default sequence desc). Bulk delete. Row actions: Edit, View, Send payment receipt (send-payment), Copy PDF URL, Delete.
**Form:** Payment date*, Payment number* (prefilled), Customer* (select; changing it clears allocations; disabled when allocations exist on edit), Amount* (money > 0), Payment mode (select + inline add), Exchange rate row (foreign currency), Notes (rich text + insert Payment note), custom fields (Payment).
Allocations section: "Select a customer to allocate" hint until customer chosen; table rows {Invoice (select from that customer's open non-draft invoices showing number, due amount), Amount}; "Add allocation"; "Allocate oldest first" button (fills oldest-due invoices until the payment amount is used up); running "Allocated" total and "Unapplied credit" = amount − allocated; error "allocations exceed amount" blocks save; "No open invoices" state. Opening the form from an invoice's "Record payment" pre-selects customer, invoice and amount = invoice due.
**Detail view:** list + receipt PDF preview; panel: payment number, date, customer, mode, amount, allocations list (invoice, amount), unapplied credit; actions Send receipt, Edit, Delete.

### 5.8 Expenses

**List** tabs (expenses / recurring expenses when purchases enabled). Filters: customer, category, from/to date. Columns: date, expense number, category (name), customer/user, notes (truncated), amount (expense currency), actions (Edit, Delete). Bulk delete.
**Form:** Category* (select + inline "Add category"), Expense date*, Expense number, Amount*, Currency* (default company), Exchange rate (if foreign), Customer (optional), Supplier (optional), Payment mode, Purchase taxes breakdown (optional rows tax type + amount), Notes (max 65,000), Receipt upload (drag & drop; shows file name; download/preview; remove), custom fields (Expense). Edit page also offers "New supplier credit" when a supplier is set.

### 5.9 Suppliers & purchases (summary)

- Suppliers list (name, email/phone, currency, balance due, enabled), form (fields of 3.20), detail (overview: payables split, bills, payments, credits).
- Bills list/workspace with tabs Bills / Supplier credits / Recurring bills; filters supplier, status, dates; bill form = lines editor (category*, description*, qty, price, discount, purchase taxes) + attachments; actions Open, Void (reason), Record payment, Create credit.
- Supplier payment form: supplier, date, amount, method, allocations to open bills (allocation editor like 5.7); refund form; void with reason.
- Purchases report (see §8).

### 5.10 Members (owner only)

Two sections: **Members** (columns: name, email, role, added on, actions Edit/Delete; filters search; bulk select) and **Pending invitations** (email, role, invited by, date, Cancel invitation).
- "Invite member" modal: Email*, Role* → creates invitation, emails a link.
- "Add member" modal: Name*, Email* (unique installation-wide), Phone, Password* (min 8), and one or more company memberships, each {company the owner manages, role in that company} → creates the account directly.
- Edit member: change name/email/phone/password (blank = keep) and memberships/roles in companies the owner manages (companies left off the list are detached; memberships in other companies untouched). Delete member (single/bulk): deletes the user account itself; documents they authored remain with no author. UI must prevent deleting the owner and oneself.
- Invitees see pending invitations in-app (banner/notification) with Accept / Decline; a user with zero companies sees a "No company" screen listing invitations and (if allowed) "Create company".

### 5.11 Reports (view-financial-reports)

Layout: tabs Sales, Profit & Loss, Expenses, Taxes (+ Purchases). Each tab: date-range picker with presets (This week, This month, This quarter, This year, Previous week, Previous month, Previous quarter, Previous year, Custom), "Update report" button, embedded PDF preview pane, "Download PDF" button. Sales tab has "Report type: By customer / By item". Details in §8.

### 5.12 Settings (company) — left sub-navigation

| Page | Access | Content |
|---|---|---|
| Account settings (user) | self | Profile: name*, email* (unique), password + confirm (optional, min 8), language (UI language), avatar upload (crop). Security: change password. Connected apps / devices: list of personal API tokens/sessions with revoke (optional). |
| Company information | owner | Logo upload/remove, Company name* (unique), VAT id, Tax id, Phone, Country*, State, City, Zip, Address line 1/2, custom fields (Company). Save. **Danger zone:** Delete company (type company name to confirm). |
| Preferences | owner | Currency* (disabled once data exists, with explanation), Default language*, Time zone*, Date format*, Time format, Financial year*, toggles: Discount per item, Invoice use time, Automatically expire public links + link expiry days. Save. |
| Customization | owner | Tabs: **Invoices** (number format builder; due-date auto + days; retrospective edits radio: allow / disable after sent+paid / disable on partial paid / disable on paid; default formats: invoice email body, company/shipping/billing address formats — rich text with placeholder insertion; email attachment toggle), **Estimates** (number format; expiry auto + days; convert action radio: no action / delete estimate / mark accepted; default formats; attachment toggle), **Payments** (number format; email body; company & from-customer address formats; attachment toggle), **Items** (units CRUD). Credit-note and purchase number formats also configurable here. |
| Number format builder | owner | Drag-orderable list of components: Series (value), Sequence (length), Delimiter (char), Customer series, Customer sequence (length), Date format (format string), Random sequence (length). Add/remove/reorder; live preview of next number; Save writes the format string. |
| Roles | owner | List roles: name, preset/system badge, added on; "Add role" modal: name*, ability checklist grouped by entity with "select all" per group; dependency auto-selection; at least one ability. Preset roles view-only. Delete custom role (blocked if assigned). |
| Exchange rate provider | view-exchange-rate-provider | List: driver, key (masked), currencies, active toggle, actions. Modal: Driver* (select), API key*, Currencies (multi-select; currencies already used by another active provider flagged "in use"), driver-specific config (plan type / URL), Active. |
| Notifications | owner | Notification email*, toggles: Invoice viewed, Estimate viewed. |
| Tax types | view-tax-type | Top toggles (owner): Tax per item, Prices include tax (tax_included), Tax included by default. List: name, used for (Sales/Purchases), calculation (percent or fixed amount), compound badge, description, actions. Modal: Name*, Used for (sales/purchases), Calculation type (percentage/fixed), Percent (0–100) or Fixed amount, Description (max 255), Compound tax switch. |
| Payment modes | view-payment | List name + actions; modal Name*. |
| Custom fields | view-custom-field | List: name, model, type, required (Yes/No), actions. Modal sections: Field (Model* — locked when field in use, Name*, Label*, Type* — locked when in use, Placeholder, Options (Dropdown; press Enter to add), Default value (typed), Order*), Behaviour (Required, Show on document), Validation (min/max length, min/max value, earliest/latest bounds: none / today / fixed date or time, regex pattern). |
| Notes | view-all-notes (manage-all-notes to edit) | List: name, type, actions. Modal: Name*, Type* (Invoice/Estimate/Payment), Notes* (rich text with placeholders), Set as default. |
| Expense categories | view-expense | List name, description; modal Name*, Description. |
| Mail configuration | owner | Toggle "Use custom mail configuration" (off = "using global mail configuration"). When on: Driver (SMTP, Mailgun, SES, Sendmail, Mail, Postmark) with driver fields — SMTP: host*, port*, username, password, encryption (none/tls/ssl/starttls), from mail*, from name*; Mailgun: domain*, secret*, endpoint*, from mail/name; SES: key*, secret*, region*, from; Postmark: token*, from; Sendmail/Mail: from mail/name. "Send test mail" modal (to*, subject*, message*). |
| Modules config | per module | Settings pages contributed by add-ons (stub). |

### 5.13 Administration area (platform admin only)

| Screen | Content |
|---|---|
| Admin dashboard | Installation counters: companies, users, documents; app version. |
| Companies | List (name, owner, members count, created); edit (name, owner transfer, address); delete (purges company). |
| All users | List (name, email, role, companies, created); create/edit user (name, email, password, platform role, memberships with role per company); delete; "Log in as" (impersonation, with banner to stop). |
| Modules | Registry list (name, version, enabled); enable/disable (marketplace stubbed). |
| Settings › Mail configuration | Platform default mail driver config (same fields as company mail) + test mail. |
| Settings › PDF generation | Engine: built-in HTML-to-PDF renderer or external Gotenberg service (host URL, PDF/A option); page setup: paper size (A4, Letter, Legal, custom width/height), orientation, margins (top/right/bottom/left), page numbers on/off. |
| Settings › Fonts / Appearance | Default PDF font; admin page title; portal branding defaults. |
| Settings › File disks | List disks (name, driver, default badge); add/edit disk (name, driver: local, Amazon S3, S3-compatible, DigitalOcean Spaces, Dropbox; driver credentials; set as default); choose disks for media, PDFs, backups; system disks not deletable. |
| Settings › Backups | List backups on the chosen disk (file, size, date) with download/delete; "Create backup" modal: option database only / files only / both, target disk. |
| Settings › Currencies | Currency list CRUD (name, code, symbol, precision, separators, symbol position). |
| Settings › Role presets | Edit preset ability sets (owner preset fixed), create new presets; changes sync into all companies. |
| Settings › Update app | Current version, check for updates (channel stable/insider), run update steps (stub for v1). |
| Settings › AI/MCP | Out of scope (stub). |

### 5.13a Suggested client route map (any equivalent structure is fine)

| Area | Routes |
|---|---|
| Auth | login, forgot password, reset password (token), register with invitation (token) |
| Install | installation wizard steps (§2.1) |
| Company app | dashboard; customers (list, new, edit, detail); items (list, new, edit); estimates (list, new, edit, detail); invoices (list with one-time/recurring switch, new, edit, detail); recurring invoices (new, edit, detail); payments (list, new, new-for-invoice, edit, detail); expenses (list, new, edit); suppliers, bills, supplier credits, supplier payments, refunds, recurring costs (phase 2); members; reports (sales, profit & loss, expenses, taxes, purchases); settings (account, company info, preferences, customization, roles, exchange rate, notifications, tax types, payment modes, custom fields, notes, expense categories, mail, danger zone) |
| Administration | admin dashboard, companies (list, edit), users (list, new, edit), modules, settings (mail, PDF, fonts/appearance, file disks, backups, currencies, role presets, update) |
| Portal (per company slug) | login, forgot password, reset password, dashboard, invoices (list, detail), estimates (list, detail), payments (list, detail), settings |
| Public | emailed document viewer (invoice / estimate / payment by email-log token); document PDF by hash |
| Fallbacks | no-company page, 404 page |

Route guards: unauthenticated → login (with `next`); not installed → wizard; missing ability → redirect to dashboard (or first permitted page) with a "not authorized" toast; non-owner on owner pages → same.

### 5.14 Error & empty pages
404 page (unknown route or record); 403 "not authorized" toast/redirect; maintenance page; "No company" page (user without memberships).

## 6. Customer portal [DONE]

### 6.1 Access & login
- Each company has its own portal, addressed by the company slug (e.g. `<app>/<company-slug>/customer/…`). The staff customer form shows this URL with a copy button.
- Only customers with `enable_portal = true` and a password can log in. Login: Email* (case-insensitive match within that company only), Password*. Unknown email / wrong password → one generic error; portal disabled → distinct "portal access not enabled" error. Session-based (separate from staff sessions; a staff login does not grant portal access and vice versa).
- Forgot / reset password flow identical to staff (§2.3) but scoped to the company and sending the customer's reset email.
- Logout ends the portal session.
- Optional branding per company: portal logo, theme, page title.

### 6.2 Screens (top navigation: Dashboard, Invoices, Estimates, Payments; avatar menu: Settings, Logout)

| Screen | Content |
|---|---|
| Dashboard | Cards: amount due (Σ due of the customer's non-draft invoices, customer currency), count of invoices (non-draft, type INVOICE), estimates (non-draft), payments. Recent invoices (latest 5: number, due on, status, amount due) and recent estimates (latest 5: number, date, status, total), each with "View all". Empty states. |
| Invoices list | Only the customer's invoices **and credit notes with status ≠ DRAFT**. Filters: status (Due, Sent, Viewed, Completed; paid status Unpaid/Partially paid/Paid), from/to date, invoice number. Columns: date, number, status, paid status / overdue badge, amount due, total; View. |
| Invoice detail | Left: list of the customer's invoices for switching; right: PDF preview, header with number, status badges, Download PDF button, **Pay invoice** button (only when an online-payment add-on is enabled and paid_status ≠ PAID; v1: hide). Viewing marks DRAFT/SENT invoices as VIEWED (+ notification). |
| Estimates list | Customer's estimates with status ≠ DRAFT. Filters: status (Sent, Viewed, Expired, Accepted, Rejected), from/to, number. Columns: date, number, status, total; View. |
| Estimate detail | PDF preview, Download; **Accept** and **Reject** buttons (confirm dialog) shown while status ∈ {SENT, VIEWED} → sets ACCEPTED / REJECTED (server must accept only these two values; the reference wrote any value — do not replicate). Viewing marks SENT → VIEWED. |
| Payments list | Customer's payments: date, number, payment mode, invoice number(s) allocated (or "—"), amount; View. |
| Payment detail | Receipt PDF preview, Download. |
| Settings (profile) | Name, Email (unique among the company's customers), Password + Confirm (optional, min 8), Profile picture (gif/jpg/png ≤ 20 MB; remove), Billing and Shipping address blocks. Save. |

### 6.3 Rules
- A customer only ever sees records where customer_id = self and company = portal company; any other id → 404.
- Customers cannot create, edit, delete or send anything except: accept/reject estimates, update own profile, (add-on) pay invoices.
- Public emailed links (§7.5) work without portal login.

## 7. PDF & email [DONE]

### 7.1 Rendering
- PDFs are generated on demand from HTML templates (server-side HTML→PDF). Engine is configurable by the platform admin: built-in renderer or an external rendering service; page size (default A4), orientation (portrait), margins, optional page numbers in footer, default font. Must support UTF-8 and RTL scripts via the chosen font.
- Language of PDF labels = company `language`. Dates use company date format (invoice date may include time when invoice_use_time). Money uses the document currency formatting (§10).
- Each document can also be returned as HTML for live preview (used by the in-app preview pane).
- Authenticated staff URLs render any document of the active company; public URLs (`unique_hash`) render a single document without login (§7.5).
- Optional: when "save PDF to disk" is enabled, generated PDFs are stored on the configured disk and regenerated after edits.

### 7.2 Invoice / credit note PDF contents (all three templates)
Elements (each omitted when empty):
- Company logo (or company name text when no logo).
- Company address block = `invoice_company_address_format` rendered with placeholders.
- Title: "Invoice" or "Credit Note".
- Details block: Invoice number (Credit note number), Invoice date (Credit note date), Due date (omitted when null), plus document-level custom fields with placement `document` (label: value).
- "Bill to" block = billing address format with customer data; "Ship to" block = shipping address format (only when the customer has a shipping address).
- Credit-note banner: on a credit note — the credit-note title, a line referencing the original invoice number and its date, and the reason (when given); on a credited invoice — a "Cancelled" marker naming the credit note (fully credited) or a "Partially credited" marker giving the credited amount and the credit note numbers.
- Items table columns: # / Items (name in regular weight, description below in smaller grey text), extra columns for printed Item custom fields, Quantity (with unit name when present), Price, Discount (only when discount per item: "10%" or money amount), Tax (only when tax per item: amount), Amount (line total).
- Totals block (right-aligned): Subtotal; Discount (document-level only; shows "Discount (10%)" or fixed amount); each tax line ("<name> (<percent>%)" or fixed amount name) — when per item, summed per tax type; when prices include tax, a "Net" line and note that tax is included; **Total** (bold, inside a thin ruled box); if credited > 0: "Amount credited"; if paid > 0: "Amount paid"; when either: "Amount due".
- Notes section: "Notes" heading + rendered notes HTML (placeholders resolved).
- Footer: optional page numbers.

### 7.3 Template variants (same data, different layout)

All templates print black text on white, use a plain sans-serif font, thin grey rules only, no colour fills, no gradients, no decorative artwork. Layouts differ only in arrangement:

| Template | Layout description |
|---|---|
| Template 1 ("invoice1"/"estimate1") — Centered header | Logo (or company name) centered at the top, a thin horizontal rule beneath. Below: company address block on the left; details table (number, date, due date) on the right, labels in regular weight, values aligned right. Then a "To" heading + billing block on the left, shipping block beside it when present. Full-width items table with a ruled header row and thin row separators. Totals right-aligned; the Total row sits in a thin ruled box. Notes at the bottom left. |
| Template 2 ("invoice2"/"estimate2") — Title header | A header row with the logo on the left and, on the right, the document title (Invoice / Estimate / Credit Note) in large type with the number and date beneath; separated from the body by a heavier rule (no filled band). Below: company address block on the left, "To" + billing (and shipping) block on the right. Items table as above. Totals inside a thin ruled panel on the right. |
| Template 3 ("invoice3"/"estimate3") — Split header | Logo on the left of the header, company address block right-aligned on the right; a rule below. Next row: "To" + billing/shipping on the left, details table on the right (number, date, due date). Bold table header labels. Totals on the right with the Total row in a ruled box. |

The template picker shows a thumbnail of each layout (generate thumbnails from the build's own templates). Custom templates are out of scope for v1 (fixed three per document type).

### 7.4 Estimate PDF
Same as invoice with: title "Estimate", details Estimate number, Estimate date, Expiry date; no paid/credited/due lines; no credit banner; uses estimate address formats; notes; templates estimate1/2/3 mirroring invoice1/2/3.

### 7.5 Payment receipt PDF (single template)
Logo; company block (`payment_company_address_format`); title "PAYMENT RECEIPT"; details: Payment date, Payment number, Payment mode; "Received from" block (`payment_from_customer_address_format`); highlighted "Amount received" box (payment amount in customer currency); allocations table (Invoice number, Amount applied) when allocated; "Unapplied credit" line when amount > allocated; Notes.

### 7.6 Placeholders (for address formats, notes, email subject/body)
Unknown/unfilled placeholders render as empty. Values are HTML-escaped.

| Group | Placeholders |
|---|---|
| Company | `{COMPANY_NAME}`, `{COMPANY_ADDRESS_STREET_1}`, `{COMPANY_ADDRESS_STREET_2}`, `{COMPANY_CITY}`, `{COMPANY_STATE}`, `{COMPANY_COUNTRY}`, `{COMPANY_ZIP_CODE}`, `{COMPANY_PHONE}`, `{COMPANY_VAT}`, `{COMPANY_TAX}` |
| Customer | `{CONTACT_DISPLAY_NAME}`, `{PRIMARY_CONTACT_NAME}`, `{CONTACT_EMAIL}`, `{CONTACT_PHONE}`, `{CONTACT_WEBSITE}`, `{CONTACT_TAX_ID}` (renders "Tax ID: <value>") |
| Billing address | `{BILLING_ADDRESS_NAME}`, `{BILLING_ADDRESS_STREET_1}`, `{BILLING_ADDRESS_STREET_2}`, `{BILLING_CITY}`, `{BILLING_STATE}`, `{BILLING_COUNTRY}`, `{BILLING_ZIP_CODE}`, `{BILLING_PHONE}` |
| Shipping address | same with `SHIPPING_` prefix |
| Invoice | `{INVOICE_DATE}`, `{INVOICE_DUE_DATE}`, `{INVOICE_NUMBER}`, `{INVOICE_REF_NUMBER}` |
| Estimate | `{ESTIMATE_DATE}`, `{ESTIMATE_EXPIRY_DATE}`, `{ESTIMATE_NUMBER}`, `{ESTIMATE_REF_NUMBER}` |
| Payment | `{PAYMENT_DATE}`, `{PAYMENT_MODE}`, `{PAYMENT_NUMBER}`, `{PAYMENT_AMOUNT}` (formatted with currency) |
| Custom fields | `{CUSTOM_<MODEL>_<NAME>}` — the slug of any custom field of the document or of its customer |

The rich-text editors for formats/notes/bodies offer a placeholder picker grouped as above.

### 7.7 Emails

| Email | Trigger | Content |
|---|---|---|
| Send invoice | Send dialog / recurring auto-send | Branded layout (company logo/name header); body = dialog body with placeholders resolved; button "View Invoice" → public link `…/customer/invoices/view/<email-log-token>`; optional PDF attachment `<number>.pdf`; optional footer line with the product name (Halyard). Subject from dialog. |
| Send credit note | Send dialog on a credit note | Same as invoice with credit-note wording. |
| Send estimate | Send dialog | Same with "View Estimate". |
| Send payment receipt | Send dialog | Same with "View Payment"; PDF = receipt. |
| Customer statement | Send statement dialog | Body from dialog; statement PDF attached. |
| Invoice viewed / Estimate viewed | Customer opens link/portal first time, setting on | To `notification_email`: one sentence saying which customer viewed the invoice/estimate, a button opening the document in the app, and a short sign-off. |
| Recurring invoice generated | Run succeeded and notify_creator | To schedule creator: customer name, invoice number/total, button to the invoice. |
| Recurring invoice failed | Run failed (new reason) and notify_creator | Customer name; whether the run failed to create the invoice or created it but failed to email it; the reason; what happens next (retried hourly, emailed again only if the reason changes / invoice kept as draft); button opening the schedule. |
| Recurring cost generated / failed | Same for purchasing schedules | |
| Company invitation | Owner invites | Company name, inviter, role; Accept button (register/login link) and Decline link; expiry note. |
| Password reset (staff / customer) | Forgot password | Reset button with token link; expiry note (60 min). |
| Test mail | Mail config "test" | Subject/message as entered. |

Public link behavior: `…/customer/invoices/view/<token>` (also estimates, payments) opens a minimal viewer page (company-branded) showing the document PDF and a Download button; `?pdf` returns the PDF directly. Visiting marks the document viewed (invoices/estimates; see 4.5/4.7). Expired link (company expiry on and older than link_expiry_days) → "Link expired" (403) page. A token belonging to another document kind → 404. Separately, every document has a permanent hash URL (`…/invoices/pdf/<unique_hash>`, estimates, payments) returning the PDF (used by "Copy PDF URL"); these do not expire.

## 8. Reports [DONE]

All reports: require `view-financial-reports`; input = from_date and to_date (YYYY-MM-DD, inclusive; required, to ≥ from); amounts in **company currency** (base amounts); output = PDF (inline preview and download), rendered in company language and date format. Common PDF header: company name/logo, report title, period "from – to". Report URL is company-scoped and requires an authenticated member.

| Report | Data rules | Output |
|---|---|---|
| Sales by customer | Every invoice and credit note (any status) with invoice_date in range, grouped by customer; customers without documents in range omitted. | Per customer: customer name and total (Σ base_total); optionally rows per invoice (date, number, amount). Footer: Total sales. |
| Sales by item | Every invoice line of invoices dated in range, grouped by the **line name** (not catalogue id). | Rows: item name, total quantity, total amount (Σ line base_total). Footer: Total sales. |
| Expenses | Expenses with expense_date in range (optional category filter), oldest first, grouped by category name ("Uncategorized" if category gone). | Per category: category name + rows (date, notes/number, amount) and category total. Footer: Total expenses. |
| Profit & loss | Income = Σ payment base_amount with payment_date in range (cash basis; unpaid invoices excluded). Expenses = per category Σ expense base_amount in range, plus lines "Supplier payments" (+) and "Supplier refunds" (−) when purchasing used. | Income line; expense lines per category; Total expenses; **Net profit** = income − total expenses. |
| Tax summary | Output (sales) tax: tax rows of non-draft invoices and credit notes dated in range (credit notes negative), grouped by tax type + name + rate, base amounts. Input (purchase) tax: expense tax rows and bill taxes minus supplier-credit taxes dated in range. | Section "Output tax": rows tax name (rate) + amount, total; section "Input tax": rows + total; **Tax balance** = output − input, labelled "Tax payable" when positive, "Tax refundable" when negative. |
| Purchases (purchasing module) | Bills, supplier credits, supplier payments/refunds in range. | Totals by supplier and status; payables summary. |
| Customer statement (from customer page) | See 5.2 activity / outstanding definitions. | Statement PDF: company + customer blocks, period or as-of date, opening balance, entries with running balance, closing balance (activity) or open-invoice table + unapplied credits + totals (outstanding); customer currency. |

Report screen UX: §5.11. A v1 may also render the same data as an HTML table above the PDF.

## 9. API surface [DONE]

### 9.1 Conventions
- JSON over HTTPS, versioned prefix (e.g. `/api/v1`). The web UI uses the same API.
- **Auth:** staff — session cookie (web UI) or `Authorization: Bearer <personal access token>` (from the token-login endpoint). Portal — separate customer session. Public document links — token in URL only.
- **Company scoping header:** every company-level call carries a header naming the active company id (header name `company`). The server verifies membership; if the user is not a member, it substitutes the user's first company. All queries filter by that company; abilities are evaluated within that company's roles. Platform-admin endpoints don't need it.
- **Lists:** query params `page` (1-based), `limit` (default 10; the literal `all` returns everything unpaginated), `orderByField` (whitelisted column), `orderBy` (`asc`/`desc`), `search` (free text; space-separated terms must all match), plus resource filters. Response: `{ data: [...], meta: { current_page, last_page, per_page, total, <resource>_total_count (unfiltered count for empty-state logic) }, links: {...} }`.
- **Single:** `{ data: {...} }` including nested relations needed by the detail screen.
- **Bulk delete:** `POST /<resource>/delete` with `{ ids: [..] }` (customers, items, invoices, estimates, payments, expenses, recurring invoices; members use `{ users: [..] }`).
- **Errors:** 401 unauthenticated; 403 missing ability/owner; 404 not found or other company; 422 validation `{ message, errors: { field: [code or message] } }` (domain rule failures use snake_case codes, e.g. `invoice_has_payment_allocations`, which the UI maps to translated text); 429 throttled. "In use" deletes of reference data return 200 with `{ success: false, error: "<code>" }` (e.g. `taxes_attached`, `payments_attached`, `expense_attached`, unit in use) — the UI shows the message.
- Money in requests/responses: integer minor units. Dates `YYYY-MM-DD` (invoice dates may be `YYYY-MM-DD HH:MM`). Responses also include `formatted_*` display strings.

### 9.2 Resources (staff API, company-scoped unless noted)

| Resource | Operations | Key params / notes |
|---|---|---|
| auth | POST login (email/username, password, device_name → token); POST logout; GET check; GET tokens; DELETE tokens/{id} | Session login variant for web. |
| password | POST forgot (email); POST reset (email, token, password, password_confirmation) | Public. |
| invitations (public) | GET details by token; POST register-with-invitation; GET decline by token | |
| bootstrap | GET | Current user, user settings, companies, active company + settings, abilities, owner flag, menus, enabled modules, global config (languages, fiscal years, retrospective-edit options, etc.). Called at app start. |
| me | GET, PUT (profile), GET/PUT settings, POST avatar | |
| company | PUT (profile), POST logo, GET/POST settings (keys list), GET has-transactions (currency lock), POST transfer ownership/{user} | Owner. |
| companies | GET (my companies), POST (create), POST delete | |
| members | list/create/show/update; POST delete | Filters: search, display_name, email. Owner. |
| company-invitations | list/create/delete; GET pending (for me); POST {token}/accept; POST {token}/decline | |
| roles | CRUD | Owner. |
| abilities | GET | Ability catalogue with dependencies. |
| countries | GET | Public. |
| currencies | GET all; GET used (by company); GET {id}/exchange-rate (lookup); GET {id}/active-provider; POST bulk-update-exchange-rate | |
| exchange-rate-providers | CRUD; GET supported-currencies; GET used-currencies | |
| customers | CRUD; POST delete; GET {id}/stats (chart; period params); GET {id}/statement (type, from_date, to_date / as_of, page, per_page); POST {id}/statement/send; POST {id}/credit-allocations (apply credit) | Filters: search, display_name, contact_name, phone, customer_id. Sort default name asc. |
| items | CRUD; POST delete | Filters: search, price, unit_id, item_id. List meta includes sales tax types. |
| units | CRUD | |
| tax-types | CRUD | Filters: search, transaction_type (sales/purchases), tax_type_id. |
| next-number | GET with key (invoice, credit_note, estimate, payment), customer id, optional model id (editing) and optional format (preview a format) | Suggested next document number. |
| number-placeholders | GET `?format=` | Parsed tokens for the format builder preview. |
| invoices | CRUD; POST delete; GET templates; GET {id}/send/preview; POST {id}/send; POST {id}/clone; POST {id}/convert-to-estimate; POST {id}/credit-note (reason, items[{id, quantity}]); POST {id}/status (SENT | COMPLETED) | Filters: search (customer name/contact/company), status (DRAFT/SENT/VIEWED/COMPLETED, UNPAID/PARTIALLY_PAID/PAID, DUE), paid_status, from_date+to_date, customer_id, invoice_number, invoice_id (force-include one record). Default sort sequence desc. Create/update body: customer_id, invoice_date, due_date, invoice_number, reference_number, template_name, currency_id, exchange_rate, discount, discount_type, discount_val, tax_included, notes, items[{item_id, name, description, unit_name, quantity, price, discount, discount_type, discount_val, tax, total, taxes[{tax_type_id, name, percent, calculation_type, fixed_amount, compound_tax, amount}], custom_fields}], taxes[…], customFields[{id, value}], invoiceSend (flag). |
| recurring-invoices | list/create/show/update; POST delete; POST {id}/actions (pause | resume); GET recurring-invoice-frequency (frequency, starts_at → next_invoice_at + 5 upcoming dates) | Filters: status, customer_id, from_date+to_date (starts_at), search. |
| estimates | CRUD; POST delete; GET templates; GET {id}/send/preview; POST {id}/send; POST {id}/clone; POST {id}/status (SENT/ACCEPTED/REJECTED); POST {id}/convert-to-invoice | Filters: search, status, from_date+to_date, customer_id, estimate_number, estimate_id. |
| payments | CRUD; POST delete; PUT {id}/allocations (replace set); GET {id}/send/preview; POST {id}/send | Filters: search, payment_number, payment_method_id, customer_id, from_date+to_date, payment_id. |
| payment-methods | CRUD | Filters: search. |
| expenses | CRUD (multipart for receipt); POST delete; GET {id}/show/receipt; POST {id}/upload/receipts | Filters: search (category name / notes), expense_category_id, customer_id, from_date+to_date, expense_id. Sort default expense_date. |
| categories (expense) | CRUD | |
| custom-fields | CRUD | Filters: type (model_type), search. |
| notes | CRUD | Filters: type, search. |
| dashboard | GET (previous_year flag or from_date/to_date) | §5.1 payload. |
| search | GET `?search=` (customers + members); GET search/user (email lookup for invites) | |
| mail (company) | GET drivers; GET config; GET/POST company-config; POST company-test | Owner. |
| settings (global) | GET/POST `?settings[]=…` | Admin-level keys. |
| config / timezones / date formats / time formats / current-company | GET | Option lists. |
| disks, backups | CRUD disks; GET drivers; GET/PUT disk purposes; list/create/delete backups; GET download-backup | Platform admin. |
| pdf config, fonts | GET drivers; GET/POST config; font status/install | Platform admin. |
| purchasing | suppliers CRUD; bills CRUD + POST {id}/actions (open/void with reason); supplier-payments CRUD + actions (void) + PUT allocations; supplier-credits CRUD + actions + PUT allocations; supplier-refunds CRUD + actions; recurring-costs CRUD + actions (pause/resume); attachments upload/download per record; GET reports/purchases; GET purchase-options | Abilities per 3.4. |
| reports (web, PDF) | GET sales/customers, sales/items, expenses, profit-loss, tax-summary, purchases, customer-statement — each with from_date, to_date (+ expense_category_id), `preview` (HTML) / `download` (attachment) / default inline | Company identified in the path by its public hash; requires an authenticated member with view-financial-reports. |
| document PDFs | GET invoices/pdf/{hash}, estimates/pdf/{hash}, payments/pdf/{hash} | Public by hash. `?preview` returns HTML. |
| public email links | GET customer/invoices/{token} (JSON) and customer/invoices/view/{token} (viewer/PDF); same for estimates, payments | Public; expiry rules §7.7. |
| admin (platform) | GET dashboard; companies list/show/update/roles; users list/create/show/update/impersonate; POST stop-impersonating; role-presets CRUD; currencies list + refresh; modules; update check/download/unzip/copy/delete/clean/migrate/finish | `super admin` only. |
| installation | GET/POST wizard-step; languages; requirements; permissions; GET/POST database config; PUT domain; POST login; POST finish | Only before install completes. |

### 9.2a Representative response payloads (field lists)

| Resource | Fields returned |
|---|---|
| Invoice | id, type, invoice_number, reference_number, invoice_date, due_date, status, paid_status, overdue, sent, viewed, tax_per_item, discount_per_item, tax_included, discount_type, discount, discount_val, sub_total, tax, total, due_amount, base_* twins, exchange_rate, currency_id, template_name, notes, unique_hash, sequence_number, customer_id, recurring_invoice_id, related_invoice_id, credit_reason, creator_id, sales_tax_type, sales_tax_address_type, formatted_created_at, formatted_invoice_date, formatted_due_date, invoice_pdf_url, allow_edit, payment_module_enabled; on detail also: items[] (with taxes[], fields[]), taxes[], fields[] (custom answers with definition), customer (with billing/shipping), creator, company, currency, credit_notes[] {id, invoice_number, total}, credited_total, credited_status (NONE/PARTIAL/FULL), credited_quantities {line_id: qty}, payment_allocations[] {id, payment_id, amount, base_amount, payment {id, payment_number, formatted_payment_date}}. |
| Estimate | same document fields (estimate_number, estimate_date, expiry_date, status, formatted_estimate_date, formatted_expiry_date, estimate_pdf_url) + items, taxes, fields, customer, currency. |
| Recurring invoice | id, starts_at, formatted_starts_at, frequency, status, next_invoice_at, formatted_next_invoice_at, limit_by, limit_count, limit_date, formatted_limit_date, send_automatically, notify_creator, last_error, customer_id, currency_id, exchange_rate, document totals/modes, notes, template_name, items, taxes, fields, customer, invoices[] (generated). |
| Customer | id, name, email, phone, contact_name, company_name, website, prefix, tax_id, enable_portal, password_added (bool; never the hash), currency_id, company_id, avatar, created_at, formatted_created_at, due_amount, base_due_amount, invoice_due_amount, base_invoice_due_amount, available_credit, base_available_credit, account_balance, base_account_balance, billing, shipping, fields, currency, company. |
| Payment | id, payment_number, payment_date, formatted_payment_date, notes, amount, base_amount, exchange_rate, currency_id, customer_id, payment_method_id, transaction_id, sequence_number, unique_hash, payment_pdf_url, allocations[] {id, invoice_id, amount, base_amount, invoice {id, invoice_number}}, allocated_amount, unallocated_amount, base_allocated_amount, base_unallocated_amount, customer, payment_method, fields, currency, formatted_created_at. |
| Item | id, name, description, price, unit_id, unit {id, name}, currency, taxes[], fields[], formatted_created_at. |
| Expense | id, expense_date, formatted_expense_date, expense_number, amount, base_amount, exchange_rate, currency, expense_category {id, name}, customer, supplier_id, payment_method, notes, receipt (url/name/type when present), taxes[] {tax_type_id, amount, tax_type}, fields. |
| Tax type | id, name, calculation_type, percent, fixed_amount, compound_tax, collective_tax, description, transaction_type, type. |
| Custom field | id, name, slug, label, model_type, type, placeholder, options, default answer, is_required, order, placement, validation, in_use. |
| Bootstrap | current_user, current_user_settings, current_user_abilities, companies, current_company, current_company_settings, current_company_currency, pending_invitations, main_menu, setting_menu, user_menu (each item: title, link, icon, group, group label, priority), modules (enabled), global_settings, config (option lists: languages, fiscal years, retrospective-edit options, convert-estimate options, etc.), admin_mode (platform admin with no company). |

### 9.3 Portal API (prefix includes company slug)
POST login, POST logout, POST password/email, POST reset/password; then (customer session): GET bootstrap (customer, company, menu, currency, enabled modules), GET dashboard, GET me, POST profile (multipart: name, email, password, avatar, billing{}, shipping{}), GET countries, GET invoices (filters: status, paid_status, from/to, invoice_number; limit), GET invoices/{id}, GET estimates, GET estimates/{id}, POST estimate/{id}/status (ACCEPTED | REJECTED), GET payments, GET payments/{id}, GET payment-method (online gateway, add-on), GET expenses / expenses/{id} (customer-linked expenses; optional).

## 10. Non-functional [DONE]

### 10.1 Visual design intent (Halyard)

Halyard is a formal, conservative business application. The rebuild must not imitate the reference product's look; this spec describes the reference screens functionally only.
- Surfaces: plain white content areas on light-grey page and sidebar backgrounds; thin grey borders and dividers.
- Colour: one muted navy accent for primary buttons, links, active navigation and focus rings; status tones (Appendix C) desaturated and used sparingly. No gradients, no glass or blur effects, no illustrations or decorative elements; empty states are a short sentence plus a primary button.
- Typography: the system font stack (platform UI sans-serif); no novelty or display fonts; tabular figures for money columns where available.
- Layout: dense, conventional admin layout: left sidebar navigation, top bar, compact tables with modest row height, forms in labelled grids, right-aligned numeric columns, primary actions at the top-right of each page.
- Documents: PDFs are black on white with thin grey rules and a plain sans-serif font, no colour fills; the company logo is the only image.
- Branding: product name "Halyard" in the app shell and emails; no reference or third-party branding anywhere.

### 10.2 Other non-functional requirements


| Topic | Requirement |
|---|---|
| Money formatting | Using the currency record: `precision` decimals, `thousand_separator`, `decimal_separator`, symbol before amount (or after when `swap_currency_symbol`). Negative amounts prefixed with `-` (only if any non-zero digit). Example: 1234567 minor, USD (2, ",", ".") → `$12,345.67`; EUR swapped (2, ".", ",") → `12.345,67€`. Inputs accept major units; convert with ×100 (round to integer). |
| Date formats (company choice) | `Y M d` (2026 Oct 16), `d M Y` (16 Oct 2026), `d/m/Y`, `d.m.Y`, `d-m-Y`, `m/d/Y`, `Y/m/d` (default), `Y-m-d`. Stored in both server-style and client-style notation. API always uses ISO `YYYY-MM-DD`. |
| Time formats | 24-hour `H:i` (default) or 12-hour `g:i a`. |
| Time zones | Company `time_zone` (any IANA zone; list endpoint) defines "today", default document dates, overdue/expiry checks (date-only comparisons), custom-field "today" bounds and recurrence schedules. Store moments in UTC (app zone). |
| Fiscal year | Month pair; dashboard "this year" = 12 months starting at the opening month (if the opening month is later than the current month, the fiscal year started last calendar year). |
| Languages | Full i18n infrastructure in the reference (≈40 locales, incl. RTL Arabic/Hebrew/Persian/Urdu). **v1 needs English only**, but keep all user-visible strings in a translation catalogue; user language overrides company language in the UI; PDFs/emails use company language. |
| Pagination | Default 10 per page; selectable 10/25/50/100; `limit=all` for selects/dropdowns. Searchable selects (customers, items) query the server with `search` and limit. Statement pages max 100. |
| Validation | Server is authoritative; client mirrors rules for UX. Names min 3 chars where noted; text fields ≤255; notes/descriptions ≤65,000; amounts ≤ 999,999,999,999 minor units; percentages 0–100. |
| Security | Hash passwords; CSRF on session routes; throttle logins (10/min); company isolation on every query (incl. route-bound ids); public links via long random tokens only; no open redirects after login; sanitize rich-text HTML (notes, bodies, address formats) before rendering in PDFs/emails; uploaded file type/size checks (receipts ≤ 20 MB; images for logos/avatars). Exchange-rate custom URLs must be public http(s) hosts. |
| File storage | Uploads (logos, avatars, receipts, purchase attachments, generated PDFs) stored on a configurable disk; default local private storage; logos may be public. Supported drivers: local, S3, S3-compatible, DigitalOcean Spaces, Dropbox. Downloads of private files go through authorized endpoints. |
| Backups | Platform admin creates backups (option: full = DB + files, `only-db`, `only-files`) as zip archives on a chosen disk; list (name, size, date), download, delete. Runs as a background job. |
| Background processing | Queue for emails/PDF jobs (synchronous fallback acceptable); scheduler running every minute (recurring) and hourly (daily sweeps with catch-up). |
| Concurrency | Row-level locking (or equivalent) around payment allocation, credit-note creation, recurring runs, purchase settlements; idempotent recurring runs per (schedule, moment). |
| Performance | Lists eager-load relations; dashboard uses ≤ a handful of aggregate queries; aim < 500 ms for list endpoints with 10k records. |
| Responsiveness | UI usable on mobile (tables → cards, sidebar → drawer, sticky bottom action bar on forms). |
| Theming | Single light theme per §10.1 (a dark mode is optional and must keep the same restrained palette). |
| Accessibility | Labeled inputs, keyboard navigable menus/dialogs, visible focus, status not by colour alone. |
| Audit | Email log per document; impersonation log; created/updated timestamps; creator ids. |

## 11. Out of scope / stub for v1 [DONE]

| Area | v1 treatment |
|---|---|
| Module marketplace (browse/install/update add-ons, credentials pairing, operations log) | Stub: empty Modules screen + module registry table; no installs. Hide "Module configuration" settings. |
| Online payment gateways (Payments module: "Pay invoice" in portal, transactions, gateway webhooks) | Out of scope; keep Transaction entity minimal or omit; hide Pay button. |
| AI assistant / MCP server, OAuth client registration, MCP connections & activity, consent screen, prune job | Out of scope. |
| Private-network / "managed" hosting modes, demo-mode auto reset | Out of scope. |
| Crowdin / translation sync, non-English locales | Out of scope (keep i18n catalogue, English only). |
| Self-updater (check/download/unzip/migrate) | Stub: show current version only. |
| Installer steps for requirements, permissions, DB selection, domain | May be simplified to Account → Company → Preferences if the deployment is preconfigured. |
| External PDF rendering service option, font package installer, custom PDF templates | Optional; ship the built-in renderer + the three templates per document type. |
| Remote file disks (S3/Dropbox/Spaces) | Optional; local disk required. |
| Backups UI | Optional for v1 (nice to have). |
| Impersonation | Optional. |
| Purchasing module (suppliers, bills, supplier payments/credits/refunds, recurring costs, purchases report, payables card) | Phase 2 — implement after core sales features; entities/rules specified in 3.20/4.14 so data model can reserve them. Expenses (with supplier field optional) are core. |
| Sales-tax module hooks (`sales_tax_type`, `sales_tax_address_type`, MODULE-type tax types) | Store/pass through only. |
| Social login columns (facebook/google/github ids) | Omit. |
| Command palette, light/dark theme, drag-reorder of lines | Nice to have. |

## Appendix A. Worked examples (acceptance checks) [DONE]

All amounts in minor units unless shown with a decimal point. R = round half up (4.3).

**A.1 Document-level discount and taxes, prices exclude tax**
- Lines: 2 × 100.00 = 20000; 3 × 33.33 = 9999 → sub_total 29999.
- Discount 10 % → R(2999.9) = 3000. Taxable base 26999.
- VAT 20 % (simple) → R(5399.8) = 5400. Eco fee fixed 1.50 (simple) → 150. Local 5 % compound → R((26999 + 5400 + 150) × 0.05) = R(1627.45) = 1627.
- tax = 5400 + 150 + 1627 = 7177; total = 26999 + 5550 + 1627 = **34176** (341.76).

**A.2 Prices include tax**
- 1 × 120.00 = 12000, VAT 20 % simple, no discount → tax = R(12000 − 12000 / 1.2) = 2000; total = 12000 (tax shown, not added). A compound 5 % on top would add R(12000 × 0.05) = 600 → total 12600.

**A.3 Per-line taxes with a document discount**
- Lines 10000 and 5000 → sub_total 15000; fixed document discount 30.00 → 3000.
- Line 1 share p = 0.67 → base 10000 − R(3000 × 0.67) = 7990 → VAT 10 % = 799.
- Line 2 share p = 0.33 → base 5000 − 990 = 4010 → VAT 10 % = 401.
- tax 1200; total = 15000 − 3000 + 1200 = **13200**.

**A.4 Per-line discounts**
- 3 × 50.00 = 15000, 10 % → discount_val 1500, line total 13500.
- 1 × 150.00 with fixed discount 200.00 → discount capped at 15000, line total 0.

**A.5 Payments and statuses**
- Invoice total 34176, status SENT. Payment 20000 allocated → due 14176, PARTIALLY_PAID, status SENT.
- Second payment 14176 allocated → due 0 → COMPLETED / PAID, overdue cleared.
- Delete the second payment → due 14176, PARTIALLY_PAID, status back to SENT (or VIEWED if the customer had viewed it).
- A payment of 50000 with 34176 allocated to this invoice leaves 15824 unapplied credit, later applicable to another invoice of the same customer and currency.

**A.6 Partial credit notes telescope exactly**
- Invoice: 3 × 3.33 = 999, document VAT 10 % = R(99.9) = 100, total 1099.
- Credit 1 unit: cumulative amount 333, ratio 1/3, tax Rh(33.33) = 33 → credit note −366.
- Credit 1 more: cumulative 666, tax Rh(66.67) = 67, cumulative total 733 → credit note −367.
- Credit the last: cumulative 1099 → credit note −366. Sum 1099 = invoice total; invoice due 0, COMPLETED/PAID, credited_status FULL.
- With 500 already paid, at most 599 can be credited (error `credit_amount_exceeds_invoice_balance` otherwise).

**A.7 Numbering**
- Format `{{SERIES:INV}}{{DELIMITER:-}}{{DATE_FORMAT:Y}}{{DELIMITER:-}}{{SEQUENCE:4}}`, highest existing sequence 11, year 2026 → `INV-2026-0012`.
- Format `{{CUSTOMER_SERIES}}{{DELIMITER:/}}{{CUSTOMER_SEQUENCE:3}}`, customer prefix ACME with 4 previous invoices → `ACME/005`; customer without prefix → `CST/005`.
- Credit notes and invoices count separately: after INV-000007 the first credit note is CN-000001.

**A.8 Multi-currency**
- Company USD, customer EUR, rate 1.08 (1 EUR = 1.08 USD). Invoice total 10000 (€100.00) → base_total R(10800) = 10800 ($108.00).
- Catalogue item priced $54.00 (5400) added to that invoice → R(5400 / 1.08) = 5000 (€50.00).
- Payment €100.00 at rate 1.10 → base_amount 11000; dashboard receipts +$110.00, sales +$108.00.

**A.9 Recurring schedule**
- Frequency monthly (`0 0 1 * *`), starts 2026-10-16, company zone Europe/Berlin → first run 2026-11-01 00:00 Berlin; invoice dated 2026-11-01, due 2026-11-08 (7 days).
- Start date 2026-11-01 (bare date) → first run 2026-12-01 (strictly after the start moment).
- Limit COUNT 3 → invoices on Nov 1, Dec 1, Jan 1; after the third the schedule becomes COMPLETED.
- Server down from Dec 1 to Dec 20 with a daily schedule → on recovery ONE invoice dated Dec 20 (latest missed), next run Dec 21.
- Paused on Dec 3, resumed Dec 10 (daily) → next run = first occurrence at or after the start of Dec 10; Dec 4–9 are skipped.

**A.10 Overdue & expiry**
- Invoice SENT, due 2026-10-15; sweep on 2026-10-16 → overdue = true. Due 2026-10-16 → not overdue until the 17th. DRAFT invoices never become overdue.
- Estimate SENT, expiry 2026-10-15 → EXPIRED on 2026-10-16. ACCEPTED estimates never expire.

## Appendix B. Domain error codes (422 unless noted) [DONE]

| Code | Raised when |
|---|---|
| customer_cannot_be_changed_after_payment_is_added | Invoice update changes customer while paid > 0 |
| total_invoice_amount_must_be_more_than_paid_amount | Invoice update total < amount paid |
| invoice_has_payment_allocations | Deleting an invoice that has allocations |
| invoice_must_be_settled_before_completion | Manual "completed" with balance outstanding |
| a_credit_note_cannot_be_created_from_a_credit_note, a_draft_invoice_cannot_be_credited | Credit note preconditions |
| a_credit_note_cannot_be_cloned, a_credit_note_cannot_be_converted_to_an_estimate | Clone/convert on a credit note |
| invoice_already_fully_credited, credit_quantity_exceeds_remaining, credit_note_must_credit_something, credit_amount_exceeds_invoice_balance | Credit note guards (4.8) |
| payment_amount_must_be_positive | Payment amount < 1 |
| payment_allocation_invalid, payment_allocation_duplicate_invoice, payment_allocation_required | Malformed allocation rows |
| payment_allocation_exceeds_payment_amount | Σ allocations > payment amount |
| payment_allocation_exceeds_invoice_balance | Allocation > invoice available balance |
| payment_allocation_invoice_mismatch | Invoice of another customer/company/currency |
| payment_allocation_invoice_not_payable | Draft invoice or credit note |
| payment_allocation_invoice_not_found, payment_allocation_payment_not_found | Unknown ids |
| payment_customer_change_requires_unallocated_credit | Changing payment customer while allocated |
| you_cannot_edit_currency | Changing a customer's currency after activity |
| recurring_invoice_not_active, recurring_invoice_not_paused | Pause/resume from wrong status |
| recurring_invoice_customer_missing, recurring_invoice_currency_changed, recurring_invoice_custom_field_required, recurring_invoice_template_invalid, recurring_invoice_failed, recurring_invoice_send_failed | Stored in `last_error` of a schedule (shown on its page/email) |
| company_name_must_match_with_given_name | Company delete confirmation mismatch (200, success false) |
| taxes_attached, payments_attached, expenses_attached, expense_attached, unit in use, provider_active, currency_used (currency already covered by another active provider), role_preset_in_use, role_preset_locked | Reference-data delete/edit refusals (200, success false) |
| purchase_* family | Purchasing rules (4.14), e.g. purchase_bill_not_draft, purchase_bill_in_use, purchase_void_reason_required, purchase_settlements_exceed_bill, purchase_supplier_inactive |

## Appendix C. Status display mapping (UI) [DONE]

Badges are small, rectangular, text-first labels in muted tones consistent with the visual design intent (§10.1). Tone names map to the build's own restrained palette (neutral = grey, info = the navy accent, positive / caution / negative = desaturated green / amber / red, used sparingly).

| Value | Label | Tone |
|---|---|---|
| Invoice DRAFT | Draft | neutral |
| Invoice SENT | Sent | info |
| Invoice VIEWED | Viewed | info |
| Invoice COMPLETED | Completed | positive |
| Paid status UNPAID | Unpaid | caution |
| Paid status PARTIALLY_PAID | Partially paid | caution |
| Paid status PAID | Paid | positive |
| overdue = true | Overdue | negative (replaces the paid-status badge) |
| credited_status FULL / PARTIAL | Cancelled / Partially credited | negative / caution |
| type CREDIT_NOTE | Credit note | neutral tag |
| Estimate DRAFT / SENT / VIEWED | Draft / Sent / Viewed | neutral / info / info |
| Estimate ACCEPTED / REJECTED / EXPIRED | Accepted / Rejected / Expired | positive / negative / neutral |
| Recurring ACTIVE / ON_HOLD / COMPLETED | Active / On hold / Completed | positive / caution / neutral |
| Bill DRAFT / OPEN / VOID | Draft / Open / Void | neutral / info / negative |
| Invitation pending / accepted / declined / expired | Pending / Accepted / Declined / Expired | caution / positive / negative / neutral |

## Appendix D. Seed / reference data [DONE]
- Countries: full ISO list (code, name, phone code).
- Currencies: world currencies with name, ISO code, symbol, precision (usually 2; 0 for e.g. JPY), thousand/decimal separators, symbol position.
- Per new company: payment methods Cash, Check, Credit Card, Bank Transfer; units box, cm, dz, ft, g, in, kg, km, lb, mg, pc; role presets owner / manager / read-only; settings sheet 3.2.
- Global: file disks `public` and `local_private` (default); version setting.
- Optional demo data generator (customers, items, invoices) for development.

## Appendix E. Glossary [DONE]

| Term | Meaning in this spec |
|---|---|
| Active company | The company the current staff request acts on (company header, §9.1). |
| Owner | The single user recorded as a company's owner; holds owner-only powers (3.4). |
| Platform admin | User with platform role `super admin`; manages the installation, not company data. |
| Member | A user belonging to a company with one role there. |
| Minor units | Integer money = major amount × 100. |
| Base amount | A money value converted into the company's base currency with the document's exchange rate. |
| Document | Invoice, credit note, estimate (and, for numbering, payment). |
| Line | One row of a document's items table. |
| Simple / compound tax | Simple taxes are charged on the taxable base; compound taxes on base + simple taxes (exclusive pricing). |
| Allocation | The part of a payment applied to one invoice. |
| Unapplied credit | Payment amount not allocated to any invoice; available to apply later. |
| Credited | Amount of an invoice reversed by credit notes. |
| Due amount | Invoice balance still owed: total − allocated − credited. |
| Schedule | A recurring invoice (or recurring cost) template that generates documents. |
| Run / occurrence | One scheduled generation moment of a schedule; logged once. |
| Public link | URL carrying a random token that opens a document without login (emailed link or permanent PDF link). |
| Portal | The per-company customer self-service area. |
