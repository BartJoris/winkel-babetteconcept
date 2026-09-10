import { odooClient } from '@/lib/odooClient';

export type OdooAttributeValue = {
  name: string;
  attributeName: string;
};

const ATTR_CACHE_TTL = 5 * 60 * 1000;
const attrCache = new Map<number, { value: OdooAttributeValue; expires: number }>();

function many2oneName(value: unknown): string {
  if (Array.isArray(value) && typeof value[1] === 'string') return value[1];
  return '';
}

export function many2oneId(value: unknown): number | null {
  if (Array.isArray(value) && typeof value[0] === 'number') return value[0];
  return null;
}

export async function fetchAttributeValues(
  uid: number,
  password: string,
  attrIds: number[]
): Promise<Record<number, OdooAttributeValue>> {
  if (attrIds.length === 0) return {};

  const uniqueIds = [...new Set(attrIds)];
  const now = Date.now();
  const result: Record<number, OdooAttributeValue> = {};
  const missing: number[] = [];

  for (const id of uniqueIds) {
    const cached = attrCache.get(id);
    if (cached && cached.expires > now) {
      result[id] = cached.value;
    } else {
      missing.push(id);
    }
  }

  if (missing.length === 0) return result;

  const attrValues = await odooClient.call<
    Array<{ id: number; name: string; attribute_id: unknown }>
  >({
    uid,
    password,
    model: 'product.template.attribute.value',
    method: 'search_read',
    args: [[['id', 'in', missing]]],
    kwargs: { fields: ['id', 'name', 'attribute_id'], limit: missing.length },
  });

  const expires = Date.now() + ATTR_CACHE_TTL;
  for (const av of attrValues) {
    const value = { name: av.name, attributeName: many2oneName(av.attribute_id) };
    result[av.id] = value;
    attrCache.set(av.id, { value, expires });
  }

  return result;
}

export function parseQueryBool(
  value: string | string[] | undefined,
  defaultValue: boolean
): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return defaultValue;
  return raw === '1' || raw === 'true';
}

export function parseQueryInt(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
