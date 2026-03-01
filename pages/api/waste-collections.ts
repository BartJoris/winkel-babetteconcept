import type { NextApiRequest, NextApiResponse } from 'next';

const ZIPCODE = '8670';
const STREET_NAME = 'Albert I Laan';
const HOUSE_NUMBER = '75';
const ADDRESS_DISPLAY = 'Albert I Laan 75, 8670 Oostduinkerke';

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Encoding': 'gzip, deflate',
  'User-Agent': 'recycleapp.be',
  'x-consumer': 'recycleapp.be',
};

let cachedEndpoint: string | null = null;
let cachedAssetsUrl: string | null = null;
let cachedZipcodeId: string | null = null;
let cachedStreetId: string | null = null;

async function getSettings(): Promise<{ endpoint: string; assetsUrl: string }> {
  if (cachedEndpoint && cachedAssetsUrl) {
    return { endpoint: cachedEndpoint, assetsUrl: cachedAssetsUrl };
  }

  const res = await fetch('https://www.recycleapp.be/config/app.settings.json', {
    headers: HEADERS,
  });
  const settings = await res.json();
  cachedEndpoint = `${settings.API}/public/v1`;
  cachedAssetsUrl = settings.ASSETS || 'https://assets.recycleapp.be';
  return { endpoint: cachedEndpoint!, assetsUrl: cachedAssetsUrl! };
}

async function apiGet(path: string): Promise<any> {
  const { endpoint } = await getSettings();
  const res = await fetch(`${endpoint}/${path}`, { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

async function apiPost(path: string, body: any = {}): Promise<any> {
  const { endpoint } = await getSettings();
  const res = await fetch(`${endpoint}/${path}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json;charset=utf-8' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

async function getZipcodeId(): Promise<string> {
  if (cachedZipcodeId) return cachedZipcodeId;

  const data = await apiGet(`zipcodes?q=${encodeURIComponent(ZIPCODE)}`);
  if (!data.items?.length) throw new Error(`Zipcode ${ZIPCODE} niet gevonden`);
  cachedZipcodeId = data.items[0].id;
  return cachedZipcodeId!;
}

async function getStreetId(zipcodeId: string): Promise<string> {
  if (cachedStreetId) return cachedStreetId;

  const data = await apiPost(
    `streets?q=${encodeURIComponent(STREET_NAME)}&zipcodes=${zipcodeId}`,
    {}
  );
  if (!data.items?.length) throw new Error(`Straat "${STREET_NAME}" niet gevonden`);
  cachedStreetId = data.items[0].id;
  return cachedStreetId!;
}

function resolveLogoUrl(relativePath: string | null, assetsUrl: string): string | null {
  if (!relativePath) return null;
  if (relativePath.startsWith('http')) return relativePath;
  return `${assetsUrl}/${relativePath}`;
}

const DAY_NAMES_NL = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

interface CollectionItem {
  name: string;
  color: string;
  logoUrl: string | null;
}

interface CollectionDay {
  date: string;
  dayName: string;
  items: CollectionItem[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { assetsUrl } = await getSettings();
    const zipcodeId = await getZipcodeId();
    const streetId = await getStreetId(zipcodeId);

    const fromParam = req.query.from as string | undefined;
    const startDate = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam)
      ? new Date(fromParam + 'T00:00:00')
      : new Date();
    const fromDate = startDate.toISOString().split('T')[0];

    const daysParam = req.query.days ? parseInt(req.query.days as string, 10) : 7;
    const days = Math.min(Math.max(daysParam, 1), 60);

    const until = new Date(startDate);
    until.setDate(until.getDate() + days);
    const untilDate = until.toISOString().split('T')[0];

    const data = await apiGet(
      `collections?zipcodeId=${zipcodeId}&streetId=${streetId}&houseNumber=${encodeURIComponent(HOUSE_NUMBER)}&fromDate=${fromDate}&untilDate=${untilDate}&size=100`
    );

    const byDate = new Map<string, CollectionItem[]>();

    for (const item of data.items || []) {
      if (item.exception?.replacedBy) continue;

      const fraction = item.fraction;
      if (!fraction) continue;

      const timestamp: string = item.timestamp || '';
      const date = timestamp.split('T')[0];
      if (!date) continue;

      const name = fraction.name?.nl || fraction.name?.en || 'Onbekend';
      const color = fraction.color || '#666';
      const logo = resolveLogoUrl(fraction.logo?.regular?.['1x'] || null, assetsUrl);

      if (!byDate.has(date)) byDate.set(date, []);
      const existing = byDate.get(date)!;
      if (!existing.some((e) => e.name === name)) {
        existing.push({ name, color, logoUrl: logo });
      }
    }

    const collections: CollectionDay[] = [];
    const cursor = new Date(startDate);
    for (let i = 0; i < days; i++) {
      const dateStr = cursor.toISOString().split('T')[0];
      const dayName = DAY_NAMES_NL[cursor.getDay()];
      collections.push({
        date: dateStr,
        dayName,
        items: byDate.get(dateStr) || [],
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json({ collections, address: ADDRESS_DISPLAY });
  } catch (error) {
    console.error('Error fetching waste collections:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Kon afvalkalender niet ophalen',
    });
  }
}
