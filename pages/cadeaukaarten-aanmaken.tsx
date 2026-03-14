import { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

export default function CadeaukaartenAanmakenPage() {
  const { isLoading } = useAuth();
  const [count, setCount] = useState('10');
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [zpl, setZpl] = useState('');
  const [printed, setPrinted] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(count);
    if (!num || num < 1 || num > 100) {
      alert('Voer een aantal in tussen 1 en 100');
      return;
    }

    setGenerating(true);
    setCodes([]);
    setZpl('');
    setPrinted(false);

    try {
      const res = await fetch('/api/generate-card-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: num }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Fout bij genereren');
      setCodes(json.codes);
      setZpl(json.zpl);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fout bij genereren');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = async () => {
    if (!zpl) return;
    setPrinting(true);
    try {
      const res = await fetch('/api/print-zpl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zpl }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Print mislukt');
      }
      setPrinted(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fout bij printen');
    } finally {
      setPrinting(false);
    }
  };

  const handleCopyCodes = () => {
    navigator.clipboard.writeText(codes.join('\n')).then(() => {
      alert('Codes gekopieerd naar klembord');
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-100 p-8">
        <p className="text-xl text-gray-600">Laden...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-100 font-sans">
      <div className="p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Cadeaukaarten Aanmaken
            </h1>
            <p className="text-gray-600 mt-2">
              Genereer blanco cadeaukaarten met EAN-13 barcodes en print ze naar de Zebra
            </p>
          </div>

          <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
            <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Aantal kaarten
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-lg"
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={generating}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold disabled:opacity-50 shadow-md hover:shadow-lg transition-all whitespace-nowrap"
              >
                {generating ? 'Genereren...' : 'Genereer codes'}
              </button>
            </form>
          </div>

          {codes.length > 0 && (
            <>
              <div className="bg-white shadow-xl rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-800">
                    {codes.length} codes gegenereerd
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyCodes}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-all"
                    >
                      Kopieer codes
                    </button>
                    <button
                      onClick={handlePrint}
                      disabled={printing || printed}
                      className={`px-6 py-2 rounded-lg text-sm font-bold shadow transition-all ${
                        printed
                          ? 'bg-green-100 text-green-800'
                          : 'bg-black hover:bg-gray-800 text-white disabled:opacity-50'
                      }`}
                    >
                      {printing ? 'Printen...' : printed ? 'Geprint naar Zebra' : `Print ${codes.length} labels naar Zebra`}
                    </button>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 max-h-80 overflow-y-auto">
                  <table className="w-full text-sm font-mono">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-1 pr-4">#</th>
                        <th className="py-1">EAN-13 Code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map((code, i) => (
                        <tr key={code} className="border-b border-gray-200">
                          <td className="py-1.5 pr-4 text-gray-400">{i + 1}</td>
                          <td className="py-1.5 tracking-wider">{code}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                <p className="text-sm text-orange-800">
                  <strong>Hoe te gebruiken:</strong> Plak de geprinte barcode-labels op fysieke cadeaukaarten.
                  Bij verkoop in de POS: voeg &quot;Gift Card&quot; toe, scan de barcode, stel het bedrag in, en reken af.
                  De kaart wordt automatisch geactiveerd met het juiste saldo.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
