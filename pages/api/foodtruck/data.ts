import type { NextApiRequest, NextApiResponse } from 'next';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

function keyForDate(date: string): string {
  return `foodtruck-day:${date}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const date = (req.query.date as string) || '';

  if (req.method === 'GET') {
    if (!date) {
      return res.status(400).json({ error: 'Missing date parameter' });
    }
    const data = await redis.get(keyForDate(date));
    return res.status(200).json(data || { date, orders: [], totalCash: 0, totalPayconiq: 0 });
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (!body || !body.date) {
      return res.status(400).json({ error: 'Invalid data' });
    }
    await redis.set(keyForDate(body.date), body);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
