export type BackupProductId = 'lynxscan' | 'lynxgeo';

export interface BackupProductEntry {
  file: string;
  dbName: string;
}

export interface BackupManifestV1 {
  version: 1;
  userId: string;
  createdAt: string;
  products: Partial<Record<BackupProductId, BackupProductEntry>>;
}

export type BackupScope = 'scan-only' | 'scan-geo' | 'legacy-scan-only';

export function buildManifest(
  userId: string,
  products: Partial<Record<BackupProductId, BackupProductEntry>>,
): BackupManifestV1 {
  return {
    version: 1,
    userId,
    createdAt: new Date().toISOString(),
    products,
  };
}

export function parseManifest(raw: string): BackupManifestV1 | null {
  try {
    const parsed = JSON.parse(raw) as BackupManifestV1;
    if (parsed?.version === 1 && parsed.userId && parsed.products) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function getBackupScope(manifest: BackupManifestV1 | null, hasLegacyDatabaseSql: boolean): BackupScope {
  if (manifest) {
    const hasScan = Boolean(manifest.products.lynxscan);
    const hasGeo = Boolean(manifest.products.lynxgeo);
    if (hasScan && hasGeo) return 'scan-geo';
    if (hasScan) return 'scan-only';
  }
  if (hasLegacyDatabaseSql) return 'legacy-scan-only';
  return 'scan-only';
}
