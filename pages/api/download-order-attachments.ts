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
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Get the order to find attachments
    const orders = await odooCall<any[]>({
      uid,
      password,
      model: 'sale.order',
      method: 'search_read',
      args: [[['id', '=', orderId]]],
      kwargs: {
        fields: ['id', 'name', 'state'],
        limit: 1,
      },
    });

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orders[0];

    // Fetch all attachments for this order
    const attachments = await odooCall<any[]>({
      uid,
      password,
      model: 'ir.attachment',
      method: 'search_read',
      args: [
        [
          ['res_model', '=', 'sale.order'],
          ['res_id', '=', orderId],
          ['mimetype', '=', 'application/pdf'],
        ],
      ],
      kwargs: {
        fields: ['id', 'name', 'datas', 'mimetype', 'description'],
        order: 'create_date desc',
      },
    });

    console.log(`Found ${attachments.length} attachments for order ${orderId}:`, 
      attachments.map(a => ({ id: a.id, name: a.name })));

    // Categorize attachments - be more flexible with naming
    const invoice = attachments.find(a => {
      const name = a.name.toLowerCase();
      return (
        name.includes('order') || 
        name.includes('invoice') ||
        name.includes('factuur') ||
        name.startsWith('order - ')
      ) && !name.includes('shipping') && !name.includes('sendcloud');
    });

    const shippingLabel = attachments.find(a => {
      const name = a.name.toLowerCase();
      return (
        name.includes('shipping') ||
        name.includes('sendcloud') ||
        name.includes('label') ||
        name.includes('verzending')
      );
    });

    return res.status(200).json({ 
      success: true,
      orderName: order.name,
      orderState: order.state,
      attachments: attachments.map(a => ({
        id: a.id,
        name: a.name,
        type: a.name.toLowerCase().includes('shipping') || a.name.toLowerCase().includes('sendcloud') 
          ? 'shipping_label' 
          : a.name.toLowerCase().includes('order') || a.name.toLowerCase().includes('invoice')
          ? 'invoice'
          : 'other'
      })),
      invoice: invoice ? {
        id: invoice.id,
        name: invoice.name,
        data: invoice.datas,
      } : null,
      shippingLabel: shippingLabel ? {
        id: shippingLabel.id,
        name: shippingLabel.name,
        data: shippingLabel.datas,
      } : null,
    });
  } catch (error) {
    console.error('Error fetching order attachments:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch order attachments' 
    });
  }
}

