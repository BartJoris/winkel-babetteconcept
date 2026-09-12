export const INVENTORY_MODE_CONTEXT = { inventory_mode: true };

export type OdooCallFn = <T>(params: {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
}) => Promise<T>;

export interface StockAdjustmentItem {
  productId: number;
  quantity: number;
}

export interface StockAdjustmentResult {
  productId: number;
  success: boolean;
  error?: string;
}

export function isOdooWizardAction(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'type' in result &&
    (result as { type?: string }).type === 'ir.actions.act_window'
  );
}

export async function getMainWarehouseLocationId(
  odooCall: OdooCallFn,
  uid: number,
  password: string,
): Promise<{ locationId: number; warehouseName: string }> {
  const warehouses = await odooCall<Array<{ id: number; name: string; lot_stock_id: [number, string] }>>({
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
    throw new Error('Geen magazijn gevonden in Odoo');
  }

  return {
    locationId: warehouses[0].lot_stock_id[0],
    warehouseName: warehouses[0].name,
  };
}

export async function adjustSingleProductStock(
  odooCall: OdooCallFn,
  uid: number,
  password: string,
  locationId: number,
  item: StockAdjustmentItem,
): Promise<void> {
  const inventoryKwargs = { context: INVENTORY_MODE_CONTEXT };

  // Odoo 19 requires inventory_mode to set counted quantities and apply adjustments.
  const quantId = await odooCall<number>({
    uid,
    password,
    model: 'stock.quant',
    method: 'create',
    args: [{
      product_id: item.productId,
      location_id: locationId,
      inventory_quantity: item.quantity,
    }],
    kwargs: inventoryKwargs,
  });

  const applyResult = await odooCall<unknown>({
    uid,
    password,
    model: 'stock.quant',
    method: 'action_apply_inventory',
    args: [[quantId]],
    kwargs: inventoryKwargs,
  });

  if (isOdooWizardAction(applyResult)) {
    throw new Error(
      'Voorraadtelling conflicteert met recente bewegingen. Pas de telling aan in Odoo.',
    );
  }
}

export async function adjustStockItems(
  odooCall: OdooCallFn,
  uid: number,
  password: string,
  items: StockAdjustmentItem[],
): Promise<StockAdjustmentResult[]> {
  const { locationId, warehouseName } = await getMainWarehouseLocationId(odooCall, uid, password);
  console.log('📍 Warehouse location:', warehouseName, '(ID:', locationId, ')');

  const results: StockAdjustmentResult[] = [];

  for (const item of items) {
    try {
      await adjustSingleProductStock(odooCall, uid, password, locationId, item);
      console.log('✅ Applied inventory for product', item.productId, 'to qty', item.quantity);
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

  return results;
}
