import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

interface CardInfo {
  id: number;
  code: string;
  balance: number;
  original_value: number;
  expiration_date: string | null;
  partner: { id: number; name: string } | null;
  program: { id: number; name: string } | null;
  created: string;
  source_order: { id: number; name: string } | null;
}

interface HistoryLine {
  id: number;
  date: string;
  description: string;
  used: number;
  order_id: [number, string] | false;
}

export default function CadeaubonOpzoekenPage() {
  const { isLoading } = useAuth();
  const [code, setCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [history, setHistory] = useState<HistoryLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  const handleSearch = async (searchCode?: string) => {
    const q = (searchCode || code).trim();
    if (!q) return;

    setSearching(true);
    setCard(null);
    setHistory([]);
    setError(null);

    try {
      const res = await fetch('/api/lookup-gift-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: q }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Niet gevonden');
      setCard(json.card);
      setHistory(json.history || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij opzoeken');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('nl-BE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  };

  const formatDateTime = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('nl-BE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatEuro = (amount: number) =>
    new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(amount);

  const isExpired = card?.expiration_date
    ? new Date(card.expiration_date) < new Date()
    : false;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <p className="text-xl text-gray-600">Laden...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-sans">
      <div className="p-4 sm:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Cadeaubon Opzoeken
            </h1>
            <p className="text-gray-600 mt-2">
              Scan de barcode of typ de code in
            </p>
          </div>

          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scan of typ code..."
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-mono"
                autoFocus
              />
              <button
                type="submit"
                disabled={searching || !code.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 shadow-md transition-all whitespace-nowrap"
              >
                {searching ? 'Zoeken...' : 'Zoek'}
              </button>
            </form>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-300 rounded-2xl p-4 mb-6">
              <p className="text-red-800 font-semibold">{error}</p>
            </div>
          )}

          {card && (
            <>
              <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Code</p>
                    <p className="text-2xl font-mono font-bold tracking-wider">{card.code}</p>
                  </div>
                  <div className="text-right">
                    {isExpired ? (
                      <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-bold">Verlopen</span>
                    ) : card.balance > 0 ? (
                      <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-bold">Actief</span>
                    ) : (
                      <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-bold">Gebruikt</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-green-700 mb-1">Huidig saldo</p>
                    <p className="text-3xl font-bold text-green-800">{formatEuro(card.balance)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-blue-700 mb-1">Oorspronkelijke waarde</p>
                    <p className="text-3xl font-bold text-blue-800">{formatEuro(card.original_value)}</p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Klant:</span>
                    <span className="ml-2 font-medium">{card.partner?.name || 'Anoniem'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Programma:</span>
                    <span className="ml-2 font-medium">{card.program?.name || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Aangemaakt:</span>
                    <span className="ml-2 font-medium">{formatDateTime(card.created)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Geldig tot:</span>
                    <span className={`ml-2 font-medium ${isExpired ? 'text-red-600' : ''}`}>
                      {formatDate(card.expiration_date)}
                    </span>
                  </div>
                  {card.source_order && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Verkooporder:</span>
                      <span className="ml-2 font-medium">{card.source_order.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {history.length > 0 && (
                <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
                  <h2 className="text-lg font-bold text-gray-800 mb-4">Geschiedenis</h2>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-3">Datum</th>
                        <th className="py-2 pr-3">Omschrijving</th>
                        <th className="py-2 pr-3">Order</th>
                        <th className="py-2 text-right">Bedrag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(h => (
                        <tr key={h.id} className="border-b">
                          <td className="py-2 pr-3">{formatDate(h.date)}</td>
                          <td className="py-2 pr-3">{h.description || '-'}</td>
                          <td className="py-2 pr-3 text-gray-500">
                            {h.order_id ? h.order_id[1] : '-'}
                          </td>
                          <td className={`py-2 text-right font-medium ${h.used > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {h.used > 0 ? '-' : '+'}{formatEuro(Math.abs(h.used))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                onClick={() => {
                  setCard(null);
                  setHistory([]);
                  setError(null);
                  setCode('');
                  setTimeout(() => inputRef.current?.focus(), 100);
                }}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all"
              >
                Nieuwe zoekopdracht
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
