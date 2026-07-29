import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

const formatEuro = (amount: number) =>
  amount.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

type ReassignStep = 'confirm-clear' | 'search' | 'pick-variant';

interface BarcodeReassignState {
  step: ReassignStep;
  barcode: string;
  /** Set when barcode was taken from an archived product; null when assigning a free barcode */
  archivedProduct: { id: number; name: string; barcode?: string | null } | null;
  searchQuery: string;
  searchResults: any[];
  variants: any[];
  productName: string;
  searching: boolean;
  loadingVariants: boolean;
  working: boolean;
}

export default function VoorraadOpzoekenPage() {
  const { isLoading } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [productData, setProductData] = useState<any>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [filterInStock, setFilterInStock] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'price'>('name');
  const [imageMap, setImageMap] = useState<Record<number, string | null>>({});
  const [imagesLoading, setImagesLoading] = useState(false);
  const [barcodeReassign, setBarcodeReassign] = useState<BarcodeReassignState | null>(null);
  const imageRequestRef = useRef(0);
  const reassignSearchRef = useRef<HTMLInputElement>(null);

  const loadImages = useCallback(async (productIds: number[]) => {
    if (productIds.length === 0) return;
    const requestId = ++imageRequestRef.current;
    setImagesLoading(true);
    try {
      const res = await fetch('/api/product-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds }),
      });
      if (!res.ok) {
        console.error('Product images API returned', res.status);
        return;
      }
      const json = await res.json();
      if (requestId === imageRequestRef.current && json.images) {
        setImageMap((prev) => ({ ...prev, ...json.images }));
      }
    } catch (err) {
      console.error('Error loading images:', err);
    } finally {
      if (requestId === imageRequestRef.current) {
        setImagesLoading(false);
      }
    }
  }, []);

  const handleScanProduct = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!barcode.trim()) {
      alert('Voer een barcode of productnaam in');
      return;
    }

    setScanLoading(true);
    setProductData(null);
    setSearchResults([]);
    setImageMap({});
    
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: barcode.trim() }),
      });
      
      const json = await res.json();

      // Check archived conflict first (barcode only on inactive product)
      if (json.archivedConflict || json.archivedProduct) {
        setBarcodeReassign({
          step: 'confirm-clear',
          barcode: json.barcode || barcode.trim(),
          archivedProduct: json.archivedProduct || {
            id: 0,
            name: 'onbekend product',
          },
          searchQuery: '',
          searchResults: [],
          variants: [],
          productName: '',
          searching: false,
          loadingVariants: false,
          working: false,
        });
        setBarcode('');
        return;
      }

      if (json.isGiftCard && json.giftCard) {
        setSearchResults([]);
        setProductData({ isGiftCard: true, giftCard: json.giftCard });
      } else if (json.isSearchResults) {
        setSearchResults(json.searchResults);
        setProductData(null);
        loadImages(json.searchResults.map((p: any) => p.id));
      } else if (json.success) {
        setProductData(json);
        setSearchResults([]);
        if (json.variants?.length > 0) {
          loadImages(json.variants.map((v: any) => v.id));
        }
      } else {
        const code = barcode.trim();
        const wantAssign = confirm(
          `Product niet gevonden: ${json.error || 'Onbekende fout'}\n\n` +
            `Wil je barcode "${code}" toewijzen aan een bestaand product?`
        );
        if (wantAssign) {
          setBarcodeReassign({
            step: 'search',
            barcode: code,
            archivedProduct: null,
            searchQuery: '',
            searchResults: [],
            variants: [],
            productName: '',
            searching: false,
            loadingVariants: false,
            working: false,
          });
          setBarcode('');
          setTimeout(() => reassignSearchRef.current?.focus(), 100);
        }
      }
    } catch (err) {
      console.error('Error scanning product:', err);
      alert('Fout bij scannen van product');
    } finally {
      setScanLoading(false);
    }
  };

  const handleSelectProduct = async (productId: number) => {
    setScanLoading(true);
    setSearchResults([]);
    setProductData(null);
    setImageMap({});
    
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      
      const json = await res.json();
      
      if (json.success) {
        setProductData(json);
        if (json.variants?.length > 0) {
          loadImages(json.variants.map((v: any) => v.id));
        }
      } else {
        alert(`Product niet gevonden: ${json.error || 'Onbekende fout'}`);
      }
    } catch (err) {
      console.error('Error loading product:', err);
      alert('Fout bij laden van product');
    } finally {
      setScanLoading(false);
    }
  };

  const closeBarcodeReassign = () => {
    setBarcodeReassign(null);
  };

  const handleClearArchivedBarcode = async () => {
    if (!barcodeReassign || barcodeReassign.working) return;
    if (!barcodeReassign.archivedProduct?.id) {
      alert('Gearchiveerd product ontbreekt');
      return;
    }

    setBarcodeReassign((prev) => (prev ? { ...prev, working: true } : prev));
    try {
      const res = await fetch('/api/reassign-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clear',
          barcode: barcodeReassign.barcode,
          archivedProductId: barcodeReassign.archivedProduct.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(`Fout: ${json.error || 'Kon barcode niet leegmaken'}`);
        setBarcodeReassign((prev) => (prev ? { ...prev, working: false } : prev));
        return;
      }

      setBarcodeReassign((prev) =>
        prev
          ? {
              ...prev,
              step: 'search',
              working: false,
              searchQuery: '',
              searchResults: [],
              variants: [],
            }
          : prev
      );
      setTimeout(() => reassignSearchRef.current?.focus(), 100);
    } catch (err) {
      console.error('Error clearing archived barcode:', err);
      alert('Fout bij leegmaken van barcode');
      setBarcodeReassign((prev) => (prev ? { ...prev, working: false } : prev));
    }
  };

  const handleReassignSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!barcodeReassign) return;
    const trimmed = barcodeReassign.searchQuery.trim();
    if (!trimmed) return;

    setBarcodeReassign((prev) =>
      prev ? { ...prev, searching: true, searchResults: [], variants: [], step: 'search' } : prev
    );
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: trimmed }),
      });
      const json = await res.json();

      if (json.archivedConflict) {
        alert('Die barcode zit nog op een gearchiveerd product. Zoek op productnaam.');
        setBarcodeReassign((prev) => (prev ? { ...prev, searching: false } : prev));
        return;
      }

      if (json.success && json.isSearchResults) {
        setBarcodeReassign((prev) =>
          prev
            ? {
                ...prev,
                searching: false,
                step: 'search',
                searchResults: json.searchResults,
                variants: [],
              }
            : prev
        );
        return;
      }

      if (json.success && json.variants?.length) {
        // Exact/single product hit: go straight to variant pick
        setBarcodeReassign((prev) =>
          prev
            ? {
                ...prev,
                searching: false,
                step: 'pick-variant',
                searchResults: [],
                variants: json.variants,
                productName: json.productName || '',
              }
            : prev
        );
        return;
      }

      setBarcodeReassign((prev) => (prev ? { ...prev, searching: false, searchResults: [] } : prev));
      alert(`Geen actief product gevonden: ${json.error || 'Onbekende fout'}`);
    } catch (err) {
      console.error('Error searching reassign target:', err);
      alert('Fout bij zoeken van product');
      setBarcodeReassign((prev) => (prev ? { ...prev, searching: false } : prev));
    }
  };

  const handleReassignPickProduct = async (productId: number) => {
    if (!barcodeReassign) return;
    setBarcodeReassign((prev) => (prev ? { ...prev, loadingVariants: true } : prev));
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      const json = await res.json();
      if (!json.success || !json.variants?.length) {
        alert(`Kon varianten niet laden: ${json.error || 'Onbekende fout'}`);
        setBarcodeReassign((prev) => (prev ? { ...prev, loadingVariants: false } : prev));
        return;
      }
      setBarcodeReassign((prev) =>
        prev
          ? {
              ...prev,
              loadingVariants: false,
              step: 'pick-variant',
              variants: json.variants,
              productName: json.productName || '',
            }
          : prev
      );
    } catch (err) {
      console.error('Error loading variants for reassign:', err);
      alert('Fout bij laden van varianten');
      setBarcodeReassign((prev) => (prev ? { ...prev, loadingVariants: false } : prev));
    }
  };

  const handleAssignBarcodeToVariant = async (
    variantId: number,
    variantLabel: string,
    existingBarcode?: string | null
  ) => {
    if (!barcodeReassign || barcodeReassign.working) return;

    const currentBarcode =
      typeof existingBarcode === 'string' && existingBarcode.trim() ? existingBarcode.trim() : '';
    let replaceExisting = false;

    if (currentBarcode && currentBarcode !== barcodeReassign.barcode) {
      const replace = confirm(
        `Deze variant heeft al barcode "${currentBarcode}".\n\n` +
          `Wil je het huidige barcode vervangen met de gescande barcode "${barcodeReassign.barcode}"?`
      );
      if (!replace) return;
      replaceExisting = true;
    } else if (
      !confirm(`Barcode ${barcodeReassign.barcode} toewijzen aan:\n"${variantLabel}"?`)
    ) {
      return;
    }

    setBarcodeReassign((prev) => (prev ? { ...prev, working: true } : prev));
    try {
      const assignOnce = async (replace: boolean) => {
        const res = await fetch('/api/reassign-barcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'assign',
            barcode: barcodeReassign.barcode,
            targetProductId: variantId,
            replaceExisting: replace,
          }),
        });
        const json = await res.json();
        return { res, json };
      };

      let { res, json } = await assignOnce(replaceExisting);

      // Server may still detect an existing barcode we didn't know about
      if (!res.ok && json.needsReplace && json.existingBarcode) {
        const replace = confirm(
          `Deze variant heeft al barcode "${json.existingBarcode}".\n\n` +
            `Wil je het huidige barcode vervangen met de gescande barcode "${barcodeReassign.barcode}"?`
        );
        if (!replace) {
          setBarcodeReassign((prev) => (prev ? { ...prev, working: false } : prev));
          return;
        }
        ({ res, json } = await assignOnce(true));
      }

      if (!res.ok || !json.success) {
        alert(`Fout: ${json.error || 'Kon barcode niet toewijzen'}`);
        setBarcodeReassign((prev) => (prev ? { ...prev, working: false } : prev));
        return;
      }

      closeBarcodeReassign();
      await handleSelectProduct(variantId);
    } catch (err) {
      console.error('Error assigning barcode:', err);
      alert('Fout bij toewijzen van barcode');
      setBarcodeReassign((prev) => (prev ? { ...prev, working: false } : prev));
    }
  };

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
      
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              🔍 Voorraad Opzoeken
            </h1>
            <p className="text-gray-600 mt-2">
              Scan barcode of zoek product om voorraad van alle varianten te controleren
            </p>
          </div>

          {/* Barcode reassign modal */}
          {barcodeReassign && (
            <div
              className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-[8vh] px-4"
              onClick={() => {
                if (!barcodeReassign.working && !barcodeReassign.loadingVariants) {
                  closeBarcodeReassign();
                }
              }}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      {barcodeReassign.archivedProduct
                        ? 'Barcode zit op gearchiveerd product'
                        : 'Barcode toewijzen aan product'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Barcode{' '}
                      <span className="font-mono font-semibold text-gray-700">
                        {barcodeReassign.barcode}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeBarcodeReassign}
                    disabled={barcodeReassign.working}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {barcodeReassign.archivedProduct ? (
                  <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 text-sm text-amber-900">
                    Gearchiveerd:{' '}
                    <span className="font-semibold">{barcodeReassign.archivedProduct.name}</span>
                  </div>
                ) : (
                  <div className="px-6 py-3 bg-sky-50 border-b border-sky-100 text-sm text-sky-900">
                    Geen product met deze barcode gevonden. Zoek het juiste product en kies de
                    variant.
                  </div>
                )}

                {barcodeReassign.step === 'confirm-clear' && (
                  <div className="px-6 py-6 space-y-4">
                    <p className="text-gray-700">
                      Wil je de barcode leegmaken bij dit gearchiveerde product? Daarna kun je hem
                      toewijzen aan de juiste actieve variant.
                    </p>
                    <div className="flex gap-3 justify-end">
                      <button
                        type="button"
                        onClick={closeBarcodeReassign}
                        disabled={barcodeReassign.working}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Annuleren
                      </button>
                      <button
                        type="button"
                        onClick={handleClearArchivedBarcode}
                        disabled={barcodeReassign.working}
                        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50"
                      >
                        {barcodeReassign.working ? 'Bezig...' : 'Ja, barcode leegmaken'}
                      </button>
                    </div>
                  </div>
                )}

                {barcodeReassign.step === 'search' && (
                  <>
                    <form
                      onSubmit={handleReassignSearch}
                      className="px-6 py-4 border-b border-gray-100 flex gap-3"
                    >
                      <input
                        ref={reassignSearchRef}
                        type="text"
                        value={barcodeReassign.searchQuery}
                        onChange={(e) =>
                          setBarcodeReassign((prev) =>
                            prev ? { ...prev, searchQuery: e.target.value } : prev
                          )
                        }
                        placeholder="Zoek actief product op naam..."
                        className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={barcodeReassign.searching || barcodeReassign.loadingVariants}
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={
                          barcodeReassign.searching ||
                          barcodeReassign.loadingVariants ||
                          !barcodeReassign.searchQuery.trim()
                        }
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50"
                      >
                        {barcodeReassign.searching ? 'Zoeken...' : 'Zoeken'}
                      </button>
                    </form>
                    <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                      {barcodeReassign.loadingVariants && (
                        <div className="px-6 py-8 text-center text-gray-500">
                          Varianten laden...
                        </div>
                      )}
                      {!barcodeReassign.loadingVariants &&
                        barcodeReassign.searchResults.length === 0 && (
                          <div className="px-6 py-8 text-center text-gray-500 text-sm">
                            Zoek het juiste product. Klik daarna op een resultaat om de variant te
                            kiezen.
                          </div>
                        )}
                      {!barcodeReassign.loadingVariants &&
                        barcodeReassign.searchResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleReassignPickProduct(p.id)}
                            className="w-full text-left px-6 py-3 hover:bg-blue-50 transition-colors"
                          >
                            <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {p.attributes && (
                                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                  {p.attributes}
                                </span>
                              )}
                              <span className="text-xs text-gray-500">
                                Voorraad: {p.qty_available} · {formatEuro(p.list_price)}
                              </span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </>
                )}

                {barcodeReassign.step === 'pick-variant' && (
                  <>
                    <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          Kies de juiste variant
                        </p>
                        {barcodeReassign.productName && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {barcodeReassign.productName}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setBarcodeReassign((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  step: 'search',
                                  variants: [],
                                  productName: '',
                                }
                              : prev
                          )
                        }
                        disabled={barcodeReassign.working}
                        className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        Terug naar zoeken
                      </button>
                    </div>
                    <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                      {barcodeReassign.working && (
                        <div className="px-6 py-8 text-center text-gray-500">
                          Barcode toewijzen...
                        </div>
                      )}
                      {!barcodeReassign.working &&
                        barcodeReassign.variants.map((v) => {
                          const label = [
                            barcodeReassign.productName || v.name,
                            v.attributes,
                          ]
                            .filter(Boolean)
                            .join(' — ');
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => handleAssignBarcodeToVariant(v.id, label, v.barcode)}
                              className="w-full text-left px-6 py-3 hover:bg-green-50 transition-colors flex items-center gap-4"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 text-sm truncate">
                                  {v.name || barcodeReassign.productName}
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {v.attributes && (
                                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                      {v.attributes}
                                    </span>
                                  )}
                                  {v.barcode && (
                                    <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                      {v.barcode}
                                    </span>
                                  )}
                                  <span
                                    className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                      v.qty_available > 0
                                        ? 'text-green-700 bg-green-100'
                                        : 'text-orange-700 bg-orange-100'
                                    }`}
                                  >
                                    Voorraad: {v.qty_available}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded shrink-0">
                                Toewijzen
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Product Scanner Section */}
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <form onSubmit={handleScanProduct} className="flex gap-3 mb-4">
              <div className="flex-1 relative">
                <input
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
                      setProductData(null);
                      setImageMap({});
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

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="border-t pt-4">
                <div className="flex flex-wrap justify-between items-center mb-3 gap-3">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Zoekresultaten ({
                      filterInStock 
                        ? searchResults.filter(p => p.qty_available > 0).length 
                        : searchResults.length
                    })
                  </h3>
                  
                  <div className="flex gap-3 items-center">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterInStock}
                        onChange={(e) => setFilterInStock(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">Alleen op voorraad</span>
                    </label>
                    
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'name' | 'stock' | 'price')}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="name">Sorteer: Naam</option>
                      <option value="stock">Sorteer: Voorraad</option>
                      <option value="price">Sorteer: Prijs</option>
                    </select>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Klik op een product om alle varianten te zien
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto">
                  {searchResults
                    .filter(product => !filterInStock || product.qty_available > 0)
                    .sort((a, b) => {
                      if (sortBy === 'stock') return b.qty_available - a.qty_available;
                      if (sortBy === 'price') return a.list_price - b.list_price;
                      return a.name.localeCompare(b.name);
                    })
                    .map((product) => (
                    <div
                      key={product.id}
                      onClick={() => handleSelectProduct(product.id)}
                      className="border-2 border-gray-200 rounded-lg overflow-hidden hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all"
                    >
                      {imageMap[product.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={`data:image/png;base64,${imageMap[product.id]}`}
                          alt={product.name}
                          className="w-full h-40 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-40 bg-gray-100 flex items-center justify-center">
                          {imagesLoading ? (
                            <span className="text-gray-300 text-sm animate-pulse">Laden...</span>
                          ) : (
                            <span className="text-gray-400 text-5xl">📦</span>
                          )}
                        </div>
                      )}
                      <div className="p-3">
                        <h4 className="font-semibold text-gray-900 text-sm mb-2 line-clamp-2 min-h-[2.5rem]">
                          {product.name}
                        </h4>
                        
                        {product.attributes ? (
                          <div className="mb-2 px-3 py-2 bg-blue-100 rounded-lg text-center border border-blue-300">
                            <p className="text-base font-bold text-blue-900">{product.attributes}</p>
                          </div>
                        ) : (
                          <div className="mb-2 px-3 py-2 bg-gray-50 rounded-lg text-center">
                            <p className="text-xs text-gray-400">Geen maat info</p>
                          </div>
                        )}
                        
                        {product.barcode && (
                          <p className="text-xs text-gray-500 font-mono mb-2 truncate">{product.barcode}</p>
                        )}
                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                          <div>
                            <p className="text-xs text-gray-600">Voorraad</p>
                            <span className={`text-lg font-bold ${
                              product.qty_available > 0 ? 'text-green-600' : 
                              product.qty_available === 0 ? 'text-orange-600' : 'text-red-600'
                            }`}>
                              {product.qty_available}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-600">Prijs</p>
                            <span className="text-sm font-semibold text-gray-900">
                              {formatEuro(product.list_price)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Product Variant Results / Cadeaubon */}
          {productData && (
            <div className="bg-white shadow-xl rounded-2xl p-6">
              {productData.isGiftCard && productData.giftCard ? (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-4">
                    🎁 Cadeaubon
                  </h2>
                  <div className="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <h3 className="text-lg font-semibold text-gray-900 font-mono">{productData.giftCard.code}</h3>
                    <div className="flex gap-4 mt-2 text-sm">
                      <p className="text-gray-700">
                        <strong>Saldo:</strong> €{Number(productData.giftCard.balance ?? productData.giftCard.points ?? 0).toFixed(2)}
                      </p>
                      {productData.giftCard.expiration_date && (
                        <p className="text-gray-700">
                          <strong>Geldig tot:</strong> {new Date(productData.giftCard.expiration_date).toLocaleDateString('nl-BE')}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-amber-800 mt-2">Gebruik de kassa (Odoo POS) om deze bon te verzilveren.</p>
                  </div>
                </>
              ) : (
                <>
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                📊 Voorraad Varianten
              </h2>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900">{productData.productName}</h3>
                <div className="flex gap-4 mt-1 text-sm">
                  <p className="text-gray-700">
                    <strong>Totaal varianten:</strong> {productData.totalVariants}
                  </p>
                  <p className="text-green-700">
                    <strong>Beschikbaar:</strong> {productData.variants.filter((v: any) => v.qty_available > 0).length}
                  </p>
                </div>
              </div>

              {productData.variants && productData.variants.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {productData.variants.map((variant: any) => (
                    <div 
                      key={variant.id} 
                      className={`border-2 rounded-lg p-4 transition-all ${
                        variant.isScanned 
                          ? 'border-blue-500 bg-blue-50 shadow-lg' 
                          : 'border-gray-200 hover:shadow-md'
                      }`}
                    >
                      {imageMap[variant.id] ? (
                        <div className="mb-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={`data:image/png;base64,${imageMap[variant.id]}`}
                            alt={variant.name}
                            className="w-full h-48 object-cover rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="mb-3 bg-gray-100 h-48 rounded-lg flex items-center justify-center">
                          {imagesLoading ? (
                            <span className="text-gray-300 text-sm animate-pulse">Laden...</span>
                          ) : (
                            <span className="text-gray-400 text-4xl">📦</span>
                          )}
                        </div>
                      )}
                      
                      <h4 className="font-semibold text-gray-900 text-sm mb-2 line-clamp-2">
                        {variant.name}
                        {variant.isScanned && (
                          <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">
                            GESCAND
                          </span>
                        )}
                      </h4>
                      
                      {variant.attributes ? (
                        <div className="mb-2 px-3 py-2 bg-blue-100 rounded-lg text-center border border-blue-300">
                          <p className="text-base font-bold text-blue-900">{variant.attributes}</p>
                        </div>
                      ) : (
                        <div className="mb-2 px-3 py-2 bg-gray-50 rounded-lg text-center">
                          <p className="text-xs text-gray-400">Geen maat info</p>
                        </div>
                      )}
                      
                      {variant.barcode && (
                        <p className="text-xs text-gray-500 mb-2 font-mono truncate">{variant.barcode}</p>
                      )}
                      
                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200">
                        <div>
                          <p className="text-xs text-gray-600">Voorraad</p>
                          <p className={`text-xl font-bold ${
                            variant.qty_available > 0 ? 'text-green-600' : 
                            variant.qty_available === 0 ? 'text-orange-600' : 'text-red-600'
                          }`}>
                            {variant.qty_available}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-600">Prijs</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {formatEuro(variant.list_price)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-600 text-center py-8">Geen varianten gevonden</p>
              )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
