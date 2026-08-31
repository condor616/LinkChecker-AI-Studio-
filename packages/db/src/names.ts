export type ProductId = 'lynxscan' | 'lynxgeo';

function testSuffix() {
  return process.env.NODE_ENV === 'test' || process.env.IS_TESTING === 'true' ? '_test' : '';
}

function sanitizeUserId(userId: string) {
  return userId.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export function getLynxScanDbName(userId: string) {
  return `lynx_scan_${sanitizeUserId(userId)}${testSuffix()}`;
}

export function getLynxGeoDbName(userId: string) {
  return `lynx_geo_${sanitizeUserId(userId)}${testSuffix()}`;
}
