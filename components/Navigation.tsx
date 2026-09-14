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

type NavItem = {
  path: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  { path: '/voorraad-opzoeken', label: 'Voorraad opzoeken', icon: '🔍' },
  { path: '/voorraad-aanpassen', label: 'Voorraad aanpassen', icon: '📦' },
  { path: '/labels-afdrukken', label: 'Labels', icon: '🏷️' },
  { path: '/labels-afdrukken-selectie', label: 'Labels selectie', icon: '☑️' },
  { path: '/labels-debug', label: 'Label test', icon: '🔧' },
  { path: '/webshoporders-beheren', label: 'Webshoporders', icon: '📦' },
  { path: '/cadeaukaarten-aanmaken', label: 'Cadeaubon Printen', icon: '🎁' },
  { path: '/cadeaubon-opzoeken', label: 'Cadeaubon Opzoeken', icon: '🔎' },
  { path: '/afval', label: 'Afval', icon: '♻️' },
  { path: '/problemen', label: 'Problemen', icon: '🎫' },
];

export default function Navigation() {
  const [envInfo, setEnvInfo] = useState<EnvInfo | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

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

  useEffect(() => {
    setMenuOpen(false);
  }, [router.pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
      router.push('/');
    }
  };

  const isActive = (path: string) => {
    const current = (router.pathname || '/').replace(/\/$/, '') || '/';
    return current === path;
  };

  const linkClass = (path: string) =>
    `flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
      isActive(path)
        ? 'bg-blue-100 text-blue-700 shadow-sm'
        : 'text-gray-600 hover:text-blue-600 hover:bg-gray-100'
    }`;

  const logoutButton = (compact: boolean) => (
    <button
      onClick={() => setShowLogoutConfirm(true)}
      className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-all ${
        compact ? '' : 'w-full'
      }`}
      title="Uitloggen"
    >
      <span className="text-base sm:text-lg">🚪</span>
      <span className={compact ? 'hidden md:inline' : ''}>Uit</span>
    </button>
  );

  return (
    <nav className="sticky top-0 z-40 bg-white shadow-lg border-b" suppressHydrationWarning>
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

      <div className="max-w-7xl mx-auto px-2 sm:px-4">
        <div className="flex items-center min-h-14 py-1 gap-2" suppressHydrationWarning>
          <Link href="/voorraad-opzoeken/" className="text-base sm:text-xl font-bold text-gray-800 hover:text-blue-600 transition-colors flex-shrink-0">
            🏪 <span className="hidden sm:inline">Babette</span>
          </Link>

          <div className="hidden sm:flex flex-wrap items-center gap-0.5 flex-1" suppressHydrationWarning>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                href={`${item.path}/`}
                className={linkClass(item.path)}
                title={item.label}
                suppressHydrationWarning
              >
                <span className="text-base sm:text-lg" suppressHydrationWarning>{item.icon}</span>
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            ))}
            {logoutButton(true)}
          </div>

          <div className="sm:hidden ml-auto">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="px-3 py-2 rounded-lg text-gray-800 hover:bg-gray-100 font-medium border border-gray-300"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Menu sluiten' : 'Menu openen'}
            >
              {menuOpen ? 'Sluiten' : 'Menu'}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="sm:hidden border-t py-2 flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                href={`${item.path}/`}
                className={linkClass(item.path)}
                title={item.label}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
            {logoutButton(false)}
          </div>
        )}
      </div>

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
