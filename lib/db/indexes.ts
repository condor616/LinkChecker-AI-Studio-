export const LINKS_INDEX_STATEMENTS = [
  'CREATE INDEX IF NOT EXISTS "links_scan_id_idx" ON "links" ("scan_id")',
  'CREATE INDEX IF NOT EXISTS "links_scan_id_status_idx" ON "links" ("scan_id", "status")',
  'CREATE INDEX IF NOT EXISTS "links_scan_id_url_idx" ON "links" ("scan_id", "url")',
];

export async function ensureLinksIndexes(run: (sql: string) => Promise<unknown>) {
  for (const sql of LINKS_INDEX_STATEMENTS) {
    await run(sql);
  }
}
