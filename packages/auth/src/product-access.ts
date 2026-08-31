export type ProductId = 'lynxscan' | 'lynxgeo';

export type ProductAccess = {
  lynxscan: boolean;
  lynxgeo: boolean;
};

export const DEFAULT_PRODUCT_ACCESS: ProductAccess = { lynxscan: true, lynxgeo: false };
export const ADMIN_PRODUCT_ACCESS: ProductAccess = { lynxscan: true, lynxgeo: true };

export function parseProductAccess(raw: string | null | undefined): ProductAccess {
  if (!raw) return { ...DEFAULT_PRODUCT_ACCESS };
  try {
    const parsed = JSON.parse(raw);
    return {
      lynxscan: parsed.lynxscan !== false,
      lynxgeo: parsed.lynxgeo === true,
    };
  } catch {
    return { ...DEFAULT_PRODUCT_ACCESS };
  }
}

export function stringifyProductAccess(access: ProductAccess): string {
  return JSON.stringify({
    lynxscan: !!access.lynxscan,
    lynxgeo: !!access.lynxgeo,
  });
}

export function hasProductAccess(access: ProductAccess | string | null | undefined, product: ProductId): boolean {
  const parsed = typeof access === 'string' || access == null ? parseProductAccess(access) : access;
  return parsed[product] === true;
}
