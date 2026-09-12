# Security review notes (production readiness)

Internal triage from the production-readiness work. Not a substitute for ongoing review.

## Fixed in this branch

| Severity | Finding | Remediation |
| --- | --- | --- |
| High | Redirect hops were not re-validated for SSRF | `fetchWithRedirects` calls `assertSafeOutboundUrl` on each Location |
| High | DNS lookup failures treated as safe | `isSafeHostname` fails closed |
| High | FlareSolverr accepted arbitrary URLs | Pre-check with `assertSafeOutboundUrl` |
| High | `/api/scans/validate-auth` fetched without SSRF checks | Same outbound URL guard |
| High | Backup zip extraction allowed path traversal | `resolveSafeZipPath` + restore entry allowlist |
| High | Bull Board always listened unauthenticated | Disabled when `NODE_ENV=production` unless `ENABLE_BULL_BOARD=true` |
| Medium | DB-offline auth fell back to JWT claims | `getSession` fails closed |
| Medium | `maxJobs` not enforced at enqueue | Scan/audit create paths enforce concurrent RUNNING limits |
| Medium | Missing baseline security headers | Middleware applies CSP/HSTS/XFO/etc. |
| Medium | Production compose published Postgres/Redis/FlareSolverr/pgAdmin | `docker-compose.prod.yml` publishes only app ports |

## Accepted / residual

| Severity | Finding | Notes |
| --- | --- | --- |
| Medium | In-memory rate limits | Sufficient for single-node deploy; multi-instance needs Redis-backed limits |
| Medium | JWT role stale until expiry | Middleware still uses JWT role; sensitive APIs re-read DB via `getSession` |
| Low | Redis without AUTH | Acceptable while Redis is not published; document adding `--requirepass` later |
| Info | Public registration | Intended; accounts stay `PENDING` until admin approval |

## Follow-ups

1. Add Redis AUTH + TLS between containers if the Docker network is shared with untrusted workloads
2. Distributed rate limiting for multi-replica Next.js
3. Shorten JWT TTL or add server-side session revocation
4. Automated `npm audit` / container scanning in CI
