import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { generateZPL as generateZPLFromLib, abbreviateRange } from '@/lib/zpl-labels';
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
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
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
  attributes: string | null;
  sizeRange: string | null;
}

type PrinterType = 'zebra' | 'dymo';
type LabelFormat = 'normal' | 'small';

// Formaten in mm (fysiek label). Het printvenster toont vaak inches: Zebra 51×25 mm = 2×1 in, Dymo 62×29 mm ≈ 2.44×1.14 in.
const ZEBRA_LABEL_MM = { width: 51, height: 25 };
const DYMO_LABEL_MM = { width: 62, height: 29 };

const PRINTER_STYLES: Record<PrinterType, { page: string; label: string; barcode: string }> = {
  zebra: {
    page: `size: ${ZEBRA_LABEL_MM.width}mm ${ZEBRA_LABEL_MM.height}mm landscape;`,
    label: `width: ${ZEBRA_LABEL_MM.width}mm; height: ${ZEBRA_LABEL_MM.height}mm; padding: 0.8mm 1.5mm;`,
    barcode: `max-width: ${ZEBRA_LABEL_MM.width - 6}mm; max-height: 8mm;`,
  },
  dymo: {
    page: `size: ${DYMO_LABEL_MM.width}mm ${DYMO_LABEL_MM.height}mm landscape;`,
    label: `width: ${DYMO_LABEL_MM.width}mm; height: ${DYMO_LABEL_MM.height}mm; padding: 1.5mm 2mm;`,
    barcode: `max-width: ${DYMO_LABEL_MM.width - 8}mm; max-height: 8mm;`,
  },
};

const SMALL_FORMAT_STYLE = {
  page: 'size: 25mm 25mm;',
  label: 'width: 25mm; height: 25mm; padding: 1mm;',
};

function generateLabelsHTML(
  products: LabelProduct[],
  barcodeImages: Map<string, string>,
  printer: PrinterType = 'zebra',
  format: LabelFormat = 'normal'
): string {
  const isSmall = format === 'small';
  const pageStyle = isSmall ? SMALL_FORMAT_STYLE.page : PRINTER_STYLES[printer].page;
  const labelStyle = isSmall ? SMALL_FORMAT_STYLE.label : PRINTER_STYLES[printer].label;

  const labelBlocks = products.map((product) => {
    const price = product.list_price.toLocaleString('nl-BE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    });
    const variantLine = [product.attributes, product.sizeRange ? abbreviateRange(product.sizeRange) : '']
      .filter(Boolean)
      .join(' – ');

    if (isSmall) {
      return `
      <div class="label label-small">
        <div class="price">${price}</div>
        ${variantLine ? `<div class="variant">${escapeHtml(variantLine)}</div>` : ''}
      </div>`;
    }

    const barcodeDataUrl = product.barcode ? barcodeImages.get(product.barcode) || '' : '';
    const isZebraLabel = !isSmall && printer === 'zebra';
    const labelContent = `
      <div class="label${isZebraLabel ? ' label-zebra' : ''}">
        <div class="product-name">${escapeHtml(product.name)}</div>
        ${product.attributes ? `<div class="attributes">${escapeHtml(product.attributes)}${product.sizeRange ? ` (${escapeHtml(abbreviateRange(product.sizeRange))})` : ''}</div>` : product.sizeRange ? `<div class="attributes">(${escapeHtml(abbreviateRange(product.sizeRange))})</div>` : ''}
        <div class="price">${price}</div>
        ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" class="barcode" alt="Barcode" />` : ''}
        ${product.barcode ? `<div class="barcode-text">${escapeHtml(product.barcode)}</div>` : ''}
      </div>`;
    return isZebraLabel ? `<div class="label-zebra-flip">${labelContent}</div>` : labelContent;
  });

  const barcodeStyle = isSmall ? '' : PRINTER_STYLES[printer].barcode;
  const isZebra = !isSmall && printer === 'zebra';
  const printHint = isZebra
    ? '<p class="print-hint">Zebra <strong>51×25 mm</strong>: in het printvenster kies je hetzelfde formaat (vaak in inches: <strong>2×1 in</strong>), <strong>Landscape</strong>, <strong>Aantal: 1</strong>. Preview toont tekst ondersteboven; op het label staat hij recht.</p>'
    : '';

  return `
<!DOCTYPE html>
<html lang="nl"${isZebra ? ' data-printer="zebra"' : ''}>
<head>
  <meta charset="UTF-8">
  <title>Product Labels</title>
  <meta name="description" content="${isZebra ? 'Zebra 51x25mm labels' : 'Product labels'}">
  <style>
    @page {
      ${pageStyle}
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
    .print-hint {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 8px 12px;
      background: #e8f4ea;
      border-bottom: 1px solid #2e7d32;
      font-size: 13px;
      color: #1b5e20;
      z-index: 9999;
    }
    @media print {
      .print-hint { display: none !important; }
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    .label {
      ${labelStyle}
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
    .label-zebra-flip {
      width: ${ZEBRA_LABEL_MM.width}mm; height: ${ZEBRA_LABEL_MM.height}mm; display: flex; align-items: center; justify-content: center; overflow: hidden; page-break-after: always;
      transform: rotate(180deg); transform-origin: center center;
    }
    .label-zebra-flip:last-of-type { page-break-after: auto; }
    .label-zebra .product-name { font-size: 10pt !important; font-weight: bold; margin-bottom: 0.5mm; line-height: 1.2; max-height: 8mm; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .label-zebra .attributes { font-size: 9pt !important; font-weight: bold; margin-bottom: 0.5mm; line-height: 1.2; }
    .label-zebra .price { font-size: 12pt !important; font-weight: bold; margin-bottom: 0.5mm; line-height: 1.2; }
    .label-zebra .barcode { max-height: 8mm !important; margin-bottom: 0.4mm; }
    .label-zebra .barcode-text { font-size: 6pt !important; }
    .label-small .price {
      font-size: 10pt;
      font-weight: bold;
      color: #000;
      margin-bottom: 1mm;
    }
    .label-small .variant {
      font-size: 7pt;
      font-weight: bold;
      color: #333;
      max-height: 8mm;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.2;
    }
    .product-name {
      font-size: 8pt;
      font-weight: bold;
      color: #000;
      margin-bottom: 0.5mm;
      max-height: 7mm;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.2;
      width: 100%;
    }
    .attributes {
      font-size: 9pt;
      font-weight: bold;
      color: #333;
      margin-bottom: 0.5mm;
    }
    .price {
      font-size: 11pt;
      font-weight: bold;
      color: #000;
      margin-bottom: 0.5mm;
    }
    .barcode {
      ${barcodeStyle}
      height: auto;
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
  ${printHint}
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
    const { productIds, overrides, printer: printerParam, format: formatParam, output: outputParam } = req.body as {
      productIds: number[];
      overrides?: Record<number, { name?: string; attributes?: string; sizeRange?: string }>;
      printer?: string;
      format?: string;
      output?: string;
    };
    const printer: PrinterType = printerParam === 'dymo' ? 'dymo' : 'zebra';
    const format: LabelFormat = formatParam === 'small' ? 'small' : 'normal';
    const outputZpl = outputParam === 'zpl';

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
        fields: ['id', 'name', 'barcode', 'list_price', 'product_template_attribute_value_ids'],
      },
    });

    // Fetch attribute values to resolve maat/size
    const allAttrIds: number[] = [];
    for (const p of products) {
      if (Array.isArray(p.product_template_attribute_value_ids)) {
        allAttrIds.push(...p.product_template_attribute_value_ids);
      }
    }

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
      for (const av of attrValues) {
        const attrName = av.attribute_id && typeof av.attribute_id !== 'boolean'
          ? av.attribute_id[1]
          : '';
        attributeValueMap[av.id] = { name: av.name, attributeName: attrName };
      }
    }

    // Maintain the order of productIds (may contain duplicates for multiple labels)
    const productMap = new Map<number, LabelProduct>();
    for (const p of products) {
      const attrIds: number[] = p.product_template_attribute_value_ids || [];
      const attributes = attrIds
        .map((id: number) => attributeValueMap[id])
        .filter((attr) => attr && !attr.attributeName.toLowerCase().includes('merk'))
        .map((attr) => attr.name)
        .join(', ');

      const ov = overrides?.[p.id];
      productMap.set(p.id, {
        id: p.id,
        name: ov?.name || p.name,
        barcode: p.barcode || null,
        list_price: p.list_price || 0,
        attributes: (ov?.attributes ?? attributes) || null,
        sizeRange: ov?.sizeRange || null,
      });
    }

    const orderedProducts: LabelProduct[] = [];
    for (const id of productIds) {
      const product = productMap.get(id);
      if (product) {
        orderedProducts.push(product);
      }
    }

    if (outputZpl && printer === 'zebra' && format === 'normal') {
      const zpl = generateZPLFromLib(orderedProducts);
      console.log('✅ Generated ZPL for', orderedProducts.length, 'labels');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(zpl);
    }

    // Generate all barcodes (for HTML output)
    const barcodeImages = new Map<string, string>();
    const uniqueBarcodes = [...new Set(orderedProducts.map(p => p.barcode).filter(Boolean))] as string[];
    await Promise.all(
      uniqueBarcodes.map(async (barcode) => {
        const img = await generateBarcode(barcode);
        if (img) barcodeImages.set(barcode, img);
      })
    );

    const html = generateLabelsHTML(orderedProducts, barcodeImages, printer, format);

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
