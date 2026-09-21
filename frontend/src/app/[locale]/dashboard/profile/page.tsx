'use client';
import { useState, useEffect, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { usersApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Input from '@/components/atoms/Input';
import Button from '@/components/atoms/Button';
import Avatar from '@/components/atoms/Avatar';
import EstadoCarga from '@/components/molecules/EstadoCarga';
import { useCarga } from '@/lib/carga';

interface Perfil {
  firstName: string;
  lastName: string;
  phone: string | null;
  bio: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
}

export default function ProfilePage() {
  const t = useTranslations('perfilPanel');
  const tAcceso = useTranslations('acceso');
  const tComun = useTranslations('comun');
  const { user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    bio: '',
    address: '',
    city: '',
    postalCode: '',
  });

  // Esta carga no tenía catch. Si fallaba, el formulario se quedaba con los
  // campos en blanco y con aspecto de estar listo; al guardar se enviaba el
  // teléfono, la biografía y la dirección vacíos, y el usuario perdía sus
  // propios datos sin haber tocado nada.
  const { datos, estado, reintentar } = useCarga<Perfil>(
    () => usersApi.getById(user!.id),
    [user?.id],
  );

  useEffect(() => {
    if (!datos) return;
    setForm({
      firstName: datos.firstName || '',
      lastName: datos.lastName || '',
      phone: datos.phone || '',
      bio: datos.bio || '',
      address: datos.address || '',
      city: datos.city || '',
      postalCode: datos.postalCode || '',
    });
  }, [datos]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await usersApi.updateProfile(form);
      toast.success(t('actualizado'));
    } catch {
      toast.error(t('errorActualizar'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-principal mb-6">{t('titulo')}</h1>
      <EstadoCarga estado={estado} onReintentar={reintentar}>
        <div className="bg-superficie rounded-lg shadow-card p-6">
          <div className="flex items-center gap-4 mb-6">
            <Avatar name={`${form.firstName} ${form.lastName}`} size="lg" />
            <div>
              <p className="font-semibold text-principal">
                {form.firstName} {form.lastName}
              </p>
              <p className="text-sm text-secundario">{user.email}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={tAcceso('nombre')}
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
                required
              />
              <Input
                label={tAcceso('apellidos')}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>
            <Input
              label={t('telefono')}
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <div>
              <label
                htmlFor="perfil-biografia"
                className="block text-sm font-medium text-secundario mb-1"
              >
                {t('biografia')}
              </label>
              <textarea
                id="perfil-biografia"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder={t('biografiaPlaceholder')}
              />
            </div>
            <Input
              label={t('direccion')}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={tComun('ciudad')}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              <Input
                label={t('codigoPostal')}
                value={form.postalCode}
                onChange={(e) =>
                  setForm({ ...form, postalCode: e.target.value })
                }
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" isLoading={isSubmitting}>
                {t('guardar')}
              </Button>
            </div>
          </form>
        </div>
      </EstadoCarga>
    </div>
  );
}
