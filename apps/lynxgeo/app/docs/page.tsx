import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { checkRefForKey } from '@/lib/geo/check-refs';
import {
  CATEGORY_META,
  CATEGORY_WEIGHTS,
  CRITERION_CATALOG,
  SCORE_MODEL_VERSION,
  SEVERITY_POINTS,
  STANDARD_WEIGHT,
  criterionScoreBlurb,
  type FindingCategory,
  type FindingSeverity,
  type FindingStandard,
} from '@/lib/geo/score';
import { loadVocabIndex } from '@/lib/geo/schemaorg/vocab';

export const metadata = {
  title: 'Docs · Lynx GEO',
  description: 'How Lynx GEO scores AI discoverability (geo-1.2 category weights, page rates, schema.org validation).',
};

const CATEGORY_ORDER: FindingCategory[] = [
  'crawlAccess',
  'extractability',
  'negotiation',
  'discovery',
  'citeability',
];

function standardBadge(standard: FindingStandard) {
  if (standard === 'established') return <Badge>established</Badge>;
  if (standard === 'convention') return <Badge variant="secondary">convention</Badge>;
  return <Badge variant="outline">emerging</Badge>;
}

function OfficialSource({ criterionKey }: { criterionKey: string }) {
  const ref = checkRefForKey(criterionKey);
  if (!ref) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      <a
        href={ref.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-start gap-1 text-primary hover:underline underline-offset-2"
      >
        <span>{ref.title}</span>
        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      </a>
      <div className="mt-1 text-xs text-muted-foreground">
        {ref.publisher} · {ref.kind}
      </div>
    </>
  );
}

function severityBadge(severity: FindingSeverity) {
  if (severity === 'fail') return <Badge variant="destructive">fail</Badge>;
  if (severity === 'warn') return <Badge variant="warning">warn</Badge>;
  return <Badge variant="success">pass</Badge>;
}

export default function DocsPage() {
  const vocab = loadVocabIndex();
  const schemaOrgRef = checkRefForKey('schemaorg');
  const schemaRichRef = checkRefForKey('schema-rich');

  return (
    <div className="w-full max-w-[1600px] mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-8 sm:space-y-10">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary font-bold">{SCORE_MODEL_VERSION}</p>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Docs</h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-3xl">
          Lynx GEO is a technical audit of AI discoverability and agent-readiness. The overall score is not a Google
          ranking prediction, and publishing <code>llms.txt</code> does not make Google Search (or anyone else) rank
          you higher. Page crawl stays under the start URL path (same host, different prefix is out of scope).
          Site probes still check origin-root files such as <code>robots.txt</code> and <code>llms.txt</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How {SCORE_MODEL_VERSION} scores a site</CardTitle>
          <CardDescription>
            Category weights are unchanged from geo-1.0. {SCORE_MODEL_VERSION} adds schema.org vocabulary validation
            on JSON-LD (plus optional Google Rich Results field warnings) on top of the geo-1.1.0 crawl and discovery
            criteria, while keeping page-rate aggregation from geo-1.0.1.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Each <strong>unique check</strong> (robots.txt, date markup, JSON-LD, …) gets one vote in its category —
              not one vote per crawled URL.
            </li>
            <li>
              <strong>Page-level</strong> checks use the pass / warn / fail <strong>rate</strong> across pages. Sparse
              checks (noindex, cookie wall, huge HTML, schema.org) treat pages without the issue as pass.
            </li>
            <li>
              <strong>Site-level</strong> probes (robots, llms.txt, Accept markdown, origin HTTPS) remain a single
              observation each. AI search bots share one rate so five bot rows cannot outweigh robots.txt.
            </li>
            <li>
              Points per observation: pass {SEVERITY_POINTS.pass}, warn {SEVERITY_POINTS.warn}, fail{' '}
              {SEVERITY_POINTS.fail}. Fail, warn, and pass stay distinct.
            </li>
            <li>
              Inside a category, established checks count at {Math.round(STANDARD_WEIGHT.established * 100)}%,
              convention at {Math.round(STANDARD_WEIGHT.convention * 100)}%, emerging at{' '}
              {Math.round(STANDARD_WEIGHT.emerging * 100)}%. Training-bot rows are informational and do not change the
              number.
            </li>
            <li>
              JSON-LD <code>jsonld</code> is presence-only. Vocabulary correctness is a separate sparse{' '}
              <code>schemaorg</code> check; Google required fields are sparse <code>schema-rich</code> warnings.
            </li>
          </ul>
          <p className="text-muted-foreground">
            Comparing two audits is only valid when <code>scoreModelVersion</code> matches. geo-1.0 / geo-1.1.0 vs{' '}
            {SCORE_MODEL_VERSION} is a rubric change (<code>rubricChanged</code> on compare).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schema.org validation</CardTitle>
          <CardDescription>
            Layer A vocabulary checks against a pinned official schema.org release — the usual approach for crawl-time
            tools. This is not a call to validator.schema.org or Google’s live Rich Results Test.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            Audits reuse the HTML already fetched for each page (one GET per URL). JSON-LD blocks are parsed locally
            and checked against schema.org <strong>{vocab.version}</strong> shipped in-repo. There is no second page
            fetch and no network call to schema.org during an audit.
          </p>
          <p>
            Two layers stay separate on purpose: <strong>schema.org vocabulary correctness</strong> (types and
            properties exist and belong on that type) is not the same as <strong>Google Rich Results eligibility</strong>{' '}
            (Google’s required fields for a search feature). Markup can pass one and fail the other.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>fail</strong> — malformed JSON-LD; unknown <code>@type</code>; unknown property; property not
              allowed on the node’s type(s) per official <code>domainIncludes</code> (including inheritance).
            </li>
            <li>
              <strong>warn</strong> (vocab) — obvious <code>rangeIncludes</code> mismatches (for example a typed object
              where only Text is allowed).
            </li>
            <li>
              <strong>warn</strong> (Google) — a curated type is present but Google-documented required properties are
              missing. Labeled as Google guidance, never as “invalid schema.org.”
            </li>
          </ul>
          <p className="text-muted-foreground">
            We do <em>not</em> invent a homemade allowlist of “must use FAQPage / HowTo.” We also do not yet judge
            whether the JSON-LD matches page content (that would be a later content-aware layer).
          </p>
          <div className="space-y-2">
            {schemaOrgRef ? (
              <div>
                <a
                  href={schemaOrgRef.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1 text-primary hover:underline underline-offset-2"
                >
                  <span>{schemaOrgRef.title}</span>
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                </a>
                <div className="text-xs text-muted-foreground">
                  {schemaOrgRef.publisher} · {schemaOrgRef.kind} · pin {vocab.version}
                </div>
              </div>
            ) : null}
            {schemaRichRef ? (
              <div>
                <a
                  href={schemaRichRef.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1 text-primary hover:underline underline-offset-2"
                >
                  <span>{schemaRichRef.title}</span>
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                </a>
                <div className="text-xs text-muted-foreground">
                  {schemaRichRef.publisher} · {schemaRichRef.kind}
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-2xl font-bold">Category weights</h2>
        <p className="text-sm text-muted-foreground">
          Same geo-1.0 mix. Empty categories (no findings) score 80 so a missing bucket does not pretend to be
          perfect.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {CATEGORY_ORDER.map((key) => {
            const meta = CATEGORY_META[key];
            return (
              <Card key={key}>
                <CardHeader className="p-4 space-y-2">
                  <CardTitle className="text-sm">{meta.label}</CardTitle>
                  <div className="text-2xl font-black text-primary">{Math.round(CATEGORY_WEIGHTS[key] * 100)}%</div>
                  <CardDescription className="text-xs">{meta.summary}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const meta = CATEGORY_META[category];
        const rows = CRITERION_CATALOG.filter((c) => c.category === category);
        return (
          <section key={category} className="space-y-3">
            <div>
              <h2 className="text-2xl font-bold">{meta.label}</h2>
              <p className="text-sm text-muted-foreground">{meta.summary}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="p-3 font-semibold">Check</th>
                    <th className="p-3 font-semibold">Official source</th>
                    <th className="p-3 font-semibold">Standard</th>
                    <th className="p-3 font-semibold">If it fails</th>
                    <th className="p-3 font-semibold">How it scores</th>
                    <th className="p-3 font-semibold">Why it matters</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-t border-border align-top">
                      <td className="p-3">
                        <div className="font-medium">{row.title}</div>
                        <div className="text-xs text-muted-foreground font-mono">{row.key}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {row.scope === 'site' ? 'Site probe' : row.sparse ? 'Page (sparse)' : 'Page rate'}
                        </div>
                      </td>
                      <td className="p-3 max-w-xs">
                        <OfficialSource criterionKey={row.key} />
                      </td>
                      <td className="p-3">{standardBadge(row.standard)}</td>
                      <td className="p-3">
                        {row.informational ? (
                          <span className="text-muted-foreground">n/a (informational)</span>
                        ) : (
                          severityBadge(row.issueSeverity)
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground max-w-xs">{criterionScoreBlurb(row)}</td>
                      <td className="p-3 max-w-sm">{row.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
