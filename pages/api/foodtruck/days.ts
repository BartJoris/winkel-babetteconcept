import type { NextApiRequest, NextApiResponse } from 'next';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

interface DayData {
  date: string;
  orders: { total: number; method: string }[];
  totalCash: number;
  totalPayconiq: number;
}

interface DaySummary {
  date: string;
  totalRevenue: number;
  totalCash: number;
  totalPayconiq: number;
  orderCount: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Migrate old single-key data if it exists
  const oldData = await redis.get<DayData>('foodtruck-day');
  if (oldData && oldData.date && (oldData.totalCash > 0 || oldData.totalPayconiq > 0)) {
    await redis.set(`foodtruck-day:${oldData.date}`, oldData);
    await redis.del('foodtruck-day');
  }

  // Scan for all foodtruck-day:* keys
  const keys: string[] = [];
  let cursor = 0;
  do {
    const result = await redis.scan(cursor, { match: 'foodtruck-day:*', count: 100 });
    cursor = Number(result[0]);
    keys.push(...result[1]);
  } while (cursor !== 0);

  if (keys.length === 0) {
    return res.status(200).json({ days: [] });
  }

  // Fetch all day data
  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.get(key);
  }
  const results = await pipeline.exec<(DayData | null)[]>();

  const days: DaySummary[] = [];
  for (const data of results) {
    if (!data || !data.date) continue;
    const totalRevenue = (data.totalCash || 0) + (data.totalPayconiq || 0);
    if (totalRevenue <= 0) continue;
    days.push({
      date: data.date,
      totalRevenue,
      totalCash: data.totalCash || 0,
      totalPayconiq: data.totalPayconiq || 0,
      orderCount: data.orders?.length || 0,
    });
  }

  days.sort((a, b) => b.date.localeCompare(a.date));

  return res.status(200).json({ days });
}
