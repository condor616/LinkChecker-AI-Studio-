# LynxGEO Criteria Expansion Plan

Status: proposed, not yet implemented.
Scope: `apps/lynxgeo/lib/geo/*`.
Target score model: bump `SCORE_MODEL_VERSION` from `geo-1.0.1` to `geo-1.1.0` once any new scored criterion ships, since `scoreModelVersion` gates audit comparisons.

Every new check must touch the same five places (existing pattern in the codebase):

1. **Finding generator** — `probes.ts` (site-level, one fetch/observation) or `analyze.ts` (per-page).
2. **Catalog entry** — `CRITERION_CATALOG` in `score.ts` (key, category, standard, scope, scoreGroup, why).
3. **Doc reference** — `CHECK_REFS` in `check-refs.ts`, https URL + title + publisher + kind.
4. **Tests** — extend `tests/check-refs.test.ts` ("every criterion maps to a doc"), `tests/score.test.ts` ("catalog lists every scored check"), plus a focused unit test near the existing pattern for that check.
5. **Docs page** — no manual edit needed; `/docs` renders from `CRITERION_CATALOG` + `CHECK_REFS` directly.

---

## 1. Expand the AI bot list (site probe, `crawlAccess`)

**Why:** `AI_SEARCH_BOTS` / `TRAINING_BOTS` in `probes.ts` predate several bots that are now actively used for citation and training in 2026.

**Add:**
- To `AI_SEARCH_BOTS` (scored as one group, `AI_SEARCH_BOT_GROUP`, same as GPTBot/ClaudeBot today):
  - `Bingbot` — Copilot leans on Bing's index; currently absent entirely.
  - `Meta-ExternalAgent` — Meta AI / Llama citation crawler.
  - `Amazonbot` — Alexa+/Rufus.
  - `YouBot` — you.com.
- To `TRAINING_BOTS` (informational only, matches `Google-Extended`/`CCBot`/`Bytespider` pattern):
  - `Applebot-Extended` — Apple Intelligence training opt-out, distinct from regular `Applebot` (which is search, out of scope here).
  - `Diffbot`

**Implementation:**
- `probes.ts`: add names to the two arrays. The existing `for (const bot of AI_SEARCH_BOTS)` / `TRAINING_BOTS` loops already generate findings with ids `bot-${bot}` / `train-${bot}` — no new logic needed.
- `score.ts`: add one `CriterionDefinition` per bot to `CRITERION_CATALOG`, mirroring the existing `bot-ClaudeBot` / `train-CCBot` entries (`scoreGroup: AI_SEARCH_BOT_GROUP` for search bots, `scoreGroup: 'training-bots'` + `informational: true` for training bots).
- `check-refs.ts`: map new keys to existing refs — `RFC_9309` for the search-group bots (robots.txt behavior, no separate spec), and for `Applebot-Extended` a new `CheckRef` pointing to Apple's crawler docs (`https://support.apple.com/en-us/119829`).
- Tests: extend `tests/check-refs.test.ts` bot-mapping test and `tests/score.test.ts` catalog test with the new keys; add a `probes.test.ts` (or extend wherever bot findings are tested today) case asserting the new bots produce `bot-*`/`train-*` findings.

**Effort:** small — same shape as existing code, no new parsing logic.

---

## 2. TDM Reservation Protocol (TDMRep) support (new site probe, `crawlAccess`)

**Why:** Emerging (2024–2025) standard for expressing text-and-data-mining consent separately from crawl access — `robots.txt: TDM-Reservation: 1` directive and/or `/.well-known/tdmrep.json`. Nothing today checks AI-training consent independent of `Disallow`.

**Implementation:**
- `probes.ts`: new function `checkTdmRep(robotsBody: string, tdmrepJson: Resource)`.
  - Parse `robotsBody` for a top-level `TDM-Reservation:` line (not tied to a specific `User-agent:` block).
  - Probe `/.well-known/tdmrep.json` (new `probe('/.well-known/tdmrep.json')` call, same pattern as the existing `/.well-known/mcp.json` probe).
  - Emit one finding, id `tdmrep`, `severity: 'warn'` if neither signal is present (informational gap, not a hard fail — this is emerging, like `mcp-json`), `pass` if either is present.
- `score.ts`: add `tdmrep` to `CRITERION_CATALOG` — `category: 'discovery'`, `standard: 'emerging'` (20% weight, same tier as `mcp-json`), `scope: 'site'`, `issueSeverity: 'warn'`.
- `check-refs.ts`: new `CheckRef` — title "TDM Reservation Protocol", publisher a placeholder for the current spec home (W3C Community Group draft), `kind: 'convention'` until it reaches spec status.
- Tests: unit test for the robots-line parser (present/absent), unit test for the JSON-probe path, catalog + check-refs coverage tests.

**Effort:** medium — new parsing logic plus a new probe call, but isolated and additive.

---

## 3. AI-specific meta/header opt-out: `noai` / `noimageai` (page check, `crawlAccess`)

**Why:** `<meta name="robots" content="noai, noimageai">` and the `X-Robots-Tag: noai` HTTP header are a distinct, growing convention for opting out of AI training while remaining searchable (separate from `noindex`, which is already checked).

**Implementation:**
- `analyze.ts`: next to the existing `robotsMeta` extraction and `noindex` finding, add:
  - Parse the same `meta[name="robots"]` content for `noai` / `noimageai` tokens.
  - Also inspect `resource.headers['x-robots-tag']` for the same tokens (requires `FetchedResource.headers` to already be available — it is, per the `httpObserved` usage of `resource.headers` elsewhere... verify header casing/lookup helper used in the codebase before assuming lowercase keys).
  - New finding id `noai-${url}`, `severity: 'pass'` when absent (default — page is available for training) and a distinct **informational** finding (not `fail`) when present, since blocking AI training is a legitimate publisher choice, not a defect. This mirrors the `training-bots` informational pattern rather than the `noindex` fail pattern.
- `score.ts`: add `noai` to `CRITERION_CATALOG` — `category: 'crawlAccess'`, `scope: 'page'`, `sparse: true`, `informational: true` (does not move the score, same treatment as `train-Google-Extended`).
- `check-refs.ts`: map to a new `CheckRef` for the `noai`/`noimageai` convention (no single canonical RFC; cite the most authoritative current publisher doc, e.g. Google's or a CMS vendor's noai documentation, `kind: 'convention'`).
- Tests: extend `tests/analyze.test.ts` with cases for meta-only, header-only, both-absent, and both-present.

**Effort:** small–medium — depends on confirming header lookup casing in `FetchedResource`.

---

## 4. Structured data depth: FAQPage / Article / Organization schema (page check, `extractability` or new sub-check)

**Why:** JSON-LD is currently presence-only (explicitly deferred as "phase 2" in `analyze.ts` comments). For AEO specifically, `FAQPage`/`HowTo`/`Article`/`Organization` types are what answer engines lift into direct answers — this is the single highest-value gap versus generic "has JSON-LD."

**Implementation:**
- `analyze.ts`: after existing `jsonld` count, parse each `<script type="application/ld+json">` block as JSON (guarded by try/catch — malformed JSON-LD is common and must not crash the audit), collect the `@type` value(s) (string or array).
- New finding `schema-type-${url}`:
  - `pass` if at least one of `FAQPage`, `HowTo`, `Article`, `NewsArticle`, `Organization`, `Person` is present.
  - `warn` otherwise (JSON-LD present but none of the answer-relevant types, or JSON-LD absent).
  - Do **not** fail — this stays a rate check like `h1`/`canonical`, not a hard requirement.
- `score.ts`: add `schema-type` to `CRITERION_CATALOG` — `category: 'extractability'`, `standard: 'established'`, `scope: 'page'` (rate, not sparse — every page gets a verdict, same as `h1`/`canonical`).
- `check-refs.ts`: reuse `JSON_LD` ref (same underlying spec) or add a schema.org-specific `CheckRef` (`https://schema.org/docs/schemas.html`), `kind: 'spec'`.
- Tests: extend `tests/analyze.test.ts` with pages containing `FAQPage`, `Article`, unrelated types (`WebSite` only), and malformed JSON-LD (must not throw).

**Effort:** medium — JSON parsing/type-matching is new logic; malformed-input handling needs care.

---

## 5. `llms.txt` structural validation (upgrade existing site probe, `discovery`)

**Why:** Today's `llms-txt` / `llms-full` checks only verify the file is reachable (`probeObserved`). A 200 response with garbage content still passes. The llms.txt convention (llmstxt.org) specifies: H1 title, optional blockquote summary, `##`-headed linked sections.

**Implementation:**
- `probes.ts`: after the existing `llms` probe, if `llms.ok`, run a lightweight structural check on `llms.bodyText`:
  - Has an `# ` H1 line.
  - Has at least one `## ` section with at least one markdown link `[text](url)` under it.
  - Downgrade the existing `llms-txt` finding from `pass` to `warn` if reachable but structurally invalid (keep `fail`/`warn` semantics conservative — this file being optional already, per `standard: 'convention'`).
- No new catalog key needed — this refines the existing `llms-txt` finding's severity logic, not a new criterion. Update the `detail` text to state which structural element is missing, per the earlier "make failures self-explanatory" fix applied to bot findings.
- Tests: extend the llms.txt probe test(s) with well-formed, no-H1, and no-linked-sections fixtures.

**Effort:** small — pure text-parsing addition to an existing probe, no schema changes.

---

## Suggested implementation order

1. Bot list expansion (#1) — lowest risk, same pattern as shipped code, immediate report value.
2. `llms.txt` structural validation (#5) — small, no schema/catalog changes, improves an existing check's accuracy.
3. `noai`/`noimageai` (#3) — needs header-casing verification but otherwise additive and isolated.
4. TDMRep (#2) — new probe + parser, larger but self-contained.
5. Schema type depth (#4) — highest implementation risk (JSON parsing edge cases) and highest AEO value; do last so the parsing pattern can reuse lessons from #2/#3.

## Open questions before implementation

- Confirm `FetchedResource.headers` key casing (`x-robots-tag` vs `X-Robots-Tag`) in `@lynx/crawler-core` before writing #3.
- Confirm whether `SCORE_MODEL_VERSION` should bump per-criterion or once for the whole batch — recommend bumping once after all five ship, to avoid repeated `rubricChanged` breaks for users comparing audits mid-rollout.
- Decide canonical doc reference for `noai`/`noimageai` and TDMRep — no single IETF/W3C RFC exists yet for either; need a publisher-backed URL that satisfies the `kind: 'convention'` bar enforced by `tests/check-refs.test.ts`.
