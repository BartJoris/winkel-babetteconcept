import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadPendingOrders,
  type PendingOrdersOdooCall,
  type PendingOrdersOdooCallParams,
} from './pendingOrders';

function domainHasIdIn(args: unknown[], expectedIds: number[]): boolean {
  const domain = args[0];
  if (!Array.isArray(domain)) return false;
  const clause = domain.find(
    (item) => Array.isArray(item) && item[0] === 'id' && item[1] === 'in'
  );
  if (!clause || !Array.isArray(clause[2])) return false;
  return expectedIds.every((id) => (clause[2] as number[]).includes(id));
}

describe('loadPendingOrders', () => {
  it('loads ten orders with four Odoo roundtrips instead of one per order', async () => {
    const calls: Array<{ model: string; method: string }> = [];

    const odooCall: PendingOrdersOdooCall = async <T>(params: PendingOrdersOdooCallParams) => {
      calls.push({ model: params.model, method: params.method });

      switch (params.model) {
        case 'sale.order':
          return Array.from({ length: 10 }, (_, i) => ({
            id: i + 1,
            name: `SO${i + 1}`,
            date_order: '2026-08-27 10:00:00',
            amount_total: 10 + i,
            partner_id: [100 + i, `Klant ${i}`],
            state: 'sale',
            website_id: [1, 'Webshop'],
          })) as T;
        case 'res.partner':
          assert.equal(domainHasIdIn(params.args, [100, 101, 109]), true);
          return Array.from({ length: 10 }, (_, i) => ({
            id: 100 + i,
            name: `Klant ${i}`,
            email: `klant${i}@example.com`,
            phone: '0470000000',
            street: 'Kerkstraat 1',
            city: 'Gent',
            zip: '9000',
            country_id: [21, 'België'],
          })) as T;
        case 'sale.order.line':
          return Array.from({ length: 10 }, (_, i) => ({
            order_id: [i + 1, `SO${i + 1}`],
            product_id: [500 + i, `Product ${i}`],
            product_uom_qty: 1,
            price_unit: 10 + i,
            price_total: 10 + i,
          })) as T;
        case 'stock.picking':
          return [
            { sale_id: [1, 'SO1'], state: 'assigned' },
            { sale_id: [2, 'SO2'], state: 'done' },
          ] as T;
        default:
          throw new Error(`Unexpected model ${params.model}`);
      }
    };

    const orders = await loadPendingOrders(odooCall, 1, 'secret');

    assert.equal(calls.length, 4);
    assert.deepEqual(calls.map((c) => c.model).sort(), [
      'res.partner',
      'sale.order',
      'sale.order.line',
      'stock.picking',
    ]);
    assert.equal(orders.length, 10);
    assert.equal(orders[0].name, 'SO1');
    assert.equal(orders[0].partner_name, 'Klant 0');
    assert.equal(orders[0].partner_email, 'klant0@example.com');
    assert.equal(orders[0].partner_country, 'België');
    assert.equal(orders[0].picking_state, 'assigned');
    assert.deepEqual(orders[0].order_line, [
      {
        product_id: [500, 'Product 0'],
        product_uom_qty: 1,
        price_unit: 10,
        price_total: 10,
      },
    ]);
    assert.equal(orders[1].picking_state, 'done');
    assert.equal(orders[2].picking_state, null);
  });

  it('skips partner, line and picking calls when there are no orders', async () => {
    const calls: string[] = [];
    const odooCall: PendingOrdersOdooCall = async <T>(params: PendingOrdersOdooCallParams) => {
      calls.push(params.model);
      if (params.model === 'sale.order') return [] as T;
      throw new Error(`Unexpected extra call to ${params.model}`);
    };

    const orders = await loadPendingOrders(odooCall, 1, 'secret');
    assert.deepEqual(orders, []);
    assert.deepEqual(calls, ['sale.order']);
  });
});
