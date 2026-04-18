/**
 * Nivel atomico: Plantilla
 * Componente: DashboardLayout (layout del panel de usuario)
 */
'use client';
import { ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Calendar, Star, User, MessageSquare, Briefcase, LayoutDashboard } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '@/lib/auth-store';
import { UserRole } from '@/types';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, loadFromStorage } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !isAuthenticated) {
      const stored = localStorage.getItem('accessToken');
      if (!stored) router.push('/auth/login?redirect=/dashboard');
    }
  }, [isAuthenticated, router]);

  if (!user) return null;

  const isProvider = user.role === UserRole.PROVIDER;

  const clientItems = [
    { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
    { href: '/dashboard/bookings', label: 'Mis reservas', icon: Calendar },
    { href: '/dashboard/reviews', label: 'Valoraciones', icon: Star },
    { href: '/dashboard/messages', label: 'Mensajes', icon: MessageSquare },
    { href: '/dashboard/profile', label: 'Perfil', icon: User },
  ];

  const providerItems = [
    { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
    { href: '/dashboard/services', label: 'Mis servicios', icon: Briefcase },
    { href: '/dashboard/bookings-received', label: 'Reservas recibidas', icon: Calendar },
    { href: '/dashboard/messages', label: 'Mensajes', icon: MessageSquare },
    { href: '/dashboard/profile', label: 'Perfil', icon: User },
  ];

  const items = isProvider ? providerItems : clientItems;

  return (
    <div className="bg-neutral-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1">
            <nav className="bg-white rounded-lg shadow-card p-2 sticky top-4">
              {items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-neutral-700 hover:bg-neutral-50',
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
