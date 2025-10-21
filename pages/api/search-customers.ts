import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

async function odooCall<T>(params: {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
}): Promise<T> {
  const payload = {
    jsonrpc: '2.0',
    method: 'call',
    params: {
      service: 'object',
      method: 'execute_kw',
      args: [
        ODOO_DB,
        params.uid,
        params.password,
        params.model,
        params.method,
        params.args,
        params.kwargs || {},
      ],
    },
    id: Date.now(),
  };

  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  
  if (json.error) {
    throw new Error(json.error.message || 'Odoo API error');
  }

  return json.result as T;
}

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

    const { uid, password } = session.user;
    const { query } = req.query;

    console.log('🔍 Customer Search - Query:', query);

    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.status(200).json({ customers: [] });
    }

    // Search for customers by name or email
    const customers = await odooCall<any[]>({
      uid,
      password,
      model: 'res.partner',
      method: 'search_read',
      args: [[
        '|',
        ['name', 'ilike', query],
        ['email', 'ilike', query],
        ['customer_rank', '>', 0], // Only actual customers
      ]],
      kwargs: {
        fields: ['id', 'name', 'email', 'phone', 'city'],
        limit: 20,
        order: 'name asc',
      },
    });

    console.log(`✅ Found ${customers.length} customers matching "${query}"`);

    return res.status(200).json({
      customers: customers.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email || null,
        phone: c.phone || null,
        city: c.city || null,
      })),
    });
  } catch (error) {
    console.error('❌ Error searching customers:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Kon klanten niet zoeken' 
    });
  }
}

