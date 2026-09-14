import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import {
  attachmentToPdfBuffer,
  collectOrderAttachments,
  isInvoiceAttachmentName,
  isShippingLabelAttachmentName,
} from '@/lib/order-attachments';

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
    const orderId = Number(req.body?.orderId);

    if (!Number.isFinite(orderId)) {
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

    const attachments = await collectOrderAttachments(odooCall, uid, password, orderId);

    console.log(`Found ${attachments.length} attachments for order ${orderId}:`, 
      attachments.map(a => ({ id: a.id, name: a.name })));

    const invoice = attachments.find((a) => isInvoiceAttachmentName(a.name));
    const shippingLabel = attachments.find((a) => isShippingLabelAttachmentName(a.name));

    return res.status(200).json({ 
      success: true,
      orderName: order.name,
      orderState: order.state,
      attachments: attachments.map(a => ({
        id: a.id,
        name: a.name,
        type: isShippingLabelAttachmentName(a.name)
          ? 'shipping_label' 
          : isInvoiceAttachmentName(a.name)
          ? 'invoice'
          : 'other'
      })),
      invoice: invoice ? {
        id: invoice.id,
        name: invoice.name,
        data: attachmentToPdfBuffer(invoice)?.toString('base64') ?? null,
      } : null,
      shippingLabel: shippingLabel ? {
        id: shippingLabel.id,
        name: shippingLabel.name,
        data: attachmentToPdfBuffer(shippingLabel)?.toString('base64') ?? null,
      } : null,
    });
  } catch (error) {
    console.error('Error fetching order attachments:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch order attachments' 
    });
  }
}

