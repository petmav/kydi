# Zenith Hosting constraints (distilled from https://docs.zenith.hosting, 2026-10-16)

CLI: `npm install -g @zenith-hosting/cli` (installed locally: zenith 0.1.5, node v25.6.1). Node >= 20.10.
Commands: `zenith auth login` -> `zenith init` -> `zenith check --upload-size` -> `zenith up` -> `zenith logs --source build|runtime` -> `zenith down`.
`zenith publish` submits a pinned public GitHub commit for review (needs GitHub connection + Developer Agreement). NEVER run publish/push without explicit user authorization.
Non-interactive: set `NO_COLOR=1`.

## Files required at repo root
- `Dockerfile` (always required, even for image-only manifests)
- `zenith-compose.yml` (Compose spec + top-level `x-zenith`, <=128 KiB)

## Runtime requirements
- linux/amd64 image; app listens on `0.0.0.0`; logs to stdout/stderr
- config via env vars; persistent data in named volumes only
- no `.env` baked into image; preview secrets in gitignored `.env.local` (<=64 vars, <=32 KiB)
- Dockerfile must `EXPOSE` the primary port

## zenith-compose.yml shape
```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment: { ... literal values only in preview ... }
    depends_on:
      db: { condition: service_healthy }
    volumes: [ "app-data:/data" ]
  db:
    image: postgres:16-alpine        # pinned tag/digest, anonymously pullable
    environment: { POSTGRES_USER: ..., POSTGRES_PASSWORD: ..., POSTGRES_DB: ... }
    volumes: [ "db-data:/var/lib/postgresql/data" ]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U ..."], interval: 5s, timeout: 5s, retries: 10 }
volumes:
  app-data: {}
  db-data: {}
x-zenith:
  catalog:
    name: ...          # required
    description: ...   # required
    authors: [...]     # required
    tags: [...]        # required
    source: https://github.com/...   # required
    license: MIT       # required
    website: ...       # optional; also alternatives, detail, funding
  expose:
    - service: app
      port: 3000
      web: true        # required boolean; primary endpoint has NO label
```

## Preview policy (`zenith check` / `zenith up`) — stricter than publish
- Exactly one app service with `build: .` + root Dockerfile, plus up to 4 public-image deps (5 total)
- Primary expose: `web: true`, no `label`
- Literal inline values only: NO `${VAR}` interpolation, no host env inheritance
- Allowed: named volumes, depends_on
- NOT allowed in preview: bind mounts, custom networks, `env_file`, remote build contexts, alternate Dockerfiles, build args/targets, resource overrides, `x-zenith.env`, `x-zenith.storage`, `x-zenith.configs`
- Preview lifetime: 20 min from ready; one live preview per account
- Upload: <=100 MiB compressed / 200 MiB expanded; follows .gitignore/.dockerignore; node_modules excluded

## Publish-only extras (implemented in zenith-compose.yml; never in the preview manifest)

Corrections confirmed on 2026-10-17 against https://docs.zenith.hosting/content/zenith-compose-reference.md and the
CLI 0.1.5 schema (`lint/compose.schema.json`):

- `x-zenith.env.<NAME>` needs `input` or exactly one of `generate` / `template` / `alias`; a bare string is an
  alias. `generate` is the RE2 pattern string itself (`generate: '[A-Za-z0-9]{64}'`); there is no `stable` key
  (generated values are stable per deployment anyway). `generate` may be combined with `input` (`label`,
  `description`, `secret: true`) so owners can see or replace the value.
- `template` uses single braces: `'{ZENITH_PUBLIC_URL}/api'` (write `{{` for a literal brace).
- `transform: urlencode | argon2id` sits on the declaration and changes the injected value that aliases and
  templates see, so a password used both raw (db) and in a URL needs a second declaration
  (`DATABASE_PASSWORD_URLENCODED: { alias: POSTGRES_PASSWORD, transform: urlencode }`).
- `services: [...]` limits injection; without it a value goes to every service. Declared values replace
  same-named Compose `environment` entries in the targeted services.
- Built-ins (resolved only when declared through alias/template): `ZENITH_PUBLIC_URL(S)`, `ZENITH_PUBLIC_HOST(S)`,
  `ZENITH_PUBLIC_HOSTNAME(S)`, `ZENITH_OWNER_EMAIL` ("when available"), `ZENITH_SMTP_HOST|PORT|FROM|DISPLAY|USER|PASS`.
- Supported service keys include `healthcheck`, `depends_on` (only `condition: service_healthy` waits),
  `deploy.replicas`, `deploy.resources.limits|reservations`, numeric `user`, `read_only`, `cap_drop`, `cap_add`,
  `tmpfs` (memory-backed). `security_opt` is not documented, so Kydi does not use it.
- `x-zenith.storage.<id>`: `volume` (required), `label`, `description`, `public` (default false; never for DB).
- No dedicated local validator exists for the publish form. Running `zenith check` at the repository root does
  validate the publish manifest against the full local schema (including `x-zenith.env`/`storage`), but the
  server-side preview policy rejects those keys in `zenith up`; previews go through `npm run zenith:preview`.
- Listing metadata (`zenith publish --metadata`): `productName`, `category` (Business, Communication, Developer
  tools, Finance, Media, Productivity, Project management, Security), `description` (<=300), `detail` (<=1000),
  `maintainerName`, `contactEmail`, `license`, optional `website`, `supportUrl`, `alternatives` (array),
  `partnershipNotes`. Icon/screenshots: JPEG/PNG/WebP, non-empty, <=2 MiB; screenshot caption = file name.
