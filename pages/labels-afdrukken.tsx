import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

type PrinterType = 'zebra' | 'dymo';
type LabelFormat = 'normal' | 'small'; // small = 25×25mm, alleen prijs + variant

interface ScannedProduct {
  id: number;
  name: string;
  barcode: string | null;
  list_price: number;
  qty_available: number;
  attributes: string | null;
  sizeRange: string | null;
  count: number;
  /** Odoo product.template id: zelfde product, andere maten/varianten */
  productTmplId?: number | null;
  stockStatus?: 'success' | 'error' | 'pending';
  stockError?: string;
}

interface SearchResult {
  id: number;
  name: string;
  barcode: string | null;
  qty_available: number;
  list_price: number;
  attributes: string | null;
  productTmplId: number | null;
}

const formatEuro = (amount: number) =>
  amount.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

/** ZPL: Zebra calibratie met label-setup (51×25mm, direct thermal, web-sensing) + ~JC. */
const ZPL_CALIBRATE = [
  '^XA',
  '^PW406',   // 51mm breed = 406 dots @ 203dpi
  '^LL200',   // 25mm lang = 200 dots @ 203dpi
  '^LH0,0',   // label home 0,0
  '^MNY',     // non-continuous web/gap sensing (die-cut labels)
  '^MTD',     // direct thermal
  '^JUS',     // opslaan in EEPROM
  '^XZ',
  '~JC',      // sensor calibratie
].join('');

/** ZPL: Diepe reset - alle relevante printer-parameters + calibratie. */
const ZPL_DEEP_CALIBRATE = [
  '^XA',
  '^PW406',   // 51mm breed
  '^LL200',   // 25mm lang
  '^LH0,0',   // label home
  '^MNY',     // web/gap sensing
  '^MTD',     // direct thermal
  '^MD10',    // darkness midden (0-30)
  '^PR4,4,4', // print speed 4 ips
  '^JUS',     // opslaan in EEPROM
  '^XZ',
  '~JC',      // sensor calibratie
].join('');

export default function LabelsAfdrukkenPage() {
  const { isLoading } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scannedProducts, setScannedProducts] = useState<ScannedProduct[]>([]);
  const [adjustingStock, setAdjustingStock] = useState(false);
  const [printingLabels, setPrintingLabels] = useState(false);
  const [calibratingZebra, setCalibratingZebra] = useState(false);
  const [printer, setPrinter] = useState<PrinterType>('zebra');
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('normal');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [variantsLoading, setVariantsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('labelPrinter') as PrinterType | null;
    if (saved === 'dymo' || saved === 'zebra') setPrinter(saved);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('labelFormat') as LabelFormat | null;
    if (saved === 'small' || saved === 'normal') setLabelFormat(saved);
  }, []);

  const togglePrinter = () => {
    const next: PrinterType = printer === 'zebra' ? 'dymo' : 'zebra';
    setPrinter(next);
    localStorage.setItem('labelPrinter', next);
  };

  const toggleLabelFormat = () => {
    const next: LabelFormat = labelFormat === 'normal' ? 'small' : 'normal';
    setLabelFormat(next);
    localStorage.setItem('labelFormat', next);
  };

  const calibrateZebra = async (deep = false) => {
    const msg = deep
      ? 'Diepe calibratie? Alle printerinstellingen (formaat, mediatype, darkness) worden gereset en opgeslagen. De printer kan een paar labels doorvoeren. Doorgaan?'
      : 'Zebra calibreer? Labelformaat en mediatype worden ingesteld, daarna calibreert de sensor. De printer kan een paar labels doorvoeren. Doorgaan?';
    if (!confirm(msg)) return;
    setCalibratingZebra(true);
    try {
      const zpl = deep ? ZPL_DEEP_CALIBRATE : ZPL_CALIBRATE;
      const res = await fetch('/api/print-zpl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zpl }),
      }).catch(() => null);
      if (res?.ok) {
        alert(
          deep
            ? 'Diepe calibratie verstuurd. Alle instellingen zijn opgeslagen en de sensor is gekalibreerd.'
            : 'Calibratie verstuurd. Printer kan een paar labels doorvoeren; daarna staat de uitlijning weer goed.'
        );
      } else {
        alert('Calibratie mislukt. Controleer of de Zebra-bridge bereikbaar is.');
      }
    } finally {
      setCalibratingZebra(false);
    }
  };

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleScan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = barcode.trim();
    if (!trimmed) return;

    setScanLoading(true);
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: trimmed, light: true }),
      });

      const json = await res.json();

      if (json.success) {
        if (json.isGiftCard && json.giftCard) {
          const g = json.giftCard;
          const expiry = g.expiration_date ? new Date(g.expiration_date).toLocaleDateString('nl-BE') : '';
          alert(`🎁 Cadeaubon herkend\n\nCode: ${g.code}\nSaldo: €${Number(g.balance ?? g.points ?? 0).toFixed(2)}${expiry ? `\nGeldig tot: ${expiry}` : ''}\n\nGebruik de kassa (Odoo POS) om de bon te verzilveren.`);
        } else         if (json.isSearchResults) {
          const exactMatch = json.searchResults.find(
            (p: any) => p.barcode === trimmed
          );
          if (exactMatch) {
            addProduct(exactMatch);
          } else if (json.searchResults.length === 1) {
            addProduct(json.searchResults[0]);
          } else {
            setSearchResults(json.searchResults);
            setSearchQuery(trimmed);
          }
        } else {
          // Single product with variants - add the scanned variant
          const scannedVariant = json.variants?.find((v: any) => v.isScanned) || json.scannedVariant;
          if (scannedVariant) {
            addProduct({
              id: scannedVariant.id,
              name: scannedVariant.name || json.productName,
              barcode: scannedVariant.barcode,
              list_price: scannedVariant.list_price,
              qty_available: scannedVariant.qty_available,
              attributes: scannedVariant.attributes,
              sizeRange: json.sizeRange,
              productTmplId: json.productTmplId ?? null,
            });
          }
        }
      } else {
        alert(`Product niet gevonden: ${json.error || 'Onbekende fout'}`);
      }
    } catch (err) {
      console.error('Error scanning product:', err);
      alert('Fout bij scannen van product');
    } finally {
      setBarcode('');
      setScanLoading(false);
      focusInput();
    }
  };

  const addProduct = (product: any) => {
    setScannedProducts((prev) => {
      const existing = prev.find((p) => p.id === product.id);
      if (existing) {
        return prev.map((p) =>
          p.id === product.id
            ? { ...p, count: p.count + 1, stockStatus: undefined, stockError: undefined }
            : p
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          barcode: product.barcode || null,
          list_price: product.list_price || 0,
          qty_available: product.qty_available || 0,
          attributes: product.attributes || null,
          sizeRange: product.sizeRange || null,
          count: 1,
          productTmplId: product.productTmplId ?? null,
        },
      ];
    });
  };

  const handleSearchResultClick = async (product: SearchResult) => {
    setVariantsLoading(true);
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      });
      const json = await res.json();

      const sizeRange = json.sizeRange ?? null;
      const productTmplId = json.productTmplId ?? product.productTmplId ?? null;
      const variants = json.success ? json.variants ?? [] : [];

      const wantAll = variants.length > 1 && confirm(
        `Alle ${variants.length} varianten van "${json.productName || product.name}" toevoegen?\n\nKlik "OK" voor alle varianten, of "Annuleren" voor enkel deze variant.`
      );

      if (wantAll) {
        for (const v of variants) {
          addProduct({
            id: v.id,
            name: v.name || json.productName,
            barcode: v.barcode,
            list_price: v.list_price,
            qty_available: v.qty_available,
            attributes: v.attributes,
            sizeRange,
            productTmplId,
          });
        }
      } else {
        addProduct({
          ...product,
          sizeRange,
          productTmplId,
        });
      }
    } catch {
      addProduct(product);
    } finally {
      setVariantsLoading(false);
    }

    setSearchResults([]);
    setSearchQuery('');
    focusInput();
  };

  const updateCount = (id: number, count: number) => {
    if (count < 1) return;
    setScannedProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, count } : p))
    );
  };

  const updateField = (id: number, field: 'name' | 'attributes', value: string) => {
    setScannedProducts((prev) => {
      const product = prev.find((p) => p.id === id);
      const productTmplId = product?.productTmplId;
      // Bij naam: ook alle andere varianten van hetzelfde product (zelfde template) bijwerken
      const sameProductIds =
        field === 'name' && productTmplId != null
          ? prev.filter((p) => p.productTmplId === productTmplId).map((p) => p.id)
          : [id];
      const idSet = new Set(sameProductIds);
      return prev.map((p) =>
        idSet.has(p.id) ? { ...p, [field]: value || null } : p
      );
    });
  };

  const removeProduct = (id: number) => {
    setScannedProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const clearAll = () => {
    if (scannedProducts.length === 0) return;
    if (confirm('Weet je zeker dat je de lijst wilt wissen?')) {
      setScannedProducts([]);
      focusInput();
    }
  };

  const handleAdjustStock = async () => {
    if (scannedProducts.length === 0) return;
    if (!confirm(`Voorraad aanpassen voor ${scannedProducts.length} product(en)?\n\nDe huidige voorraad wordt ingesteld op het ingevoerde aantal.`)) {
      return;
    }

    setAdjustingStock(true);

    // Mark all as pending
    setScannedProducts((prev) =>
      prev.map((p) => ({ ...p, stockStatus: 'pending' as const, stockError: undefined }))
    );

    try {
      const res = await fetch('/api/adjust-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: scannedProducts.map((p) => ({
            productId: p.id,
            quantity: p.count,
          })),
        }),
      });

      const json = await res.json();

      if (json.results) {
        setScannedProducts((prev) =>
          prev.map((p) => {
            const result = json.results.find((r: any) => r.productId === p.id);
            if (!result) return { ...p, stockStatus: 'error' as const, stockError: 'Geen resultaat' };
            return {
              ...p,
              stockStatus: result.success ? ('success' as const) : ('error' as const),
              stockError: result.error,
              qty_available: result.success ? p.count : p.qty_available,
            };
          })
        );

        const successCount = json.results.filter((r: any) => r.success).length;
        alert(`${json.message || `${successCount} van ${scannedProducts.length} producten aangepast`}`);
      } else {
        alert(`Fout: ${json.error || 'Kon voorraad niet aanpassen'}`);
        setScannedProducts((prev) =>
          prev.map((p) => ({ ...p, stockStatus: 'error' as const, stockError: json.error }))
        );
      }
    } catch (err) {
      console.error('Error adjusting stock:', err);
      alert('Fout bij aanpassen van voorraad');
      setScannedProducts((prev) =>
        prev.map((p) => ({ ...p, stockStatus: 'error' as const, stockError: 'Netwerk fout' }))
      );
    } finally {
      setAdjustingStock(false);
    }
  };

  const handlePrintLabels = async () => {
    if (scannedProducts.length === 0) return;

    setPrintingLabels(true);
    try {
      const productIds: number[] = [];
      const overrides: Record<number, { name?: string; attributes?: string; sizeRange?: string }> = {};
      for (const p of scannedProducts) {
        overrides[p.id] = {
          name: p.name,
          attributes: p.attributes || undefined,
          sizeRange: p.sizeRange || undefined,
        };
        for (let i = 0; i < p.count; i++) {
          productIds.push(p.id);
        }
      }

      const payload = { productIds, overrides, printer, format: labelFormat };
      const useZpl = printer === 'zebra' && labelFormat === 'normal';

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
            alert(`Alle ${total} labels zijn naar de Zebra gestuurd.`);
            setScannedProducts([]);
            setPrintingLabels(false);
            focusInput();
            return;
          }

          const useFallback = confirm(
            'Zebra-bridge niet bereikbaar of fout. Controleer de bridge (lokaal of via tunnel).\n\nNu afdrukken via het browser-printvenster?'
          );
          if (!useFallback) {
            setPrintingLabels(false);
            return;
          }
        } else {
          const useFallback = confirm(
            'Kon geen ZPL ophalen voor directe print (controleer of je bent ingelogd).\n\nAfdrukken via het browser-printvenster?'
          );
          if (!useFallback) {
            setPrintingLabels(false);
            return;
          }
        }
      }

      const labelWindow = window.open('', '_blank', 'width=400,height=600');
      if (!labelWindow) {
        alert('Popup geblokkeerd. Sta popups toe voor deze site.');
        return;
      }

      const res = await fetch('/api/print-product-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        labelWindow.close();
        alert(`Fout: ${error.error || 'Kon labels niet genereren'}`);
        return;
      }

      const html = await res.text();
      labelWindow.document.write(html);
      labelWindow.document.close();

      const checkClosed = setInterval(() => {
        if (labelWindow.closed) {
          clearInterval(checkClosed);
          if (confirm('Labels afgedrukt. Wil je de lijst leegmaken?')) {
            setScannedProducts([]);
            focusInput();
          }
        }
      }, 500);
    } catch (err) {
      console.error('Error printing labels:', err);
      alert('Fout bij afdrukken van labels');
    } finally {
      setPrintingLabels(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="p-8 text-center">
          <p className="text-xl text-gray-600">Laden...</p>
        </div>
      </div>
    );
  }

  const totalLabels = scannedProducts.reduce((sum, p) => sum + p.count, 0);

  // Groepeer op productTmplId zodat we varianten visueel kunnen groeperen
  const productGroups = (() => {
    const byTmpl = new Map<number | string, ScannedProduct[]>();
    for (const p of scannedProducts) {
      const key = p.productTmplId != null ? p.productTmplId : `single-${p.id}`;
      if (!byTmpl.has(key)) byTmpl.set(key, []);
      byTmpl.get(key)!.push(p);
    }
    return Array.from(byTmpl.entries()).map(([key, products]) => ({ key, products }));
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 font-sans">
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  🏷️ Labels Afdrukken
                </h1>
                <p className="text-gray-600 mt-2">
                  Scan producten, pas voorraad aan en druk prijslabels af
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/api/test-label?printer=${printer}&format=${labelFormat}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all shrink-0"
                  title="Print één testlabel met het gekozen formaat"
                >
                  🧪 Testlabel
                </a>
                <button
                  onClick={toggleLabelFormat}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-all shrink-0 ${
                    labelFormat === 'normal'
                      ? 'border-gray-400 bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                  title={labelFormat === 'normal' ? 'Klik voor klein formaat (25×25mm)' : 'Klik voor normaal formaat'}
                >
                  📐 {labelFormat === 'normal' ? 'Normaal formaat' : 'Klein (25×25mm)'}
                </button>
                <button
                  onClick={togglePrinter}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-all shrink-0 ${
                    printer === 'zebra'
                      ? 'border-black bg-gray-900 text-white hover:bg-gray-800'
                      : 'border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  🖨️ {printer === 'zebra' ? 'Zebra ZD421d (51×25mm)' : 'Dymo (62×29mm)'}
                </button>
                {printer === 'zebra' && (
                  <>
                    <button
                      type="button"
                      onClick={() => calibrateZebra(false)}
                      disabled={calibratingZebra}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-all shrink-0 disabled:opacity-50"
                      title="Labelformaat instellen + sensor calibratie"
                    >
                      {calibratingZebra ? 'Bezig…' : '⚙️ Calibreer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => calibrateZebra(true)}
                      disabled={calibratingZebra}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 border-red-400 bg-red-50 text-red-800 hover:bg-red-100 transition-all shrink-0 disabled:opacity-50"
                      title="Volledige reset: formaat, mediatype, darkness, snelheid + calibratie"
                    >
                      {calibratingZebra ? 'Bezig…' : '🔧 Diep calibreer'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Scanner */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <form onSubmit={handleScan} className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan barcode of zoek op naam..."
                  className="w-full px-4 py-3 pr-10 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg"
                  autoFocus
                  disabled={scanLoading}
                />
                {barcode && (
                  <button
                    type="button"
                    onClick={() => setBarcode('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={scanLoading}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
              >
                {scanLoading ? '⏳ Scannen...' : '📷 Scan'}
              </button>
            </form>

            {scannedProducts.length > 0 && (
              <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
                <span>{scannedProducts.length} product(en), {totalLabels} label(s)</span>
              </div>
            )}
          </div>

          {/* Search Results Modal */}
          {searchResults.length > 0 && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[10vh] px-4" onClick={() => { setSearchResults([]); setSearchQuery(''); }}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      🔍 Zoekresultaten voor &ldquo;{searchQuery}&rdquo;
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {searchResults.length} resultaten — klik om toe te voegen
                    </p>
                  </div>
                  <button
                    onClick={() => { setSearchResults([]); setSearchQuery(''); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                  {variantsLoading && (
                    <div className="px-6 py-8 text-center text-gray-500 font-medium">
                      ⏳ Varianten ophalen...
                    </div>
                  )}
                  {!variantsLoading && (() => {
                    const grouped = new Map<number | string, SearchResult[]>();
                    for (const r of searchResults) {
                      const key = r.productTmplId ?? `single-${r.id}`;
                      if (!grouped.has(key)) grouped.set(key, []);
                      grouped.get(key)!.push(r);
                    }
                    return Array.from(grouped.entries()).map(([groupKey, items]) => {
                      const isGroup = items.length > 1 && typeof groupKey === 'number';
                      return (
                        <div key={String(groupKey)}>
                          {isGroup && (
                            <div className="px-6 py-2 bg-sky-50 text-xs font-semibold text-sky-700 flex items-center gap-1.5 border-b border-sky-100">
                              <span>🔗 {items.length} varianten</span>
                            </div>
                          )}
                          {items.map((r) => (
                            <button
                              key={r.id}
                              onClick={() => handleSearchResultClick(r)}
                              disabled={variantsLoading}
                              className={`w-full text-left px-6 py-3 hover:bg-green-50 transition-colors flex items-center gap-4 disabled:opacity-50 ${
                                isGroup ? 'pl-10' : ''
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 text-sm truncate">{r.name}</div>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {r.attributes && (
                                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{r.attributes}</span>
                                  )}
                                  {r.barcode && (
                                    <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{r.barcode}</span>
                                  )}
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                    r.qty_available > 0 ? 'text-green-700 bg-green-100' : 'text-orange-700 bg-orange-100'
                                  }`}>
                                    Voorraad: {r.qty_available}
                                  </span>
                                </div>
                              </div>
                              <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                                {formatEuro(r.list_price)}
                              </div>
                              <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          ))}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Scanned Products List */}
          {scannedProducts.length > 0 && (
            <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  📋 Gescande Producten
                </h2>
                <button
                  onClick={clearAll}
                  className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium"
                >
                  🗑️ Alles wissen
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col />
                    <col className="hidden sm:table-column w-[20%]" />
                    <col className="w-[15%] sm:w-[10%]" />
                    <col className="w-[22%] sm:w-[15%]" />
                    <col className="w-[8%] sm:w-[6%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Product</th>
                      <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700 hidden sm:table-cell">Barcode</th>
                      <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Prijs</th>
                      <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Aantal</th>
                      <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productGroups.map(({ key, products }) => {
                      const isLinkedGroup = products.length > 1 && typeof key === 'number';
                      return (
                        <Fragment key={String(key)}>
                          {isLinkedGroup && (
                            <tr className="bg-sky-50 border-y-2 border-sky-200">
                              <td colSpan={5} className="py-2 px-3 text-sm text-sky-800 font-medium">
                                <span className="inline-flex items-center gap-1.5">
                                  <span aria-hidden>🔗</span>
                                  Productgroep ({products.length} varianten) — naam wijzigen geldt voor alle varianten hieronder
                                </span>
                              </td>
                            </tr>
                          )}
                          {products.map((product) => (
                            <tr
                              key={product.id}
                              className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                                isLinkedGroup ? 'bg-sky-50/50' : ''
                              } ${
                                product.stockStatus === 'success'
                                  ? 'bg-green-50'
                                  : product.stockStatus === 'error'
                                  ? 'bg-red-50'
                                  : product.stockStatus === 'pending'
                                  ? 'bg-yellow-50'
                                  : ''
                              }`}
                            >
                              <td className="py-3 px-2">
                                <input
                                  type="text"
                                  value={product.name}
                                  onChange={(e) => updateField(product.id, 'name', e.target.value)}
                                  className="w-full font-medium text-gray-900 text-sm break-words bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none py-0.5 transition-colors"
                                  title={isLinkedGroup ? 'Naam geldt voor alle varianten in deze groep' : 'Klik om naam te bewerken (alleen voor afdruk)'}
                                />
                                {isLinkedGroup && (
                                  <p className="text-xs text-sky-600 mt-0.5 font-medium">
                                    Naam geldt voor alle {products.length} varianten
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <input
                              type="text"
                              value={product.attributes || ''}
                              onChange={(e) => updateField(product.id, 'attributes', e.target.value)}
                              placeholder="Maat..."
                              className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-transparent hover:border-blue-300 focus:border-blue-500 focus:outline-none w-20 transition-colors"
                              title="Klik om maat te bewerken (alleen voor afdruk)"
                            />
                            {product.sizeRange && (
                              <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                                {product.sizeRange}
                              </span>
                            )}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              product.qty_available > 0
                                ? 'text-green-700 bg-green-100'
                                : product.qty_available === 0
                                ? 'text-orange-700 bg-orange-100'
                                : 'text-red-700 bg-red-100'
                            }`}>
                              Voorraad: {product.qty_available}
                            </span>
                          </div>
                          {product.stockStatus === 'success' && (
                            <span className="text-xs text-green-600 font-medium">✅ Voorraad aangepast</span>
                          )}
                          {product.stockStatus === 'error' && (
                            <span className="text-xs text-red-600 font-medium">❌ {product.stockError || 'Fout'}</span>
                          )}
                          {product.stockStatus === 'pending' && (
                            <span className="text-xs text-yellow-600 font-medium">⏳ Bezig...</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-sm text-gray-500 font-mono hidden sm:table-cell">
                          {product.barcode || '-'}
                        </td>
                        <td className="py-3 px-2 text-sm text-right font-semibold text-gray-900">
                          {formatEuro(product.list_price)}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => updateCount(product.id, product.count - 1)}
                              disabled={product.count <= 1}
                              className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={product.count}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (val >= 1) updateCount(product.id, val);
                              }}
                              className="w-12 text-center border border-gray-300 rounded py-1 text-sm font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              onClick={() => updateCount(product.id, product.count + 1)}
                              className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold transition-colors text-sm"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => removeProduct(product.id)}
                            className="text-red-400 hover:text-red-600 transition-colors"
                            title="Verwijderen"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          {scannedProducts.length > 0 && (
            <div className="bg-white shadow-xl rounded-2xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">⚡ Acties</h2>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleAdjustStock}
                  disabled={adjustingStock || scannedProducts.length === 0}
                  className="flex-1 px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all text-lg flex items-center justify-center gap-2"
                >
                  {adjustingStock ? (
                    <>⏳ Voorraad aanpassen...</>
                  ) : (
                    <>📦 Voorraad Aanpassen</>
                  )}
                </button>
                <button
                  onClick={handlePrintLabels}
                  disabled={printingLabels || scannedProducts.length === 0}
                  className="flex-1 px-6 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all text-lg flex items-center justify-center gap-2"
                >
                  {printingLabels ? (
                    <>⏳ Labels versturen…</>
                  ) : (
                    <>🖨️ Labels Afdrukken ({totalLabels})</>
                  )}
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                💡 {labelFormat === 'small'
                  ? 'Klein formaat (25×25mm): alleen prijs en variant/maatreeks. '
                  : ''}
                Labels: {printer === 'zebra' ? 'Zebra (51×25mm)' : 'Dymo (62×29mm)'}.
                {printer === 'zebra' && labelFormat === 'normal'
                  ? ' Zebra 51×25 mm. Direct naar printer: start in een terminal "npm run print-zebra", daarna gaat "Labels afdrukken" direct naar de Zebra (zoals echo | lpr -o raw). Zonder bridge opent het browser-printvenster.'
                  : ` Selecteer je ${printer === 'zebra' ? 'Zebra' : 'Dymo'} printer in het printvenster.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
