export function getGeoAppUrl() {
  return process.env.NEXT_PUBLIC_GEO_URL || process.env.GEO_APP_URL || 'http://localhost:3010';
}
