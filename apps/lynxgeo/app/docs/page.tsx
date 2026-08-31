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

export const metadata = {
  title: 'Docs · Lynx GEO',
  description: 'How Lynx GEO scores AI discoverability (geo-1.0 category weights, page rates, conventions).',
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
  return (
    <div className="max-w-5xl mx-auto p-8 space-y-10">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-primary font-bold">{SCORE_MODEL_VERSION}</p>
        <h1 className="text-4xl font-black tracking-tight">Docs</h1>
        <p className="text-lg text-muted-foreground max-w-3xl">
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
            Category weights are unchanged from geo-1.0. The {SCORE_MODEL_VERSION} patch changed aggregation: page
            checks score as rates (or grouped criteria), so 79 identical “no date markup” warnings cannot zero
            citeability.
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
              checks (noindex, cookie wall, huge HTML) treat pages without the issue as pass.
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
              JSON-LD is presence-only. Schema.org type validation is phase 2 (official schema.org vocabulary, not a
              homemade list).
            </li>
          </ul>
          <p className="text-muted-foreground">
            Comparing two audits is only valid when <code>scoreModelVersion</code> matches. geo-1.0 vs{' '}
            {SCORE_MODEL_VERSION} is a rubric change (<code>rubricChanged</code> on compare).
          </p>
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
              <table className="w-full text-sm">
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
