import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { odooClient } from '@/lib/odooClient';
import { ODOO_VARIANT_PRICE_FIELDS, variantListPrice } from '@/lib/odoo-product-price';
import { BRAND_ATTRIBUTE_NAMES, recordIsFavorite } from '@/lib/product-brands';
import {
  fetchAttributeValues,
  many2oneId,
  parseQueryBool,
  parseQueryInt,
} from '@/lib/odoo-attribute-values';
import {
  formatVariantAttributes,
  sizeRangeFromSizes,
} from '@/lib/product-variant-display';

const PAGE_SIZE = 200;

type FavoriteField = 'is_favorite' | 'priority';

type OdooVariantRow = {
  id: number;
  name: string;
  barcode: string | false | null;
  qty_available: number;
  product_tmpl_id: unknown;
  product_template_attribute_value_ids: number[];
  priority?: unknown;
  is_favorite?: unknown;
  list_price?: number;
  lst_price?: number;
  price_extra?: number;
};

type SiblingRow = {
  id: number;
  product_tmpl_id: unknown;
  product_template_attribute_value_ids: number[];
};

let cachedFavoriteField: FavoriteField | null | undefined;

async function resolveFavoriteField(uid: number, password: string): Promise<FavoriteField | null> {
  if (cachedFavoriteField !== undefined) return cachedFavoriteField;

  try {
    const fields = await odooClient.call<
      Record<string, { type?: string; related?: string }>
    >({
      uid,
      password,
      model: 'product.product',
      method: 'fields_get',
      args: [['priority', 'is_favorite']],
      kwargs: { attributes: ['type', 'related'] },
    });

    if (fields.is_favorite && !fields.is_favorite.related) {
      cachedFavoriteField = 'is_favorite';
    } else if (fields.priority) {
      cachedFavoriteField = 'priority';
    } else if (fields.is_favorite) {
      cachedFavoriteField = 'is_favorite';
    } else {
      cachedFavoriteField = null;
    }
  } catch (err) {
    console.warn('Could not resolve favorite field, falling back to priority:', err);
    cachedFavoriteField = 'priority';
  }

  return cachedFavoriteField;
}

async function searchReadAll<T>(params: {
  uid: number;
  password: string;
  model: string;
  domain: unknown[];
  fields: string[];
  order?: string;
}): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const page = await odooClient.call<T[]>({
      uid: params.uid,
      password: params.password,
      model: params.model,
      method: 'search_read',
      args: [params.domain],
      kwargs: {
        fields: params.fields,
        limit: PAGE_SIZE,
        offset,
        order: params.order,
      },
    });
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function brandValueIds(
  uid: number,
  password: string,
  brandId: number
): Promise<number[]> {
  const selected = await odooClient.call<Array<{ id: number; name: string }>>({
    uid,
    password,
    model: 'product.attribute.value',
    method: 'search_read',
    args: [[['id', '=', brandId]]],
    kwargs: { fields: ['id', 'name'], limit: 1 },
  });

  if (selected.length === 0) return [];

  const brandName = selected[0].name;
  const attributes = await odooClient.call<Array<{ id: number }>>({
    uid,
    password,
    model: 'product.attribute',
    method: 'search_read',
    args: [[['name', 'in', [...BRAND_ATTRIBUTE_NAMES]]]],
    kwargs: { fields: ['id'], limit: 20 },
  });

  const attrIds = attributes.map((a) => a.id);
  if (attrIds.length === 0) return [brandId];

  const siblings = await odooClient.call<Array<{ id: number }>>({
    uid,
    password,
    model: 'product.attribute.value',
    method: 'search_read',
    args: [
      [
        ['name', '=', brandName],
        ['attribute_id', 'in', attrIds],
      ],
    ],
    kwargs: { fields: ['id'], limit: 50 },
  });

  const ids = siblings.map((s) => s.id);
  return ids.length > 0 ? ids : [brandId];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getIronSession<SessionData>(req, res, sessionOptions);
    if (!session.isLoggedIn || !session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { uid, password } = session.user;
    const brandId = parseQueryInt(req.query.brandId);
    if (brandId == null) {
      return res.status(400).json({ error: 'brandId is verplicht' });
    }

    const favoritesOnly = parseQueryBool(req.query.favoritesOnly, false);
    const inStockOnly = parseQueryBool(req.query.inStockOnly, false);

    const valueIds = await brandValueIds(uid, password, brandId);
    if (valueIds.length === 0) {
      return res.status(404).json({ error: 'Merk niet gevonden' });
    }

    const ptavs = await odooClient.call<Array<{ id: number }>>({
      uid,
      password,
      model: 'product.template.attribute.value',
      method: 'search_read',
      args: [[['product_attribute_value_id', 'in', valueIds]]],
      kwargs: { fields: ['id'], limit: 5000 },
    });
    const ptavIds = ptavs.map((row) => row.id);
    if (ptavIds.length === 0) {
      return res.status(200).json({ success: true, brandId, favoriteField: null, products: [] });
    }

    const domain: unknown[] = [
      ['active', '=', true],
      ['product_template_attribute_value_ids', 'in', ptavIds],
    ];

    if (inStockOnly) {
      domain.push(['qty_available', '>', 0]);
    }

    const favoriteField = await resolveFavoriteField(uid, password);
    if (favoritesOnly && favoriteField === 'is_favorite') {
      domain.push(['is_favorite', '=', true]);
    } else if (favoritesOnly && favoriteField === 'priority') {
      domain.push(['priority', '=', '1']);
    }

    const fields = [
      'id',
      'name',
      'barcode',
      'qty_available',
      'product_tmpl_id',
      'product_template_attribute_value_ids',
      ...ODOO_VARIANT_PRICE_FIELDS,
    ];
    if (favoriteField) fields.push(favoriteField);

    const products = await searchReadAll<OdooVariantRow>({
      uid,
      password,
      model: 'product.product',
      domain,
      fields,
      order: 'name asc',
    });

    const tmplIds = [
      ...new Set(
        products
          .map((p) => many2oneId(p.product_tmpl_id))
          .filter((id): id is number => id != null)
      ),
    ];

    const siblings =
      tmplIds.length === 0
        ? []
        : await searchReadAll<SiblingRow>({
            uid,
            password,
            model: 'product.product',
            domain: [
              ['product_tmpl_id', 'in', tmplIds],
              ['active', '=', true],
            ],
            fields: ['id', 'product_tmpl_id', 'product_template_attribute_value_ids'],
          });

    const allAttrIds: number[] = [];
    for (const row of [...products, ...siblings]) {
      if (Array.isArray(row.product_template_attribute_value_ids)) {
        allAttrIds.push(...row.product_template_attribute_value_ids);
      }
    }

    const attrMap = await fetchAttributeValues(uid, password, allAttrIds);

    const sizesByTmpl = new Map<number, string[]>();
    for (const sibling of siblings) {
      const tmplId = many2oneId(sibling.product_tmpl_id);
      if (tmplId == null) continue;
      const size = formatVariantAttributes(
        sibling.product_template_attribute_value_ids || [],
        attrMap
      );
      if (!size) continue;
      const list = sizesByTmpl.get(tmplId) ?? [];
      list.push(size);
      sizesByTmpl.set(tmplId, list);
    }

    const sizeRangeByTmpl = new Map<number, string | null>();
    for (const [tmplId, sizes] of sizesByTmpl) {
      sizeRangeByTmpl.set(tmplId, sizeRangeFromSizes(sizes));
    }

    return res.status(200).json({
      success: true,
      brandId,
      favoriteField: favoriteField ?? null,
      products: products.map((p) => {
        const productTmplId = many2oneId(p.product_tmpl_id);
        return {
          id: p.id,
          name: p.name,
          barcode: typeof p.barcode === 'string' && p.barcode ? p.barcode : null,
          qty_available: typeof p.qty_available === 'number' ? p.qty_available : 0,
          list_price: variantListPrice(p),
          attributes: formatVariantAttributes(
            p.product_template_attribute_value_ids || [],
            attrMap
          ),
          productTmplId,
          sizeRange: productTmplId != null ? sizeRangeByTmpl.get(productTmplId) ?? null : null,
          favorite: recordIsFavorite(p),
        };
      }),
    });
  } catch (error) {
    console.error('Error listing products by brand:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Kon producten niet ophalen',
    });
  }
}
