export type PendingOrdersOdooCallParams = {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
};

export type PendingOrdersOdooCall = <T>(params: PendingOrdersOdooCallParams) => Promise<T>;

export type PendingOrder = {
  id: number;
  name: string;
  date_order: string;
  amount_total: number;
  partner_id: [number, string] | false;
  partner_name: string;
  partner_email: string | null;
  partner_phone: string | null;
  partner_street: string | null;
  partner_city: string | null;
  partner_zip: string | null;
  partner_country: string | null;
  state: string;
  website_id: [number, string] | false;
  picking_state: string | null;
  order_line: Array<{
    product_id: [number, string];
    product_uom_qty: number;
    price_unit: number;
    price_total: number;
  }>;
};

type OdooRecord = Record<string, unknown>;

function many2oneId(value: unknown): number | null {
  return Array.isArray(value) && typeof value[0] === 'number' ? value[0] : null;
}

function many2oneName(value: unknown): string | null {
  return Array.isArray(value) && typeof value[1] === 'string' ? value[1] : null;
}

/**
 * Last 10 e-commerce sale orders, with partners/lines/pickings loaded in
 * 4 Odoo roundtrips (1 + 3 in parallel) instead of 1 + 3N sequential calls.
 */
export async function loadPendingOrders(
  odooCall: PendingOrdersOdooCall,
  uid: number,
  password: string
): Promise<PendingOrder[]> {
  const orders = await odooCall<OdooRecord[]>({
    uid,
    password,
    model: 'sale.order',
    method: 'search_read',
    args: [
      [
        ['state', 'in', ['sent', 'sale', 'done']],
        ['website_id', '!=', false],
      ],
    ],
    kwargs: {
      fields: [
        'id',
        'name',
        'date_order',
        'amount_total',
        'partner_id',
        'state',
        'website_id',
      ],
      order: 'date_order desc',
      limit: 10,
    },
  });

  if (orders.length === 0) {
    return [];
  }

  const orderIds = orders.map((order) => order.id as number);
  const partnerIds = [
    ...new Set(
      orders
        .map((order) => many2oneId(order.partner_id))
        .filter((id): id is number => id !== null)
    ),
  ];

  const [allPartners, allOrderLines, allPickings] = await Promise.all([
    partnerIds.length > 0
      ? odooCall<OdooRecord[]>({
          uid,
          password,
          model: 'res.partner',
          method: 'search_read',
          args: [[['id', 'in', partnerIds]]],
          kwargs: {
            fields: ['name', 'email', 'phone', 'street', 'city', 'zip', 'country_id'],
          },
        })
      : Promise.resolve([] as OdooRecord[]),
    odooCall<OdooRecord[]>({
      uid,
      password,
      model: 'sale.order.line',
      method: 'search_read',
      args: [[['order_id', 'in', orderIds]]],
      kwargs: {
        fields: ['order_id', 'product_id', 'product_uom_qty', 'price_unit', 'price_total'],
      },
    }),
    odooCall<OdooRecord[]>({
      uid,
      password,
      model: 'stock.picking',
      method: 'search_read',
      args: [[['sale_id', 'in', orderIds]]],
      kwargs: {
        fields: ['sale_id', 'state'],
      },
    }).catch(() => [] as OdooRecord[]),
  ]);

  const partnerMap = new Map(allPartners.map((partner) => [partner.id as number, partner]));
  const orderLinesMap = new Map<number, OdooRecord[]>();
  for (const line of allOrderLines) {
    const orderId = many2oneId(line.order_id);
    if (orderId === null) continue;
    const lines = orderLinesMap.get(orderId);
    if (lines) {
      lines.push(line);
    } else {
      orderLinesMap.set(orderId, [line]);
    }
  }

  const pickingMap = new Map<number, string>();
  for (const picking of allPickings) {
    const saleId = many2oneId(picking.sale_id);
    if (saleId === null || pickingMap.has(saleId)) continue;
    pickingMap.set(saleId, typeof picking.state === 'string' ? picking.state : String(picking.state));
  }

  return orders.map((order) => {
    const partnerId = many2oneId(order.partner_id);
    const partnerDetails = partnerId ? partnerMap.get(partnerId) ?? {} : {};
    const orderLines = orderLinesMap.get(order.id as number) ?? [];

    return {
      id: order.id as number,
      name: String(order.name),
      date_order: String(order.date_order),
      amount_total: Number(order.amount_total),
      partner_id: (order.partner_id as [number, string] | false) || false,
      partner_name:
        typeof partnerDetails.name === 'string' ? partnerDetails.name : 'Onbekend',
      partner_email: typeof partnerDetails.email === 'string' ? partnerDetails.email : null,
      partner_phone: typeof partnerDetails.phone === 'string' ? partnerDetails.phone : null,
      partner_street: typeof partnerDetails.street === 'string' ? partnerDetails.street : null,
      partner_city: typeof partnerDetails.city === 'string' ? partnerDetails.city : null,
      partner_zip: typeof partnerDetails.zip === 'string' ? partnerDetails.zip : null,
      partner_country: many2oneName(partnerDetails.country_id),
      state: String(order.state),
      website_id: (order.website_id as [number, string] | false) || false,
      picking_state: pickingMap.get(order.id as number) ?? null,
      order_line: orderLines.map((line) => ({
        product_id: line.product_id as [number, string],
        product_uom_qty: Number(line.product_uom_qty),
        price_unit: Number(line.price_unit),
        price_total: Number(line.price_total),
      })),
    };
  });
}
