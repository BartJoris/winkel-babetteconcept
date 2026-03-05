import type { NextApiRequest, NextApiResponse } from 'next';
import { generateZPL } from '@/lib/zpl-labels';

/**
 * GET: retourneert ZPL voor een vast testlabel (geen auth).
 * Gebruik voor de Zebra-label debugpagina en om in Labelary te testen.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const testProduct = {
    id: 0,
    name: 'Claude & Co - Noa mustard knit vest',
    barcode: '505677460865',
    list_price: 45.0,
    attributes: '12 maand',
    sizeRange: '12m/6j',
  };

  const zpl = generateZPL([testProduct]);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(200).send(zpl);
}
