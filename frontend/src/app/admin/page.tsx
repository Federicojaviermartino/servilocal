/**
 * Panel de administración. Da cumplimiento al requisito del enunciado
 * "administrar la aplicación desde la propia aplicación". Solo accesible
 * para usuarios con rol admin; el resto se redirige a /dashboard.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Users, Tag, Flag } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { usersApi, categoriesApi, reviewsApi } from '@/lib/api';
import { User, Category, Review, UserRole } from '@/types';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';
import Badge from '@/components/atoms/Badge';
import Spinner from '@/components/atoms/Spinner';

type Tab = 'users' | 'categories' | 'reviews';

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: 'users', label: 'Usuarios', icon: Users },
  { key: 'categories', label: 'Categorías', icon: Tag },
  { key: 'reviews', label: 'Valoraciones reportadas', icon: Flag },
];

export default function AdminPage() {
  const { user, loadFromStorage } = useAuthStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('users');

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (user && user.role !== UserRole.ADMIN) {
      router.replace('/dashboard');
    }
    if (!user) {
      const stored = localStorage.getItem('accessToken');
      if (!stored) router.replace('/auth/login?redirect=/admin');
    }
  }, [user, router]);

  if (!user || user.role !== UserRole.ADMIN) return null;

  return (
    <div className="bg-neutral-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">
            Panel de administración
          </h1>
          <p className="text-neutral-600 mt-1">
            Gestión de usuarios, categorías y moderación de valoraciones.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-card">
          <div
            role="tablist"
            aria-label="Secciones de administración"
            className="flex border-b border-neutral-200 overflow-x-auto"
          >
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
                id={`tab-${key}`}
                onClick={() => setTab(key)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                  tab === key
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-600 hover:text-neutral-900',
                )}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === 'users' && (
              <div role="tabpanel" id="panel-users" aria-labelledby="tab-users">
                <UsersSection />
              </div>
            )}
            {tab === 'categories' && (
              <div
                role="tabpanel"
                id="panel-categories"
                aria-labelledby="tab-categories"
              >
                <CategoriesSection />
              </div>
            )}
            {tab === 'reviews' && (
              <div
                role="tabpanel"
                id="panel-reviews"
                aria-labelledby="tab-reviews"
              >
                <ReportedReviewsSection />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Sección: Usuarios                                                */
/* ---------------------------------------------------------------- */

function UsersSection() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | UserRole>('all');

  const load = () => {
    setIsLoading(true);
    usersApi
      .getAll()
      .then((res) => setUsers(res.data || []))
      .catch(() => toast.error('No se pudo cargar la lista de usuarios.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (u: User) => {
    const next = !u.isActive;
    const verb = next ? 'activar' : 'desactivar';
    if (!window.confirm(`¿Confirmas ${verb} la cuenta de ${u.firstName} ${u.lastName}?`)) {
      return;
    }
    try {
      await usersApi.toggleActive(u.id);
      toast.success(`Cuenta ${next ? 'activada' : 'desactivada'}.`);
      load();
    } catch {
      toast.error('No se pudo actualizar el estado de la cuenta.');
    }
  };

  const visible =
    filter === 'all' ? users : users.filter((u) => u.role === filter);

  const counts = {
    all: users.length,
    client: users.filter((u) => u.role === UserRole.CLIENT).length,
    provider: users.filter((u) => u.role === UserRole.PROVIDER).length,
    admin: users.filter((u) => u.role === UserRole.ADMIN).length,
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          Todos ({counts.all})
        </FilterChip>
        <FilterChip
          active={filter === UserRole.CLIENT}
          onClick={() => setFilter(UserRole.CLIENT)}
        >
          Clientes ({counts.client})
        </FilterChip>
        <FilterChip
          active={filter === UserRole.PROVIDER}
          onClick={() => setFilter(UserRole.PROVIDER)}
        >
          Proveedores ({counts.provider})
        </FilterChip>
        <FilterChip
          active={filter === UserRole.ADMIN}
          onClick={() => setFilter(UserRole.ADMIN)}
        >
          Administradores ({counts.admin})
        </FilterChip>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" aria-label="Lista de usuarios">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Nombre</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Rol</th>
              <th className="text-left px-3 py-2 font-medium">Estado</th>
              <th className="text-right px-3 py-2 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center text-neutral-500 py-6"
                >
                  No hay usuarios en esta categoría.
                </td>
              </tr>
            )}
            {visible.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100">
                <td className="px-3 py-2">
                  {u.firstName} {u.lastName}
                </td>
                <td className="px-3 py-2 text-neutral-600">{u.email}</td>
                <td className="px-3 py-2">
                  <Badge variant={roleVariant(u.role)}>{roleLabel(u.role)}</Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={u.isActive ? 'success' : 'danger'}>
                    {u.isActive ? 'Activa' : 'Inactiva'}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant={u.isActive ? 'danger' : 'primary'}
                    size="sm"
                    onClick={() => handleToggle(u)}
                  >
                    {u.isActive ? 'Desactivar' : 'Activar'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function roleLabel(role: UserRole) {
  if (role === UserRole.CLIENT) return 'Cliente';
  if (role === UserRole.PROVIDER) return 'Proveedor';
  return 'Administrador';
}

function roleVariant(role: UserRole): 'info' | 'success' | 'warning' {
  if (role === UserRole.CLIENT) return 'info';
  if (role === UserRole.PROVIDER) return 'success';
  return 'warning';
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'px-3 py-1.5 rounded-full text-sm border transition-colors',
        active
          ? 'bg-primary-50 border-primary-200 text-primary-700'
          : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50',
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- */
/*  Sección: Categorías                                              */
/* ---------------------------------------------------------------- */

function CategoriesSection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const load = () => {
    setIsLoading(true);
    categoriesApi
      .getAll()
      .then((res) => setCategories(flatten(res.data || [])))
      .catch(() => toast.error('No se pudo cargar el árbol de categorías.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast.error('Nombre y slug son obligatorios.');
      return;
    }
    setIsCreating(true);
    try {
      await categoriesApi.create({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || undefined,
      });
      toast.success('Categoría creada.');
      setName('');
      setSlug('');
      setDescription('');
      load();
    } catch {
      toast.error('No se pudo crear la categoría.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (c: Category) => {
    if (
      !window.confirm(
        `¿Eliminar la categoría "${c.name}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    try {
      await categoriesApi.remove(c.id);
      toast.success('Categoría eliminada.');
      load();
    } catch {
      toast.error('No se pudo eliminar la categoría (puede tener servicios asociados).');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end p-4 bg-neutral-50 rounded-md border border-neutral-200"
        aria-label="Crear nueva categoría"
      >
        <Input
          label="Nombre"
          value={name}
          onChange={(e) => {
            const v = e.target.value;
            setName(v);
            if (!slug || slug === slugify(name)) {
              setSlug(slugify(v));
            }
          }}
          placeholder="Fontanería"
          required
        />
        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="fontaneria"
          required
        />
        <Input
          label="Descripción (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Reparaciones e instalaciones"
        />
        <Button type="submit" variant="primary" isLoading={isCreating}>
          Crear categoría
        </Button>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" aria-label="Lista de categorías">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Nombre</th>
              <th className="text-left px-3 py-2 font-medium">Slug</th>
              <th className="text-left px-3 py-2 font-medium">Descripción</th>
              <th className="text-right px-3 py-2 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-neutral-500 py-6">
                  No hay categorías. Crea la primera con el formulario superior.
                </td>
              </tr>
            )}
            {categories.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100">
                <td className="px-3 py-2 font-medium">
                  {c.parentId ? <span className="text-neutral-400 mr-1">↳</span> : null}
                  {c.name}
                </td>
                <td className="px-3 py-2 text-neutral-600">{c.slug}</td>
                <td className="px-3 py-2 text-neutral-600">
                  {c.description || '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(c)}
                  >
                    Eliminar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function flatten(items: Category[]): Category[] {
  const out: Category[] = [];
  for (const it of items) {
    out.push(it);
    if (it.children && it.children.length) {
      for (const c of it.children) out.push({ ...c, parentId: it.id });
    }
  }
  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/* ---------------------------------------------------------------- */
/*  Sección: Valoraciones reportadas                                 */
/* ---------------------------------------------------------------- */

function ReportedReviewsSection() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = () => {
    setIsLoading(true);
    reviewsApi
      .getReported()
      .then((res) => setReviews(res.data || []))
      .catch(() => toast.error('No se pudo cargar la lista de valoraciones reportadas.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (r: Review) => {
    if (
      !window.confirm(
        '¿Eliminar definitivamente esta valoración? El cliente no podrá recuperarla.',
      )
    ) {
      return;
    }
    try {
      await reviewsApi.remove(r.id);
      toast.success('Valoración eliminada.');
      load();
    } catch {
      toast.error('No se pudo eliminar la valoración.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center text-neutral-500 py-10">
        <Flag size={32} className="mx-auto mb-2 text-neutral-300" aria-hidden="true" />
        <p>No hay valoraciones reportadas pendientes de moderación.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li
          key={r.id}
          className="border border-neutral-200 rounded-md p-4 bg-white"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="warning">Reportada</Badge>
                <span className="text-sm text-neutral-600">
                  {r.rating}/5 · {r.client?.firstName} {r.client?.lastName}
                </span>
              </div>
              {r.comment && (
                <p className="text-neutral-800 break-words">{r.comment}</p>
              )}
              <p className="text-xs text-neutral-500">
                Reserva #{r.bookingId.slice(0, 8)} · {new Date(r.createdAt).toLocaleDateString('es-ES')}
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => handleDelete(r)}>
              Eliminar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
