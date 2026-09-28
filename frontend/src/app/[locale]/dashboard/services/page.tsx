'use client';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Service } from '@/types';
import { servicesApi } from '@/lib/api';
import { useAvisoDeFallo } from '@/lib/aviso-de-fallo';
import { useBorrador } from '@/lib/borrador';
import { useAuthStore } from '@/lib/auth-store';
import Button from '@/components/atoms/Button';
import Badge from '@/components/atoms/Badge';
import EstadoCarga from '@/components/molecules/EstadoCarga';
import { useCarga } from '@/lib/carga';
import { usePrecioServicio } from '@/lib/importes';
import ServiceForm from '@/components/organisms/ServiceForm';

/** Lo que se estaba escribiendo, y de qué servicio si se editaba uno. */
interface BorradorServicio {
  servicio: Service | null;
  datos: Partial<Service>;
}

export default function ProviderServicesPage() {
  const t = useTranslations('serviciosPanel');
  const tEstados = useTranslations('estados');
  const tComun = useTranslations('comun');
  const avisarFallo = useAvisoDeFallo();
  const precio = usePrecioServicio();
  const formato = useFormatter();
  const { user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Si la sesión caducó a mitad, se vuelve al mismo formulario con lo que
  // se había escrito.
  const borrador = useBorrador<BorradorServicio>('servicio');
  const recuperado = borrador.recuperado;
  const [editing, setEditing] = useState<Service | null>(() =>
    recuperado?.servicio
      ? ({ ...recuperado.servicio, ...recuperado.datos } as Service)
      : null,
  );
  const [isCreating, setIsCreating] = useState(
    () => !!recuperado && !recuperado.servicio,
  );
  const [inicialNuevo, setInicialNuevo] = useState<
    Partial<Service> | undefined
  >(() => (recuperado && !recuperado.servicio ? recuperado.datos : undefined));

  // El panel no se pinta sin usuario, pero se comprueba igual: sin él, pedir
  // los servicios fallaría dentro del efecto en lugar de en la promesa.
  const { datos, estado, reintentar, referencia } = useCarga<Service[]>(
    () =>
      user
        ? servicesApi.getByProvider(user.id)
        : Promise.reject(new Error('sin usuario')),
    [user?.id],
  );
  const services = datos ?? [];

  const handleCreate = async (data: Record<string, unknown>) => {
    setIsSubmitting(true);
    try {
      await servicesApi.create(data);
      toast.success(t('creado'));
      setIsCreating(false);
      setInicialNuevo(undefined);
      reintentar();
    } catch (error) {
      avisarFallo(error, t('errorCrear'), () =>
        borrador.guardar({ servicio: null, datos: data as Partial<Service> }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (!editing) return;
    setIsSubmitting(true);
    try {
      await servicesApi.update(editing.id, data);
      toast.success(t('actualizado'));
      setEditing(null);
      reintentar();
    } catch (error) {
      avisarFallo(error, t('errorActualizar'), () =>
        borrador.guardar({
          servicio: editing,
          datos: data as Partial<Service>,
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmarEliminar'))) return;
    try {
      await servicesApi.remove(id);
      toast.success(t('eliminado'));
      reintentar();
    } catch (error) {
      // Con reservas abiertas no se elimina: se dice por qué.
      avisarFallo(error, t('errorEliminar'));
    }
  };

  if (isCreating) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-principal mb-6">{t('nuevo')}</h1>
        {inicialNuevo && (
          <p role="status" className="mb-4 text-sm text-secundario">
            {tComun('borradorRecuperado')}
          </p>
        )}
        <div className="bg-superficie rounded-lg shadow-card p-6">
          <ServiceForm
            initial={inicialNuevo}
            onSubmit={handleCreate}
            onCancel={() => {
              setIsCreating(false);
              setInicialNuevo(undefined);
            }}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-principal mb-6">
          {t('editar')}
        </h1>
        {recuperado?.servicio?.id === editing.id && (
          <p role="status" className="mb-4 text-sm text-secundario">
            {tComun('borradorRecuperado')}
          </p>
        )}
        <div className="bg-superficie rounded-lg shadow-card p-6">
          <ServiceForm
            initial={editing}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-principal">{t('titulo')}</h1>
        <Button onClick={() => setIsCreating(true)}>
          <Plus size={18} className="inline me-1" />
          {t('nuevo')}
        </Button>
      </div>

      <EstadoCarga
        estado={estado}
        onReintentar={reintentar}
        referencia={referencia}
      >
        {services.length === 0 ? (
          <div className="bg-superficie rounded-lg shadow-card p-10 text-center">
            <p className="text-secundario">{t('sinServicios')}</p>
            <p className="text-sm text-tenue mt-2">{t('sinServiciosPista')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {services.map((s) => (
              <div
                key={s.id}
                className="bg-superficie rounded-lg shadow-card p-5 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-principal truncate">
                      {s.title}
                    </h3>
                    <Badge variant={s.isActive ? 'success' : 'default'}>
                      {s.isActive ? tEstados('activo') : tEstados('pausado')}
                    </Badge>
                  </div>
                  <p className="text-sm text-secundario line-clamp-2">
                    {s.description}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-sm text-secundario">
                    <span>{s.city}</span>
                    {/* Estaban escritos a mano en castellano: en los otros
                        nueve idiomas el profesional veía «Desde 35 euros».
                        El precio sale igual que en la tarjeta pública. */}
                    <span>{precio(s)}</span>
                    <span>
                      {t('resumenValoraciones', { total: s.totalReviews })}
                      {s.totalReviews > 0 &&
                        ` · ${formato.number(s.averageRating || 0, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}`}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(s)}
                    className="p-2 rounded-md hover:bg-superficie-alt text-secundario"
                    aria-label={tComun('editar')}
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-2 rounded-md hover:bg-danger-50 text-danger-600"
                    aria-label={tComun('eliminar')}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </EstadoCarga>
    </div>
  );
}
