'use client';

import { Link, usePathname } from '@/i18n/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MapPin, Menu, X, User, LogOut, Search } from 'lucide-react';
import SelectorTema from '../molecules/SelectorTema';
import SelectorIdioma from '../molecules/SelectorIdioma';
import CampanaAvisos from '../organisms/CampanaAvisos';

export default function Header() {
  const { user, isAuthenticated, logout, loadFromStorage } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const t = useTranslations('navegacion');
  const ruta = usePathname();

  // Escape cierra el menú del móvil y devuelve el foco al botón que lo
  // abrió. Solo se cerraba volviendo hasta ese botón.
  useEffect(() => {
    if (!menuOpen) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      setMenuOpen(false);
      botonMenu.current?.focus();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [menuOpen]);

  // La sección actual se distinguía solo por el color al pasar por encima.
  // Quien navega escuchando la página oía una lista de enlaces idénticos sin
  // saber en cuál estaba, y el panel lateral ya lo marcaba: quedaba fuera
  // justo la navegación principal.
  const actual = (destino: string) =>
    ruta === destino || (destino !== '/' && ruta.startsWith(destino))
      ? ('page' as const)
      : undefined;

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
          className="flex items-center gap-2 text-xl font-bold text-primary-500 dark:text-primary-400"
        >
          <MapPin className="h-6 w-6" aria-hidden="true" />
          <span>ServiLocal</span>
        </Link>

        <div className="flex items-center gap-1 md:gap-6">
          {/* Una sola campana para las dos disposiciones. Había una en cada
              una, las dos montadas a la vez y una oculta: pedían los avisos
              por duplicado y los anunciaban dos veces. */}
          {isAuthenticated && user && <CampanaAvisos />}

          {/* Desktop nav */}
          <div className="hidden items-center gap-6 md:flex">
            <SelectorIdioma />
            <SelectorTema />
            <Link
              href="/services/search"
              aria-current={actual('/services/search')}
              className="flex items-center gap-1 text-sm text-secundario transition-colors hover:text-acento"
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
                  aria-current={actual(
                    user.role === 'provider'
                      ? '/dashboard/bookings-received'
                      : '/dashboard/bookings',
                  )}
                  className="text-sm text-secundario hover:text-acento"
                >
                  {user.role === 'provider'
                    ? t('reservasRecibidas')
                    : t('misReservas')}
                </Link>
                <Link
                  href="/dashboard/messages"
                  aria-current={actual('/dashboard/messages')}
                  className="text-sm text-secundario hover:text-acento"
                >
                  {t('mensajes')}
                </Link>
                {user.role === 'admin' && (
                  <Link
                    href="/admin"
                    aria-current={actual('/admin')}
                    className="text-sm text-secundario hover:text-acento"
                  >
                    {t('administracion')}
                  </Link>
                )}
                <Link
                  href="/dashboard/profile"
                  className="flex items-center gap-1 text-sm text-secundario hover:text-acento"
                >
                  <User className="h-4 w-4" aria-hidden="true" />
                  {user.firstName}
                </Link>
                {/* Sin aria-label: con «Cerrar sesión» sobre un botón que
                  dice «Salir», quien lo maneja por voz no lo encontraba
                  diciendo lo que ve (WCAG 2.5.3). */}
                <button
                  type="button"
                  onClick={logout}
                  className="flex items-center gap-1 text-sm text-secundario hover:text-error"
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
            {/* Con su hueco alrededor: el icono solo mide 24 px, y era todo
              lo que se podía tocar. */}
            <button
              ref={botonMenu}
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-secundario hover:bg-fondo md:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? t('cerrarMenu') : t('abrirMenu')}
            >
              {menuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
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
              aria-current={actual('/services/search')}
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
                  aria-current={actual(
                    user.role === 'provider'
                      ? '/dashboard/bookings-received'
                      : '/dashboard/bookings',
                  )}
                  className="text-sm text-secundario"
                  onClick={() => setMenuOpen(false)}
                >
                  {user.role === 'provider'
                    ? t('reservasRecibidas')
                    : t('misReservas')}
                </Link>
                <Link
                  href="/dashboard/messages"
                  aria-current={actual('/dashboard/messages')}
                  className="text-sm text-secundario"
                  onClick={() => setMenuOpen(false)}
                >
                  {t('mensajes')}
                </Link>
                {/* Faltaba: desde el móvil, a la administración solo se
                    llegaba escribiendo la dirección. */}
                {user.role === 'admin' && (
                  <Link
                    href="/admin"
                    aria-current={actual('/admin')}
                    className="text-sm text-secundario"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t('administracion')}
                  </Link>
                )}
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
                  className="text-start text-sm text-error"
                >
                  {t('cerrarSesion')}
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-sm text-acento"
                  onClick={() => setMenuOpen(false)}
                >
                  {t('iniciarSesion')}
                </Link>
                <Link
                  href="/auth/register"
                  className="text-sm text-acento"
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
