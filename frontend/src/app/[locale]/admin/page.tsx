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
  Sparkles,
  ScrollText,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import GraficasPanel from '@/components/organisms/GraficasPanel';
import {
  adminApi,
  usersApi,
  categoriesApi,
  reviewsApi,
  iaApi,
} from '@/lib/api';
import { User, Category, Review, UserRole } from '@/types';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';
import Badge from '@/components/atoms/Badge';
import Spinner from '@/components/atoms/Spinner';
import Pagination from '@/components/molecules/Pagination';

type Tab = (typeof TABS)[number]['key'];

const TABS = [
  { key: 'users', clave: 'usuarios', icon: Users },
  { key: 'reputation', clave: 'reputacion', icon: TrendingUp },
  { key: 'categories', clave: 'categorias', icon: Tag },
  { key: 'reviews', clave: 'valoracionesReportadas', icon: Flag },
  { key: 'auditoria', clave: 'auditoria', icon: ScrollText },
  { key: 'ia', clave: 'ia', icon: Sparkles },
] as const;

/** Forma de GET /api/ia/consumo. */
interface ConsumoIa {
  mes: string;
  llamadas: number;
  fallos: number;
  tokensEntrada: number;
  tokensSalida: number;
  costeCentimos: number;
  topeCentimos: number;
  porcentaje: number;
  porFuncionalidad: {
    funcionalidad: string;
    llamadas: number;
    fallos: number;
    costeCentimos: number;
  }[];
}

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
  reservas: {
    total: number;
    porEstado: Recuento[];
    facturado: number;
    porSemana: { semana: string; reservas: number; facturado: number }[];
  };
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

  /**
   * Flechas, Inicio y Fin entre pestañas, como manda el patrón de ARIA.
   *
   * Se mueve también el foco, no solo la selección: dejarlo atrás haría que
   * la siguiente flecha partiera del sitio equivocado.
   */
  const moverEntrePestanas = (
    evento: React.KeyboardEvent<HTMLButtonElement>,
    indice: number,
  ) => {
    const saltos: Record<string, number> = {
      ArrowRight: indice + 1,
      ArrowLeft: indice - 1,
      Home: 0,
      End: TABS.length - 1,
    };
    const destino = saltos[evento.key];
    if (destino === undefined) return;

    evento.preventDefault();
    const siguiente = TABS[(destino + TABS.length) % TABS.length];
    setTab(siguiente.key);
    document.getElementById(`tab-${siguiente.key}`)?.focus();
  };

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
            className="mb-6 flex items-start gap-3 rounded-lg border border-warning-500/30 bg-warning-50 p-4 dark:bg-warning-900/20"
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

        {stats && (
          <GraficasPanel
            datos={{
              porSemana: stats.reservas.porSemana,
              porEstado: stats.reservas.porEstado,
              porNota: stats.valoraciones.porNota,
              porCategoria: stats.servicios.porCategoria,
            }}
          />
        )}

        <div className="bg-superficie rounded-lg shadow-card">
          <div
            role="tablist"
            aria-label={t('secciones')}
            className="flex border-b border-borde overflow-x-auto"
          >
            {TABS.map(({ key, clave, icon: Icon }, indice) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
                id={`tab-${key}`}
                // Un grupo de pestañas es una sola parada del tabulador: se
                // entra en la activa y dentro se recorre con las flechas. Con
                // todas tabulables había que pasar por las cinco para llegar
                // al contenido, y las flechas no hacían nada.
                tabIndex={tab === key ? 0 : -1}
                onKeyDown={(evento) => moverEntrePestanas(evento, indice)}
                onClick={() => setTab(key)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                  tab === key
                    ? 'border-acento text-acento'
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
            {tab === 'auditoria' && (
              <div
                role="tabpanel"
                id="panel-auditoria"
                aria-labelledby="tab-auditoria"
              >
                <AuditoriaSection />
              </div>
            )}
            {tab === 'ia' && (
              <div role="tabpanel" id="panel-ia" aria-labelledby="tab-ia">
                <IaSection />
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

      <div className="overflow-x-auto" tabIndex={0}>
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
  const soloLectura = useAuthStore((estado) => estado.user?.soloLectura);
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
      toast.error(t('nombreYSlugObligatorios'));
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
      toast.error(t('nombreYSlugObligatorios'));
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
        <Button
          type="submit"
          variant="primary"
          isLoading={isCreating}
          disabled={soloLectura}
          title={soloLectura ? t('soloLecturaTexto') : undefined}
        >
          {t('crearCategoria')}
        </Button>
      </form>

      <div className="overflow-x-auto" tabIndex={0}>
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
                          {tComun('guardar')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelEdit}
                          aria-label={t('cancelarEdicion')}
                        >
                          <X size={14} aria-hidden="true" />
                          {tComun('cancelar')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(c)}
                          disabled={soloLectura}
                          aria-label={`${tComun('editar')} ${c.name}`}
                          title={
                            soloLectura ? t('soloLecturaTexto') : undefined
                          }
                        >
                          <Pencil size={14} aria-hidden="true" />
                          {tComun('editar')}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(c)}
                          disabled={soloLectura}
                          aria-label={`${tComun('eliminar')} ${c.name}`}
                          title={
                            soloLectura ? t('soloLecturaTexto') : undefined
                          }
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
  const soloLectura = useAuthStore((estado) => estado.user?.soloLectura);
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
                disabled={soloLectura}
                title={soloLectura ? t('soloLecturaTexto') : undefined}
              >
                <Check size={14} aria-hidden="true" />
                {t('mantener')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(r)}
                disabled={soloLectura}
                title={soloLectura ? t('soloLecturaTexto') : undefined}
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

      <div className="overflow-x-auto" tabIndex={0}>
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

/**
 * Consumo de la capa de IA.
 *
 * Se consulta también el estado porque con la capa apagada todas las cifras
 * son cero, y un cero sin explicación se lee como una avería. Aquí el panel
 * dice si está inactiva, si se ha agotado el tope o si funciona.
 */
function IaSection() {
  const t = useTranslations('administracion');
  const [consumo, setConsumo] = useState<ConsumoIa | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([iaApi.consumo(), iaApi.estado()])
      .then(([resConsumo, resEstado]) => {
        setConsumo(resConsumo.data);
        setDisponible(resEstado.data?.disponible ?? false);
        setMotivo(resEstado.data?.motivo ?? null);
      })
      .catch(() => toast.error(t('errorConsumoIa')))
      .finally(() => setIsLoading(false));
  }, [t]);

  if (isLoading) {
    return <p className="p-4 text-secundario">{t('cargando')}</p>;
  }

  if (!consumo) return null;

  const euros = (centimos: number) => (centimos / 100).toFixed(2);

  // El tope es un techo, no una previsión: pasado el 100 % la capa deja de
  // llamar al modelo, así que la barra se recorta ahí en lugar de desbordarse.
  const ocupado = Math.min(consumo.porcentaje, 100);

  const estado = disponible
    ? { texto: t('iaActiva'), variante: 'success' as const }
    : motivo === 'presupuesto'
      ? { texto: t('iaSinPresupuesto'), variante: 'warning' as const }
      : { texto: t('iaInactiva'), variante: 'default' as const };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-principal">{t('iaTitulo')}</p>
          <p className="mt-1 text-sm text-secundario">
            {t('iaMes', { mes: consumo.mes })}
          </p>
        </div>
        <Badge variant={estado.variante}>{estado.texto}</Badge>
      </div>

      {!disponible && motivo === 'inactiva' && (
        <p className="mt-3 rounded-lg bg-superficie-alt p-3 text-sm text-secundario">
          {t('iaInactivaTexto')}
        </p>
      )}

      <div className="mt-6">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-principal">
            {t('iaGasto', {
              gastado: euros(consumo.costeCentimos),
              tope: euros(consumo.topeCentimos),
            })}
          </span>
          <span className="text-secundario">{consumo.porcentaje} %</span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-superficie-alt"
          role="progressbar"
          aria-valuenow={ocupado}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('iaGastoEtiqueta')}
        >
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              consumo.porcentaje >= 100 ? 'bg-warning-500' : 'bg-primary-600',
            )}
            style={{ width: `${ocupado}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          icon={Sparkles}
          label={t('iaLlamadas')}
          value={consumo.llamadas}
          variant="info"
        />
        <MetricCard
          icon={X}
          label={t('iaFallos')}
          value={consumo.fallos}
          variant={consumo.fallos > 0 ? 'warning' : 'default'}
        />
        <MetricCard
          icon={TrendingUp}
          label={t('iaTokensEntrada')}
          value={consumo.tokensEntrada}
          variant="default"
        />
        <MetricCard
          icon={TrendingUp}
          label={t('iaTokensSalida')}
          value={consumo.tokensSalida}
          variant="default"
        />
      </div>

      {consumo.porFuncionalidad.length > 0 && (
        <div className="mt-6 overflow-x-auto" tabIndex={0}>
          <table className="w-full text-sm">
            <caption className="sr-only">{t('iaRepartoTitulo')}</caption>
            <thead>
              <tr className="border-b border-borde text-start text-secundario">
                <th className="px-3 py-2 text-start font-medium">
                  {t('iaFuncionalidad')}
                </th>
                <th className="px-3 py-2 text-end font-medium">
                  {t('iaLlamadas')}
                </th>
                <th className="px-3 py-2 text-end font-medium">
                  {t('iaFallos')}
                </th>
                <th className="px-3 py-2 text-end font-medium">
                  {t('iaCoste')}
                </th>
              </tr>
            </thead>
            <tbody>
              {consumo.porFuncionalidad.map((f) => (
                <tr key={f.funcionalidad} className="border-b border-borde">
                  <td className="px-3 py-2 text-principal">
                    {f.funcionalidad}
                  </td>
                  <td className="px-3 py-2 text-end text-secundario">
                    {f.llamadas}
                  </td>
                  <td className="px-3 py-2 text-end text-secundario">
                    {f.fallos}
                  </td>
                  <td className="px-3 py-2 text-end text-secundario">
                    {euros(f.costeCentimos)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Forma de una fila de GET /api/admin/auditoria. */
interface EntradaAuditoria {
  id: string;
  actorEmail: string;
  accion: string;
  entidad: string;
  entidadId: string | null;
  contexto: Record<string, string> | null;
  createdAt: string;
}

/**
 * Historial de acciones de administración.
 *
 * No hay nada que pulsar, y es deliberado: el servidor no expone ninguna ruta
 * para modificar ni para borrar una entrada, así que tampoco la hay aquí.
 *
 * El texto de cada acción y el de cada campo del contexto salen del catálogo,
 * igual que en los avisos: el servidor anota el nombre en crudo y quien lo
 * lee lo ve en su idioma. Si algún día se registra una acción que el catálogo
 * todavía no conoce, se enseña el nombre tal cual en lugar de dejar el hueco
 * en blanco.
 */
function AuditoriaSection() {
  const t = useTranslations('auditoria');
  const idioma = useLocale();
  const [entradas, setEntradas] = useState<EntradaAuditoria[]>([]);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Cambiar de página antes de que vuelva la anterior dejaría pintada la
    // respuesta que llegue la última, que no tiene por qué ser la pedida.
    let vigente = true;
    setIsLoading(true);
    adminApi
      .auditoria(pagina)
      .then(({ data }) => {
        if (!vigente) return;
        setEntradas(data.datos ?? []);
        setPaginas(data.paginas ?? 1);
      })
      .catch(() => {
        if (vigente) toast.error(t('error'));
      })
      .finally(() => {
        if (vigente) setIsLoading(false);
      });

    return () => {
      vigente = false;
    };
  }, [pagina, t]);

  const traducir = (clave: string) =>
    t.has(clave as never) ? t(clave as never) : clave;

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-secundario">{t('ayuda')}</p>

      <div className="overflow-x-auto" tabIndex={0}>
        <table className="min-w-full text-sm" aria-label={t('lista')}>
          <thead className="bg-fondo text-secundario">
            <tr>
              <th className="text-start px-3 py-2 font-medium">
                {t('cuando')}
              </th>
              <th className="text-start px-3 py-2 font-medium">{t('quien')}</th>
              <th className="text-start px-3 py-2 font-medium">
                {t('accion')}
              </th>
              <th className="text-start px-3 py-2 font-medium">
                {t('detalle')}
              </th>
            </tr>
          </thead>
          <tbody>
            {entradas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-tenue">
                  {t('sinEntradas')}
                </td>
              </tr>
            )}
            {entradas.map((entrada) => (
              <tr key={entrada.id} className="border-t border-borde align-top">
                {/* La hora importa tanto como el día: dos moderaciones
                    seguidas sobre la misma cuenta solo se distinguen así. */}
                <td className="px-3 py-2 whitespace-nowrap text-secundario">
                  {new Date(entrada.createdAt).toLocaleString(idioma, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="px-3 py-2 text-principal">
                  {entrada.actorEmail}
                </td>
                <td className="px-3 py-2 font-medium text-principal">
                  {traducir(entrada.accion)}
                </td>
                <td className="px-3 py-2">
                  {entrada.contexto &&
                  Object.keys(entrada.contexto).length > 0 ? (
                    <ul className="space-y-0.5">
                      {Object.entries(entrada.contexto).map(
                        ([campo, valor]) => (
                          <li key={campo} className="break-words">
                            <span className="text-tenue">
                              {traducir(`campo_${campo}`)}:{' '}
                            </span>
                            <span className="text-secundario">{valor}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <span className="text-tenue">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={pagina} totalPages={paginas} onChange={setPagina} />
    </div>
  );
}
