/**
 * ZPL-generatie voor Zebra 51×25 mm labels (203 dpi).
 * Gebruikt door print-product-labels API en test-label-zpl.
 * Zie https://labelary.com/docs.html en https://labelary.com/viewer.html voor testen.
 */

export interface ZplLabelProduct {
  id: number;
  name: string;
  barcode: string | null;
  list_price: number;
  attributes: string | null;
  sizeRange: string | null;
}

export function abbreviateRange(range: string): string {
  return range
    .replace(/\s*-\s*/g, '/')
    .replace(/\s*maand/gi, 'm')
    .replace(/\s*jaar/gi, 'j');
}

/** Escape for ZPL ^FD...^FS: \ and ^ are special. MaxLen 0 = no truncate. */
export function escapeZpl(str: string, maxLen = 80): string {
  const s = str.replace(/\\/g, '\\\\').replace(/\^/g, '\\^');
  return maxLen > 0 ? s.slice(0, maxLen) : s;
}

/** Price with Euro for ZPL (use ^CI28 UTF-8 in label) */
export function formatPriceZpl(amount: number): string {
  return '€ ' + amount.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Labelformaat voor Labelary: 51×25 mm = 2×1 inch, 8 dpmm = 203 dpi */
export const ZPL_LABEL_DPMM = 8;
export const ZPL_LABEL_WIDTH_IN = 2;
export const ZPL_LABEL_HEIGHT_IN = 1;

/** Optionele typografie/layout voor generateZPL (o.a. labels-debug). Waarden in dots (203 dpi). */
export interface ZplLabelOptions {
  /** Ruimte van bovenrand label tot eerste tekst (marge boven) */
  marginTop?: number;
  /** Ruimte van linkerrand tot tekst (marge links); rechts wordt dezelfde waarde gebruikt. */
  marginLeft?: number;
  /** Lettergrootte productnaam (hoogte in dots) */
  nameFontH?: number;
  /** Ruimte tussen regels productnaam (line height) */
  nameLineH?: number;
  /** Max. aantal regels voor productnaam */
  nameLines?: number;
  /** Ruimte tussen productnaam en attributen */
  nameToVariantGap?: number;
  /** Lettergrootte attributen/maat */
  variantFontH?: number;
  /** Ruimte tussen attributen en prijs */
  variantToPriceGap?: number;
  /** Lettergrootte prijs */
  priceH?: number;
  barcodeBarMaxHeight?: number;
  barcodeBottomMargin?: number;
}

/** Standaard typografie voor alle Zebra-labels (labels-debug en print-product-labels). */
export const DEFAULT_LABEL_OPTIONS: Required<ZplLabelOptions> = {
  marginTop: 10,
  marginLeft:20,
  nameFontH: 22,
  nameLineH: 12,
  nameLines: 3,
  nameToVariantGap: 0,
  variantFontH: 20,
  variantToPriceGap: 15,
  priceH: 30,
  barcodeBarMaxHeight: 34,
  barcodeBottomMargin: 16,
};

/**
 * Genereer ZPL voor Zebra 51×25mm (203 dpi). Eén ^XA...^XZ per label. ^CI28 = UTF-8 voor €.
 * Optioneel tweede argument voor typografie (lettergroottes, regelafstand).
 */
export function generateZPL(products: ZplLabelProduct[], options?: ZplLabelOptions): string {
  const labelWidthDots = Math.round(51 * (203 / 25.4)); // ~407
  const labelHeightDots = Math.round(25 * (203 / 25.4)); // ~200

  const opts = { ...DEFAULT_LABEL_OPTIONS, ...options };
  const {
    marginTop,
    marginLeft,
    nameFontH,
    nameLineH,
    nameLines,
    nameToVariantGap,
    variantFontH,
    variantToPriceGap,
    priceH,
    barcodeBarMaxHeight,
    barcodeBottomMargin,
  } = opts;

  const contentWidth = labelWidthDots - marginLeft * 2;

  const blocks = products.map((p) => {
    const name = escapeZpl(p.name, 140);
    const variant = [p.attributes, p.sizeRange ? abbreviateRange(p.sizeRange) : ''].filter(Boolean).join(' - ');
    const variantLine = escapeZpl(variant);
    const priceLine = escapeZpl(formatPriceZpl(p.list_price));

    let y = marginTop;
    let z = `^XA^CI28^CF0,${nameFontH}^FO${marginLeft},${y}^FB${contentWidth},${nameLines},0^FD${name}^FS`;
    y += nameLines * nameLineH + nameToVariantGap;
    z += `^CF0,${variantFontH}^FO${marginLeft},${y}^FB${contentWidth},1,0^FD${variantLine}^FS`;
    y += variantFontH + variantToPriceGap;
    z += `^CF0,${priceH}^FO${marginLeft},${y}^FB${contentWidth},1,1^FD${priceLine}^FS`;
    y += priceH + 4;
    const barcodeHeight = Math.min(barcodeBarMaxHeight, labelHeightDots - y - barcodeBottomMargin);
    if (p.barcode && barcodeHeight >= 26) {
      z += `^FO${marginLeft},${y}^BCN,${barcodeHeight},Y,N,N^FD${p.barcode}^FS`;
    }
    z += '^XZ';
    return z;
  });
  return blocks.join('\n');
}

/** Genereer ZPL voor een cadeaubon-label (51×25mm, 203 dpi). */
function generateBarcodeZpl(code: string, x: number, y: number, height: number): string {
  const isEan13 = /^\d{13}$/.test(code);
  if (isEan13) {
    return `^FO${x},${y}^BEN,${height},Y,N^FD${code}^FS`;
  }
  return `^FO${x},${y}^BCN,${height},Y,N,N^FD${code}^FS`;
}

export function generateVoucherZPL(voucher: {
  code: string;
  amount: number;
  expiryDate?: string;
}): string {
  const labelWidthDots = Math.round(51 * (203 / 25.4)); // ~407
  const labelHeightDots = Math.round(25 * (203 / 25.4)); // ~200
  const marginLeft = 20;
  const contentWidth = labelWidthDots - marginLeft * 2;

  // Blanco kaart: code + barcode, beide gecentreerd
  if (voucher.amount <= 0 && !voucher.expiryDate) {
    const isEan13 = /^\d{13}$/.test(voucher.code);
    const eanWidth = 190;
    const barcodeX = Math.round((labelWidthDots - eanWidth) / 2);
    let z = `^XA^CI28`;
    z += `^CF0,24^FO0,12^FB${labelWidthDots},1,0,C^FD${voucher.code}^FS`;
    if (isEan13) {
      z += `^FO${barcodeX},46^BEN,90,N,N^FD${voucher.code}^FS`;
    } else {
      z += `^FO0,46^BCN,90,N,N,N,A^FD${voucher.code}^FS`;
    }
    z += '^XZ';
    return z;
  }

  const amountStr = escapeZpl(formatPriceZpl(voucher.amount));
  let expiryStr = '';
  if (voucher.expiryDate) {
    const d = new Date(voucher.expiryDate);
    expiryStr = escapeZpl(
      `geldig tot ${d.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
    );
  }

  let y = 10;
  let z = `^XA^CI28`;
  z += `^CF0,30^FO${marginLeft},${y}^FB${contentWidth},1,0,C^FD${amountStr}^FS`;
  y += 34;
  if (expiryStr) {
    z += `^CF0,18^FO${marginLeft},${y}^FB${contentWidth},1,0,C^FD${expiryStr}^FS`;
    y += 22;
  }
  const barcodeHeight = Math.min(60, labelHeightDots - y - 16);
  if (barcodeHeight >= 30) {
    z += generateBarcodeZpl(voucher.code, marginLeft, y, barcodeHeight);
  }
  z += '^XZ';
  return z;
}

/** Eerste label uit multi-label ZPL halen (voor preview) */
export function getFirstLabelZpl(fullZpl: string): string {
  const match = fullZpl.match(/^(\^XA[\s\S]*?\^XZ)/m);
  return match ? match[1] : fullZpl;
}
