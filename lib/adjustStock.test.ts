import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVENTORY_MODE_CONTEXT,
  adjustSingleProductStock,
  adjustStockItems,
  isOdooWizardAction,
  type OdooCallFn,
} from './adjustStock';

describe('isOdooWizardAction', () => {
  it('detects Odoo wizard actions returned instead of applying inventory', () => {
    assert.equal(
      isOdooWizardAction({ type: 'ir.actions.act_window', res_model: 'stock.inventory.conflict' }),
      true,
    );
    assert.equal(isOdooWizardAction(null), false);
    assert.equal(isOdooWizardAction(true), false);
  });
});

describe('adjustSingleProductStock', () => {
  it('uses inventory_mode context for quant create and apply', async () => {
    const calls: Array<{ model: string; method: string; kwargs?: Record<string, unknown> }> = [];

    const odooCall: OdooCallFn = async <T>(params) => {
      calls.push({ model: params.model, method: params.method, kwargs: params.kwargs });

      if (params.model === 'stock.quant' && params.method === 'create') {
        return 101 as T;
      }

      return undefined as T;
    };

    await adjustSingleProductStock(odooCall, 1, 'secret', 55, { productId: 42, quantity: 3 });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      model: 'stock.quant',
      method: 'create',
      kwargs: { context: INVENTORY_MODE_CONTEXT },
    });
    assert.deepEqual(calls[1], {
      model: 'stock.quant',
      method: 'action_apply_inventory',
      kwargs: { context: INVENTORY_MODE_CONTEXT },
    });
  });

  it('rejects inventory conflict wizard responses', async () => {
    const odooCall: OdooCallFn = async <T>(params) => {
      if (params.method === 'create') return 101 as T;
      return { type: 'ir.actions.act_window', res_model: 'stock.inventory.conflict' } as T;
    };

    await assert.rejects(
      () => adjustSingleProductStock(odooCall, 1, 'secret', 55, { productId: 42, quantity: 3 }),
      /conflicteert met recente bewegingen/,
    );
  });
});

describe('adjustStockItems', () => {
  it('resolves warehouse location and reports per-item results', async () => {
    const odooCall: OdooCallFn = async <T>(params) => {
      if (params.model === 'stock.warehouse') {
        return [{ id: 1, name: 'Winkel', lot_stock_id: [55, 'Stock'] }] as T;
      }
      if (params.method === 'create') {
        const productId = (params.args[0] as { product_id: number }).product_id;
        return (productId === 99 ? 201 : 202) as T;
      }
      return undefined as T;
    };

    const results = await adjustStockItems(odooCall, 1, 'secret', [
      { productId: 42, quantity: 1 },
      { productId: 99, quantity: 0 },
    ]);

    assert.deepEqual(results, [
      { productId: 42, success: true },
      { productId: 99, success: true },
    ]);
  });
});
