export const BRAND_ATTRIBUTE_NAMES = ['MERK', 'Merk 1'] as const;

export type BrandAttributeValue = {
  id: number;
  name: string;
  attributeName: string;
};

export type ProductBrand = {
  id: number;
  name: string;
  valueIds: number[];
};

export function isBrandAttributeName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === 'merk' || normalized === 'merk 1';
}

export function brandAttributeRank(attributeName: string): number {
  return attributeName.trim().toUpperCase() === 'MERK' ? 0 : 1;
}

/** Unique brand names; MERK wins the canonical id, but all value ids are kept. */
export function dedupeBrands(values: BrandAttributeValue[]): ProductBrand[] {
  const byName = new Map<string, { brand: ProductBrand; rank: number }>();

  for (const value of values) {
    const name = value.name.trim();
    if (!name) continue;

    const rank = brandAttributeRank(value.attributeName);
    const existing = byName.get(name);
    if (!existing) {
      byName.set(name, {
        brand: { id: value.id, name, valueIds: [value.id] },
        rank,
      });
      continue;
    }

    if (!existing.brand.valueIds.includes(value.id)) {
      existing.brand.valueIds.push(value.id);
    }

    if (rank < existing.rank) {
      existing.brand.id = value.id;
      existing.rank = rank;
    }
  }

  return Array.from(byName.values())
    .map((entry) => entry.brand)
    .sort((a, b) => a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
}

export function recordIsFavorite(record: {
  priority?: unknown;
  is_favorite?: unknown;
}): boolean {
  if (record.is_favorite === true) return true;
  return record.priority === '1' || record.priority === 1;
}
