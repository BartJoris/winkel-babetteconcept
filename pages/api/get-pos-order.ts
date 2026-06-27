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
    throw new Error(json.error.data?.message || json.error.message || 'Odoo API error');
  }

  return json.result as T;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.isLoggedIn || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { uid, password } = session.user;
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is verplicht' });
    }

    const numericId = parseInt(String(orderId), 10);
    if (isNaN(numericId)) {
      return res.status(400).json({ error: 'Ongeldig order ID' });
    }

    console.log('📋 Fetching POS order:', numericId);

    const orders = await odooCall<any[]>({
      uid,
      password,
      model: 'pos.order',
      method: 'search_read',
      args: [[['id', '=', numericId]]],
      kwargs: {
        fields: ['id', 'name', 'date_order', 'state', 'partner_id', 'amount_total', 'lines'],
        limit: 1,
      },
    });

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Geen POS order gevonden met ID ${numericId}`,
      });
    }

    const order = orders[0];
    const lineIds: number[] = order.lines || [];

    if (lineIds.length === 0) {
      return res.status(200).json({
        success: true,
        order: {
          id: order.id,
          name: order.name,
          date: order.date_order,
          state: order.state,
          partner: order.partner_id ? order.partner_id[1] : null,
          total: order.amount_total,
        },
        products: [],
      });
    }

    const lines = await odooCall<any[]>({
      uid,
      password,
      model: 'pos.order.line',
      method: 'search_read',
      args: [[['id', 'in', lineIds]]],
      kwargs: {
        fields: ['id', 'product_id', 'full_product_name', 'qty', 'price_unit', 'price_subtotal_incl'],
      },
    });

    const productIds = lines
      .map(l => l.product_id?.[0])
      .filter((id): id is number => typeof id === 'number');

    const uniqueProductIds = [...new Set(productIds)];

    let stockMap: Record<number, number> = {};
    if (uniqueProductIds.length > 0) {
      const products = await odooCall<any[]>({
        uid,
        password,
        model: 'product.product',
        method: 'search_read',
        args: [[['id', 'in', uniqueProductIds], ['active', '=', true]]],
        kwargs: {
          fields: ['id', 'qty_available', 'barcode', 'product_template_attribute_value_ids'],
        },
      });

      for (const p of products) {
        stockMap[p.id] = p.qty_available;
      }
    }

    const products = lines
      .filter(l => {
        const name = (l.full_product_name || '').toLowerCase();
        return !name.includes('[disc]') && !name.includes('korting');
      })
      .map(l => ({
        productId: l.product_id?.[0] ?? null,
        name: l.full_product_name || l.product_id?.[1] || 'Onbekend product',
        qty: l.qty,
        priceUnit: l.price_unit,
        priceTotal: l.price_subtotal_incl,
        currentStock: stockMap[l.product_id?.[0]] ?? null,
      }))
      .filter(p => p.productId !== null);

    console.log(`✅ POS order ${order.name}: ${products.length} product(en) gevonden`);

    return res.status(200).json({
      success: true,
      order: {
        id: order.id,
        name: order.name,
        date: order.date_order,
        state: order.state,
        partner: order.partner_id ? order.partner_id[1] : null,
        total: order.amount_total,
      },
      products,
    });
  } catch (error) {
    console.error('❌ Error fetching POS order:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Kon order niet ophalen',
    });
  }
}
