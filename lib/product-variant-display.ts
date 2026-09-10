export type AttributeInfo = {
  name: string;
  attributeName: string;
};

export function isMerkAttributeName(attributeName: string): boolean {
  return attributeName.toLowerCase().includes('merk');
}

export function formatVariantAttributes(
  attrIds: number[],
  attrMap: Record<number, AttributeInfo>
): string | null {
  const attributes = attrIds
    .map((id) => attrMap[id])
    .filter((attr): attr is AttributeInfo => Boolean(attr) && !isMerkAttributeName(attr.attributeName))
    .map((attr) => attr.name)
    .join(', ');
  return attributes || null;
}

export function sizeToMonths(s: string): number | null {
  const m = s.match(/(\d+)\s*maand/i);
  if (m) return parseInt(m[1], 10);
  const j = s.match(/(\d+)\s*jaar/i);
  if (j) return parseInt(j[1], 10) * 12;
  const n = s.match(/(\d+)/);
  if (n) return parseInt(n[1], 10);
  return null;
}

export function sortSizeLabels(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const aVal = sizeToMonths(a);
    const bVal = sizeToMonths(b);
    if (aVal !== null && bVal !== null) return aVal - bVal;
    return a.localeCompare(b, 'nl');
  });
}

export function sizeRangeFromSizes(sizeValues: string[]): string | null {
  const unique = sortSizeLabels([...new Set(sizeValues.filter(Boolean))]);
  if (unique.length <= 1) return null;
  return `${unique[0]} - ${unique[unique.length - 1]}`;
}
