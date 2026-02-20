import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

interface ScannedProduct {
  id: number;
  name: string;
  barcode: string | null;
  list_price: number;
  qty_available: number;
  image: string | null;
  attributes: string | null;
  count: number;
  stockStatus?: 'success' | 'error' | 'pending';
  stockError?: string;
}

const formatEuro = (amount: number) =>
  amount.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

export default function LabelsAfdrukkenPage() {
  const { isLoading } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scannedProducts, setScannedProducts] = useState<ScannedProduct[]>([]);
  const [adjustingStock, setAdjustingStock] = useState(false);
  const [printingLabels, setPrintingLabels] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ barcode: trimmed }),
      });

      const json = await res.json();

      if (json.success) {
        if (json.isSearchResults) {
          // Multiple results - we can't auto-add, but take the first exact barcode match
          const exactMatch = json.searchResults.find(
            (p: any) => p.barcode === trimmed
          );
          if (exactMatch) {
            addProduct(exactMatch);
          } else if (json.searchResults.length === 1) {
            addProduct(json.searchResults[0]);
          } else {
            alert(`Meerdere producten gevonden voor "${trimmed}". Gebruik de Voorraad Opzoeken pagina voor naam-zoekopdrachten.`);
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
              image: scannedVariant.image,
              attributes: scannedVariant.attributes,
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
          image: product.image || null,
          attributes: product.attributes || null,
          count: 1,
        },
      ];
    });
  };

  const updateCount = (id: number, count: number) => {
    if (count < 1) return;
    setScannedProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, count } : p))
    );
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
      // Build array of product IDs, repeated by count (1 label per count)
      const productIds: number[] = [];
      for (const p of scannedProducts) {
        for (let i = 0; i < p.count; i++) {
          productIds.push(p.id);
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
        body: JSON.stringify({ productIds }),
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 font-sans">
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              🏷️ Labels Afdrukken
            </h1>
            <p className="text-gray-600 mt-2">
              Scan producten, pas voorraad aan en druk prijslabels af (Dymo formaat)
            </p>
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
                  placeholder="Scan barcode..."
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
                    {scannedProducts.map((product) => (
                      <tr
                        key={product.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
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
                          <div className="flex items-center gap-3">
                            {product.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`data:image/png;base64,${product.image}`}
                                alt={product.name}
                                className="w-10 h-10 object-cover rounded hidden sm:block"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center hidden sm:flex">
                                <span className="text-gray-400 text-sm">📦</span>
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-gray-900 text-sm break-words">
                                {product.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                {product.attributes && (
                                  <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                                    {product.attributes}
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
                            </div>
                          </div>
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
                    <>⏳ Labels genereren...</>
                  ) : (
                    <>🖨️ Labels Afdrukken ({totalLabels})</>
                  )}
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                💡 Labels worden afgedrukt in Dymo formaat (62mm x 29mm). Selecteer je Dymo printer in het printvenster.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
