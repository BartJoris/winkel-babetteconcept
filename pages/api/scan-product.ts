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
    const { barcode, productId } = req.body;

    console.log('🔍 Product Scan Request - Barcode:', barcode, 'Product ID:', productId);

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
          fields: ['id', 'name', 'barcode', 'product_tmpl_id', 'qty_available', 'list_price', 'image_1920'],
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
        fields: ['id', 'name', 'barcode', 'product_tmpl_id', 'qty_available', 'list_price', 'image_1920'],
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
          fields: ['id', 'name', 'barcode', 'product_tmpl_id', 'qty_available', 'list_price', 'image_1920', 'product_template_attribute_value_ids'],
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
        
        // Get all attribute value IDs from search results
        const allAttrIds: number[] = [];
        products.forEach(p => {
          if (p.product_template_attribute_value_ids && Array.isArray(p.product_template_attribute_value_ids)) {
            allAttrIds.push(...p.product_template_attribute_value_ids);
          }
        });

        // Fetch attribute values with their attribute names
        const attributeValueMap: Record<number, { name: string; attributeName: string }> = {};
        if (allAttrIds.length > 0) {
          const uniqueIds = [...new Set(allAttrIds)];
          const attrValues = await odooCall<any[]>({
            uid,
            password,
            model: 'product.template.attribute.value',
            method: 'search_read',
            args: [[['id', 'in', uniqueIds]]],
            kwargs: {
              fields: ['id', 'name', 'attribute_id'],
            },
          });

          attrValues.forEach(av => {
            const attrName = av.attribute_id && typeof av.attribute_id !== 'boolean' 
              ? av.attribute_id[1] 
              : '';
            attributeValueMap[av.id] = {
              name: av.name,
              attributeName: attrName,
            };
          });
        }

        return res.status(200).json({
          success: true,
          isSearchResults: true,
          searchResults: products.map(p => {
            // Get attributes but exclude "Merk" (brand)
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
              image: p.image_1920,
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
        image: scannedProduct.image_1920,
      },
      variants: [],
      totalVariants: 1,
    };
  }

  // Get the product template name
  const templates = await odooCall<any[]>({
    uid,
    password,
    model: 'product.template',
    method: 'search_read',
    args: [[['id', '=', templateId]]],
    kwargs: {
      fields: ['name'],
      limit: 1,
    },
  });

  const productName = templates.length > 0 ? templates[0].name : scannedProduct.name;

  // Get all variants of this product template (exclude archived)
  const allVariants = await odooCall<any[]>({
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
        'image_1920',
        'product_template_attribute_value_ids',
      ],
      order: 'name asc',
    },
  });

  console.log(`✅ Found ${allVariants.length} variants for product template ${templateId}`);

  // Get all attribute value IDs from all variants
  const allAttributeValueIds: number[] = [];
  allVariants.forEach(variant => {
    if (variant.product_template_attribute_value_ids && Array.isArray(variant.product_template_attribute_value_ids)) {
      allAttributeValueIds.push(...variant.product_template_attribute_value_ids);
    }
  });

  // Fetch attribute values with attribute names to filter out "Merk"
  const attributeValueMap: Record<number, { name: string; attributeName: string }> = {};
  if (allAttributeValueIds.length > 0) {
    const uniqueIds = [...new Set(allAttributeValueIds)];
    const attrValues = await odooCall<any[]>({
      uid,
      password,
      model: 'product.template.attribute.value',
      method: 'search_read',
      args: [[['id', 'in', uniqueIds]]],
      kwargs: {
        fields: ['id', 'name', 'attribute_id'],
      },
    });

    attrValues.forEach(av => {
      const attrName = av.attribute_id && typeof av.attribute_id !== 'boolean' 
        ? av.attribute_id[1] 
        : '';
      attributeValueMap[av.id] = {
        name: av.name,
        attributeName: attrName,
      };
    });
  }

  const variants = allVariants.map(variant => {
    // Get attribute values for this variant, excluding "Merk" (brand)
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
      image: variant.image_1920 || null,
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

