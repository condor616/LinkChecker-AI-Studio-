import { scans, links } from '../db/schema';

export interface ExportData {
    scan: any;
    links: any[];
}

export function filterAndGroupLinks(links: any[], scanConfig: any) {
    const startUrl = scanConfig.startUrl || '';
    const internalDomain = startUrl ? new URL(startUrl).hostname.toLowerCase().replace(/^www\./, '') : '';
    const isTargeted = !!scanConfig.isTargeted && (scanConfig.targetUrls?.length > 0);
    const targetUrls = scanConfig.targetUrls || [];

    const isUrlInternal = (url: string) => {
        try {
            const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
            return host === internalDomain || (host.endsWith('.' + internalDomain) && !scanConfig.excludeSubdomains);
        } catch (e) {
            return url.startsWith('/');
        }
    };

    // Filter links
    const filteredLinks = links.filter((l: any) => {
        if (isTargeted) {
            return targetUrls.some((t: string) => {
                const cleanT = t.trim().replace(/\/$/, '');
                const cleanL = l.url.replace(/\/$/, '');
                return cleanL === cleanT || cleanL.includes(cleanT);
            });
        }
        
        const parent = l.parentUrl;
        if (!parent) return true; // Entry point
        return isUrlInternal(parent);
    });

    // Group links by URL
    const grouped: Record<string, any[]> = {};
    filteredLinks.forEach(link => {
        const normalizedUrl = link.url.replace(/^https?:\/\//, '').toLowerCase();
        if (!grouped[normalizedUrl]) {
            grouped[normalizedUrl] = [];
        }
        grouped[normalizedUrl].push(link);
    });

    return Object.entries(grouped).map(([normalizedKey, instances]) => {
        const displayUrl = instances.find(inst => inst.url.startsWith('https'))?.url || instances[0].url;
        return {
            url: displayUrl,
            normalizedKey,
            instances,
            status: instances[0].status,
            statusCode: instances[0].statusCode,
            error: instances[0].error,
            type: instances[0].type,
            count: instances.length
        };
    });
}

export function generateCSV(groupedLinks: any[]) {
    const headers = ['URL', 'Status', 'Status Code', 'Error', 'Type', 'Parent URL', 'Snippet'];
    const rows = [headers.join(',')];

    groupedLinks.forEach(group => {
        group.instances.forEach((inst: any) => {
            const row = [
                `"${inst.url}"`,
                `"${inst.status}"`,
                `"${inst.statusCode || ''}"`,
                `"${(inst.error || '').replace(/"/g, '""')}"`,
                `"${inst.type || ''}"`,
                `"${inst.parentUrl || ''}"`,
                `"${(inst.snippet || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
            ];
            rows.push(row.join(','));
        });
    });

    return rows.join('\n');
}

export function generateJSON(scan: any, links: any[]) {
    return JSON.stringify({ scan, links }, null, 2);
}

export function generateHTML(scan: any, groupedLinks: any[]) {
    const brokenCount = groupedLinks.filter(g => g.status === 'BROKEN').length;
    const successCount = groupedLinks.filter(g => g.status === 'SUCCESS').length;
    
    const rowsHtml = groupedLinks.map(group => {
        const isBroken = group.status === 'BROKEN';
        const instancesHtml = group.instances.map((inst: any) => `
            <div class="instance">
                <strong>Found on:</strong> <a href="${inst.parentUrl}" target="_blank">${inst.parentUrl}</a>
                ${inst.snippet ? `<pre><code>${escapeHtml(inst.snippet)}</code></pre>` : ''}
            </div>
        `).join('');

        return `
            <tr class="link-row ${isBroken ? 'broken' : 'success'}" data-status="${group.status}" data-url="${group.url.toLowerCase()}">
                <td>
                    <div class="url-group">
                        <button class="toggle-btn" onclick="toggleInstances(this)">▶</button>
                        <a href="${group.url}" target="_blank">${group.url}</a>
                        ${group.count > 1 ? `<span class="count">${group.count} occurrences</span>` : ''}
                    </div>
                    <div class="instances-container" style="display: none;">
                        ${instancesHtml}
                    </div>
                </td>
                <td style="width: 100px;"><span class="status-badge">${group.status}</span></td>
                <td style="width: 80px;">${group.statusCode || '-'}</td>
                <td class="error-cell">${group.error || '-'}</td>
            </tr>
        `;
    }).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Link Audit Report - ${scan.name}</title>
    <style>
        :root { --primary: #6366f1; --primary-hover: #4f46e5; --bg: #f9fafb; --card-bg: #ffffff; --text: #1f2937; --text-muted: #6b7280; --border: #e5e7eb; --red: #ef4444; --green: #10b981; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: var(--text); background: var(--bg); margin: 0; padding: 40px 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        header { margin-bottom: 32px; }
        h1 { margin: 0 0 8px; font-size: 30px; font-weight: 800; tracking: tight; }
        .meta { font-size: 14px; color: var(--text-muted); }
        
        .stats { display: flex; gap: 16px; margin-bottom: 32px; }
        .stat-card { background: var(--card-bg); padding: 16px 24px; border-radius: 12px; border: 1px solid var(--border); flex: 1; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .stat-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 4px; }
        .stat-value { font-size: 24px; font-weight: 700; }
        .stat-value.broken { color: var(--red); }
        .stat-value.success { color: var(--green); }

        .controls { display: flex; gap: 12px; margin-bottom: 24px; background: var(--card-bg); padding: 16px; border-radius: 12px; border: 1px solid var(--border); align-items: center; }
        .search-input { flex: 1; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); font-size: 14px; outline: none; }
        .search-input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1); }
        .filter-btn { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--card-bg); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .filter-btn:hover { background: #f3f4f6; }
        .filter-btn.active { background: var(--primary); color: white; border-color: var(--primary); }

        table { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--card-bg); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        th { background: #f8fafc; padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); border-bottom: 1px solid var(--border); }
        td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        tr.broken { background: #fffcfc; }
        tr:last-child td { border-bottom: none; }
        
        .url-group { display: flex; align-items: center; gap: 8px; font-size: 14px; }
        .url-group a { color: var(--primary); text-decoration: none; font-weight: 600; word-break: break-all; }
        .url-group a:hover { text-decoration: underline; }
        .toggle-btn { background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 10px; padding: 4px; transition: transform 0.2s; }
        .toggle-btn.open { transform: rotate(90deg); }
        
        .count { font-size: 10px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: var(--text-muted); font-weight: 700; }
        .status-badge { font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; color: white; }
        .broken .status-badge { background: var(--red); }
        .success .status-badge { background: var(--green); }
        
        .instances-container { margin-top: 12px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid var(--border); }
        .instance { margin-bottom: 12px; font-size: 12px; }
        .instance:last-child { margin-bottom: 0; }
        .instance strong { color: var(--text-muted); text-transform: uppercase; font-size: 10px; margin-right: 4px; }
        .instance a { color: var(--text); text-decoration: none; word-break: break-all; }
        .instance a:hover { text-decoration: underline; }
        
        pre { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; font-size: 11px; overflow-x: auto; margin: 8px 0; border: 1px solid #334155; }
        .error-cell { color: var(--red); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
        
        .no-results { padding: 40px; text-align: center; color: var(--text-muted); }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>${scan.name}</h1>
            <p class="meta">Generated on ${new Date().toLocaleString()} • Status: ${scan.status}</p>
        </header>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-label">Total Links</div>
                <div class="stat-value">${groupedLinks.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Healthy</div>
                <div class="stat-value success">${successCount}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Broken</div>
                <div class="stat-value broken">${brokenCount}</div>
            </div>
        </div>

        <div class="controls">
            <input type="text" class="search-input" id="searchInput" placeholder="Search by URL..." oninput="filterTable()">
            <button class="filter-btn active" onclick="setFilter('ALL', this)">All Links</button>
            <button class="filter-btn" onclick="setFilter('BROKEN', this)">Broken Only</button>
            <button class="filter-btn" onclick="setFilter('SUCCESS', this)">Success Only</button>
        </div>

        <table id="reportTable">
            <thead>
                <tr>
                    <th>Link Details</th>
                    <th>Status</th>
                    <th>Code</th>
                    <th>Error Message</th>
                </tr>
            </thead>
            <tbody id="tableBody">
                ${rowsHtml}
            </tbody>
        </table>
        <div id="noResults" class="no-results" style="display: none;">
            No links match your search or filter.
        </div>
    </div>

    <script>
        let currentFilter = 'ALL';
        
        function toggleInstances(btn) {
            const container = btn.closest('td').querySelector('.instances-container');
            const isOpen = container.style.display !== 'none';
            container.style.display = isOpen ? 'none' : 'block';
            btn.classList.toggle('open', !isOpen);
            btn.innerText = isOpen ? '▶' : '▼';
        }

        function setFilter(filter, btn) {
            currentFilter = filter;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterTable();
        }

        function filterTable() {
            const query = document.getElementById('searchInput').value.toLowerCase();
            const rows = document.querySelectorAll('.link-row');
            let visibleCount = 0;

            rows.forEach(row => {
                const status = row.getAttribute('data-status');
                const url = row.getAttribute('data-url');
                
                const matchesFilter = currentFilter === 'ALL' || status === currentFilter;
                const matchesSearch = url.includes(query);
                
                if (matchesFilter && matchesSearch) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });

            document.getElementById('noResults').style.display = visibleCount === 0 ? 'block' : 'none';
            document.getElementById('reportTable').style.display = visibleCount === 0 ? 'none' : '';
        }
    </script>
</body>
</html>
    `;
}

function escapeHtml(text: string) {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}
