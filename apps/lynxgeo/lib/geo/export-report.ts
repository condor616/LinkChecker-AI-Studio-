import { findingUrls } from './score';
import type { FrozenSnapshot } from './snapshot';

export function snapshotToJson(name: string, startUrl: string, snapshot: FrozenSnapshot) {
  return JSON.stringify({ name, startUrl, ...snapshot }, null, 2);
}

export function snapshotToCsv(snapshot: FrozenSnapshot) {
  const header = ['severity', 'standard', 'category', 'title', 'url', 'detail', 'suggestion'];
  const rows = snapshot.findings.map((f) =>
    [f.severity, f.standard, f.category, f.title, f.url || '', f.detail, f.suggestion].map(csvCell).join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

function csvCell(value: string) {
  const escaped = value.replace(/"/g, '""').replace(/\r?\n/g, ' ');
  return `"${escaped}"`;
}

export function snapshotToHtml(name: string, startUrl: string, snapshot: FrozenSnapshot) {
  const items = snapshot.playbook
    .map((f) => {
      const urls = findingUrls(f);
      const where = urls.length
        ? `<br><small>${urls.map((u) => escapeHtml(u)).join('<br>')}</small>`
        : '';
      const count = f.count && f.count > 1 ? ` ×${f.count}` : '';
      return `<li><strong>${escapeHtml(f.severity)}</strong> [${escapeHtml(f.standard)}] ${escapeHtml(f.title)}${count}${where}<br>${escapeHtml(f.detail)}<br>${escapeHtml(f.suggestion || '')}</li>`;
    })
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(name)} — Lynx GEO</title></head>
<body>
<h1>${escapeHtml(name)}</h1>
<p>${escapeHtml(startUrl)}</p>
<p>Score ${snapshot.score} (${escapeHtml(snapshot.scoreModelVersion)})</p>
<ul>${items}</ul>
<p>Schema.org vocabulary validation is phase 2 and is not included in this report.</p>
</body></html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
