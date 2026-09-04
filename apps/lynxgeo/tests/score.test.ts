import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aggregateScore,
  CATEGORY_WEIGHTS,
  collectAuditFindings,
  CRITERION_CATALOG,
  groupCriteria,
  playbook,
  resolveAbsoluteUrl,
  SCORE_MODEL_VERSION,
  SEVERITY_POINTS,
  type Finding,
} from '../lib/geo/score';

test('geo-1.1.0 keeps category weights that sum to 1.00', () => {
  const sum = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(Number(sum.toFixed(2)), 1);
  assert.equal(CATEGORY_WEIGHTS.crawlAccess, 0.28);
  assert.equal(CATEGORY_WEIGHTS.extractability, 0.28);
  assert.equal(CATEGORY_WEIGHTS.negotiation, 0.18);
  assert.equal(CATEGORY_WEIGHTS.discovery, 0.16);
  assert.equal(CATEGORY_WEIGHTS.citeability, 0.1);
  assert.equal(SCORE_MODEL_VERSION, 'geo-1.1.0');
});

test('geo-1.0 weights sum to 1.00 via a perfect score', () => {
  const findings: Finding[] = [
    { id: 'a', category: 'crawlAccess', title: 'ok', detail: '', severity: 'pass', standard: 'established', suggestion: '' },
    { id: 'b', category: 'extractability', title: 'ok', detail: '', severity: 'pass', standard: 'established', suggestion: '' },
    { id: 'c', category: 'negotiation', title: 'ok', detail: '', severity: 'pass', standard: 'established', suggestion: '' },
    { id: 'd', category: 'discovery', title: 'ok', detail: '', severity: 'pass', standard: 'convention', suggestion: '' },
    { id: 'e', category: 'citeability', title: 'ok', detail: '', severity: 'pass', standard: 'established', suggestion: '' },
  ];
  const { overall, categories } = aggregateScore(findings);
  assert.equal(overall, 100);
  assert.equal(categories.crawlAccess, 100);
  assert.equal(playbook(findings).length, 0);
});

test('failures reduce crawlAccess more than warnings', () => {
  const findings: Finding[] = [
    { id: 'fail', category: 'crawlAccess', title: 'blocked', detail: '', severity: 'fail', standard: 'established', suggestion: 'fix' },
    { id: 'warn', category: 'discovery', title: 'llms', detail: '', severity: 'warn', standard: 'convention', suggestion: 'add' },
  ];
  const { categories } = aggregateScore(findings);
  assert.equal(categories.crawlAccess, SEVERITY_POINTS.fail);
  assert.equal(categories.discovery, SEVERITY_POINTS.warn);
  assert.ok(categories.crawlAccess < categories.discovery);
  assert.equal(playbook(findings).length, 2);
});

test('playbook groups the same check across pages and keeps site-level items distinct', () => {
  const pages = [
    'https://www.example.com/a',
    'https://www.example.com/b',
    'https://www.example.com/c',
    'https://www.example.com/d',
  ];
  const dates: Finding[] = pages.map((url) => ({
    id: `date-${url}`,
    category: 'citeability',
    title: 'No visible date markup',
    detail: `Checked <time> on ${url} — none present.`,
    severity: 'warn',
    standard: 'established',
    suggestion: `On ${url}, add a visible <time datetime>.`,
    url,
  }));
  const site: Finding[] = [
    {
      id: 'llms-txt',
      category: 'discovery',
      title: 'llms.txt not found',
      detail: 'HTTP 404, Content-Type: text/html for https://www.example.com/llms.txt',
      severity: 'warn',
      standard: 'convention',
      suggestion: 'Optional: add https://www.example.com/llms.txt',
      url: 'https://www.example.com/llms.txt',
    },
    {
      id: 'mcp-json',
      category: 'discovery',
      title: 'No /.well-known/mcp.json',
      detail: 'HTTP 404 for https://www.example.com/.well-known/mcp.json',
      severity: 'warn',
      standard: 'emerging',
      suggestion: 'Optional: publish https://www.example.com/.well-known/mcp.json',
      url: 'https://www.example.com/.well-known/mcp.json',
    },
  ];
  const items = playbook([...dates, ...site]);
  assert.equal(items.length, 3);
  const dateGroup = items.find((i) => i.title === 'No visible date markup');
  assert.ok(dateGroup);
  assert.equal(dateGroup.count, 4);
  assert.deepEqual(dateGroup.urls, pages);
  assert.match(dateGroup.detail, /4 pages/);
  assert.match(dateGroup.suggestion, /these pages/);
  assert.equal(items.filter((i) => i.id.startsWith('llms-txt') || i.title.includes('llms')).length, 1);
  assert.equal(items.filter((i) => i.title.includes('mcp.json')).length, 1);

  const again = playbook(items);
  assert.equal(again.length, 3);
  assert.equal(again.find((i) => i.title === 'No visible date markup')?.count, 4);
});

function finding(partial: Partial<Finding> & Pick<Finding, 'id' | 'title' | 'severity'>): Finding {
  return {
    category: 'citeability',
    detail: '',
    standard: 'established',
    suggestion: '',
    ...partial,
  };
}

test('groupCriteria includes passes and buckets URLs by severity for the same check', () => {
  const pages = ['https://www.example.com/a', 'https://www.example.com/b', 'https://www.example.com/c'];
  const findings: Finding[] = [
    finding({
      id: `md-alt-${pages[0]}`,
      title: 'Markdown alternate link present',
      detail: `1 rel=alternate markdown link(s) on ${pages[0]}.`,
      severity: 'pass',
      category: 'negotiation',
      standard: 'convention',
      url: pages[0],
    }),
    finding({
      id: `md-alt-${pages[1]}`,
      title: 'No markdown rel=alternate',
      detail: `No markdown alternate on ${pages[1]}.`,
      severity: 'warn',
      category: 'negotiation',
      standard: 'convention',
      suggestion: `Optionally advertise markdown on ${pages[1]}.`,
      url: pages[1],
    }),
    finding({
      id: `md-alt-${pages[2]}`,
      title: 'No markdown rel=alternate',
      detail: `No markdown alternate on ${pages[2]}.`,
      severity: 'warn',
      category: 'negotiation',
      standard: 'convention',
      suggestion: `Optionally advertise markdown on ${pages[2]}.`,
      url: pages[2],
    }),
    finding({
      id: `date-${pages[0]}`,
      title: 'Date markup present',
      detail: `Observed <time> on ${pages[0]}.`,
      severity: 'pass',
      url: pages[0],
    }),
    finding({
      id: 'llms-txt',
      category: 'discovery',
      title: 'llms.txt found',
      detail: 'HTTP 200 for https://www.example.com/llms.txt',
      severity: 'pass',
      standard: 'convention',
      url: 'https://www.example.com/llms.txt',
    }),
  ];
  const items = groupCriteria(findings);
  const md = items.find((i) => i.key === 'md-alt');
  assert.ok(md);
  assert.equal(md.title, 'Markdown rel=alternate');
  assert.equal(md.counts.pass, 1);
  assert.equal(md.counts.warn, 2);
  assert.equal(md.counts.fail, 0);
  assert.deepEqual(md.urls.pass.map((u) => u.url), [pages[0]]);
  assert.deepEqual(md.urls.warn.map((u) => u.url).sort(), [pages[1], pages[2]].sort());
  assert.ok(md.suggestion);

  const dates = items.find((i) => i.key === 'date');
  assert.ok(dates);
  assert.equal(dates.counts.pass, 1);
  assert.equal(dates.severity, 'pass');

  const llms = items.find((i) => i.key === 'llms-txt');
  assert.ok(llms);
  assert.deepEqual(llms.urls.pass.map((u) => u.url), ['https://www.example.com/llms.txt']);
});

test('groupCriteria lists absolute URLs and does not glue this page onto paths', () => {
  const origin = 'https://www.novartis.com/';
  const about = 'https://www.novartis.com/about';
  const findings: Finding[] = [
    finding({
      id: `canonical-${origin}`,
      category: 'extractability',
      title: 'Canonical link present',
      detail: `rel=canonical href="${origin}"`,
      severity: 'pass',
      url: origin,
    }),
    finding({
      id: `canonical-${about}`,
      category: 'extractability',
      title: 'Canonical link present',
      detail: 'rel=canonical href="/about"',
      severity: 'pass',
      url: about,
    }),
    finding({
      id: `canonical-https://www.novartis.com/about/novartis-us`,
      category: 'extractability',
      title: 'Canonical link present',
      detail: 'rel=canonical href="/about/novartis-us"',
      severity: 'warn',
      url: 'https://www.novartis.com/about/novartis-us',
    }),
  ];
  const items = groupCriteria(findings, { baseUrl: origin });
  const canonical = items.find((i) => i.key === 'canonical');
  assert.ok(canonical);
  assert.equal(canonical.detail.includes('this pageabout'), false);
  assert.equal(canonical.detail.includes(' · '), false);
  assert.match(canonical.detail, /3 pages/);
  assert.ok(canonical.urls.pass.every((u) => u.url.startsWith('https://')));
  assert.deepEqual(
    canonical.urls.pass.map((u) => u.url).sort(),
    [resolveAbsoluteUrl(origin), resolveAbsoluteUrl(about)].sort(),
  );
  assert.equal(canonical.urls.warn[0]?.url, 'https://www.novartis.com/about/novartis-us');
  assert.match(canonical.urls.pass.find((u) => u.url.includes('/about'))?.detail || '', /https:\/\/www\.novartis\.com\/about/);
});

test('collectAuditFindings prefers snapshot findings so site-level passes are kept', () => {
  const snapshotFindings: Finding[] = [
    finding({
      id: 'llms-txt',
      category: 'discovery',
      title: 'llms.txt found',
      severity: 'pass',
      standard: 'convention',
      url: 'https://www.example.com/llms.txt',
    }),
    finding({
      id: 'date-https://www.example.com/a',
      title: 'Date markup present',
      severity: 'pass',
      url: 'https://www.example.com/a',
    }),
  ];
  const fromSnapshot = collectAuditFindings({
    pages: [{ findings: JSON.stringify([snapshotFindings[1]]) }],
    snapshotFindings,
    playbook: [],
  });
  assert.equal(fromSnapshot.length, 2);

  const pageOnly = collectAuditFindings({
    pages: [
      {
        findings: JSON.stringify([
          finding({
            id: 'date-https://www.example.com/a',
            title: 'No visible date markup',
            severity: 'warn',
            suggestion: 'Add a date',
            url: 'https://www.example.com/a',
          }),
        ]),
      },
    ],
    snapshotFindings: [],
    playbook: [
      finding({
        id: 'llms-txt|warn|llms.txt not found',
        category: 'discovery',
        title: 'llms.txt not found',
        severity: 'warn',
        standard: 'convention',
        suggestion: 'Optional: add llms.txt',
        url: 'https://www.example.com/llms.txt',
      }),
    ],
  });
  assert.equal(pageOnly.length, 2);
  assert.ok(pageOnly.some((f) => f.title.includes('llms')));
  const grouped = groupCriteria(pageOnly);
  assert.ok(grouped.find((c) => c.key === 'date'));
  assert.ok(grouped.find((c) => c.key === 'llms-txt'));
});

test('collectAuditFindings drops HTML title checks on sitemap.xml and PDFs', () => {
  const sitemap = 'https://www.novartis.com/sitemap.xml';
  const pdf = 'https://www.novartis.com/files/report.pdf';
  const page = 'https://www.novartis.com/about';
  const snapshotFindings: Finding[] = [
    finding({
      id: `title-${sitemap}`,
      title: 'Missing title',
      detail: `No <title> element in the HTML of ${sitemap}.`,
      severity: 'fail',
      url: sitemap,
    }),
    finding({
      id: `title-${pdf}`,
      title: 'Missing title',
      detail: `No <title> element in the HTML of ${pdf}.`,
      severity: 'fail',
      url: pdf,
    }),
    finding({
      id: `title-${page}`,
      title: 'Title is present',
      detail: '<title>About</title>',
      severity: 'pass',
      url: page,
    }),
    finding({
      id: 'sitemap',
      category: 'crawlAccess',
      title: 'sitemap.xml found',
      detail: `HTTP 200, Content-Type: application/xml for ${sitemap}.`,
      severity: 'pass',
      url: sitemap,
    }),
  ];
  const collected = collectAuditFindings({ snapshotFindings, pages: [], playbook: [] });
  assert.equal(
    collected.some((f) => f.id.startsWith('title-') && f.url === sitemap),
    false,
  );
  assert.equal(
    collected.some((f) => f.id.startsWith('title-') && f.url === pdf),
    false,
  );
  assert.ok(collected.some((f) => f.id === `title-${page}`));
  assert.ok(collected.some((f) => f.id === 'sitemap'));

  const grouped = groupCriteria(collected);
  const title = grouped.find((c) => c.key === 'title');
  assert.ok(title);
  assert.equal(title.counts.fail, 0);
  assert.equal(
    title.urls.fail.some((row) => row.url.includes('sitemap.xml')),
    false,
  );
});

function pageFinding(
  key: string,
  url: string,
  severity: Finding['severity'],
  extra: Partial<Finding> = {},
): Finding {
  return {
    id: `${key}-${url}`,
    category: extra.category || 'citeability',
    title: extra.title || key,
    detail: extra.detail || url,
    severity,
    standard: extra.standard || 'established',
    suggestion: extra.suggestion || '',
    url,
    ...extra,
    id: extra.id || `${key}-${url}`,
  };
}

test('many identical page date warns do not zero citeability when HTTPS and titles pass', () => {
  const pages = Array.from({ length: 79 }, (_, i) => `https://www.example.com/p/${i}`);
  const findings: Finding[] = [
    {
      id: 'https-origin',
      category: 'citeability',
      title: 'Origin is HTTPS',
      detail: 'https://www.example.com',
      severity: 'pass',
      standard: 'established',
      suggestion: '',
      url: 'https://www.example.com',
    },
    ...pages.flatMap((url) => [
      pageFinding('title', url, 'pass', { title: 'Title is present' }),
      pageFinding('https', url, 'pass', { title: 'Page served over HTTPS' }),
      pageFinding('date', url, 'warn', { title: 'No visible date markup' }),
    ]),
  ];
  const { categories } = aggregateScore(findings);
  assert.ok(categories.citeability > 80, `citeability was ${categories.citeability}`);
  assert.ok(categories.citeability < 100, `citeability was ${categories.citeability}`);
  assert.equal(categories.citeability, 93);
});

test('date-warn rate is independent of crawl size when every page warns', () => {
  const make = (n: number): Finding[] =>
    Array.from({ length: n }, (_, i) =>
      pageFinding('date', `https://www.example.com/${i}`, 'warn', { title: 'No visible date markup' }),
    );
  const small = aggregateScore(make(4));
  const large = aggregateScore(make(79));
  assert.equal(small.categories.citeability, SEVERITY_POINTS.warn);
  assert.equal(large.categories.citeability, small.categories.citeability);
});

test('missing llms.txt convention does not zero discovery, and mcp.json cannot dominate', () => {
  const llmsWarn: Finding = {
    id: 'llms-txt',
    category: 'discovery',
    title: 'llms.txt not found',
    detail: '',
    severity: 'warn',
    standard: 'convention',
    suggestion: 'add',
    url: 'https://www.example.com/llms.txt',
  };
  const llmsFullWarn: Finding = {
    ...llmsWarn,
    id: 'llms-full',
    title: 'llms-full.txt not found',
    url: 'https://www.example.com/llms-full.txt',
  };
  const mcpWarn: Finding = {
    ...llmsWarn,
    id: 'mcp-json',
    title: 'No /.well-known/mcp.json',
    standard: 'emerging',
    url: 'https://www.example.com/.well-known/mcp.json',
  };
  const mcpPass: Finding = { ...mcpWarn, title: 'mcp.json found', severity: 'pass' };

  const allMissing = aggregateScore([llmsWarn, llmsFullWarn, mcpWarn]);
  assert.equal(allMissing.categories.discovery, SEVERITY_POINTS.warn);
  assert.ok(allMissing.categories.discovery > 0);

  const onlyEmergingPass = aggregateScore([llmsWarn, llmsFullWarn, mcpPass]);
  const equalWeightIfEmergingDominated = Math.round((70 + 70 + 100) / 3);
  assert.ok(
    onlyEmergingPass.categories.discovery < equalWeightIfEmergingDominated,
    `emerging pass scored ${onlyEmergingPass.categories.discovery}, equal-weight would be ${equalWeightIfEmergingDominated}`,
  );
  assert.ok(onlyEmergingPass.categories.discovery > allMissing.categories.discovery);
});

test('Google-Extended is informational and does not change crawlAccess', () => {
  const robots: Finding = {
    id: 'robots-present',
    category: 'crawlAccess',
    title: 'robots.txt is reachable',
    detail: '',
    severity: 'pass',
    standard: 'established',
    suggestion: '',
    url: 'https://www.example.com/robots.txt',
  };
  const googlebot: Finding = {
    id: 'bot-Googlebot',
    category: 'crawlAccess',
    title: 'Googlebot (Search) is allowed',
    detail: '',
    severity: 'pass',
    standard: 'established',
    suggestion: '',
    url: 'https://www.example.com/robots.txt',
  };
  const extended: Finding = {
    id: 'train-Google-Extended',
    category: 'crawlAccess',
    title: 'Google-Extended (training) allowed',
    detail: '',
    severity: 'pass',
    standard: 'established',
    suggestion: 'Consider blocking',
    url: 'https://www.example.com/robots.txt',
  };
  const without = aggregateScore([robots, googlebot]);
  const withExtended = aggregateScore([robots, googlebot, extended]);
  assert.equal(without.categories.crawlAccess, withExtended.categories.crawlAccess);
  assert.equal(without.categories.crawlAccess, 100);
});

test('Googlebot fail is scored separately from AI search bots', () => {
  const robots: Finding = {
    id: 'robots-present',
    category: 'crawlAccess',
    title: 'robots.txt is reachable',
    detail: '',
    severity: 'pass',
    standard: 'established',
    suggestion: '',
    url: 'https://www.example.com/robots.txt',
  };
  const googlebotFail: Finding = {
    id: 'bot-Googlebot',
    category: 'crawlAccess',
    title: 'Googlebot (Search) is disallowed',
    detail: '',
    severity: 'fail',
    standard: 'established',
    suggestion: 'allow',
    url: 'https://www.example.com/robots.txt',
  };
  const gptPass: Finding = {
    id: 'bot-GPTBot',
    category: 'crawlAccess',
    title: 'GPTBot is allowed',
    detail: '',
    severity: 'pass',
    standard: 'established',
    suggestion: '',
    url: 'https://www.example.com/robots.txt',
  };
  const { categories } = aggregateScore([robots, googlebotFail, gptPass]);
  assert.ok(categories.crawlAccess < 100);
  assert.ok(categories.crawlAccess > SEVERITY_POINTS.fail);
});

test('catalog lists every scored check', () => {
  const keys = CRITERION_CATALOG.map((c) => c.key);
  for (const key of [
    'robots',
    'bot-GPTBot',
    'bot-OAI-SearchBot',
    'bot-ChatGPT-User',
    'bot-ClaudeBot',
    'bot-PerplexityBot',
    'bot-Bingbot',
    'bot-Meta-ExternalAgent',
    'bot-Amazonbot',
    'bot-YouBot',
    'bot-Googlebot',
    'train-Google-Extended',
    'train-CCBot',
    'train-Bytespider',
    'train-Applebot-Extended',
    'train-Diffbot',
    'sitemap',
    'llms-txt',
    'llms-full',
    'mcp-json',
    'tdmrep',
    'accept-markdown',
    'vary-accept',
    'https-origin',
    'title',
    'h1',
    'canonical',
    'lang',
    'hreflang',
    'jsonld',
    'md-alt',
    'noindex',
    'noai',
    'wall',
    'date',
    'https',
    'size',
    'http',
    'ssrf',
    'excluded',
  ]) {
    assert.ok(keys.includes(key), `missing catalog key ${key}`);
  }
});
