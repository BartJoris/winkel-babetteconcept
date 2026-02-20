import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

// In-memory cache for attribute values (rarely change)
const ATTR_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const attrCache = new Map<number, { name: string; attributeName: string; expires: number }>();

function getCachedAttributes(ids: number[]): Record<number, { name: string; attributeName: string }> | null {
  const now = Date.now();
  const result: Record<number, { name: string; attributeName: string }> = {};
  for (const id of ids) {
    const cached = attrCache.get(id);
    if (!cached || cached.expires < now) return null;
    result[id] = { name: cached.name, attributeName: cached.attributeName };
  }
  return result;
}

function cacheAttributes(attrs: Array<{ id: number; name: string; attributeName: string }>) {
  const expires = Date.now() + ATTR_CACHE_TTL;
  for (const attr of attrs) {
    attrCache.set(attr.id, { name: attr.name, attributeName: attr.attributeName, expires });
  }
}

async function fetchAttributeValues(
  uid: number,
  password: string,
  attrIds: number[]
): Promise<Record<number, { name: string; attributeName: string }>> {
  if (attrIds.length === 0) return {};

  const uniqueIds = [...new Set(attrIds)];
  const cached = getCachedAttributes(uniqueIds);
  if (cached) return cached;

  const attrValues = await odooCall<any[]>({
    uid,
    password,
    model: 'product.template.attribute.value',
    method: 'search_read',
    args: [[['id', 'in', uniqueIds]]],
    kwargs: { fields: ['id', 'name', 'attribute_id'] },
  });

  const result: Record<number, { name: string; attributeName: string }> = {};
  const toCache: Array<{ id: number; name: string; attributeName: string }> = [];

  for (const av of attrValues) {
    const attributeName = av.attribute_id && typeof av.attribute_id !== 'boolean'
      ? av.attribute_id[1]
      : '';
    result[av.id] = { name: av.name, attributeName };
    toCache.push({ id: av.id, name: av.name, attributeName });
  }

  cacheAttributes(toCache);
  return result;
}

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
    throw new Error(json.error.message || 'Odoo API error');
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
    const { barcode, productId, light } = req.body;

    console.log('🔍 Product Scan Request - Barcode:', barcode, 'Product ID:', productId, 'Light:', !!light);

    const productFields = ['id', 'name', 'barcode', 'product_tmpl_id', 'qty_available', 'list_price'];

    // Light mode: fast scan returning only the scanned product (no images, no variants)
    if (light && barcode) {
      const products = await odooCall<any[]>({
        uid,
        password,
        model: 'product.product',
        method: 'search_read',
        args: [[
          ['barcode', '=', barcode.trim()],
          ['active', '=', true]
        ]],
        kwargs: {
          fields: [...productFields, 'product_template_attribute_value_ids'],
          limit: 1,
        },
      });

      if (products.length === 0) {
        return res.status(404).json({
          success: false,
          error: `Geen product gevonden met barcode: ${barcode}`,
        });
      }

      const p = products[0];

      const attrIds: number[] = p.product_template_attribute_value_ids || [];
      const attrMap = await fetchAttributeValues(uid, password, attrIds);
      const attributes = attrIds
        .map(id => attrMap[id])
        .filter(attr => attr && !attr.attributeName.toLowerCase().includes('merk'))
        .map(attr => attr.name)
        .join(', ');

      return res.status(200).json({
        success: true,
        productName: p.name,
        scannedVariantId: p.id,
        variants: [{
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          qty_available: p.qty_available,
          list_price: p.list_price,
          image: null,
          isScanned: true,
          attributes: attributes || null,
        }],
        totalVariants: 1,
      });
    }

    // If productId is provided, use it directly (from search results click)
    if (productId) {
      const products = await odooCall<any[]>({
        uid,
        password,
        model: 'product.product',
        method: 'search_read',
        args: [[
          ['id', '=', productId],
          ['active', '=', true]
        ]],
        kwargs: {
          fields: productFields,
          limit: 1,
        },
      });

      if (products.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'Product niet gevonden' 
        });
      }

      const scannedProduct = products[0];
      const templateId = scannedProduct.product_tmpl_id && typeof scannedProduct.product_tmpl_id !== 'boolean'
        ? scannedProduct.product_tmpl_id[0]
        : null;

      const result = await getVariantsResponse(uid, password, scannedProduct, templateId);
      return res.status(200).json(result);
    }

    if (!barcode) {
      return res.status(400).json({ error: 'Barcode or product name is required' });
    }

    // Try to search by barcode first (exclude archived products)
    let products = await odooCall<any[]>({
      uid,
      password,
      model: 'product.product',
      method: 'search_read',
      args: [[
        ['barcode', '=', barcode],
        ['active', '=', true]
      ]],
      kwargs: {
        fields: productFields,
        limit: 1,
      },
    });

    // If not found by barcode, search by name
    if (products.length === 0) {
      console.log('No product found with barcode, trying name search...');
      
      // Search in both variant name and barcode for better results (exclude archived)
      products = await odooCall<any[]>({
        uid,
        password,
        model: 'product.product',
        method: 'search_read',
        args: [[
          '|',
          ['name', 'ilike', barcode],
          ['barcode', 'ilike', barcode],
          ['active', '=', true]
        ]],
        kwargs: {
          fields: ['id', 'name', 'barcode', 'product_tmpl_id', 'qty_available', 'list_price', 'product_template_attribute_value_ids'],
          limit: 50,
          order: 'name asc',
        },
      });

      if (products.length === 0) {
        console.log('❌ No product found with name containing:', barcode);
        return res.status(404).json({ 
          success: false,
          error: `Geen product gevonden met naam of barcode: ${barcode}` 
        });
      }

      // If multiple products found by name, return search results with attributes
      if (products.length > 1) {
        console.log(`✅ Found ${products.length} products matching name search`);
        
        const allAttrIds: number[] = [];
        products.forEach(p => {
          if (Array.isArray(p.product_template_attribute_value_ids)) {
            allAttrIds.push(...p.product_template_attribute_value_ids);
          }
        });

        const attributeValueMap = await fetchAttributeValues(uid, password, allAttrIds);

        return res.status(200).json({
          success: true,
          isSearchResults: true,
          searchResults: products.map(p => {
            const attrIds = p.product_template_attribute_value_ids || [];
            const attributes = attrIds
              .map((id: number) => attributeValueMap[id])
              .filter((attr: any) => attr && !attr.attributeName.toLowerCase().includes('merk'))
              .map((attr: any) => attr.name)
              .join(', ');

            return {
              id: p.id,
              name: p.name,
              barcode: p.barcode,
              qty_available: p.qty_available,
              list_price: p.list_price,
              attributes: attributes || null,
            };
          }),
          totalResults: products.length,
        });
      }
    }

    const scannedProduct = products[0];
    const templateId = scannedProduct.product_tmpl_id && typeof scannedProduct.product_tmpl_id !== 'boolean'
      ? scannedProduct.product_tmpl_id[0]
      : null;

    console.log('✅ Found product:', scannedProduct.name, '(Template ID:', templateId, ')');

    const result = await getVariantsResponse(uid, password, scannedProduct, templateId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('❌ Error scanning product:', error);
    return res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Kon product niet scannen' 
    });
  }
}

async function getVariantsResponse(uid: number, password: string, scannedProduct: any, templateId: number | null) {
  if (!templateId) {
    return {
      success: true,
      productName: scannedProduct.name,
      scannedVariant: {
        id: scannedProduct.id,
        name: scannedProduct.name,
        barcode: scannedProduct.barcode,
        qty_available: scannedProduct.qty_available,
        list_price: scannedProduct.list_price,
      },
      variants: [],
      totalVariants: 1,
    };
  }

  // Fetch template name and all variants in parallel
  const [templates, allVariants] = await Promise.all([
    odooCall<any[]>({
      uid,
      password,
      model: 'product.template',
      method: 'search_read',
      args: [[['id', '=', templateId]]],
      kwargs: {
        fields: ['name'],
        limit: 1,
      },
    }),
    odooCall<any[]>({
      uid,
      password,
      model: 'product.product',
      method: 'search_read',
      args: [[
        ['product_tmpl_id', '=', templateId],
        ['active', '=', true]
      ]],
      kwargs: {
        fields: [
          'id',
          'name',
          'display_name',
          'barcode',
          'qty_available',
          'list_price',
          'product_template_attribute_value_ids',
        ],
        order: 'name asc',
      },
    }),
  ]);

  const productName = templates.length > 0 ? templates[0].name : scannedProduct.name;
  console.log(`✅ Found ${allVariants.length} variants for product template ${templateId}`);

  const allAttributeValueIds: number[] = [];
  allVariants.forEach(variant => {
    if (Array.isArray(variant.product_template_attribute_value_ids)) {
      allAttributeValueIds.push(...variant.product_template_attribute_value_ids);
    }
  });

  const attributeValueMap = await fetchAttributeValues(uid, password, allAttributeValueIds);

  const variants = allVariants.map(variant => {
    const variantAttributes = variant.product_template_attribute_value_ids || [];
    const attributeNames = variantAttributes
      .map((id: number) => attributeValueMap[id])
      .filter((attr: any) => attr && !attr.attributeName.toLowerCase().includes('merk'))
      .map((attr: any) => attr.name)
      .join(', ');

    return {
      id: variant.id,
      name: variant.display_name || variant.name,
      barcode: variant.barcode || null,
      qty_available: variant.qty_available,
      list_price: variant.list_price,
      isScanned: variant.id === scannedProduct.id,
      attributes: attributeNames || null,
    };
  });

  // Sort variants by attributes (numerically if they contain numbers like "3 jaar", "5 jaar")
  variants.sort((a, b) => {
    if (!a.attributes && !b.attributes) return 0;
    if (!a.attributes) return 1;
    if (!b.attributes) return -1;
    
    // Try to extract numbers from attributes for sorting (e.g., "3 jaar" -> 3)
    const aMatch = a.attributes.match(/(\d+)/);
    const bMatch = b.attributes.match(/(\d+)/);
    
    if (aMatch && bMatch) {
      const aNum = parseInt(aMatch[1]);
      const bNum = parseInt(bMatch[1]);
      if (aNum !== bNum) {
        return aNum - bNum; // Numerical sort
      }
    }
    
    // Fallback to alphabetical sort
    return a.attributes.localeCompare(b.attributes);
  });

  return {
    success: true,
    productName: productName,
    scannedVariantId: scannedProduct.id,
    variants: variants,
    totalVariants: variants.length,
  };
}

