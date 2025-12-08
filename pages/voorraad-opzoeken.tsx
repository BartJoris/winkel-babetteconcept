import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

const formatEuro = (amount: number) =>
  amount.toLocaleString('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

export default function VoorraadOpzoekenPage() {
  const { isLoading } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [productData, setProductData] = useState<any>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [filterInStock, setFilterInStock] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'price'>('name');

  const handleScanProduct = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!barcode.trim()) {
      alert('Voer een barcode of productnaam in');
      return;
    }

    setScanLoading(true);
    setProductData(null);
    setSearchResults([]);
    
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: barcode.trim() }),
      });
      
      const json = await res.json();
      
      if (json.success) {
        if (json.isSearchResults) {
          setSearchResults(json.searchResults);
          setProductData(null);
        } else {
          console.log('Product data received:', json);
          setProductData(json);
          setSearchResults([]);
        }
      } else {
        alert(`Product niet gevonden: ${json.error || 'Onbekende fout'}`);
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
    
    try {
      const res = await fetch('/api/scan-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      
      const json = await res.json();
      
      if (json.success) {
        setProductData(json);
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
                      {product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={`data:image/png;base64,${product.image}`}
                          alt={product.name}
                          className="w-full h-40 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-40 bg-gray-100 flex items-center justify-center">
                          <span className="text-gray-400 text-5xl">📦</span>
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

          {/* Product Variant Results */}
          {productData && (
            <div className="bg-white shadow-xl rounded-2xl p-6">
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
                      {variant.image ? (
                        <div className="mb-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={`data:image/png;base64,${variant.image}`}
                            alt={variant.name}
                            className="w-full h-48 object-cover rounded-lg"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="mb-3 bg-gray-100 h-48 rounded-lg flex items-center justify-center">
                          <span className="text-gray-400 text-4xl">📦</span>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

