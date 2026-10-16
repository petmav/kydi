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

## Publish-only extras (add later, not in preview manifest)
- `x-zenith.env`: declarations with `input` / `generate` (RE2 pattern, stable) / `template` / `alias`; `transform: argon2id|urlencode`
- Built-ins must be declared to be used: `ZENITH_PUBLIC_URL`, `ZENITH_PUBLIC_HOST`, `ZENITH_OWNER_EMAIL`, `ZENITH_SMTP_*`
- `x-zenith.storage`: map stable id -> named volume (`public: true` only for owner-browsable files, never DB)
- Rejected always: bind mounts, `include`, `extends`, `env_file`, `label_file`, file-backed configs/secrets, `privileged: true`
- `user:` numeric ids only; `depends_on` long form with `condition: service_healthy` is the only startup wait
