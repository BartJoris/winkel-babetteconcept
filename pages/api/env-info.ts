import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.isLoggedIn || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const odooUrl = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
    const odooDb = process.env.ODOO_DB || 'babetteconcept';
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Determine if this is production
    const isProduction = odooDb === 'babetteconcept' || odooDb.toLowerCase().includes('prod');

    // Extract a friendly name from the URL
    let environmentName = 'Unknown';
    try {
      const url = new URL(odooUrl);
      environmentName = url.hostname;
    } catch {
      environmentName = odooUrl;
    }

    return res.status(200).json({
      odooUrl,
      odooDb,
      nodeEnv,
      isProduction,
      environmentName,
    });
  } catch (error) {
    console.error('Error getting environment info:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get environment info' 
    });
  }
}

