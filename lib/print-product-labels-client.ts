export type PrinterType = 'zebra' | 'dymo';
export type LabelFormat = 'normal' | 'small';

export type PrintLabelSource = {
  id: number;
  count: number;
  name: string;
  attributes: string | null;
  sizeRange: string | null;
};

export type PrintLabelsResult =
  | { status: 'zpl-printed'; total: number; clearList: boolean }
  | { status: 'html-printed' }
  | { status: 'cancelled' }
  | { status: 'popup-blocked' }
  | { status: 'error'; message: string };

function buildPayload(
  products: PrintLabelSource[],
  printer: PrinterType,
  format: LabelFormat
) {
  const productIds: number[] = [];
  const overrides: Record<number, { name?: string; attributes?: string; sizeRange?: string }> = {};
  for (const p of products) {
    overrides[p.id] = {
      name: p.name,
      attributes: p.attributes || undefined,
      sizeRange: p.sizeRange || undefined,
    };
    for (let i = 0; i < p.count; i++) {
      productIds.push(p.id);
    }
  }
  return { productIds, overrides, printer, format };
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error || 'Kon labels niet genereren';
  } catch {
    return 'Kon labels niet genereren';
  }
}

/**
 * Print product labels via ZPL-bridge (Zebra normal) or the browser print window.
 * HTML print is fire-and-forget: onClearList runs after the popup is closed.
 */
export async function printProductLabels(params: {
  products: PrintLabelSource[];
  printer: PrinterType;
  format: LabelFormat;
  onClearList?: () => void;
}): Promise<PrintLabelsResult> {
  const { products, printer, format, onClearList } = params;
  if (products.length === 0) {
    return { status: 'error', message: 'Geen producten om af te drukken' };
  }

  const payload = buildPayload(products, printer, format);
  const useZpl = printer === 'zebra' && format === 'normal';

  try {
    if (useZpl) {
      const zplRes = await fetch('/api/print-product-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, output: 'zpl' }),
      });

      if (zplRes.ok) {
        const zpl = await zplRes.text();
        const bridgeRes = await fetch('/api/print-zpl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zpl }),
        }).catch(() => null);

        if (bridgeRes?.ok) {
          const total = (zpl.match(/\^XA/g) || []).length;
          const clearList = confirm(
            `Alle ${total} labels zijn naar de Zebra gestuurd.\n\nWil je de lijst leegmaken?`
          );
          if (clearList) onClearList?.();
          return { status: 'zpl-printed', total, clearList };
        }

        const useFallback = confirm(
          'Zebra-bridge niet bereikbaar of fout. Controleer de bridge (lokaal of via tunnel).\n\nNu afdrukken via het browser-printvenster?'
        );
        if (!useFallback) return { status: 'cancelled' };
      } else {
        const useFallback = confirm(
          'Kon geen ZPL ophalen voor directe print (controleer of je bent ingelogd).\n\nAfdrukken via het browser-printvenster?'
        );
        if (!useFallback) return { status: 'cancelled' };
      }
    }

    const labelWindow = window.open('', '_blank', 'width=400,height=600');
    if (!labelWindow) {
      alert('Popup geblokkeerd. Sta popups toe voor deze site.');
      return { status: 'popup-blocked' };
    }

    const res = await fetch('/api/print-product-labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const message = await readErrorMessage(res);
      labelWindow.close();
      alert(`Fout: ${message}`);
      return { status: 'error', message };
    }

    const html = await res.text();
    labelWindow.document.write(html);
    labelWindow.document.close();

    const checkClosed = setInterval(() => {
      if (labelWindow.closed) {
        clearInterval(checkClosed);
        if (confirm('Labels afgedrukt. Wil je de lijst leegmaken?')) {
          onClearList?.();
        }
      }
    }, 500);

    return { status: 'html-printed' };
  } catch (err) {
    console.error('Error printing labels:', err);
    alert('Fout bij afdrukken van labels');
    return { status: 'error', message: 'Fout bij afdrukken van labels' };
  }
}

export function loadPrinterPreference(): PrinterType {
  if (typeof window === 'undefined') return 'zebra';
  const saved = localStorage.getItem('labelPrinter');
  return saved === 'dymo' || saved === 'zebra' ? saved : 'zebra';
}

export function loadLabelFormatPreference(): LabelFormat {
  if (typeof window === 'undefined') return 'normal';
  const saved = localStorage.getItem('labelFormat');
  return saved === 'small' || saved === 'normal' ? saved : 'normal';
}

export function savePrinterPreference(printer: PrinterType) {
  localStorage.setItem('labelPrinter', printer);
}

export function saveLabelFormatPreference(format: LabelFormat) {
  localStorage.setItem('labelFormat', format);
}
