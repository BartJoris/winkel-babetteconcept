import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

// bwip-js has no bundled types in this project; match existing label APIs
const bwipjs = require('bwip-js');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.isLoggedIn || !session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const softkeyUrl = (process.env.OTZY_SOFTKEY_URL || '').trim();
  if (!softkeyUrl) {
    return res.status(404).json({
      error: 'OTZY_SOFTKEY_URL is niet geconfigureerd',
    });
  }

  try {
    const png: Buffer = await bwipjs.toBuffer({
      bcid: 'qrcode',
      text: softkeyUrl,
      scale: 6,
      includetext: false,
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(png);
  } catch (err) {
    console.error('Softkey QR generation failed:', err);
    return res.status(500).json({ error: 'QR genereren mislukt' });
  }
}
