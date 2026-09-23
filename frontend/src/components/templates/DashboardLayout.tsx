/**
 * Nivel atomico: Plantilla
 * Componente: DashboardLayout (layout del panel de usuario)
 */
'use client';
import { ReactNode, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  Calendar,
  Star,
  User,
  MessageSquare,
  Briefcase,
  LayoutDashboard,
} from 'lucide-react';
import clsx from 'clsx';
import { haySesionRecordada, useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@/types';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const t = useTranslations('panel');
  const tReservas = useTranslations('reservasPanel');
  const tNavegacion = useTranslations('navegacion');
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isAuthenticated && !haySesionRecordada()) {
      router.push('/auth/login?redirect=/dashboard');
    }
  }, [isAuthenticated, router]);

  const isProvider = user?.role === UserRole.PROVIDER;

  const clientItems = [
    { href: '/dashboard', label: t('resumen'), icon: LayoutDashboard },
    {
      href: '/dashboard/bookings',
      label: tReservas('misReservas'),
      icon: Calendar,
    },
    { href: '/dashboard/reviews', label: t('valoraciones'), icon: Star },
    {
      href: '/dashboard/messages',
      label: tNavegacion('mensajes'),
      icon: MessageSquare,
    },
    { href: '/dashboard/profile', label: t('perfil'), icon: User },
  ];

  const providerItems = [
    { href: '/dashboard', label: t('resumen'), icon: LayoutDashboard },
    { href: '/dashboard/services', label: t('misServicios'), icon: Briefcase },
    {
      href: '/dashboard/bookings-received',
      label: tReservas('reservasRecibidas'),
      icon: Calendar,
    },
    {
      href: '/dashboard/messages',
      label: tNavegacion('mensajes'),
      icon: MessageSquare,
    },
    { href: '/dashboard/profile', label: t('perfil'), icon: User },
  ];

  if (!user) return null;

  const items = isProvider ? providerItems : clientItems;

  return (
    <div className="bg-fondo min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1">
            <nav className="bg-superficie rounded-lg shadow-card p-2 sticky top-4">
              {items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' &&
                    pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    // La sección activa se distinguía solo por color. Quien
                    // navega escuchando la página oía cinco enlaces iguales
                    // y ninguna pista de dónde estaba.
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-secundario hover:bg-fondo',
                    )}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
          <section className="lg:col-span-3">{children}</section>
        </div>
      </div>
    </div>
  );
}
