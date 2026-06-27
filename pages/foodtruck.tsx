import { useState, useEffect, useCallback } from 'react';

// ============================================================
// PRODUCTEN - Pas hier eenvoudig de producten en prijzen aan
// ============================================================
const PRODUCTS = [
  { name: 'Water', price: 2.50 },
  { name: 'Cola', price: 2.50 },
  { name: 'Fanta', price: 2.50 },
  { name: 'Bier', price: 2.50 },
  { name: 'Glas Rosé', price: 6.00 },
  { name: 'Fles Rosé', price: 30.00 },
  { name: 'Glas Cava', price: 8.00 },
  { name: 'Fles Cava', price: 35.00 },
  { name: 'Chips', price: 1.50 },
  { name: 'Croque', price: 5.00 },
];

// ============================================================

type PaymentMethod = 'cash' | 'payconiq';
type Screen = 'products' | 'payment' | 'overview';

interface CartItem {
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  items: CartItem[];
  total: number;
  method: PaymentMethod;
  timestamp: string;
}

interface DayData {
  date: string;
  orders: Order[];
  totalCash: number;
  totalPayconiq: number;
}

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function freshDayData(): DayData {
  return { date: getTodayStr(), orders: [], totalCash: 0, totalPayconiq: 0 };
}

async function loadDayData(): Promise<DayData> {
  try {
    const res = await fetch('/api/foodtruck/data');
    if (res.ok) {
      const data: DayData = await res.json();
      if (data.date === getTodayStr()) {
        return data;
      }
    }
  } catch {}
  return freshDayData();
}

async function saveDayData(data: DayData): Promise<void> {
  await fetch('/api/foodtruck/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

function formatPrice(amount: number): string {
  return `€${amount.toFixed(2).replace('.', ',')}`;
}

export default function FoodtruckPage() {
  const [screen, setScreen] = useState<Screen>('products');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [dayData, setDayData] = useState<DayData>(freshDayData);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDayData().then(data => {
      setDayData(data);
      setLoading(false);
    });
  }, []);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addToCart = useCallback((product: { name: string; price: number }) => {
    setCart(prev => {
      const existing = prev.find(item => item.name === product.name);
      if (existing) {
        return prev.map(item =>
          item.name === product.name
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { name: product.name, price: product.price, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((productName: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.name === productName);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        return prev.filter(item => item.name !== productName);
      }
      return prev.map(item =>
        item.name === productName
          ? { ...item, quantity: item.quantity - 1 }
          : item
      );
    });
  }, []);

  const completeOrder = useCallback((method: PaymentMethod) => {
    if (cart.length === 0) return;

    const order: Order = {
      items: [...cart],
      total: cartTotal,
      method,
      timestamp: new Date().toISOString(),
    };

    const updated: DayData = {
      ...dayData,
      orders: [...dayData.orders, order],
      totalCash: dayData.totalCash + (method === 'cash' ? cartTotal : 0),
      totalPayconiq: dayData.totalPayconiq + (method === 'payconiq' ? cartTotal : 0),
    };

    setDayData(updated);
    saveDayData(updated);
    setCart([]);
    setScreen('products');
    setConfirmationVisible(true);
    setTimeout(() => setConfirmationVisible(false), 2000);
  }, [cart, cartTotal, dayData]);

  const deleteOrder = useCallback((index: number) => {
    const order = dayData.orders[index];
    if (!order) return;
    const updated: DayData = {
      ...dayData,
      orders: dayData.orders.filter((_, i) => i !== index),
      totalCash: dayData.totalCash - (order.method === 'cash' ? order.total : 0),
      totalPayconiq: dayData.totalPayconiq - (order.method === 'payconiq' ? order.total : 0),
    };
    setDayData(updated);
    saveDayData(updated);
  }, [dayData]);

  const resetDay = useCallback(() => {
    const fresh: DayData = { date: getTodayStr(), orders: [], totalCash: 0, totalPayconiq: 0 };
    setDayData(fresh);
    saveDayData(fresh);
  }, []);

  const getCartQuantity = (productName: string): number => {
    return cart.find(item => item.name === productName)?.quantity || 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-xl text-gray-500">Laden...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-8">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Foodtruck Kassa</h1>
          <div className="flex gap-2">
            {screen !== 'products' && (
              <button
                onClick={() => setScreen('products')}
                className="px-4 py-2 text-base font-medium rounded-lg bg-gray-200 text-gray-700 active:bg-gray-300"
              >
                ← Terug
              </button>
            )}
            <button
              onClick={() => setScreen('overview')}
              className={`px-4 py-2 text-base font-medium rounded-lg ${
                screen === 'overview'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 active:bg-gray-300'
              }`}
            >
              Dagoverzicht
            </button>
          </div>
        </div>
      </div>

      {/* Bevestiging toast */}
      {confirmationVisible && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-8 py-4 rounded-xl shadow-lg text-xl font-bold animate-pulse">
          ✓ Betaling voltooid!
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 mt-6">
        {/* PRODUCTSCHERM */}
        {screen === 'products' && (
          <div>
            {/* Producten grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {PRODUCTS.map(product => {
                const qty = getCartQuantity(product.name);
                return (
                  <button
                    key={product.name}
                    onClick={() => addToCart(product)}
                    className="relative bg-white rounded-2xl shadow-sm border-2 border-gray-200 p-6 flex flex-col items-center justify-center gap-2 active:border-blue-500 active:bg-blue-50 transition-colors min-h-[120px]"
                  >
                    <span className="text-lg font-semibold text-gray-800">{product.name}</span>
                    <span className="text-2xl font-bold text-blue-600">{formatPrice(product.price)}</span>
                    {qty > 0 && (
                      <span className="absolute top-2 right-2 bg-blue-600 text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center">
                        {qty}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Winkelmandje */}
            {cart.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4">
                <h2 className="text-lg font-semibold text-gray-700 mb-3">Bestelling</h2>
                <div className="space-y-2">
                  {cart.map(item => (
                    <div key={item.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFromCart(item.name); }}
                          className="w-10 h-10 rounded-full bg-red-100 text-red-600 font-bold text-xl flex items-center justify-center active:bg-red-200"
                        >
                          −
                        </button>
                        <span className="text-base text-gray-800">
                          {item.quantity}× {item.name}
                        </span>
                      </div>
                      <span className="text-base font-semibold text-gray-800">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Totaal + Afrekenen */}
            <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-200 p-4 flex items-center justify-between">
              <div>
                <span className="text-gray-600 text-base">Totaal</span>
                <span className="block text-3xl font-bold text-gray-900">{formatPrice(cartTotal)}</span>
              </div>
              <button
                onClick={() => cart.length > 0 && setScreen('payment')}
                disabled={cart.length === 0}
                className="px-8 py-4 bg-blue-600 text-white text-xl font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed active:bg-blue-700"
              >
                Afrekenen
              </button>
            </div>
          </div>
        )}

        {/* BETAALSCHERM */}
        {screen === 'payment' && (
          <div className="flex flex-col items-center gap-8 pt-8">
            <div className="text-center">
              <p className="text-gray-600 text-lg mb-2">Te betalen</p>
              <p className="text-5xl font-bold text-gray-900">{formatPrice(cartTotal)}</p>
            </div>

            <div className="w-full max-w-md space-y-4">
              <button
                onClick={() => completeOrder('cash')}
                className="w-full py-6 bg-green-600 text-white text-2xl font-bold rounded-2xl shadow-md active:bg-green-700 transition-colors"
              >
                💵 Cash
              </button>
              <button
                onClick={() => completeOrder('payconiq')}
                className="w-full py-6 bg-purple-600 text-white text-2xl font-bold rounded-2xl shadow-md active:bg-purple-700 transition-colors"
              >
                📱 Payconiq
              </button>
            </div>

            <button
              onClick={() => setScreen('products')}
              className="mt-4 px-6 py-3 text-lg text-gray-600 underline active:text-gray-800"
            >
              Annuleren
            </button>
          </div>
        )}

        {/* DAGOVERZICHT */}
        {screen === 'overview' && (
          <div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                Dagoverzicht — {new Date().toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-blue-600 font-medium">Totaal omzet</p>
                  <p className="text-3xl font-bold text-blue-700">
                    {formatPrice(dayData.totalCash + dayData.totalPayconiq)}
                  </p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-green-600 font-medium">Cash</p>
                  <p className="text-3xl font-bold text-green-700">{formatPrice(dayData.totalCash)}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-purple-600 font-medium">Payconiq</p>
                  <p className="text-3xl font-bold text-purple-700">{formatPrice(dayData.totalPayconiq)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-gray-600">
                <span className="text-base">Aantal bestellingen: <strong>{dayData.orders.length}</strong></span>
              </div>
            </div>

            {/* Bestellingenlijst */}
            {dayData.orders.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Bestellingen</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {dayData.orders.slice().reverse().map((order, reversedIdx) => {
                    const originalIdx = dayData.orders.length - 1 - reversedIdx;
                    return (
                      <div key={reversedIdx} className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <div>
                          <span className="text-sm text-gray-500">
                            {new Date(order.timestamp).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="ml-2 text-sm text-gray-700">
                            {order.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            order.method === 'cash'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}>
                            {order.method === 'cash' ? 'Cash' : 'Payconiq'}
                          </span>
                          <span className="font-semibold text-gray-800">{formatPrice(order.total)}</span>
                          <button
                            onClick={() => {
                              if (window.confirm('Bestelling verwijderen?')) {
                                deleteOrder(originalIdx);
                              }
                            }}
                            className="ml-1 w-8 h-8 rounded-full bg-red-100 text-red-600 font-bold text-sm flex items-center justify-center active:bg-red-200"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reset knop */}
            <div className="text-center">
              <button
                onClick={() => {
                  if (window.confirm('Weet je zeker dat je alle data van vandaag wilt wissen?')) {
                    resetDay();
                  }
                }}
                className="px-6 py-3 bg-red-100 text-red-700 font-medium rounded-xl active:bg-red-200"
              >
                Dagdata wissen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
