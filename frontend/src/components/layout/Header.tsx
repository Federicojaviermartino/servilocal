'use client';

import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { useEffect, useState } from 'react';
import { MapPin, Menu, X, User, LogOut, Search } from 'lucide-react';

export default function Header() {
  const { user, isAuthenticated, logout, loadFromStorage } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white" role="banner">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6" aria-label="Navegación principal">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-xl font-bold text-primary-500">
          <MapPin className="h-6 w-6" aria-hidden="true" />
          <span>ServiLocal</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 md:flex">
          <Link href="/search" className="flex items-center gap-1 text-sm text-gray-600 transition-colors hover:text-primary-500">
            <Search className="h-4 w-4" aria-hidden="true" />
            Buscar servicios
          </Link>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-4">
              <Link href="/bookings" className="text-sm text-gray-600 hover:text-primary-500">
                Mis reservas
              </Link>
              <Link href="/messages" className="text-sm text-gray-600 hover:text-primary-500">
                Mensajes
              </Link>
              {user.role === 'admin' && (
                <Link href="/admin" className="text-sm text-gray-600 hover:text-primary-500">
                  Admin
                </Link>
              )}
              <Link href="/profile" className="flex items-center gap-1 text-sm text-gray-600 hover:text-primary-500">
                <User className="h-4 w-4" aria-hidden="true" />
                {user.firstName}
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-500"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Salir
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/auth/login" className="btn-secondary text-sm">
                Iniciar sesión
              </Link>
              <Link href="/auth/register" className="btn-primary text-sm">
                Registrarse
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div id="mobile-menu" className="border-t border-gray-200 bg-white px-4 py-4 md:hidden" role="navigation" aria-label="Menú móvil">
          <div className="flex flex-col gap-3">
            <Link href="/search" className="text-sm text-gray-600" onClick={() => setMenuOpen(false)}>
              Buscar servicios
            </Link>
            {isAuthenticated && user ? (
              <>
                <Link href="/bookings" className="text-sm text-gray-600" onClick={() => setMenuOpen(false)}>
                  Mis reservas
                </Link>
                <Link href="/messages" className="text-sm text-gray-600" onClick={() => setMenuOpen(false)}>
                  Mensajes
                </Link>
                <Link href="/profile" className="text-sm text-gray-600" onClick={() => setMenuOpen(false)}>
                  Mi perfil
                </Link>
                <button onClick={() => { logout(); setMenuOpen(false); }} className="text-left text-sm text-red-500">
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="text-sm text-primary-500" onClick={() => setMenuOpen(false)}>
                  Iniciar sesión
                </Link>
                <Link href="/auth/register" className="text-sm text-primary-500" onClick={() => setMenuOpen(false)}>
                  Registrarse
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
