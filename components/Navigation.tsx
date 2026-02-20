import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

type EnvInfo = {
  odooUrl: string;
  odooDb: string;
  nodeEnv: string;
  isProduction: boolean;
  environmentName: string;
};

export default function Navigation() {
  const [envInfo, setEnvInfo] = useState<EnvInfo | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const router = useRouter();

  // Fetch environment info
  useEffect(() => {
    const fetchEnvInfo = async () => {
      try {
        const res = await fetch('/api/env-info');
        if (res.ok) {
          const data = await res.json();
          setEnvInfo(data);
        }
      } catch (error) {
        console.error('Failed to fetch environment info:', error);
      }
    };

    fetchEnvInfo();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
      router.push('/');
    }
  };

  const isActive = (path: string) => router.pathname === path;

  const navItems = [
    { path: '/voorraad-opzoeken', label: 'Voorraad opzoeken', icon: '🔍' },
    { path: '/labels-afdrukken', label: 'Labels', icon: '🏷️' },
    { path: '/webshoporders-beheren', label: 'Webshoporders', icon: '📦' },
    { path: '/cadeaubon-aanmaken', label: 'Cadeaubon', icon: '🎁' },
  ];

  return (
    <nav className="bg-white shadow-lg border-b">
      {/* Environment indicator banner - only show if NOT production */}
      {envInfo && !envInfo.isProduction && (
        <div className="bg-blue-600 text-white px-4 py-2">
          <div className="max-w-6xl mx-auto flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="font-bold">🟢 {envInfo.environmentName}</span>
              <span className="opacity-75">Database: {envInfo.odooDb}</span>
            </div>
            <span className="opacity-75 text-xs">{envInfo.nodeEnv}</span>
          </div>
        </div>
      )}
      
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <Link href="/voorraad-opzoeken" className="text-xl font-bold text-gray-800 hover:text-blue-600 transition-colors flex-shrink-0">
            🏪 Babette Winkel
          </Link>

          {/* Navigation with Pictograms - Desktop & Mobile */}
          <div className="flex items-center gap-1 md:gap-3 flex-1 mx-4 justify-center md:justify-end">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`flex flex-col md:flex-row items-center gap-1 md:gap-2 px-3 py-2 rounded-lg text-sm md:text-base font-medium transition-all ${
                  isActive(item.path)
                    ? 'bg-blue-100 text-blue-700 shadow-md'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
                }`}
                title={item.label}
              >
                <span className="text-lg md:text-2xl">{item.icon}</span>
                <span className="hidden md:inline text-xs md:text-sm">{item.label}</span>
              </Link>
            ))}

            {/* Logout button */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="flex flex-col md:flex-row items-center gap-1 md:gap-2 px-3 py-2 rounded-lg text-sm md:text-base font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-all"
              title="Uitloggen"
            >
              <span className="text-lg md:text-2xl">🚪</span>
              <span className="hidden md:inline text-xs md:text-sm">Uitloggen</span>
            </button>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Uitloggen?</h2>
            <p className="text-gray-600 mb-6">Weet je zeker dat je wilt uitloggen?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Uitloggen
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

