'use client';

import { Link } from '@/i18n/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, Menu, X, User, LogOut, Search } from 'lucide-react';
import SelectorTema from '../molecules/SelectorTema';
import SelectorIdioma from '../molecules/SelectorIdioma';

export default function Header() {
  const { user, isAuthenticated, logout, loadFromStorage } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations('navegacion');

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-borde bg-superficie"
      role="banner"
    >
      <nav
        className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6"
        aria-label={t('principal')}
      >
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold text-primary-500"
        >
          <MapPin className="h-6 w-6" aria-hidden="true" />
          <span>ServiLocal</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 md:flex">
          <SelectorIdioma />
          <SelectorTema />
          <Link
            href="/services/search"
            className="flex items-center gap-1 text-sm text-secundario transition-colors hover:text-primary-500"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {t('buscarServicios')}
          </Link>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-4">
              <Link
                href={
                  user.role === 'provider'
                    ? '/dashboard/bookings-received'
                    : '/dashboard/bookings'
                }
                className="text-sm text-secundario hover:text-primary-500"
              >
                {user.role === 'provider'
                  ? t('reservasRecibidas')
                  : t('misReservas')}
              </Link>
              <Link
                href="/dashboard/messages"
                className="text-sm text-secundario hover:text-primary-500"
              >
                {t('mensajes')}
              </Link>
              {user.role === 'admin' && (
                <Link
                  href="/admin"
                  className="text-sm text-secundario hover:text-primary-500"
                >
                  {t('administracion')}
                </Link>
              )}
              <Link
                href="/dashboard/profile"
                className="flex items-center gap-1 text-sm text-secundario hover:text-primary-500"
              >
                <User className="h-4 w-4" aria-hidden="true" />
                {user.firstName}
              </Link>
              <button
                onClick={logout}
                className="flex items-center gap-1 text-sm text-secundario hover:text-red-500"
                aria-label={t('cerrarSesion')}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t('salir')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/auth/login" className="btn-secondary text-sm">
                {t('iniciarSesion')}
              </Link>
              <Link href="/auth/register" className="btn-primary text-sm">
                {t('registrarse')}
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu button */}
        <div className="flex items-center gap-1 md:hidden">
          <SelectorTema />
          <button
            className="md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? t('cerrarMenu') : t('abrirMenu')}
          >
            {menuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          id="mobile-menu"
          className="border-t border-borde bg-superficie px-4 py-4 md:hidden"
          role="navigation"
          aria-label={t('menuMovil')}
        >
          <div className="flex flex-col gap-3">
            <Link
              href="/services/search"
              className="text-sm text-secundario"
              onClick={() => setMenuOpen(false)}
            >
              {t('buscarServicios')}
            </Link>
            {isAuthenticated && user ? (
              <>
                <Link
                  href={
                    user.role === 'provider'
                      ? '/dashboard/bookings-received'
                      : '/dashboard/bookings'
                  }
                  className="text-sm text-secundario"
                  onClick={() => setMenuOpen(false)}
                >
                  {user.role === 'provider'
                    ? t('reservasRecibidas')
                    : t('misReservas')}
                </Link>
                <Link
                  href="/dashboard/messages"
                  className="text-sm text-secundario"
                  onClick={() => setMenuOpen(false)}
                >
                  {t('mensajes')}
                </Link>
                <Link
                  href="/dashboard/profile"
                  className="text-sm text-secundario"
                  onClick={() => setMenuOpen(false)}
                >
                  {t('miPerfil')}
                </Link>
                <button
                  onClick={() => {
                    logout();
                    setMenuOpen(false);
                  }}
                  className="text-left text-sm text-red-500"
                >
                  {t('cerrarSesion')}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-sm text-primary-500"
                  onClick={() => setMenuOpen(false)}
                >
                  {t('iniciarSesion')}
                </Link>
                <Link
                  href="/auth/register"
                  className="text-sm text-primary-500"
                  onClick={() => setMenuOpen(false)}
                >
                  {t('registrarse')}
                </Link>
              </>
            )}
            <div className="border-t border-borde pt-3">
              <SelectorIdioma />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
