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
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.isLoggedIn || !session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { uid, password } = session.user;

  try {
    const [programFields] = await Promise.all([
      odooCall<Record<string, any>>({
        uid, password,
        model: 'loyalty.program',
        method: 'fields_get',
        args: [],
        kwargs: { attributes: ['string', 'type', 'relation'] },
      }),
    ]);

    const programProductFields = Object.entries(programFields)
      .filter(([, v]: [string, any]) => v.relation === 'product.product' || v.relation === 'product.template')
      .map(([k]) => k);

    const programReadFields = ['id', 'name', 'program_type', 'active', ...programProductFields];

    // Fetch gift_card programs only
    const programs = await odooCall<any[]>({
      uid, password,
      model: 'loyalty.program',
      method: 'search_read',
      args: [[['program_type', '=', 'gift_card']]],
      kwargs: {
        fields: programReadFields,
        context: { active_test: false, lang: 'nl_BE' },
      },
    });

    // Count loyalty.cards per program (total + with remaining balance)
    const cardCounts: Record<number, { total: number; with_balance: number }> = {};
    for (const prog of programs) {
      const [total, withBalance] = await Promise.all([
        odooCall<number>({
          uid, password,
          model: 'loyalty.card',
          method: 'search_count',
          args: [[['program_id', '=', prog.id]]],
          kwargs: { context: { active_test: false } },
        }),
        odooCall<number>({
          uid, password,
          model: 'loyalty.card',
          method: 'search_count',
          args: [[['program_id', '=', prog.id], ['points', '>', 0]]],
          kwargs: { context: { active_test: false } },
        }),
      ]);
      cardCounts[prog.id] = { total, with_balance: withBalance };
    }

    // Collect all product IDs referenced by programs
    const programProductIds: number[] = [];
    for (const p of programs) {
      for (const field of programProductFields) {
        const val = p[field];
        if (Array.isArray(val)) {
          for (const v of val) {
            if (typeof v === 'number') programProductIds.push(v);
          }
        } else if (typeof val === 'number' && val > 0) {
          programProductIds.push(val);
        }
      }
    }

    // Also search for all gift/cadeau products by name
    const allGiftProducts = await odooCall<any[]>({
      uid, password,
      model: 'product.product',
      method: 'search_read',
      args: [[
        '|', '|', '|',
        ['name', 'ilike', 'gift card'],
        ['name', 'ilike', 'cadeaubon'],
        ['name', 'ilike', 'geschenkbon'],
        ['name', 'ilike', 'voucher'],
      ]],
      kwargs: {
        fields: ['id', 'name', 'display_name', 'active', 'sale_ok', 'taxes_id', 'list_price', 'type', 'product_tmpl_id'],
        context: { active_test: false },
      },
    });

    // Also fetch program-linked products that might not match name search
    const missingIds = programProductIds.filter(id => !allGiftProducts.some((p: any) => p.id === id));
    if (missingIds.length > 0) {
      const extra = await odooCall<any[]>({
        uid, password,
        model: 'product.product',
        method: 'search_read',
        args: [[['id', 'in', missingIds]]],
        kwargs: {
          fields: ['id', 'name', 'display_name', 'active', 'sale_ok', 'taxes_id', 'list_price', 'type', 'product_tmpl_id'],
          context: { active_test: false },
        },
      });
      allGiftProducts.push(...extra);
    }

    // Resolve taxes
    const allTaxIds = [...new Set(allGiftProducts.flatMap((p: any) => p.taxes_id || []))];
    let taxes: any[] = [];
    if (allTaxIds.length > 0) {
      taxes = await odooCall<any[]>({
        uid, password,
        model: 'account.tax',
        method: 'search_read',
        args: [[['id', 'in', allTaxIds]]],
        kwargs: { fields: ['id', 'name', 'amount', 'type_tax_use'] },
      });
    }
    const taxMap: Record<number, any> = Object.fromEntries(taxes.map((t: any) => [t.id, t]));

    const linkedProductIds = new Set(programProductIds);

    const enrichProduct = (p: any) => ({
      ...p,
      taxes_detail: (p.taxes_id || []).map((id: number) => taxMap[id] || { id, name: '?' }),
      has_tax: (p.taxes_id || []).length > 0,
      linked_to_program: linkedProductIds.has(p.id),
    });

    return res.status(200).json({
      programs: programs.map(p => ({
        ...p,
        card_counts: cardCounts[p.id] || { total: 0, with_balance: 0 },
      })),
      products: allGiftProducts.map(enrichProduct),
      program_product_fields: programProductFields,
      odoo_url: ODOO_URL.replace('/jsonrpc', ''),
    });
  } catch (error) {
    console.error('Debug gift cards error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
