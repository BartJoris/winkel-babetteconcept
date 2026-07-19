import { useState, useEffect } from 'react';

interface CartItem {
  name: string;
  price: number;
  quantity: number;
}

interface Order {
  items: CartItem[];
  total: number;
  method: 'cash' | 'payconiq';
  timestamp: string;
}

interface DayData {
  date: string;
  orders: Order[];
  totalCash: number;
  totalPayconiq: number;
}

interface DaySummary {
  date: string;
  totalRevenue: number;
  totalCash: number;
  totalPayconiq: number;
  orderCount: number;
}

function formatPrice(amount: number): string {
  return `€${amount.toFixed(2).replace('.', ',')}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getProductSummary(orders: Order[]): { name: string; quantity: number; revenue: number }[] {
  const map = new Map<string, { quantity: number; revenue: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const existing = map.get(item.name) || { quantity: 0, revenue: 0 };
      existing.quantity += item.quantity;
      existing.revenue += item.price * item.quantity;
      map.set(item.name, existing);
    }
  }
  return Array.from(map.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.revenue - a.revenue);
}

export default function FoodtruckOmzetPage() {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDay, setLoadingDay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDays();
  }, []);

  const fetchDays = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/foodtruck/days');
      if (res.ok) {
        const data = await res.json();
        setDays(data.days);
      } else {
        setError('Kon data niet ophalen');
      }
    } catch {
      setError('Verbindingsfout');
    } finally {
      setLoading(false);
    }
  };

  const fetchDay = async (date: string) => {
    setLoadingDay(true);
    try {
      const res = await fetch(`/api/foodtruck/data?date=${date}`);
      if (res.ok) {
        const data: DayData = await res.json();
        setSelectedDay(data);
      }
    } catch {
      setError('Kon dag niet ophalen');
    } finally {
      setLoadingDay(false);
    }
  };

  const productSummary = selectedDay ? getProductSummary(selectedDay.orders) : [];
  const allTimeRevenue = days.reduce((s, d) => s + d.totalRevenue, 0);
  const allTimeCash = days.reduce((s, d) => s + d.totalCash, 0);
  const allTimePayconiq = days.reduce((s, d) => s + d.totalPayconiq, 0);

  return (
    <div className="min-h-screen bg-gray-100 pb-8">
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {selectedDay ? 'Dagdetail' : 'Foodtruck Omzet'}
          </h1>
          <div className="flex gap-2">
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="px-4 py-2 text-base font-medium rounded-lg bg-gray-200 text-gray-700 active:bg-gray-300"
              >
                ← Overzicht
              </button>
            )}
            <a
              href="/foodtruck"
              className="px-4 py-2 text-base font-medium rounded-lg bg-gray-200 text-gray-700 active:bg-gray-300"
            >
              Kassa
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-6">
        {loading && (
          <p className="text-center text-gray-500 text-lg py-8">Laden...</p>
        )}

        {error && (
          <p className="text-center text-red-600 text-lg py-4">{error}</p>
        )}

        {/* DAGENOVERZICHT */}
        {!selectedDay && !loading && (
          <div>
            {days.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <p className="text-gray-500 text-lg">Nog geen verkoopdata gevonden.</p>
              </div>
            ) : (
              <>
                {/* Totaal over alle dagen */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-50 rounded-xl p-5 text-center">
                    <p className="text-sm text-blue-600 font-medium">Totaal alle dagen</p>
                    <p className="text-3xl font-bold text-blue-700">{formatPrice(allTimeRevenue)}</p>
                    <p className="text-sm text-blue-500 mt-1">{days.length} verkoopdag{days.length !== 1 ? 'en' : ''}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-5 text-center">
                    <p className="text-sm text-green-600 font-medium">Totaal Cash</p>
                    <p className="text-3xl font-bold text-green-700">{formatPrice(allTimeCash)}</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-5 text-center">
                    <p className="text-sm text-purple-600 font-medium">Totaal Payconiq</p>
                    <p className="text-3xl font-bold text-purple-700">{formatPrice(allTimePayconiq)}</p>
                  </div>
                </div>

                {/* Lijst van dagen */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">Verkoopgeschiedenis</h3>
                  <div className="space-y-3">
                    {days.map(day => (
                      <button
                        key={day.date}
                        onClick={() => fetchDay(day.date)}
                        className="w-full text-left border border-gray-100 rounded-xl p-4 active:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-base font-semibold text-gray-800">{formatDateShort(day.date)}</p>
                            <p className="text-sm text-gray-500">{day.orderCount} bestelling{day.orderCount !== 1 ? 'en' : ''}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-gray-900">{formatPrice(day.totalRevenue)}</p>
                            <div className="flex gap-2 justify-end mt-1">
                              <span className="text-xs text-green-600">Cash: {formatPrice(day.totalCash)}</span>
                              <span className="text-xs text-purple-600">Payconiq: {formatPrice(day.totalPayconiq)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* DAGDETAIL */}
        {selectedDay && !loadingDay && (
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {formatDateLabel(selectedDay.date)}
            </h2>

            {/* Totalen */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-xl p-5 text-center">
                <p className="text-sm text-blue-600 font-medium">Totaal omzet</p>
                <p className="text-3xl font-bold text-blue-700">
                  {formatPrice(selectedDay.totalCash + selectedDay.totalPayconiq)}
                </p>
                <p className="text-sm text-blue-500 mt-1">{selectedDay.orders.length} bestellingen</p>
              </div>
              <div className="bg-green-50 rounded-xl p-5 text-center">
                <p className="text-sm text-green-600 font-medium">Cash</p>
                <p className="text-3xl font-bold text-green-700">{formatPrice(selectedDay.totalCash)}</p>
                <p className="text-sm text-green-500 mt-1">
                  {selectedDay.orders.filter(o => o.method === 'cash').length} bestellingen
                </p>
              </div>
              <div className="bg-purple-50 rounded-xl p-5 text-center">
                <p className="text-sm text-purple-600 font-medium">Payconiq</p>
                <p className="text-3xl font-bold text-purple-700">{formatPrice(selectedDay.totalPayconiq)}</p>
                <p className="text-sm text-purple-500 mt-1">
                  {selectedDay.orders.filter(o => o.method === 'payconiq').length} bestellingen
                </p>
              </div>
            </div>

            {/* Product overzicht */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-3">Verkocht per product</h3>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Aantal</th>
                    <th className="pb-2 text-right">Omzet</th>
                  </tr>
                </thead>
                <tbody>
                  {productSummary.map(p => (
                    <tr key={p.name} className="border-b border-gray-50">
                      <td className="py-2 text-base text-gray-800">{p.name}</td>
                      <td className="py-2 text-base text-gray-800 text-right">{p.quantity}</td>
                      <td className="py-2 text-base font-semibold text-gray-800 text-right">{formatPrice(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td className="pt-3 text-base font-bold text-gray-900">Totaal</td>
                    <td className="pt-3 text-base font-bold text-gray-900 text-right">
                      {productSummary.reduce((s, p) => s + p.quantity, 0)}
                    </td>
                    <td className="pt-3 text-base font-bold text-gray-900 text-right">
                      {formatPrice(productSummary.reduce((s, p) => s + p.revenue, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Alle bestellingen */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-3">
                Alle bestellingen ({selectedDay.orders.length})
              </h3>
              <div className="space-y-4">
                {selectedDay.orders.slice().reverse().map((order, idx) => (
                  <div key={idx} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-500">
                        #{selectedDay.orders.length - idx} — {new Date(order.timestamp).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          order.method === 'cash'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {order.method === 'cash' ? '💵 Cash' : '📱 Payconiq'}
                        </span>
                        <span className="text-lg font-bold text-gray-900">{formatPrice(order.total)}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm text-gray-700">
                          <span>{item.quantity}× {item.name}</span>
                          <span className="text-gray-500">{formatPrice(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {loadingDay && (
          <p className="text-center text-gray-500 text-lg py-8">Laden...</p>
        )}
      </div>
    </div>
  );
}
