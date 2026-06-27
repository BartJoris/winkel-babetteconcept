import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

interface AdjustmentItem {
  productId: number;
  productName: string;
  attributes: string | null;
  barcode: string | null;
  currentStock: number;
  adjustment: number;
  newStock: number;
  status: 'pending' | 'saving' | 'success' | 'error';
  error?: string;
}

interface SearchResult {
  id: number;
  name: string;
  barcode: string | null;
  qty_available: number;
  list_price: number;
  attributes: string | null;
}

export default function VoorraadAanpassenPage() {
  const { isLoading } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentItem[]>([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [orderInput, setOrderInput] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderInfo, setOrderInfo] = useState<{ name: string; date: string; state: string; partner: string | null; total: number } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!barcode.trim()) return;

    setScanLoading(true);
    setSearchResults([]);

    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: barcode.trim(), light: true }),
      });

      const json = await res.json();

      if (json.success) {
        if (json.isSearchResults) {
          setSearchResults(json.searchResults);
        } else if (json.variants?.length > 0) {
          const variant = json.variants[0];
          addToAdjustments({
            id: variant.id,
            name: json.productName || variant.name,
            barcode: variant.barcode,
            qty_available: variant.qty_available,
            list_price: variant.list_price,
            attributes: variant.attributes,
          });
          setBarcode('');
          inputRef.current?.focus();
        }
      } else {
        showToast(`Product niet gevonden: ${json.error || 'Onbekende fout'}`, 'error');
      }
    } catch {
      showToast('Fout bij zoeken van product', 'error');
    } finally {
      setScanLoading(false);
    }
  };

  const handleSelectProduct = async (product: SearchResult) => {
    addToAdjustments(product);
    setSearchResults([]);
    setBarcode('');
    inputRef.current?.focus();
  };

  const addToAdjustments = useCallback((product: SearchResult) => {
    setAdjustments(prev => {
      const existing = prev.find(a => a.productId === product.id && a.status === 'pending');
      if (existing) {
        return prev.map(a =>
          a.productId === product.id && a.status === 'pending'
            ? { ...a, adjustment: a.adjustment - 1, newStock: a.currentStock + (a.adjustment - 1) }
            : a
        );
      }
      return [{
        productId: product.id,
        productName: product.name,
        attributes: product.attributes,
        barcode: product.barcode,
        currentStock: product.qty_available,
        adjustment: -1,
        newStock: product.qty_available - 1,
        status: 'pending',
      }, ...prev];
    });
  }, []);

  const handleOrderImport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!orderInput.trim()) return;

    const raw = orderInput.trim();
    const match = raw.match(/(\d+)\s*$/);
    if (!match) {
      showToast('Voer een geldig order ID of URL in', 'error');
      return;
    }
    const orderId = parseInt(match[1], 10);

    setOrderLoading(true);
    setOrderInfo(null);

    try {
      const res = await fetch('/api/get-pos-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      const json = await res.json();

      if (json.success) {
        setOrderInfo(json.order);

        if (json.products.length === 0) {
          showToast('Geen producten gevonden in dit order', 'error');
          return;
        }

        const newItems: AdjustmentItem[] = json.products
          .filter((p: any) => p.productId && p.currentStock !== null)
          .map((p: any) => {
            const adjustment = Math.round(-p.qty);
            return {
              productId: p.productId,
              productName: p.name,
              attributes: null,
              barcode: null,
              currentStock: p.currentStock,
              adjustment,
              newStock: p.currentStock + adjustment,
              status: 'pending' as const,
            };
          });

        setAdjustments(prev => {
          const existingIds = new Set(prev.filter(a => a.status === 'pending').map(a => a.productId));
          const toAdd = newItems.filter(item => !existingIds.has(item.productId));
          return [...toAdd, ...prev];
        });

        showToast(`${newItems.length} product(en) toegevoegd uit order ${json.order.name}`, 'success');
        setOrderInput('');
      } else {
        showToast(`Order niet gevonden: ${json.error || 'Onbekende fout'}`, 'error');
      }
    } catch {
      showToast('Fout bij ophalen van order', 'error');
    } finally {
      setOrderLoading(false);
    }
  };

  const updateAdjustment = useCallback((productId: number, newAdjustment: number) => {
    setAdjustments(prev =>
      prev.map(a =>
        a.productId === productId && a.status === 'pending'
          ? { ...a, adjustment: newAdjustment, newStock: a.currentStock + newAdjustment }
          : a
      )
    );
  }, []);

  const removeAdjustment = useCallback((productId: number) => {
    setAdjustments(prev => prev.filter(a => !(a.productId === productId && a.status === 'pending')));
  }, []);

  const applySingle = useCallback(async (productId: number) => {
    const item = adjustments.find(a => a.productId === productId && a.status === 'pending');
    if (!item) return;

    setAdjustments(prev =>
      prev.map(a => a.productId === productId && a.status === 'pending' ? { ...a, status: 'saving' } : a)
    );

    try {
      const res = await fetch('/api/adjust-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ productId: item.productId, quantity: item.newStock }],
        }),
      });

      const json = await res.json();
      if (json.success && json.results?.[0]?.success) {
        setAdjustments(prev =>
          prev.map(a => a.productId === productId && a.status === 'saving' ? { ...a, status: 'success' } : a)
        );
        showToast(`${item.productName} aangepast`, 'success');
      } else {
        const errorMsg = json.results?.[0]?.error || json.error || 'Onbekende fout';
        setAdjustments(prev =>
          prev.map(a => a.productId === productId && a.status === 'saving'
            ? { ...a, status: 'error', error: errorMsg } : a)
        );
        showToast(`Fout: ${errorMsg}`, 'error');
      }
    } catch {
      setAdjustments(prev =>
        prev.map(a => a.productId === productId && a.status === 'saving'
          ? { ...a, status: 'error', error: 'Netwerkfout' } : a)
      );
      showToast('Netwerkfout bij opslaan', 'error');
    }
  }, [adjustments, showToast]);

  const applyAll = useCallback(async () => {
    const pending = adjustments.filter(a => a.status === 'pending');
    if (pending.length === 0) return;

    setBulkConfirmOpen(false);
    setBulkSaving(true);

    setAdjustments(prev =>
      prev.map(a => a.status === 'pending' ? { ...a, status: 'saving' } : a)
    );

    try {
      const res = await fetch('/api/adjust-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: pending.map(a => ({ productId: a.productId, quantity: a.newStock })),
        }),
      });

      const json = await res.json();
      if (json.results) {
        const resultMap = new Map<number, { success: boolean; error?: string }>();
        for (const r of json.results) {
          resultMap.set(r.productId, r);
        }

        setAdjustments(prev =>
          prev.map(a => {
            if (a.status !== 'saving') return a;
            const result = resultMap.get(a.productId);
            if (result?.success) return { ...a, status: 'success' };
            return { ...a, status: 'error', error: result?.error || 'Onbekende fout' };
          })
        );

        const successCount = json.results.filter((r: any) => r.success).length;
        showToast(`${successCount} van ${pending.length} producten aangepast`, successCount > 0 ? 'success' : 'error');
      }
    } catch {
      setAdjustments(prev =>
        prev.map(a => a.status === 'saving' ? { ...a, status: 'error', error: 'Netwerkfout' } : a)
      );
      showToast('Netwerkfout bij opslaan', 'error');
    } finally {
      setBulkSaving(false);
    }
  }, [adjustments, showToast]);

  const clearCompleted = useCallback(() => {
    setAdjustments(prev => prev.filter(a => a.status === 'pending'));
  }, []);

  const pendingCount = adjustments.filter(a => a.status === 'pending').length;
  const completedCount = adjustments.filter(a => a.status === 'success' || a.status === 'error').length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="p-8 text-center">
          <p className="text-xl text-gray-600">Laden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-sans">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg text-lg font-semibold animate-pulse ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}

      {/* Bulk confirm modal */}
      {bulkConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Alle aanpassingen doorvoeren?</h3>
            <p className="text-gray-600 mb-2">
              Je staat op het punt <strong>{pendingCount} product{pendingCount !== 1 ? 'en' : ''}</strong> aan te passen:
            </p>
            <div className="max-h-48 overflow-y-auto mb-4 space-y-1">
              {adjustments.filter(a => a.status === 'pending').map(a => (
                <div key={a.productId} className="flex justify-between text-sm py-1 border-b border-gray-100">
                  <span className="text-gray-700 truncate mr-2">{a.productName}</span>
                  <span className={`font-mono font-bold whitespace-nowrap ${a.adjustment < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {a.adjustment > 0 ? '+' : ''}{a.adjustment} → {a.newStock}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setBulkConfirmOpen(false)}
                className="flex-1 py-3 px-4 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={applyAll}
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                Bevestigen
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              📦 Voorraad Aanpassen
            </h1>
            <p className="text-gray-600 mt-2">
              Scan barcode of zoek product, pas voorraad aan en sla op
            </p>
          </div>

          {/* Search */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan barcode of typ productnaam..."
                  className="w-full px-4 py-3 pr-10 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                  autoFocus
                />
                {barcode && (
                  <button
                    type="button"
                    onClick={() => {
                      setBarcode('');
                      setSearchResults([]);
                      inputRef.current?.focus();
                    }}
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
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
              >
                {scanLoading ? '⏳ Zoeken...' : '🔍 Zoeken'}
              </button>
            </form>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="border-t mt-4 pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Zoekresultaten ({searchResults.length})
                </h3>
                <p className="text-sm text-gray-600 mb-3">Klik op een product om toe te voegen</p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {searchResults.map(product => (
                    <button
                      key={product.id}
                      onClick={() => handleSelectProduct(product)}
                      className="w-full text-left flex items-center justify-between p-3 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{product.name}</p>
                        <div className="flex gap-3 text-sm text-gray-500">
                          {product.attributes && <span className="text-blue-700 font-medium">{product.attributes}</span>}
                          {product.barcode && <span className="font-mono">{product.barcode}</span>}
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        <p className="text-xs text-gray-500">Voorraad</p>
                        <p className={`text-lg font-bold ${
                          product.qty_available > 0 ? 'text-green-600' :
                          product.qty_available === 0 ? 'text-orange-600' : 'text-red-600'
                        }`}>
                          {product.qty_available}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Order import */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">📋 Order importeren</h3>
            <p className="text-sm text-gray-600 mb-3">
              Voer een POS order ID of URL in om alle producten uit het order toe te voegen
            </p>
            <form onSubmit={handleOrderImport} className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={orderInput}
                  onChange={(e) => setOrderInput(e.target.value)}
                  placeholder="Order ID of URL (bv. 13818 of https://...pos-orders/13818)"
                  className="w-full px-4 py-3 pr-10 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg"
                />
                {orderInput && (
                  <button
                    type="button"
                    onClick={() => { setOrderInput(''); setOrderInfo(null); }}
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
                disabled={orderLoading}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
              >
                {orderLoading ? '⏳ Laden...' : '📋 Importeren'}
              </button>
            </form>

            {orderInfo && (
              <div className="mt-4 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold text-purple-900">{orderInfo.name}</span>
                  {orderInfo.partner && <span className="text-gray-600">{orderInfo.partner}</span>}
                  <span className="text-gray-500">{new Date(orderInfo.date).toLocaleString('nl-BE')}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    orderInfo.state === 'cancel' ? 'bg-red-100 text-red-700' :
                    orderInfo.state === 'done' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {orderInfo.state === 'cancel' ? 'Geannuleerd' :
                     orderInfo.state === 'done' ? 'Voltooid' :
                     orderInfo.state}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Adjustments list */}
          {adjustments.length > 0 && (
            <div className="bg-white shadow-xl rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  Aanpassingen ({adjustments.length})
                </h2>
                <div className="flex gap-2">
                  {completedCount > 0 && (
                    <button
                      onClick={clearCompleted}
                      className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                    >
                      Voltooide wissen
                    </button>
                  )}
                  {pendingCount > 0 && (
                    <button
                      onClick={() => setBulkConfirmOpen(true)}
                      disabled={bulkSaving}
                      className="px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
                    >
                      {bulkSaving ? '⏳ Opslaan...' : `Alles opslaan (${pendingCount})`}
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {adjustments.map(item => (
                  <div
                    key={`${item.productId}-${item.status}`}
                    className={`border-2 rounded-xl p-4 transition-all ${
                      item.status === 'success' ? 'border-green-300 bg-green-50' :
                      item.status === 'error' ? 'border-red-300 bg-red-50' :
                      item.status === 'saving' ? 'border-yellow-300 bg-yellow-50 animate-pulse' :
                      'border-gray-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Product info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{item.productName}</p>
                        <div className="flex gap-2 text-sm text-gray-500">
                          {item.attributes && <span className="text-blue-700 font-medium">{item.attributes}</span>}
                          {item.barcode && <span className="font-mono">{item.barcode}</span>}
                        </div>
                      </div>

                      {/* Stock display */}
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">Huidig:</span>
                        <span className="font-bold text-gray-700">{item.currentStock}</span>
                      </div>

                      {/* Adjustment controls */}
                      {item.status === 'pending' ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateAdjustment(item.productId, item.adjustment - 1)}
                            className="w-10 h-10 rounded-lg bg-red-100 text-red-700 font-bold text-xl flex items-center justify-center hover:bg-red-200 active:bg-red-300 transition-colors"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={item.adjustment}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isNaN(val)) updateAdjustment(item.productId, val);
                            }}
                            className="w-16 h-10 text-center border-2 border-gray-300 rounded-lg font-mono font-bold text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <button
                            onClick={() => updateAdjustment(item.productId, item.adjustment + 1)}
                            className="w-10 h-10 rounded-lg bg-green-100 text-green-700 font-bold text-xl flex items-center justify-center hover:bg-green-200 active:bg-green-300 transition-colors"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className={`font-mono font-bold text-lg ${item.adjustment < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {item.adjustment > 0 ? '+' : ''}{item.adjustment}
                          </span>
                        </div>
                      )}

                      {/* New stock */}
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">→</span>
                        <span className={`font-bold text-lg ${
                          item.newStock > 0 ? 'text-green-600' :
                          item.newStock === 0 ? 'text-orange-600' : 'text-red-600'
                        }`}>
                          {item.newStock}
                        </span>
                      </div>

                      {/* Actions */}
                      {item.status === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => applySingle(item.productId)}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                            title="Dit product opslaan"
                          >
                            ✓
                          </button>
                          <button
                            onClick={() => removeAdjustment(item.productId)}
                            className="px-3 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-200 transition-colors"
                            title="Verwijderen"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      {item.status === 'success' && (
                        <span className="text-green-600 font-semibold text-sm">✓ Opgeslagen</span>
                      )}
                      {item.status === 'saving' && (
                        <span className="text-yellow-600 font-semibold text-sm">⏳ Opslaan...</span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-red-600 font-semibold text-sm" title={item.error}>✕ Fout</span>
                      )}
                    </div>
                    {item.status === 'error' && item.error && (
                      <p className="text-sm text-red-600 mt-2">{item.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
