import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { generateVoucherZPL } from '@/lib/zpl-labels';

function calcEan13Check(digits12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function generateEan13(): string {
  const digits12 = '044' + Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  return digits12 + calcEan13Check(digits12);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.isLoggedIn || !session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { count } = req.body;
  const numCards = Math.min(Math.max(parseInt(count) || 1, 1), 100);

  const codes: string[] = [];
  const usedCodes = new Set<string>();
  while (codes.length < numCards) {
    const code = generateEan13();
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      codes.push(code);
    }
  }

  const zplLabels = codes.map(code =>
    generateVoucherZPL({ code, amount: 0 })
  ).join('\n');

  return res.status(200).json({
    codes,
    zpl: zplLabels,
  });
}
