# Security policy

## Supported versions

Security fixes are made on the `main` branch and released as a new version (see CHANGELOG.md). Only the latest
release is supported. Deployments should update to the latest release (see PRODUCTION.md, "Upgrades").

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability reporting:

1. Open https://github.com/petmav/kydi/security/advisories/new (or the repository's **Security** tab, then
   **Report a vulnerability**).
2. Describe the issue, the affected version or commit, and steps to reproduce. Include a proof of concept if you
   have one, but do not access or change data that is not yours.

Do not open a public issue, pull request or discussion for a suspected vulnerability.

What to expect:

- An acknowledgement within 7 days.
- An assessment and, for confirmed issues, a fix or mitigation plan. Coordinated disclosure through a GitHub
  security advisory once a fixed release is available. Reporters are credited unless they ask not to be.

## Scope

In scope: the Kydi application code in this repository, its Dockerfile and its Zenith manifests
(`zenith-compose.yml`, `zenith-compose.preview.yml`).

Out of scope: vulnerabilities in third-party dependencies that do not affect Kydi (report them upstream),
findings that need a compromised host or administrator account, denial of service by volume, and demo instances
started with `KYDI_DEMO_SEED=true` (their credentials are public by design).

## Security design summary

See PRODUCTION.md, "Security posture", for the controls in place (secret handling, install protection, session
and token handling, tenant isolation, browser security headers, SSRF protection and upload validation) and the
known limitations.
