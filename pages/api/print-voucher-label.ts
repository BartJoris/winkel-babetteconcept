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

// Generate barcode image as base64
async function generateBarcode(code: string): Promise<string> {
  try {
    // Generate Code 128 barcode
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: code,
      scale: 3,
      height: 10,
      includetext: false,
    });
    
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (err) {
    console.error('Error generating barcode:', err);
    return '';
  }
}

// Generate HTML for Dymo-style label with barcode
async function generateLabelHTML(code: string, amount: number, expiryDate?: string): Promise<string> {
  const barcodeDataUrl = await generateBarcode(code);
  
  // Format expiry date to DD/MM/YYYY if provided
  let expiryFormatted = '';
  if (expiryDate) {
    const date = new Date(expiryDate);
    expiryFormatted = date.toLocaleDateString('nl-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
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
      width: 62mm;
      height: 29mm;
      margin: 0;
      padding: 2mm;
      font-family: Arial, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .amount-line {
      font-size: 11pt;
      font-weight: bold;
      color: #000;
      margin-bottom: 1.5mm;
      white-space: nowrap;
    }
    .barcode {
      max-width: 56mm;
      height: auto;
      margin-bottom: 1mm;
    }
    .code {
      font-size: 9pt;
      font-weight: bold;
      letter-spacing: 0.5px;
      font-family: 'Courier New', monospace;
      color: #333;
    }
  </style>
</head>
<body>
  <div class="amount-line">€${amount.toFixed(2)}${expiryFormatted ? ` geldig tot: ${expiryFormatted}` : ''}</div>
  ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" class="barcode" alt="Barcode" />` : ''}
  <div class="code">${code}</div>
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
    const { voucherCode, voucherId } = req.body;

    console.log('🖨️ Print Voucher Label - Code:', voucherCode, 'ID:', voucherId);

    let code = voucherCode;
    let amount = 0;
    let expiryDate: string | undefined;

    // If voucherId provided, fetch the voucher details
    if (voucherId) {
      const vouchers = await odooCall<any[]>({
        uid,
        password,
        model: 'loyalty.card',
        method: 'search_read',
        args: [[['id', '=', voucherId]]],
        kwargs: {
          fields: ['id', 'code', 'points', 'expiration_date'],
          limit: 1,
        },
      });

      if (vouchers.length > 0) {
        code = vouchers[0].code;
        amount = vouchers[0].points || 0;
        expiryDate = vouchers[0].expiration_date || undefined;
        console.log('✅ Found voucher:', code, 'Amount:', amount, 'Expiry:', expiryDate);
      }
    }

    if (!code) {
      return res.status(400).json({ error: 'Voucher code is required' });
    }

    // Generate HTML label with barcode
    const htmlContent = await generateLabelHTML(code, amount, expiryDate);

    // Return HTML that will be converted to PDF by the browser
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(htmlContent);
  } catch (error) {
    console.error('❌ Error generating voucher label:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Kon label niet genereren' 
    });
  }
}

