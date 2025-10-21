import React, { useState, useEffect } from 'react';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [envInfo, setEnvInfo] = useState<EnvInfo | null>(null);
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

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

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

  return (
    <nav className="bg-white shadow-lg border-b">
      {/* Environment indicator banner */}
      {envInfo && (
        <div className={`${
          envInfo.isProduction 
            ? 'bg-red-600 text-white' 
            : 'bg-blue-600 text-white'
        } px-4 py-1`}>
          <div className="max-w-6xl mx-auto flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {envInfo.isProduction && (
                <span className="font-bold animate-pulse">⚠️ PRODUCTIE</span>
              )}
              <span className="font-medium">
                {envInfo.isProduction ? '🔴' : '🟢'} Database: <strong>{envInfo.odooDb}</strong>
              </span>
              <span className="opacity-75">|</span>
              <span className="opacity-90">{envInfo.environmentName}</span>
            </div>
            <span className="opacity-75 text-xs">{envInfo.nodeEnv}</span>
          </div>
        </div>
      )}
      
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex items-center gap-3">
            <Link href="/voorraad-opzoeken" className="text-xl font-bold text-gray-800 hover:text-blue-600 transition-colors">
              🏪 Babette Winkel
            </Link>
            {envInfo?.isProduction && (
              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded font-semibold border border-red-300">
                PROD
              </span>
            )}
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-2">
            <Link 
              href="/voorraad-opzoeken" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/voorraad-opzoeken') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Voorraad opzoeken
            </Link>

            <Link 
              href="/webshoporders-beheren" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/webshoporders-beheren') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Webshoporders
            </Link>

            <Link 
              href="/cadeaubon-aanmaken" 
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive('/cadeaubon-aanmaken') 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              Cadeaubon aanmaken
            </Link>

            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
            >
              Uitloggen
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:text-blue-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            >
              <span className="sr-only">Open main menu</span>
              {/* Hamburger icon */}
              <svg
                className={`${isMenuOpen ? 'hidden' : 'block'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              {/* Close icon */}
              <svg
                className={`${isMenuOpen ? 'block' : 'hidden'} h-6 w-6`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`${isMenuOpen ? 'block' : 'hidden'} md:hidden`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t">
          {/* Environment info in mobile menu */}
          {envInfo && (
            <div className={`mx-3 mb-3 px-3 py-2 rounded-lg ${
              envInfo.isProduction 
                ? 'bg-red-50 border-2 border-red-300' 
                : 'bg-blue-50 border border-blue-200'
            }`}>
              <div className="flex items-center gap-2 text-xs">
                {envInfo.isProduction && (
                  <span className="font-bold text-red-700 animate-pulse">⚠️ PRODUCTIE</span>
                )}
                <span className={`font-medium ${envInfo.isProduction ? 'text-red-800' : 'text-blue-800'}`}>
                  {envInfo.isProduction ? '🔴' : '🟢'} {envInfo.odooDb}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {envInfo.environmentName}
              </div>
            </div>
          )}
          
          <Link
            href="/voorraad-opzoeken"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/voorraad-opzoeken')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            Voorraad opzoeken
          </Link>

          <Link
            href="/webshoporders-beheren"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/webshoporders-beheren')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            Webshoporders
          </Link>

          <Link
            href="/cadeaubon-aanmaken"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
              isActive('/cadeaubon-aanmaken')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
            }`}
          >
            Cadeaubon aanmaken
          </Link>

          <div className="pt-2">
            <button
              onClick={() => {
                closeMenu();
                handleLogout();
              }}
              className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
            >
              Uitloggen
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

