export type HistoryScan = {
  id: string;
  name: string;
  status: string;
  config: string;
  createdAt: Date | string;
};

export function getScanStartUrl(config: string | null | undefined): string {
  if (!config) return '';
  try {
    const parsed = typeof config === 'string' ? JSON.parse(config) : config;
    return typeof parsed?.startUrl === 'string' ? parsed.startUrl : '';
  } catch {
    return '';
  }
}

export function scanMatchesQuery(scan: Pick<HistoryScan, 'name' | 'config'>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const name = (scan.name || '').toLowerCase();
  const startUrl = getScanStartUrl(scan.config).toLowerCase();
  return name.includes(needle) || startUrl.includes(needle);
}

export function filterScansByQuery<T extends Pick<HistoryScan, 'name' | 'config'>>(scans: T[], query: string): T[] {
  return scans.filter((scan) => scanMatchesQuery(scan, query));
}
