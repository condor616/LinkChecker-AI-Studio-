# Security Policy

## Supported versions

Security fixes are applied on the default development branch of this repository. If you run a fork or pinned release, please rebase or cherry-pick fixes promptly.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security bugs that could lead to remote code execution, authentication bypass, SSRF against internal networks, or data exposure.

Instead, email the maintainer privately (repository owner) with:

1. A short description of the issue and impact
2. Steps to reproduce (PoC)
3. Affected commit / tag / deployment mode (local vs `docker-compose.prod.yml`)
4. Any suggested remediation

You should receive an acknowledgement within a reasonable time. Please give us time to ship a fix before public disclosure.

## Production hardening checklist

When exposing Lynx Scan / Lynx GEO on the public internet:

- Use `docker-compose.prod.yml` (not the local `docker/services` stack)
- Publish only app ports (`3001`, `3010`) to a reverse proxy; keep Postgres, Redis, FlareSolverr, Bull Board, and pgAdmin private
- Set strong `JWT_SECRET` and `POSTGRES_PASSWORD`
- Set public HTTPS URLs and rebuild images so `NEXT_PUBLIC_*` values are correct
- Set `AUTH_COOKIE_DOMAIN` only when you intentionally share login across both subdomains
- Keep `TRUST_PROXY=true` only behind a trusted reverse proxy (e.g. Nginx Proxy Manager)
- Leave `ENABLE_BULL_BOARD=false` in production
- Approve new users manually (registration creates `PENDING` accounts)
- Keep the VM firewalled so only the reverse-proxy host can reach app ports

## Known residual risks

Authenticated users can instruct the crawler to fetch arbitrary public URLs (by design). SSRF protections block private/link-local/metadata targets and unsafe redirect hops, but crawler abuse against third-party public sites remains an operational concern—use admin approval, job limits, and network egress controls.
