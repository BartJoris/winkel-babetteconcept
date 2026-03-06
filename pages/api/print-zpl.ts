import type { NextApiRequest, NextApiResponse } from 'next';

const ZPL_BRIDGE_URL = process.env.ZPL_BRIDGE_URL || 'http://127.0.0.1:9333/print';
const ZPL_BRIDGE_SECRET = process.env.ZPL_BRIDGE_SECRET || '';

/**
 * POST: ontvangt ZPL (body: { zpl: string }) en stuurt door naar de ZPL-bridge (lpr naar Zebra).
 * Als ZPL_BRIDGE_SECRET gezet is (lokaal of op Vercel), stuurt de API die mee als X-ZPL-Secret.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as { zpl?: string } | null;
  const zplBody = typeof body?.zpl === 'string' ? body.zpl.trim() : '';

  if (!zplBody) {
    return res.status(400).json({ error: 'Geen ZPL. Stuur JSON: { "zpl": "^XA..." }' });
  }

  const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' };
  if (ZPL_BRIDGE_SECRET) {
    headers['X-ZPL-Secret'] = ZPL_BRIDGE_SECRET;
  }

  try {
    const bridgeRes = await fetch(ZPL_BRIDGE_URL, {
      method: 'POST',
      headers,
      body: zplBody,
    });

    const data = await bridgeRes.json().catch(() => ({}));
    if (!bridgeRes.ok) {
      const status = bridgeRes.status === 401 ? 502 : bridgeRes.status;
      return res.status(status).json({
        error: 'ZPL-bridge fout',
        details: data.error || bridgeRes.statusText,
      });
    }

    return res.status(200).json({ ok: true, labels: data.labels ?? 1 });
  } catch (err) {
    console.error('print-zpl: bridge request failed', err);
    return res.status(502).json({
      error: 'ZPL-bridge niet bereikbaar. Start op de server: npm run print-zebra',
    });
  }
}
