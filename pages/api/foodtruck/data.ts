import type { NextApiRequest, NextApiResponse } from 'next';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const REDIS_KEY = 'foodtruck-day';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const data = await redis.get(REDIS_KEY);
    return res.status(200).json(data || { date: '', orders: [], totalCash: 0, totalPayconiq: 0 });
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (!body || !body.date) {
      return res.status(400).json({ error: 'Invalid data' });
    }
    await redis.set(REDIS_KEY, body);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
