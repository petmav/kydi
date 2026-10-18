# Publishing Kydi to the Zenith catalogue

This is the ordered checklist for the maintainer. Nothing in this repository runs it for you. Every step that
changes something outside your machine (GitHub, Zenith) is a manual decision.

The publication package:

| File | Purpose |
| --- | --- |
| `zenith-compose.yml` | **Publish manifest.** `zenith publish` reads it from the pinned commit. Generated secrets, owner-bound install, private storage, health checks, limits. |
| `zenith-compose.preview.yml` | Preview manifest for `zenith check` / `zenith up` (the preview policy forbids `x-zenith.env` and `x-zenith.storage`). |
| `scripts/zenith-preview.mjs` (`npm run zenith:preview`) | Swaps the preview manifest in, runs `zenith check --upload-size` (and `zenith up` only with `--up`), then restores the publish manifest byte for byte. |
| `listing.json` | Listing metadata for `zenith publish --metadata`. |
| `publish/icon.png` | 512x512 icon (the Kydi mark on white; source artwork in `brand/`). |
| `publish/screenshots/*.png` | Real screenshots taken from a running instance with demo data (`scripts/screenshots.mjs`). The file name becomes the caption, and the first `--screenshot` becomes the cover. |
| `SECURITY.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `PRODUCTION.md`, `CHANGELOG.md` | Policy, licences, operator runbook and release notes. |

`publish/`, `listing.json`, the preview manifest, the scripts and the tests are excluded from the Docker image by
`.dockerignore`.

## Checklist

1. **Review before going public.**
   - Read SECURITY.md, LICENSE (MIT) and THIRD_PARTY_NOTICES.md. Regenerate the notices with
     `node scripts/third-party-notices.mjs` after any dependency change.
   - `listing.json`: replace `contactEmail` (currently `TODO-replace-before-publishing@example.com`) with a real
     address you want to publish, and confirm `maintainerName`.
   - Decide about repository history. Every commit's author email (`git log --format='%ae' | sort -u`) becomes
     public. The remote branch `origin/jas` (a contribution by another author) also becomes public, unless you
     delete it or confirm that you may publish it under MIT.
   - Optional: re-run the secret sweep (`git log -p | grep -iE "secret|password|token"`). The sweep for 0.2.0
     found no live secrets, only the documented preview and demo values, which production refuses.

2. **Make the GitHub repository public** (Settings > General > Danger zone > Change visibility). Then enable
   **Private vulnerability reporting** (Settings > Code security), which SECURITY.md relies on.

3. **Run the local checks.**
   ```bash
   npm ci
   npm run lint && npm test && npm run build
   # e2e: start a production server against a disposable database (see README "End-to-end tests")
   npm run test:e2e
   ```

4. **Run the preview swap test.**
   ```bash
   sha256sum zenith-compose.yml          # note the hash
   npm run zenith:preview                # check only: swaps, runs `zenith check --upload-size`, restores
   sha256sum zenith-compose.yml          # must equal the first hash
   git status --short zenith-compose.yml # must show nothing
   ```
   Optional live preview (20 minutes, one per account): `npm run zenith:preview -- --up`. If needed, this
   appends random `SESSION_SECRET` and `APP_ENCRYPTION_KEY` values to the gitignored `.env.local`. The preview
   seeds demo data (sign in as `admin@kydi.test` / `password123`). Zenith recommends a preview but does not
   require one. The CLI warns when the published commit differs from your last preview.
   `zenith check` run directly at the repository root validates the publish manifest against the local
   Zenith Compose schema (including `x-zenith.env`), but the server-side preview policy rejects it in
   `zenith up`. Always preview through the script.

5. **Sign in to Zenith and connect GitHub.**
   ```bash
   zenith auth login
   ```
   Then connect a GitHub account that can access `petmav/kydi` in the Zenith dashboard. Signing in to Zenith
   alone does not connect GitHub. `zenith publish status` shows the linked account ids.

6. **Commit and push.** Publishing reads the commit from GitHub, not your working tree.
   ```bash
   git status            # clean
   git push origin main
   git rev-parse HEAD    # the full 40-character SHA to publish
   ```

7. **Submit.** Run this from the repository root, with the SHA from step 6 (flags as listed by
   `zenith publish --help`):
   ```bash
   NO_COLOR=1 zenith publish \
     --metadata listing.json \
     --icon publish/icon.png \
     --screenshot "publish/screenshots/Dashboard.png" \
     --screenshot "publish/screenshots/Invoices.png" \
     --screenshot "publish/screenshots/Invoice detail.png" \
     --screenshot "publish/screenshots/Invoice PDF.png" \
     --screenshot "publish/screenshots/Reports.png" \
     --screenshot "publish/screenshots/Customer portal.png" \
     --commit <full-40-character-sha>
   ```
   - If several GitHub accounts are linked, add `--github-account-id <id>` (or set `ZENITH_GITHUB_ACCOUNT_ID`).
   - **Developer Agreement**: the first submission requires accepting it. Read it when prompted. Pass
     `--accept-agreement` only if you have the authority to accept it. The flag records acceptance; it does not
     bypass authorisation.
   - The command returns a submission receipt. A submission is not yet a catalogue listing.

8. **Track the review.**
   ```bash
   zenith publish status
   ```
   This shows the status, receipt, pinned commit and reviewer feedback. If changes are requested (or the
   submission is rejected or withdrawn), fix them, push a new commit and run
   `zenith publish resubmit --commit <sha>` with the same listing flags.

## What Zenith checks (from the Zenith publishing documentation)

- The GitHub repository is public and you may publish the app.
- A GitHub account that can access the repository is connected to Zenith.
- The pinned commit is pushed and contains a root `zenith-compose.yml` and a root `Dockerfile`.
- Image-based services can be pulled without registry credentials. `postgres:16.15-alpine3.24@sha256:…` is a
  public Docker Hub image.
- The listing is accurate and has at least one real screenshot. Icon and screenshots are JPEG, PNG or WebP, at
  most 2 MiB each. `category` is one of the documented values (`Finance` here). `description` is at most 300
  characters (201 here) and `detail` at most 1,000 (823 here).
- Publish validation covers the full runtime contract, including resolving and rendering `x-zenith.env`, and
  Zenith builds the image from the pinned commit before deployment.

## Updating a published app

- New code: push a new commit, then run
  `zenith publish update-code --commit <new-sha> --metadata listing.json` (plus `--icon` / `--screenshot` to
  replace them). The commit must differ from the last pinned one. Pushing to GitHub alone updates neither the
  submission nor running deployments.
- Listing only (copy, icon, screenshots): `zenith publish update-listing --metadata listing.json [--icon …]
  [--screenshot …]`. This keeps the pinned commit. New screenshots replace the saved ones.
- A submission that is already in review cannot be revised. Check `zenith publish status` first.
- Before every update: bump the version in `package.json` and `src/lib/version.ts`, add a CHANGELOG.md entry,
  run the checks in step 3 and the preview swap in step 4, and regenerate screenshots if the UI changed
  (`E2E_BASE_URL=http://localhost:3100 node scripts/screenshots.mjs` against a demo-seeded instance).
