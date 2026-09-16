/**
 * Panel de administración. Da cumplimiento al requisito del enunciado
 * "administrar la aplicación desde la propia aplicación". Solo accesible
 * para usuarios con rol admin; el resto se redirige a /dashboard.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import {
  Users,
  Tag,
  Flag,
  Pencil,
  Check,
  X,
  Briefcase,
  TrendingUp,
  Star,
  Eye,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { adminApi, usersApi, categoriesApi, reviewsApi } from '@/lib/api';
import { User, Category, Review, UserRole } from '@/types';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';
import Badge from '@/components/atoms/Badge';
import Spinner from '@/components/atoms/Spinner';

type Tab = 'users' | 'reputation' | 'categories' | 'reviews';

const TABS = [
  { key: 'users', clave: 'usuarios', icon: Users },
  { key: 'reputation', clave: 'reputacion', icon: TrendingUp },
  { key: 'categories', clave: 'categorias', icon: Tag },
  { key: 'reviews', clave: 'valoracionesReportadas', icon: Flag },
] as const;

interface Recuento {
  clave: string;
  total: number;
}

/** Forma de GET /api/admin/metricas. */
interface Stats {
  usuarios: { total: number; porRol: Recuento[]; inactivos: number };
  servicios: {
    total: number;
    activos: number;
    sinFoto: number;
    porCategoria: Recuento[];
    porCiudad: Recuento[];
  };
  reservas: { total: number; porEstado: Recuento[]; facturado: number };
  valoraciones: {
    total: number;
    media: number | null;
    porNota: Recuento[];
    reportadas: number;
    sinResponder: number;
  };
  categorias: { total: number; sinServicios: number };
}

/** Número de usuarios con un rol, desde el agregado del servidor. */
const contarRol = (stats: Stats, rol: string) =>
  stats.usuarios.porRol.find((r) => r.clave === rol)?.total ?? 0;

export default function AdminPage() {
  const t = useTranslations('administracion');
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

  // Antes esto se descargaba la lista entera de usuarios, la de categorías y
  // la de valoraciones reportadas para contar longitudes aquí. Ahora los
  // agregados llegan calculados y el navegador solo los pinta.
  const loadStats = useCallback(async () => {
    try {
      const { data } = await adminApi.metricas();
      setStats(data);
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
          <h1 className="text-2xl font-bold text-principal">{t('titulo')}</h1>
          <p className="text-secundario mt-1">{t('subtitulo')}</p>
        </div>

        {/* Se avisa antes de que alguien pulse, no después con un error: el
            bloqueo es deliberado y tiene que parecerlo. Quien manda es el
            servidor; esto solo lo cuenta. */}
        {user.soloLectura && (
          <div
            role="status"
            className="mb-6 flex items-start gap-3 rounded-lg border border-warning-500/30 bg-warning-50 p-4"
          >
            <Eye
              className="mt-0.5 h-5 w-5 shrink-0 text-warning-600"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium text-principal">
                {t('soloLecturaTitulo')}
              </p>
              <p className="mt-1 text-sm text-secundario">
                {t('soloLecturaTexto')}
              </p>
            </div>
          </div>
        )}

        {stats && (
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
            aria-label={t('metricas')}
          >
            <MetricCard
              icon={Users}
              label={t('usuarios')}
              value={stats.usuarios.total}
              variant="info"
            />
            <MetricCard
              icon={Briefcase}
              label={t('proveedores')}
              value={contarRol(stats, 'provider')}
              variant="success"
            />
            <MetricCard
              icon={Tag}
              label={t('categorias')}
              value={stats.categorias.total}
              variant="default"
            />
            <MetricCard
              icon={Flag}
              label={t('reportesPendientes')}
              value={stats.valoraciones.reportadas}
              variant={
                stats.valoraciones.reportadas > 0 ? 'warning' : 'default'
              }
            />
          </div>
        )}

        <div className="bg-superficie rounded-lg shadow-card">
          <div
            role="tablist"
            aria-label={t('secciones')}
            className="flex border-b border-borde overflow-x-auto"
          >
            {TABS.map(({ key, clave, icon: Icon }) => (
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
                {t(clave)}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === 'users' && (
              <div role="tabpanel" id="panel-users" aria-labelledby="tab-users">
                <UsersSection onMutate={loadStats} />
              </div>
            )}
            {tab === 'reputation' && (
              <div
                role="tabpanel"
                id="panel-reputation"
                aria-labelledby="tab-reputation"
              >
                <ReputacionSection />
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
  const t = useTranslations('administracion');
  const soloLectura = useAuthStore((estado) => estado.user?.soloLectura);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | UserRole>('all');

  const load = useCallback(() => {
    setIsLoading(true);
    usersApi
      .getAll()
      .then((res) => setUsers(res.data || []))
      .catch(() => toast.error(t('errorUsuarios')))
      .finally(() => setIsLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (u: User) => {
    const next = !u.isActive;

    const nombre = `${u.firstName} ${u.lastName}`;
    const pregunta = next
      ? t('confirmarActivar', { nombre })
      : t('confirmarDesactivar', { nombre });

    if (!window.confirm(pregunta)) return;
    try {
      await usersApi.toggleActive(u.id);
      toast.success(next ? t('cuentaActivada') : t('cuentaDesactivada'));
      load();
      onMutate?.();
    } catch {
      toast.error(t('errorEstadoCuenta'));
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
          {t('todos', { total: counts.all })}
        </FilterChip>
        <FilterChip
          active={filter === UserRole.CLIENT}
          onClick={() => setFilter(UserRole.CLIENT)}
        >
          {t('clientes', { total: counts.client })}
        </FilterChip>
        <FilterChip
          active={filter === UserRole.PROVIDER}
          onClick={() => setFilter(UserRole.PROVIDER)}
        >
          {t('proveedoresFiltro', { total: counts.provider })}
        </FilterChip>
        <FilterChip
          active={filter === UserRole.ADMIN}
          onClick={() => setFilter(UserRole.ADMIN)}
        >
          {t('administradores', { total: counts.admin })}
        </FilterChip>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" aria-label={t('listaUsuarios')}>
          <thead className="bg-fondo text-secundario">
            <tr>
              <th className="text-start px-3 py-2 font-medium">
                {t('nombre')}
              </th>
              <th className="text-start px-3 py-2 font-medium">{t('email')}</th>
              <th className="text-start px-3 py-2 font-medium">{t('rol')}</th>
              <th className="text-start px-3 py-2 font-medium">
                {t('estado')}
              </th>
              <th className="text-end px-3 py-2 font-medium">{t('accion')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-tenue py-6">
                  {t('sinUsuarios')}
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
                    {t(claveRol(u.role))}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={u.isActive ? 'success' : 'danger'}>
                    {u.isActive ? t('activa') : t('inactiva')}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-end">
                  <Button
                    variant={u.isActive ? 'danger' : 'primary'}
                    size="sm"
                    onClick={() => handleToggle(u)}
                    disabled={soloLectura}
                    title={soloLectura ? t('soloLecturaTexto') : undefined}
                  >
                    {u.isActive ? t('desactivar') : t('activar')}
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

function claveRol(role: UserRole) {
  if (role === UserRole.CLIENT) return 'cliente' as const;
  if (role === UserRole.PROVIDER) return 'proveedor' as const;
  return 'administrador' as const;
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
  const t = useTranslations('administracion');
  const tComun = useTranslations('comun');
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

  const load = useCallback(() => {
    setIsLoading(true);
    categoriesApi
      .getAll()
      .then((res) => setCategories(flatten(res.data || [])))
      .catch(() => toast.error(t('errorArbol')))
      .finally(() => setIsLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

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
      toast.success(t('categoriaCreada'));
      setName('');
      setSlug('');
      setDescription('');
      load();
      onMutate?.();
    } catch {
      toast.error(t('errorCrearCategoria'));
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
      toast.success(t('categoriaActualizada'));
      cancelEdit();
      load();
      onMutate?.();
    } catch {
      toast.error(t('errorActualizarCategoria'));
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
      toast.success(t('categoriaEliminada'));
      load();
      onMutate?.();
    } catch {
      toast.error(t('errorEliminarCategoria'));
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
        aria-label={t('crearCategoriaFormulario')}
      >
        <Input
          label={t('nombre')}
          value={name}
          onChange={(e) => {
            const v = e.target.value;
            setName(v);
            if (!slug || slug === slugify(name)) {
              setSlug(slugify(v));
            }
          }}
          placeholder={t('nombrePlaceholder')}
          required
        />
        <Input
          label={t('slug')}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={t('slugPlaceholder')}
          required
        />
        <Input
          label={t('descripcionOpcional')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('descripcionPlaceholder')}
        />
        <Button type="submit" variant="primary" isLoading={isCreating}>
          {t('crearCategoria')}
        </Button>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" aria-label={t('listaCategorias')}>
          <thead className="bg-fondo text-secundario">
            <tr>
              <th className="text-start px-3 py-2 font-medium">
                {t('nombre')}
              </th>
              <th className="text-start px-3 py-2 font-medium">{t('slug')}</th>
              <th className="text-start px-3 py-2 font-medium">
                {t('descripcion')}
              </th>
              <th className="text-end px-3 py-2 font-medium">{t('accion')}</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-tenue py-6">
                  {t('sinCategorias')}
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
                        aria-label={t('editarNombre')}
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
                        aria-label={t('editarSlug')}
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
                        aria-label={t('editarDescripcion')}
                      />
                    ) : (
                      c.description || '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-end">
                    {editing ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => saveEdit(c.id)}
                          isLoading={isSavingEdit}
                          aria-label={t('guardarCambios')}
                        >
                          <Check size={14} aria-hidden="true" />
                          Guardar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEdit}
                          aria-label={t('cancelarEdicion')}
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
                          {tComun('editar')}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(c)}
                        >
                          {tComun('eliminar')}
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
  const t = useTranslations('administracion');
  const idioma = useLocale();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    setIsLoading(true);
    reviewsApi
      .getReported()
      .then((res) => setReviews(res.data || []))
      .catch(() => toast.error(t('errorReportadas')))
      .finally(() => setIsLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDismiss = async (r: Review) => {
    if (!window.confirm(t('confirmarDescartar'))) {
      return;
    }
    try {
      await reviewsApi.dismissReport(r.id);
      toast.success(t('reporteDescartado'));
      load();
      onMutate?.();
    } catch {
      toast.error(t('errorDescartar'));
    }
  };

  const handleDelete = async (r: Review) => {
    if (!window.confirm(t('confirmarEliminarValoracion'))) {
      return;
    }
    try {
      await reviewsApi.remove(r.id);
      toast.success(t('valoracionEliminada'));
      load();
      onMutate?.();
    } catch {
      toast.error(t('errorEliminarValoracion'));
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
        <p>{t('sinReportes')}</p>
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
                <Badge variant="warning">{t('reportada')}</Badge>
                <span className="text-sm text-secundario">
                  {r.rating}/5 · {r.client?.firstName} {r.client?.lastName}
                </span>
              </div>
              {r.comment && (
                <p className="text-principal break-words">{r.comment}</p>
              )}
              <p className="text-xs text-tenue">
                {t('reserva', { id: r.bookingId.slice(0, 8) })} ·{' '}
                {new Date(r.createdAt).toLocaleDateString(idioma)}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleDismiss(r)}
              >
                <Check size={14} aria-hidden="true" />
                {t('mantener')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(r)}
              >
                {t('eliminar')}
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface Reputacion {
  proveedorId: string;
  nombre: string;
  ciudad: string | null;
  activo: boolean;
  servicios: number;
  serviciosActivos: number;
  valoraciones: number;
  media: number | null;
  reservasCompletadas: number;
  tasaRespuesta: number | null;
}

/**
 * Reputación agregada por profesional.
 *
 * Los datos llegan ya calculados y ordenados del servidor: aquí no se suma ni
 * se ordena nada, solo se pinta. Quien no tiene valoraciones aparece al final
 * con la nota en blanco, no con un cero, porque cero es una nota pésima y lo
 * que ocurre es que todavía no hay de qué opinar.
 */
function ReputacionSection() {
  const t = useTranslations('administracion');
  const tComun = useTranslations('comun');
  const [filas, setFilas] = useState<Reputacion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    setIsLoading(true);
    adminApi
      .reputacion()
      .then((res) => setFilas(res.data || []))
      .catch(() => toast.error(t('errorReputacion')))
      .finally(() => setIsLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-secundario">{t('reputacionAyuda')}</p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm" aria-label={t('listaReputacion')}>
          <thead className="bg-fondo text-secundario">
            <tr>
              <th className="text-start px-3 py-2 font-medium">
                {t('nombre')}
              </th>
              <th className="text-start px-3 py-2 font-medium">
                {tComun('ciudad')}
              </th>
              <th className="text-end px-3 py-2 font-medium">{t('media')}</th>
              <th className="text-end px-3 py-2 font-medium">
                {t('valoracionesCol')}
              </th>
              <th className="text-end px-3 py-2 font-medium">
                {t('serviciosCol')}
              </th>
              <th className="text-end px-3 py-2 font-medium">
                {t('completadas')}
              </th>
              <th className="text-end px-3 py-2 font-medium">
                {t('tasaRespuesta')}
              </th>
              <th className="text-start px-3 py-2 font-medium">
                {t('estado')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-tenue">
                  {t('sinReputacion')}
                </td>
              </tr>
            )}
            {filas.map((p) => (
              <tr key={p.proveedorId} className="border-t border-borde">
                <td className="px-3 py-2 font-medium text-principal">
                  {p.nombre}
                </td>
                <td className="px-3 py-2 text-secundario">{p.ciudad || '—'}</td>
                <td className="px-3 py-2 text-end">
                  {p.media === null ? (
                    <span className="text-tenue">{t('sinNota')}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-principal">
                      <Star
                        size={14}
                        className="fill-warning-500 text-warning-500"
                        aria-hidden="true"
                      />
                      {p.media.toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-end text-secundario">
                  {p.valoraciones}
                </td>
                <td className="px-3 py-2 text-end text-secundario">
                  {p.serviciosActivos}/{p.servicios}
                </td>
                <td className="px-3 py-2 text-end text-secundario">
                  {p.reservasCompletadas}
                </td>
                <td className="px-3 py-2 text-end text-secundario">
                  {p.tasaRespuesta === null ? '—' : `${p.tasaRespuesta}%`}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={p.activo ? 'success' : 'danger'}>
                    {p.activo ? t('activa') : t('inactiva')}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
