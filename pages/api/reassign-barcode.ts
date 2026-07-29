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

async function fetchAttributeValues(
  uid: number,
  password: string,
  attrIds: number[]
): Promise<Record<number, { name: string; attributeName: string }>> {
  if (attrIds.length === 0) return {};

  const uniqueIds = [...new Set(attrIds)];
  const attrValues = await odooCall<any[]>({
    uid,
    password,
    model: 'product.template.attribute.value',
    method: 'search_read',
    args: [[['id', 'in', uniqueIds]]],
    kwargs: { fields: ['id', 'name', 'attribute_id'] },
  });

  const result: Record<number, { name: string; attributeName: string }> = {};
  for (const av of attrValues) {
    const attributeName =
      av.attribute_id && typeof av.attribute_id !== 'boolean' ? av.attribute_id[1] : '';
    result[av.id] = { name: av.name, attributeName };
  }
  return result;
}

function formatAttributes(
  attrIds: number[],
  attrMap: Record<number, { name: string; attributeName: string }>
): string | null {
  const attributes = attrIds
    .map((id) => attrMap[id])
    .filter((attr) => attr && !attr.attributeName.toLowerCase().includes('merk'))
    .map((attr) => attr.name)
    .join(', ');
  return attributes || null;
}

async function readArchivedProduct(
  uid: number,
  password: string,
  archivedProductId: number
) {
  const archivedProducts = await odooCall<any[]>({
    uid,
    password,
    model: 'product.product',
    method: 'search_read',
    args: [[['id', '=', archivedProductId]]],
    kwargs: {
      fields: ['id', 'name', 'barcode', 'active'],
      limit: 1,
      context: { active_test: false },
    },
  });
  return archivedProducts[0] ?? null;
}

async function readTargetProduct(
  uid: number,
  password: string,
  targetProductId: number
) {
  const targetProducts = await odooCall<any[]>({
    uid,
    password,
    model: 'product.product',
    method: 'search_read',
    args: [[
      ['id', '=', targetProductId],
      ['active', '=', true],
    ]],
    kwargs: {
      fields: [
        'id',
        'name',
        'barcode',
        'list_price',
        'qty_available',
        'product_tmpl_id',
        'product_template_attribute_value_ids',
      ],
      limit: 1,
    },
  });
  return targetProducts[0] ?? null;
}

async function buildProductResponse(
  uid: number,
  password: string,
  target: any,
  trimmedBarcode: string
) {
  const attrIds: number[] = target.product_template_attribute_value_ids || [];
  const attrMap = await fetchAttributeValues(uid, password, attrIds);
  const attributes = formatAttributes(attrIds, attrMap);

  let sizeRange: string | null = null;
  const templateId =
    target.product_tmpl_id && typeof target.product_tmpl_id !== 'boolean'
      ? target.product_tmpl_id[0]
      : null;

  if (templateId) {
    const siblings = await odooCall<any[]>({
      uid,
      password,
      model: 'product.product',
      method: 'search_read',
      args: [[
        ['product_tmpl_id', '=', templateId],
        ['active', '=', true],
      ]],
      kwargs: {
        fields: ['id', 'product_template_attribute_value_ids'],
      },
    });

    const allSiblingAttrIds: number[] = [];
    for (const s of siblings) {
      if (Array.isArray(s.product_template_attribute_value_ids)) {
        allSiblingAttrIds.push(...s.product_template_attribute_value_ids);
      }
    }
    const siblingAttrMap = await fetchAttributeValues(uid, password, allSiblingAttrIds);

    const sizeValues: string[] = [];
    for (const s of siblings) {
      const sAttrIds: number[] = s.product_template_attribute_value_ids || [];
      const size = formatAttributes(sAttrIds, siblingAttrMap);
      if (size) sizeValues.push(size);
    }

    if (sizeValues.length > 1) {
      const toMonths = (s: string): number | null => {
        const m = s.match(/(\d+)\s*maand/i);
        if (m) return parseInt(m[1]);
        const j = s.match(/(\d+)\s*jaar/i);
        if (j) return parseInt(j[1]) * 12;
        const n = s.match(/(\d+)/);
        if (n) return parseInt(n[1]);
        return null;
      };
      sizeValues.sort((a, b) => {
        const aVal = toMonths(a);
        const bVal = toMonths(b);
        if (aVal !== null && bVal !== null) return aVal - bVal;
        return a.localeCompare(b);
      });
      sizeRange = `${sizeValues[0]} - ${sizeValues[sizeValues.length - 1]}`;
    }
  }

  return {
    id: target.id,
    name: target.name,
    barcode: trimmedBarcode,
    list_price: target.list_price,
    qty_available: target.qty_available,
    attributes,
    sizeRange,
    productTmplId: templateId,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getIronSession<SessionData>(req, res, sessionOptions);

    if (!session.isLoggedIn || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { uid, password } = session.user;
    const { barcode, archivedProductId, targetProductId, action, replaceExisting } = req.body as {
      barcode?: string;
      archivedProductId?: number;
      targetProductId?: number;
      action?: 'clear' | 'assign' | 'reassign';
      replaceExisting?: boolean;
    };

    const trimmedBarcode = typeof barcode === 'string' ? barcode.trim() : '';
    if (!trimmedBarcode) {
      return res.status(400).json({ error: 'barcode is verplicht' });
    }

    const mode: 'clear' | 'assign' | 'reassign' =
      action === 'clear' || action === 'assign' || action === 'reassign'
        ? action
        : archivedProductId && targetProductId
          ? 'reassign'
          : archivedProductId
            ? 'clear'
            : targetProductId
              ? 'assign'
              : 'reassign';

    if (mode === 'clear') {
      if (!archivedProductId) {
        return res.status(400).json({ error: 'archivedProductId is verplicht om te leegmaken' });
      }

      const archived = await readArchivedProduct(uid, password, archivedProductId);
      if (!archived) {
        return res.status(404).json({ error: 'Gearchiveerd product niet gevonden' });
      }
      if (archived.active) {
        return res.status(400).json({ error: 'Bronproduct is niet gearchiveerd' });
      }
      if (archived.barcode !== trimmedBarcode) {
        return res.status(409).json({
          error: `Barcode staat niet meer op gearchiveerd product "${archived.name}"`,
        });
      }

      await odooCall<boolean>({
        uid,
        password,
        model: 'product.product',
        method: 'write',
        args: [[archivedProductId], { barcode: false }],
        kwargs: { context: { active_test: false } },
      });

      return res.status(200).json({
        success: true,
        cleared: true,
        clearedFrom: { id: archived.id, name: archived.name },
        barcode: trimmedBarcode,
      });
    }

    if (mode === 'assign') {
      if (!targetProductId) {
        return res.status(400).json({ error: 'targetProductId is verplicht om toe te wijzen' });
      }

      const target = await readTargetProduct(uid, password, targetProductId);
      if (!target) {
        return res.status(404).json({ error: 'Doelproduct niet gevonden of niet actief' });
      }

      const existingBarcode =
        typeof target.barcode === 'string' && target.barcode.trim() ? target.barcode.trim() : '';
      if (existingBarcode && existingBarcode !== trimmedBarcode && !replaceExisting) {
        return res.status(409).json({
          needsReplace: true,
          existingBarcode,
          error: `Doelproduct heeft al barcode "${existingBarcode}".`,
        });
      }

      // Ensure barcode is not still held by another product (incl. archived)
      const holders = await odooCall<any[]>({
        uid,
        password,
        model: 'product.product',
        method: 'search_read',
        args: [[['barcode', '=', trimmedBarcode]]],
        kwargs: {
          fields: ['id', 'name', 'active'],
          limit: 5,
          context: { active_test: false },
        },
      });
      const otherHolder = holders.find((p) => p.id !== targetProductId);
      if (otherHolder) {
        return res.status(409).json({
          error: `Barcode zit nog op ${otherHolder.active === false ? 'gearchiveerd ' : ''}product "${otherHolder.name}". Maak die eerst leeg.`,
        });
      }

      await odooCall<boolean>({
        uid,
        password,
        model: 'product.product',
        method: 'write',
        args: [[targetProductId], { barcode: trimmedBarcode }],
      });

      const product = await buildProductResponse(uid, password, target, trimmedBarcode);
      return res.status(200).json({
        success: true,
        assigned: true,
        replacedBarcode: existingBarcode && existingBarcode !== trimmedBarcode ? existingBarcode : undefined,
        product,
      });
    }

    // Full reassign (clear archived + assign target)
    if (!archivedProductId || !targetProductId) {
      return res.status(400).json({
        error: 'barcode, archivedProductId en targetProductId zijn verplicht',
      });
    }

    if (archivedProductId === targetProductId) {
      return res.status(400).json({ error: 'Gearchiveerd en doelproduct moeten verschillen' });
    }

    const archived = await readArchivedProduct(uid, password, archivedProductId);
    if (!archived) {
      return res.status(404).json({ error: 'Gearchiveerd product niet gevonden' });
    }
    if (archived.active) {
      return res.status(400).json({ error: 'Bronproduct is niet gearchiveerd' });
    }
    if (archived.barcode !== trimmedBarcode) {
      return res.status(409).json({
        error: `Barcode staat niet meer op gearchiveerd product "${archived.name}"`,
      });
    }

    const target = await readTargetProduct(uid, password, targetProductId);
    if (!target) {
      return res.status(404).json({ error: 'Doelproduct niet gevonden of niet actief' });
    }

    const existingBarcode =
      typeof target.barcode === 'string' && target.barcode.trim() ? target.barcode.trim() : '';
    if (existingBarcode && existingBarcode !== trimmedBarcode && !replaceExisting) {
      return res.status(409).json({
        needsReplace: true,
        existingBarcode,
        error: `Doelproduct heeft al barcode "${existingBarcode}".`,
      });
    }

    await odooCall<boolean>({
      uid,
      password,
      model: 'product.product',
      method: 'write',
      args: [[archivedProductId], { barcode: false }],
      kwargs: { context: { active_test: false } },
    });

    try {
      await odooCall<boolean>({
        uid,
        password,
        model: 'product.product',
        method: 'write',
        args: [[targetProductId], { barcode: trimmedBarcode }],
      });
    } catch (writeErr) {
      try {
        await odooCall<boolean>({
          uid,
          password,
          model: 'product.product',
          method: 'write',
          args: [[archivedProductId], { barcode: trimmedBarcode }],
          kwargs: { context: { active_test: false } },
        });
      } catch (restoreErr) {
        console.error('❌ Failed to restore barcode on archived product:', restoreErr);
      }
      throw writeErr;
    }

    const product = await buildProductResponse(uid, password, target, trimmedBarcode);
    return res.status(200).json({
      success: true,
      product,
      clearedFrom: { id: archived.id, name: archived.name },
    });
  } catch (error) {
    console.error('❌ Error reassigning barcode:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Kon barcode niet toewijzen',
    });
  }
}
