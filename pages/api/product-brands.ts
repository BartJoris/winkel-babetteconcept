import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { odooClient } from '@/lib/odooClient';
import {
  BRAND_ATTRIBUTE_NAMES,
  dedupeBrands,
  type BrandAttributeValue,
} from '@/lib/product-brands';
import { many2oneId } from '@/lib/odoo-attribute-values';

type OdooAttribute = { id: number; name: string };
type OdooAttributeValueRow = {
  id: number;
  name: string;
  attribute_id: unknown;
};

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

    let attributes = await odooClient.call<OdooAttribute[]>({
      uid,
      password,
      model: 'product.attribute',
      method: 'search_read',
      args: [[['name', 'in', [...BRAND_ATTRIBUTE_NAMES]]]],
      kwargs: { fields: ['id', 'name'], limit: 20 },
    });

    if (attributes.length === 0) {
      attributes = await odooClient.call<OdooAttribute[]>({
        uid,
        password,
        model: 'product.attribute',
        method: 'search_read',
        args: [[['name', 'ilike', 'merk']]],
        kwargs: { fields: ['id', 'name'], limit: 20 },
      });
    }

    if (attributes.length === 0) {
      return res.status(200).json({ brands: [] });
    }

    const attrIds = attributes.map((a) => a.id);
    const attrNameById = new Map(attributes.map((a) => [a.id, a.name]));

    const values = await odooClient.call<OdooAttributeValueRow[]>({
      uid,
      password,
      model: 'product.attribute.value',
      method: 'search_read',
      args: [[['attribute_id', 'in', attrIds]]],
      kwargs: {
        fields: ['id', 'name', 'attribute_id'],
        limit: 2000,
        order: 'name asc',
      },
    });

    const mapped: BrandAttributeValue[] = values.map((row) => {
      const attributeId = many2oneId(row.attribute_id);
      return {
        id: row.id,
        name: row.name,
        attributeName: (attributeId != null ? attrNameById.get(attributeId) : '') || '',
      };
    });

    return res.status(200).json({ brands: dedupeBrands(mapped) });
  } catch (error) {
    console.error('Error listing product brands:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Kon merken niet ophalen',
    });
  }
}
