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
  const res = await fetch(ODOO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message || json.error.message);
  return json.result as T;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.isLoggedIn || !session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { uid, password } = session.user;
  const { code } = req.body;

  if (!code || typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'Code is verplicht' });
  }

  const trimmed = code.trim();
  const variants = [trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()];

  try {
    let card: any = null;
    for (const c of variants) {
      const cards = await odooCall<any[]>({
        uid, password,
        model: 'loyalty.card',
        method: 'search_read',
        args: [[['code', '=', c]]],
        kwargs: {
          fields: [
            'id', 'code', 'points', 'point_name',
            'expiration_date', 'partner_id', 'program_id',
            'create_date', 'write_date',
            'source_pos_order_id',
          ],
          limit: 1,
          context: { active_test: false, lang: 'nl_BE' },
        },
      });
      if (cards.length > 0) {
        card = cards[0];
        break;
      }
    }

    if (!card) {
      return res.status(404).json({ error: `Geen cadeaubon gevonden met code: ${trimmed}` });
    }

    // Fetch transaction history
    let history: any[] = [];
    try {
      history = await odooCall<any[]>({
        uid, password,
        model: 'loyalty.history',
        method: 'search_read',
        args: [[['card_id', '=', card.id]]],
        kwargs: {
          fields: ['id', 'date', 'description', 'used', 'order_id'],
          order: 'date desc',
          context: { lang: 'nl_BE' },
        },
      });
    } catch {
      // loyalty.history might not exist in all Odoo versions
    }

    // Calculate original value from history if available
    let originalValue = card.points;
    if (history.length > 0) {
      let totalIssued = 0;
      let totalUsed = 0;
      for (const h of history) {
        const used = h.used || 0;
        if (used < 0) {
          totalIssued += Math.abs(used);
        } else {
          totalUsed += used;
        }
      }
      if (totalIssued > 0) {
        originalValue = totalIssued;
      } else {
        originalValue = card.points + totalUsed;
      }
    }

    // If no history, try to get original value from source POS order
    if (history.length === 0 && card.source_pos_order_id) {
      try {
        const orders = await odooCall<any[]>({
          uid, password,
          model: 'pos.order',
          method: 'search_read',
          args: [[['id', '=', card.source_pos_order_id[0]]]],
          kwargs: {
            fields: ['id', 'name', 'date_order', 'amount_total'],
            limit: 1,
          },
        });
        if (orders.length > 0 && originalValue === card.points) {
          originalValue = orders[0].amount_total;
        }
      } catch {
        // ignore
      }
    }

    return res.status(200).json({
      card: {
        id: card.id,
        code: card.code,
        balance: card.points,
        original_value: originalValue,
        expiration_date: card.expiration_date || null,
        partner: card.partner_id ? { id: card.partner_id[0], name: card.partner_id[1] } : null,
        program: card.program_id ? { id: card.program_id[0], name: card.program_id[1] } : null,
        created: card.create_date,
        source_order: card.source_pos_order_id
          ? { id: card.source_pos_order_id[0], name: card.source_pos_order_id[1] }
          : null,
      },
      history,
    });
  } catch (error) {
    console.error('Lookup gift card error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Onbekende fout' });
  }
}
