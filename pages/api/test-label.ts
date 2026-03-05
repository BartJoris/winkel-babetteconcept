import type { NextApiRequest, NextApiResponse } from 'next';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';

type PrinterType = 'zebra' | 'dymo';
type LabelFormat = 'normal' | 'small';

const PRINTER_STYLES: Record<PrinterType, { page: string; label: string }> = {
  zebra: {
    page: 'size: 51mm 25mm landscape;',
    label: 'width: 51mm; height: 25mm; padding: 0.5mm 1mm;',
  },
  dymo: {
    page: 'size: 62mm 29mm landscape;',
    label: 'width: 62mm; height: 29mm; padding: 1.5mm 2mm;',
  },
};

const SMALL_FORMAT_STYLE = {
  page: 'size: 25mm 25mm;',
  label: 'width: 25mm; height: 25mm; padding: 1mm;',
};

function getTestLabelHtml(printer: PrinterType, format: LabelFormat): string {
  const isSmall = format === 'small';
  const pageStyle = isSmall ? SMALL_FORMAT_STYLE.page : PRINTER_STYLES[printer].page;
  const labelStyle = isSmall ? SMALL_FORMAT_STYLE.label : PRINTER_STYLES[printer].label;
  const isZebra = !isSmall && printer === 'zebra';
  const printHint = isZebra
    ? '<p class="print-hint">Zebra <strong>51×25 mm</strong>: in het printvenster hetzelfde formaat kiezen (vaak als <strong>2×1 in</strong>), <strong>Landscape</strong>, <strong>Aantal: 1</strong>. Preview ondersteboven = op het label recht.</p>'
    : '';

  const labelInner = `
      <div class="label${isZebra ? ' label-zebra' : ''}">
        <div class="product-name">Testlabel</div>
        <div class="attributes">${printer === 'zebra' ? '51×25 mm' : '62×29 mm'} – Test</div>
        <div class="price">€ 0,00</div>
      </div>`;
  const labelContent = isSmall
    ? `
      <div class="label label-small">
        <div class="price">€ 0,00</div>
        <div class="variant">Test 25×25 mm</div>
      </div>`
    : isZebra
    ? `<div class="label-zebra-flip">${labelInner}</div>`
    : labelInner;

  return `
<!DOCTYPE html>
<html lang="nl"${isZebra ? ' data-printer="zebra"' : ''}>
<head>
  <meta charset="UTF-8">
  <title>Testlabel</title>
  <style>
    @page { ${pageStyle} margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    .print-hint {
      position: fixed; top: 0; left: 0; right: 0;
      padding: 8px 12px; background: #e8f4ea; border-bottom: 1px solid #2e7d32;
      font-size: 13px; color: #1b5e20; z-index: 9999;
    }
    @media print {
      .print-hint { display: none !important; }
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    .label {
      ${labelStyle}
      display: flex; flex-direction: column; justify-content: center;
      align-items: center; text-align: center; overflow: hidden;
    }
    .label-zebra-flip {
      width: 51mm; height: 25mm; display: flex; align-items: center; justify-content: center; overflow: hidden;
      transform: rotate(180deg); transform-origin: center center;
    }
    .label-zebra .product-name { font-size: 10pt !important; font-weight: bold; color: #000; margin-bottom: 0.5mm; line-height: 1.2; }
    .label-zebra .attributes { font-size: 9pt !important; font-weight: bold; color: #333; margin-bottom: 0.5mm; line-height: 1.2; }
    .label-zebra .price { font-size: 12pt !important; font-weight: bold; color: #000; margin-bottom: 0; line-height: 1.2; }
    .label-small .price { font-size: 10pt; font-weight: bold; color: #000; margin-bottom: 1mm; }
    .label-small .variant { font-size: 7pt; font-weight: bold; color: #333; }
    .product-name { font-size: 8pt; font-weight: bold; color: #000; margin-bottom: 0.5mm; }
    .attributes { font-size: 9pt; font-weight: bold; color: #333; margin-bottom: 0.5mm; }
    .price { font-size: 11pt; font-weight: bold; color: #000; margin-bottom: 0.5mm; }
  </style>
</head>
<body>
  ${printHint}
  ${labelContent}
  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 400); };
  </script>
</body>
</html>`;
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

    const printer: PrinterType = req.query.printer === 'dymo' ? 'dymo' : 'zebra';
    const format: LabelFormat = req.query.format === 'small' ? 'small' : 'normal';

    const html = getTestLabelHtml(printer, format);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (error) {
    console.error('Test label error:', error);
    return res.status(500).json({ error: 'Kon testlabel niet genereren' });
  }
}
