import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  printProductLabels,
  loadPrinterPreference,
  loadLabelFormatPreference,
  savePrinterPreference,
  saveLabelFormatPreference,
  type PrinterType,
  type LabelFormat,
} from '@/lib/print-product-labels-client';

type ProductBrand = {
  id: number;
  name: string;
  valueIds: number[];
};

type BrandProduct = {
  id: number;
  name: string;
  barcode: string | null;
  qty_available: number;
  list_price: number;
  attributes: string | null;
  productTmplId: number | null;
  sizeRange: string | null;
  favorite: boolean;
  count: number;
  stockStatus?: 'success' | 'error' | 'pending';
  stockError?: string;
};

const formatEuro = (amount: number) =>
  amount.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

export default function LabelsAfdrukkenSelectiePage() {
  const { isLoading, isLoggedIn } = useAuth();
  const [brands, setBrands] = useState<ProductBrand[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [brandsError, setBrandsError] = useState<string | null>(null);
  const [brandSearch, setBrandSearch] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(true);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [products, setProducts] = useState<BrandProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [printer, setPrinter] = useState<PrinterType>('zebra');
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('normal');
  const [printingLabels, setPrintingLabels] = useState(false);
  const [adjustingStock, setAdjustingStock] = useState(false);

  useEffect(() => {
    setPrinter(loadPrinterPreference());
    setLabelFormat(loadLabelFormatPreference());
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    const loadBrands = async () => {
      setBrandsLoading(true);
      setBrandsError(null);
      try {
        const res = await fetch('/api/product-brands');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Kon merken niet laden');
        if (!cancelled) setBrands(json.brands || []);
      } catch (err) {
        console.error(err);
        if (!cancelled) setBrandsError('Kon merken niet laden');
      } finally {
        if (!cancelled) setBrandsLoading(false);
      }
    };
    void loadBrands();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (selectedBrandId == null) {
      setProducts([]);
      setSelectedIds(new Set());
      setProductsError(null);
      return;
    }

    let cancelled = false;
    const loadProducts = async () => {
      setProductsLoading(true);
      setProductsError(null);
      try {
        const params = new URLSearchParams({
          brandId: String(selectedBrandId),
          favoritesOnly: favoritesOnly ? '1' : '0',
          inStockOnly: inStockOnly ? '1' : '0',
        });
        const res = await fetch(`/api/products-by-brand?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Kon producten niet laden');
        if (cancelled) return;
        const rows: BrandProduct[] = (json.products || []).map(
          (p: Omit<BrandProduct, 'count'>) => ({
            ...p,
            count: 1,
          })
        );
        setProducts(rows);
        setSelectedIds(new Set());
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setProducts([]);
          setProductsError(err instanceof Error ? err.message : 'Kon producten niet laden');
        }
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    };
    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, [selectedBrandId, favoritesOnly, inStockOnly]);

  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q));
  }, [brands, brandSearch]);

  const selectedBrand = brands.find((b) => b.id === selectedBrandId) ?? null;

  const productGroups = useMemo(() => {
    const byTmpl = new Map<number | string, BrandProduct[]>();
    for (const p of products) {
      const key = p.productTmplId != null ? p.productTmplId : `single-${p.id}`;
      if (!byTmpl.has(key)) byTmpl.set(key, []);
      byTmpl.get(key)!.push(p);
    }
    return Array.from(byTmpl.entries()).map(([key, groupProducts]) => ({
      key,
      products: groupProducts,
    }));
  }, [products]);

  const selectedProducts = products.filter((p) => selectedIds.has(p.id));
  const totalLabels = selectedProducts.reduce((sum, p) => sum + p.count, 0);

  const togglePrinter = () => {
    const next: PrinterType = printer === 'zebra' ? 'dymo' : 'zebra';
    setPrinter(next);
    savePrinterPreference(next);
  };

  const toggleLabelFormat = () => {
    const next: LabelFormat = labelFormat === 'normal' ? 'small' : 'normal';
    setLabelFormat(next);
    saveLabelFormatPreference(next);
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setGroupSelected = (ids: number[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(products.map((p) => p.id)));
  const selectNone = () => setSelectedIds(new Set());

  const updateCount = (id: number, count: number) => {
    if (count < 1) return;
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, count } : p)));
  };

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handlePrintLabels = async () => {
    if (selectedProducts.length === 0) return;
    setPrintingLabels(true);
    try {
      const result = await printProductLabels({
        products: selectedProducts,
        printer,
        format: labelFormat,
        onClearList: clearSelection,
      });
      switch (result.status) {
        case 'zpl-printed':
        case 'html-printed':
        case 'cancelled':
        case 'popup-blocked':
        case 'error':
          break;
        default: {
          const _exhaustive: never = result;
          return _exhaustive;
        }
      }
    } finally {
      setPrintingLabels(false);
    }
  };

  const handleAdjustStock = async () => {
    if (selectedProducts.length === 0) return;
    if (
      !confirm(
        `Voorraad aanpassen voor ${selectedProducts.length} product(en)?\n\nDe huidige voorraad wordt ingesteld op het ingevoerde aantal.`
      )
    ) {
      return;
    }

    setAdjustingStock(true);
    const selectedIdSet = new Set(selectedProducts.map((p) => p.id));
    setProducts((prev) =>
      prev.map((p) =>
        selectedIdSet.has(p.id) ? { ...p, stockStatus: 'pending', stockError: undefined } : p
      )
    );

    try {
      const res = await fetch('/api/adjust-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedProducts.map((p) => ({
            productId: p.id,
            quantity: p.count,
          })),
        }),
      });
      const json = await res.json();

      if (json.results) {
        setProducts((prev) =>
          prev.map((p) => {
            const result = json.results.find((r: { productId: number }) => r.productId === p.id);
            if (!result) {
              if (!selectedIdSet.has(p.id)) return p;
              return { ...p, stockStatus: 'error', stockError: 'Geen resultaat' };
            }
            return {
              ...p,
              stockStatus: result.success ? ('success' as const) : ('error' as const),
              stockError: result.error,
              qty_available: result.success ? p.count : p.qty_available,
            };
          })
        );

        const successCount = json.results.filter((r: { success: boolean }) => r.success).length;
        const message = json.message || `${successCount} van ${selectedProducts.length} producten aangepast`;

        if (successCount > 0) {
          const wantPrint = confirm(`${message}\n\nWil je de labels nu afdrukken?`);
          setAdjustingStock(false);
          if (wantPrint) await handlePrintLabels();
          return;
        }

        alert(message);
      } else {
        alert(`Fout: ${json.error || 'Kon voorraad niet aanpassen'}`);
        setProducts((prev) =>
          prev.map((p) =>
            selectedIdSet.has(p.id)
              ? { ...p, stockStatus: 'error', stockError: json.error }
              : p
          )
        );
      }
    } catch (err) {
      console.error('Error adjusting stock:', err);
      alert('Fout bij aanpassen van voorraad');
      setProducts((prev) =>
        prev.map((p) =>
          selectedIdSet.has(p.id) ? { ...p, stockStatus: 'error', stockError: 'Netwerk fout' } : p
        )
      );
    } finally {
      setAdjustingStock(false);
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

  const allSelected = products.length > 0 && selectedIds.size === products.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 font-sans">
      <div className="p-4 sm:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  Labels afdrukken — selectie
                </h1>
                <p className="text-gray-600 mt-2">
                  Kies een merk, vink varianten aan en pas voorraad aan of druk labels af
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleLabelFormat}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-all shrink-0 ${
                    labelFormat === 'normal'
                      ? 'border-gray-400 bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  {labelFormat === 'normal' ? 'Normaal formaat' : 'Klein (25×25mm)'}
                </button>
                <button
                  type="button"
                  onClick={togglePrinter}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-all shrink-0 ${
                    printer === 'zebra'
                      ? 'border-black bg-gray-900 text-white hover:bg-gray-800'
                      : 'border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  {printer === 'zebra' ? 'Zebra ZD421d (51×25mm)' : 'Dymo (25×54mm)'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="brand-search">
                  Merk
                </label>
                <input
                  id="brand-search"
                  type="search"
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  placeholder={brandsLoading ? 'Merken laden…' : 'Zoek merk…'}
                  disabled={brandsLoading}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
                <select
                  aria-label="Merk kiezen"
                  value={selectedBrandId ?? ''}
                  onChange={(e) => setSelectedBrandId(e.target.value ? Number(e.target.value) : null)}
                  disabled={brandsLoading}
                  size={8}
                  className="mt-2 w-full border-2 border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">— Kies een merk —</option>
                  {filteredBrands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {brandsError && (
                  <p className="mt-2 text-sm text-red-600">{brandsError}</p>
                )}
                {selectedBrand && (
                  <p className="mt-2 text-sm text-green-800 font-medium">Gekozen: {selectedBrand.name}</p>
                )}
              </div>

              <div className="flex flex-col justify-end gap-3">
                <label className="flex items-center gap-3 text-sm font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={favoritesOnly}
                    onChange={(e) => setFavoritesOnly(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  Enkel favorieten (Odoo-sterren)
                </label>
                <label className="flex items-center gap-3 text-sm font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  Enkel met voorraad
                </label>
              </div>
            </div>
          </div>

          {selectedBrandId != null && (
            <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  Varianten
                  {!productsLoading && (
                    <span className="text-base font-medium text-gray-500 ml-2">
                      ({products.length}
                      {selectedIds.size > 0 ? `, ${selectedIds.size} gekozen` : ''})
                    </span>
                  )}
                </h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={products.length === 0 || productsLoading}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {allSelected ? 'Alles aangevinkt' : 'Alles aanvinken'}
                  </button>
                  <button
                    type="button"
                    onClick={selectNone}
                    disabled={selectedIds.size === 0}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Niets aanvinken
                  </button>
                </div>
              </div>

              {productsLoading && (
                <p className="py-8 text-center text-gray-500">Producten laden…</p>
              )}
              {productsError && (
                <p className="py-4 text-center text-red-600">{productsError}</p>
              )}
              {!productsLoading && !productsError && products.length === 0 && (
                <p className="py-8 text-center text-gray-500">
                  {favoritesOnly
                    ? 'Geen favorieten voor dit merk. Zet het filter uit om alle varianten te zien.'
                    : 'Geen varianten gevonden voor dit merk.'}
                </p>
              )}

              {!productsLoading && products.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col className="w-10" />
                      <col />
                      <col className="hidden sm:table-column w-[18%]" />
                      <col className="w-[14%] sm:w-[10%]" />
                      <col className="w-[22%] sm:w-[16%]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b-2 border-gray-200">
                        <th className="py-3 px-2">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={(e) => (e.target.checked ? selectAll() : selectNone())}
                            aria-label="Alles aanvinken"
                            className="w-4 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                        </th>
                        <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Product</th>
                        <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700 hidden sm:table-cell">
                          Barcode
                        </th>
                        <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Prijs</th>
                        <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Aantal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productGroups.map(({ key, products: group }) => {
                        const isLinkedGroup = group.length > 1 && typeof key === 'number';
                        const groupIds = group.map((p) => p.id);
                        const groupSelectedCount = groupIds.filter((id) => selectedIds.has(id)).length;
                        const groupAllSelected = groupSelectedCount === groupIds.length;
                        return (
                          <Fragment key={String(key)}>
                            {isLinkedGroup && (
                              <tr className="bg-sky-50 border-y-2 border-sky-200">
                                <td className="py-2 px-2">
                                  <input
                                    type="checkbox"
                                    checked={groupAllSelected}
                                    onChange={(e) => setGroupSelected(groupIds, e.target.checked)}
                                    aria-label="Alle maten van dit product aanvinken"
                                    className="w-4 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                  />
                                </td>
                                <td colSpan={4} className="py-2 px-3 text-sm text-sky-800 font-medium">
                                  Productgroep ({group.length} varianten)
                                </td>
                              </tr>
                            )}
                            {group.map((product) => (
                              <tr
                                key={product.id}
                                className={`border-b border-gray-100 hover:bg-gray-50 ${
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
                                    type="checkbox"
                                    checked={selectedIds.has(product.id)}
                                    onChange={() => toggleSelected(product.id)}
                                    aria-label={`Selecteer ${product.name}`}
                                    className="w-4 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                  />
                                </td>
                                <td className="py-3 px-2">
                                  <div className="font-medium text-gray-900 text-sm break-words">
                                    {product.favorite ? (
                                      <span className="mr-1 text-amber-500" title="Favoriet">
                                        ★
                                      </span>
                                    ) : (
                                      <span className="mr-1 text-gray-300" title="Geen favoriet">
                                        ☆
                                      </span>
                                    )}
                                    {product.name}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                    {product.attributes && (
                                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                        {product.attributes}
                                      </span>
                                    )}
                                    {product.sizeRange && (
                                      <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                                        {product.sizeRange}
                                      </span>
                                    )}
                                    <span
                                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                        product.qty_available > 0
                                          ? 'text-green-700 bg-green-100'
                                          : 'text-orange-700 bg-orange-100'
                                      }`}
                                    >
                                      Voorraad: {product.qty_available}
                                    </span>
                                  </div>
                                  {product.stockStatus === 'success' && (
                                    <span className="text-xs text-green-600 font-medium">Voorraad aangepast</span>
                                  )}
                                  {product.stockStatus === 'error' && (
                                    <span className="text-xs text-red-600 font-medium">
                                      {product.stockError || 'Fout'}
                                    </span>
                                  )}
                                  {product.stockStatus === 'pending' && (
                                    <span className="text-xs text-yellow-600 font-medium">Bezig...</span>
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
                                      type="button"
                                      onClick={() => updateCount(product.id, product.count - 1)}
                                      disabled={product.count <= 1}
                                      className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min="1"
                                      value={product.count}
                                      onChange={(e) => {
                                        const val = parseInt(e.target.value, 10);
                                        if (val >= 1) updateCount(product.id, val);
                                      }}
                                      className="w-12 text-center border border-gray-300 rounded py-1 text-sm font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateCount(product.id, product.count + 1)}
                                      className="w-7 h-7 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-sm"
                                    >
                                      +
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {selectedProducts.length > 0 && (
            <div className="bg-white shadow-xl rounded-2xl p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Acties</h2>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  type="button"
                  onClick={handleAdjustStock}
                  disabled={adjustingStock || printingLabels}
                  className="flex-1 px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all text-lg"
                >
                  {adjustingStock ? 'Voorraad aanpassen...' : 'Voorraad aanpassen'}
                </button>
                <button
                  type="button"
                  onClick={handlePrintLabels}
                  disabled={printingLabels || adjustingStock}
                  className="flex-1 px-6 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all text-lg"
                >
                  {printingLabels ? 'Labels versturen…' : `Labels afdrukken (${totalLabels})`}
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                {labelFormat === 'small'
                  ? 'Klein formaat (25×25mm): alleen prijs en variant/maatreeks. '
                  : ''}
                Labels: {printer === 'zebra' ? 'Zebra (51×25mm)' : 'Dymo (25×54mm)'}.
                Alleen aangevinkte rijen. Het aantal is de nieuwe voorraad én het aantal labels.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
