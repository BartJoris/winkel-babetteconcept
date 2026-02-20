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
    console.error('❌ Odoo Error:', JSON.stringify(json.error, null, 2));
    throw new Error(json.error.data?.message || json.error.message || 'Odoo API error');
  }

  return json.result as T;
}

interface AdjustmentItem {
  productId: number;
  quantity: number;
}

interface AdjustmentResult {
  productId: number;
  success: boolean;
  error?: string;
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
    const { items } = req.body as { items: AdjustmentItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    console.log('📦 Stock adjustment request for', items.length, 'products');

    // Find the main warehouse stock location
    const warehouses = await odooCall<any[]>({
      uid,
      password,
      model: 'stock.warehouse',
      method: 'search_read',
      args: [[]],
      kwargs: {
        fields: ['id', 'name', 'lot_stock_id'],
        limit: 1,
      },
    });

    if (warehouses.length === 0) {
      return res.status(500).json({ error: 'Geen magazijn gevonden in Odoo' });
    }

    const locationId = warehouses[0].lot_stock_id[0];
    console.log('📍 Warehouse location:', warehouses[0].name, '(ID:', locationId, ')');

    const results: AdjustmentResult[] = [];

    for (const item of items) {
      try {
        // Search for existing quant for this product at this location
        let quantIds = await odooCall<number[]>({
          uid,
          password,
          model: 'stock.quant',
          method: 'search',
          args: [[
            ['product_id', '=', item.productId],
            ['location_id', '=', locationId],
          ]],
          kwargs: { limit: 1 },
        });

        if (quantIds.length === 0) {
          // Create a quant record if none exists
          const newQuantId = await odooCall<number>({
            uid,
            password,
            model: 'stock.quant',
            method: 'create',
            args: [{
              product_id: item.productId,
              location_id: locationId,
              inventory_quantity: item.quantity,
            }],
          });
          quantIds = [newQuantId];
          console.log('✅ Created new quant', newQuantId, 'for product', item.productId);
        } else {
          // Update the inventory_quantity on the existing quant
          await odooCall<boolean>({
            uid,
            password,
            model: 'stock.quant',
            method: 'write',
            args: [quantIds, { inventory_quantity: item.quantity }],
          });
          console.log('✅ Updated quant', quantIds[0], 'for product', item.productId, 'to qty', item.quantity);
        }

        // Apply the inventory adjustment
        await odooCall<any>({
          uid,
          password,
          model: 'stock.quant',
          method: 'action_apply_inventory',
          args: [quantIds],
        });

        console.log('✅ Applied inventory for product', item.productId);
        results.push({ productId: item.productId, success: true });
      } catch (err) {
        console.error('❌ Failed to adjust stock for product', item.productId, ':', err);
        results.push({
          productId: item.productId,
          success: false,
          error: err instanceof Error ? err.message : 'Onbekende fout',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`📦 Stock adjustment complete: ${successCount}/${items.length} succeeded`);

    return res.status(200).json({
      success: successCount > 0,
      results,
      message: `${successCount} van ${items.length} producten aangepast`,
    });
  } catch (error) {
    console.error('❌ Error adjusting stock:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Kon voorraad niet aanpassen',
    });
  }
}
