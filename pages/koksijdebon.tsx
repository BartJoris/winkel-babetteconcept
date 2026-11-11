import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';

type SoftkeyConfig = {
  softkeyConfigured: boolean;
  openUrl: string;
};

export default function KoksijdebonPage() {
  const { isLoading } = useAuth();
  const [config, setConfig] = useState<SoftkeyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const openSoftkey = async () => {
      setError(null);
      try {
        const res = await fetch('/api/otzy-softkey');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Config laden mislukt');
        const next = json as SoftkeyConfig;
        setConfig(next);
        if (next.openUrl) {
          window.open(next.openUrl, '_blank', 'noopener,noreferrer');
          setOpened(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Koksijdebon openen mislukt');
      }
    };

    void openSoftkey();
  }, [isLoading]);

  const reopen = () => {
    if (!config?.openUrl) return;
    window.open(config.openUrl, '_blank', 'noopener,noreferrer');
    setOpened(true);
  };

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
        <div className="max-w-xl mx-auto bg-white shadow-xl rounded-2xl p-6">
          <h1 className="text-2xl font-bold text-gray-900">Koksijdebon</h1>
          <p className="text-gray-600 mt-2">
            Otzy Softkey opent in een nieuw tabblad zodat je Koksijdebons kunt
            controleren en innen.
          </p>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-300 rounded-xl p-4">
              <p className="text-red-800 font-semibold">{error}</p>
            </div>
          )}

          {!error && opened && (
            <p className="mt-4 text-green-700 font-medium">
              Otzy is geopend in een nieuw tabblad.
            </p>
          )}

          {!error && !config?.softkeyConfigured && config && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 text-sm">
              Softkey-URL ontbreekt. Zet <code className="font-mono">OTZY_SOFTKEY_URL</code> in
              de omgeving. Nu wordt merchant.otzy.eu geopend.
            </div>
          )}

          <button
            type="button"
            onClick={reopen}
            disabled={!config?.openUrl}
            className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold disabled:opacity-50"
          >
            Opnieuw openen
          </button>
        </div>
      </div>
    </div>
  );
}
