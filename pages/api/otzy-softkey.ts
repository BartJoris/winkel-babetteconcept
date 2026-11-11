import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

const DEFAULT_MERCHANT_URL = 'https://merchant.otzy.eu';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.isLoggedIn || !session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const softkeyUrl = (process.env.OTZY_SOFTKEY_URL || '').trim();
  const merchantUrl = (process.env.OTZY_MERCHANT_URL || DEFAULT_MERCHANT_URL).trim();

  return res.status(200).json({
    merchantUrl,
    softkeyConfigured: Boolean(softkeyUrl),
    // Softkey deeplink only for authenticated staff — opens limited Otzy wallet login
    softkeyUrl: softkeyUrl || null,
    openUrl: softkeyUrl || merchantUrl,
  });
}
