'use client';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Service } from '@/types';
import { servicesApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Button from '@/components/atoms/Button';
import Badge from '@/components/atoms/Badge';
import Spinner from '@/components/atoms/Spinner';
import ServiceForm from '@/components/organisms/ServiceForm';

export default function ProviderServicesPage() {
  const { user } = useAuthStore();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const load = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data } = await servicesApi.getByProvider(user.id);
      setServices(data || []);
    } catch {
      setServices([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user]);

  const handleCreate = async (data: Record<string, unknown>) => {
    setIsSubmitting(true);
    try {
      await servicesApi.create(data);
      toast.success('Servicio creado');
      setIsCreating(false);
      load();
    } catch {
      toast.error('No se ha podido crear el servicio');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (!editing) return;
    setIsSubmitting(true);
    try {
      await servicesApi.update(editing.id, data);
      toast.success('Servicio actualizado');
      setEditing(null);
      load();
    } catch {
      toast.error('No se ha podido actualizar el servicio');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Quieres eliminar este servicio? No se podra deshacer.')) return;
    try {
      await servicesApi.remove(id);
      toast.success('Servicio eliminado');
      load();
    } catch {
      toast.error('No se ha podido eliminar');
    }
  };

  if (isCreating) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-6">
          Nuevo servicio
        </h1>
        <div className="bg-white rounded-lg shadow-card p-6">
          <ServiceForm
            onSubmit={handleCreate}
            onCancel={() => setIsCreating(false)}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-6">
          Editar servicio
        </h1>
        <div className="bg-white rounded-lg shadow-card p-6">
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
        <h1 className="text-2xl font-bold text-neutral-900">Mis servicios</h1>
        <Button onClick={() => setIsCreating(true)}>
          <Plus size={18} className="inline mr-1" />
          Nuevo servicio
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" />
        </div>
      ) : services.length === 0 ? (
        <div className="bg-white rounded-lg shadow-card p-10 text-center">
          <p className="text-neutral-600">
            Aun no has publicado ningun servicio.
          </p>
          <p className="text-sm text-neutral-500 mt-2">
            Crea tu primer servicio para empezar a recibir reservas.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-lg shadow-card p-5 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-neutral-900 truncate">
                    {s.title}
                  </h3>
                  <Badge variant={s.isActive ? 'success' : 'default'}>
                    {s.isActive ? 'Activo' : 'Pausado'}
                  </Badge>
                </div>
                <p className="text-sm text-neutral-600 line-clamp-2">
                  {s.description}
                </p>
                <div className="mt-2 flex items-center gap-4 text-sm text-neutral-600">
                  <span>{s.city}</span>
                  <span>Desde {s.priceMin} euros</span>
                  <span>
                    {s.totalReviews} valoraciones (
                    {(s.averageRating || 0).toFixed(1)})
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(s)}
                  className="p-2 rounded-md hover:bg-neutral-100 text-neutral-600"
                  aria-label="Editar"
                >
                  <Pencil size={18} />
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="p-2 rounded-md hover:bg-danger-50 text-danger-600"
                  aria-label="Eliminar"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
