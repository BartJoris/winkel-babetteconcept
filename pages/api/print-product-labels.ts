import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
const bwipjs = require('bwip-js');

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

async function generateBarcode(text: string): Promise<string> {
  try {
    const isEan13 = /^\d{13}$/.test(text);
    const isEan8 = /^\d{8}$/.test(text);

    const png = await bwipjs.toBuffer({
      bcid: isEan13 ? 'ean13' : isEan8 ? 'ean8' : 'code128',
      text,
      scale: 3,
      height: 10,
      includetext: false,
    });

    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (err) {
    console.error('Error generating barcode for', text, ':', err);
    return '';
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface LabelProduct {
  id: number;
  name: string;
  barcode: string | null;
  list_price: number;
}

function generateLabelsHTML(products: LabelProduct[], barcodeImages: Map<string, string>): string {
  const labelBlocks = products.map((product) => {
    const barcodeDataUrl = product.barcode ? barcodeImages.get(product.barcode) || '' : '';
    const price = product.list_price.toLocaleString('nl-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    });

    return `
      <div class="label">
        <div class="product-name">${escapeHtml(product.name)}</div>
        <div class="price">${price}</div>
        ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" class="barcode" alt="Barcode" />` : ''}
        ${product.barcode ? `<div class="barcode-text">${escapeHtml(product.barcode)}</div>` : ''}
      </div>`;
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Product Labels</title>
  <style>
    @page {
      size: 62mm 29mm;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
    }
    .label {
      width: 62mm;
      height: 29mm;
      padding: 1.5mm 2mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      page-break-after: always;
      overflow: hidden;
    }
    .label:last-child {
      page-break-after: auto;
    }
    .product-name {
      font-size: 8pt;
      font-weight: bold;
      color: #000;
      margin-bottom: 1mm;
      max-height: 8mm;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.2;
      width: 100%;
    }
    .price {
      font-size: 11pt;
      font-weight: bold;
      color: #000;
      margin-bottom: 1mm;
    }
    .barcode {
      max-width: 54mm;
      height: auto;
      max-height: 8mm;
      margin-bottom: 0.5mm;
    }
    .barcode-text {
      font-size: 7pt;
      font-family: 'Courier New', monospace;
      color: #333;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  ${labelBlocks.join('\n')}
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 400);
    };
  </script>
</body>
</html>`;
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
    const { productIds } = req.body as { productIds: number[] };

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ error: 'Product IDs array is required' });
    }

    console.log('🏷️ Generating labels for', productIds.length, 'products');

    const products = await odooCall<any[]>({
      uid,
      password,
      model: 'product.product',
      method: 'search_read',
      args: [[['id', 'in', productIds]]],
      kwargs: {
        fields: ['id', 'name', 'barcode', 'list_price'],
      },
    });

    // Maintain the order of productIds (may contain duplicates for multiple labels)
    const productMap = new Map<number, LabelProduct>();
    for (const p of products) {
      productMap.set(p.id, {
        id: p.id,
        name: p.name,
        barcode: p.barcode || null,
        list_price: p.list_price || 0,
      });
    }

    const orderedProducts: LabelProduct[] = [];
    for (const id of productIds) {
      const product = productMap.get(id);
      if (product) {
        orderedProducts.push(product);
      }
    }

    // Generate all barcodes
    const barcodeImages = new Map<string, string>();
    const uniqueBarcodes = [...new Set(orderedProducts.map(p => p.barcode).filter(Boolean))] as string[];
    await Promise.all(
      uniqueBarcodes.map(async (barcode) => {
        const img = await generateBarcode(barcode);
        if (img) barcodeImages.set(barcode, img);
      })
    );

    const html = generateLabelsHTML(orderedProducts, barcodeImages);

    console.log('✅ Generated', orderedProducts.length, 'labels');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (error) {
    console.error('❌ Error generating product labels:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Kon labels niet genereren',
    });
  }
}
