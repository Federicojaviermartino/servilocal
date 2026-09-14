/**
 * Panel de administración. Da cumplimiento al requisito del enunciado
 * "administrar la aplicación desde la propia aplicación". Solo accesible
 * para usuarios con rol admin; el resto se redirige a /dashboard.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Users, Tag, Flag, Pencil, Check, X, Briefcase } from 'lucide-react';
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

interface Stats {
  totalUsers: number;
  totalProviders: number;
  totalCategories: number;
  reportedReviews: number;
}

export default function AdminPage() {
  const { user, loadFromStorage } = useAuthStore();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('users');
  const [stats, setStats] = useState<Stats | null>(null);

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

  const loadStats = useCallback(async () => {
    try {
      const [usersRes, catsRes, repRes] = await Promise.all([
        usersApi.getAll(),
        categoriesApi.getAll(),
        reviewsApi.getReported(),
      ]);
      const allUsers: User[] = usersRes.data || [];
      const allCats: Category[] = flatten(catsRes.data || []);
      const reported: Review[] = repRes.data || [];
      setStats({
        totalUsers: allUsers.length,
        totalProviders: allUsers.filter((u) => u.role === UserRole.PROVIDER)
          .length,
        totalCategories: allCats.length,
        reportedReviews: reported.length,
      });
    } catch {
      // si falla, dejamos stats en null y los contadores no se muestran
    }
  }, []);

  useEffect(() => {
    if (user?.role === UserRole.ADMIN) loadStats();
  }, [user, loadStats]);

  if (!user || user.role !== UserRole.ADMIN) return null;

  return (
    <div className="bg-fondo min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-principal">
            Panel de administración
          </h1>
          <p className="text-secundario mt-1">
            Gestión de usuarios, categorías y moderación de valoraciones.
          </p>
        </div>

        {stats && (
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
            aria-label="Métricas de la plataforma"
          >
            <MetricCard
              icon={Users}
              label="Usuarios"
              value={stats.totalUsers}
              variant="info"
            />
            <MetricCard
              icon={Briefcase}
              label="Proveedores"
              value={stats.totalProviders}
              variant="success"
            />
            <MetricCard
              icon={Tag}
              label="Categorías"
              value={stats.totalCategories}
              variant="default"
            />
            <MetricCard
              icon={Flag}
              label="Reportes pendientes"
              value={stats.reportedReviews}
              variant={stats.reportedReviews > 0 ? 'warning' : 'default'}
            />
          </div>
        )}

        <div className="bg-superficie rounded-lg shadow-card">
          <div
            role="tablist"
            aria-label="Secciones de administración"
            className="flex border-b border-borde overflow-x-auto"
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
                    : 'border-transparent text-secundario hover:text-principal',
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
                <UsersSection onMutate={loadStats} />
              </div>
            )}
            {tab === 'categories' && (
              <div
                role="tabpanel"
                id="panel-categories"
                aria-labelledby="tab-categories"
              >
                <CategoriesSection onMutate={loadStats} />
              </div>
            )}
            {tab === 'reviews' && (
              <div
                role="tabpanel"
                id="panel-reviews"
                aria-labelledby="tab-reviews"
              >
                <ReportedReviewsSection onMutate={loadStats} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  variant = 'default',
}: {
  icon: typeof Users;
  label: string;
  value: number;
  variant?: 'default' | 'info' | 'success' | 'warning';
}) {
  const ring = {
    default: 'bg-fondo text-secundario',
    info: 'bg-primary-50 text-primary-700',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
  }[variant];
  return (
    <div className="bg-superficie rounded-lg shadow-card p-4 flex items-center gap-3">
      <div
        className={clsx(
          'h-10 w-10 rounded-md flex items-center justify-center',
          ring,
        )}
      >
        <Icon size={20} aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs text-tenue uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-principal leading-tight">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Sección: Usuarios                                                */
/* ---------------------------------------------------------------- */

function UsersSection({ onMutate }: { onMutate?: () => void }) {
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
    if (
      !window.confirm(
        `¿Confirmas ${verb} la cuenta de ${u.firstName} ${u.lastName}?`,
      )
    ) {
      return;
    }
    try {
      await usersApi.toggleActive(u.id);
      toast.success(`Cuenta ${next ? 'activada' : 'desactivada'}.`);
      load();
      onMutate?.();
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
          <thead className="bg-fondo text-secundario">
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
                <td colSpan={5} className="text-center text-tenue py-6">
                  No hay usuarios en esta categoría.
                </td>
              </tr>
            )}
            {visible.map((u) => (
              <tr key={u.id} className="border-t border-borde">
                <td className="px-3 py-2">
                  {u.firstName} {u.lastName}
                </td>
                <td className="px-3 py-2 text-secundario">{u.email}</td>
                <td className="px-3 py-2">
                  <Badge variant={roleVariant(u.role)}>
                    {roleLabel(u.role)}
                  </Badge>
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
          : 'bg-superficie border-borde text-secundario hover:bg-fondo',
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

function CategoriesSection({ onMutate }: { onMutate?: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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
      onMutate?.();
    } catch {
      toast.error('No se pudo crear la categoría.');
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditSlug(c.slug);
    setEditDescription(c.description || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditSlug('');
    setEditDescription('');
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim() || !editSlug.trim()) {
      toast.error('Nombre y slug son obligatorios.');
      return;
    }
    setIsSavingEdit(true);
    try {
      await categoriesApi.update(id, {
        name: editName.trim(),
        slug: editSlug.trim(),
        description: editDescription.trim() || null,
      });
      toast.success('Categoría actualizada.');
      cancelEdit();
      load();
      onMutate?.();
    } catch {
      toast.error('No se pudo actualizar la categoría.');
    } finally {
      setIsSavingEdit(false);
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
      onMutate?.();
    } catch {
      toast.error(
        'No se pudo eliminar la categoría (puede tener servicios asociados).',
      );
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
        className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end p-4 bg-fondo rounded-md border border-borde"
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
          <thead className="bg-fondo text-secundario">
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
                <td colSpan={4} className="text-center text-tenue py-6">
                  No hay categorías. Crea la primera con el formulario superior.
                </td>
              </tr>
            )}
            {categories.map((c) => {
              const editing = editingId === c.id;
              return (
                <tr key={c.id} className="border-t border-borde">
                  <td className="px-3 py-2 font-medium">
                    {c.parentId ? (
                      <span className="text-tenue mr-1">↳</span>
                    ) : null}
                    {editing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full border border-borde rounded px-2 py-1 text-sm"
                        aria-label="Editar nombre"
                      />
                    ) : (
                      c.name
                    )}
                  </td>
                  <td className="px-3 py-2 text-secundario">
                    {editing ? (
                      <input
                        type="text"
                        value={editSlug}
                        onChange={(e) => setEditSlug(e.target.value)}
                        className="w-full border border-borde rounded px-2 py-1 text-sm"
                        aria-label="Editar slug"
                      />
                    ) : (
                      c.slug
                    )}
                  </td>
                  <td className="px-3 py-2 text-secundario">
                    {editing ? (
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full border border-borde rounded px-2 py-1 text-sm"
                        aria-label="Editar descripción"
                      />
                    ) : (
                      c.description || '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editing ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => saveEdit(c.id)}
                          isLoading={isSavingEdit}
                          aria-label="Guardar cambios"
                        >
                          <Check size={14} aria-hidden="true" />
                          Guardar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEdit}
                          aria-label="Cancelar edición"
                        >
                          <X size={14} aria-hidden="true" />
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(c)}
                          aria-label={`Editar ${c.name}`}
                        >
                          <Pencil size={14} aria-hidden="true" />
                          Editar
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(c)}
                        >
                          Eliminar
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
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

function ReportedReviewsSection({ onMutate }: { onMutate?: () => void }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = () => {
    setIsLoading(true);
    reviewsApi
      .getReported()
      .then((res) => setReviews(res.data || []))
      .catch(() =>
        toast.error('No se pudo cargar la lista de valoraciones reportadas.'),
      )
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDismiss = async (r: Review) => {
    if (
      !window.confirm('¿Descartar el reporte y mantener visible la valoración?')
    ) {
      return;
    }
    try {
      await reviewsApi.dismissReport(r.id);
      toast.success('Reporte descartado: la valoración sigue visible.');
      load();
      onMutate?.();
    } catch {
      toast.error('No se pudo descartar el reporte.');
    }
  };

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
      onMutate?.();
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
      <div className="text-center text-tenue py-10">
        <Flag
          size={32}
          className="mx-auto mb-2 text-tenue"
          aria-hidden="true"
        />
        <p>No hay valoraciones reportadas pendientes de moderación.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li
          key={r.id}
          className="border border-borde rounded-md p-4 bg-superficie"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="warning">Reportada</Badge>
                <span className="text-sm text-secundario">
                  {r.rating}/5 · {r.client?.firstName} {r.client?.lastName}
                </span>
              </div>
              {r.comment && (
                <p className="text-principal break-words">{r.comment}</p>
              )}
              <p className="text-xs text-tenue">
                Reserva #{r.bookingId.slice(0, 8)} ·{' '}
                {new Date(r.createdAt).toLocaleDateString('es-ES')}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleDismiss(r)}
              >
                <Check size={14} aria-hidden="true" />
                Mantener
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(r)}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
