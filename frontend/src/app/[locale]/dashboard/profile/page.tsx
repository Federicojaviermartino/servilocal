'use client';
import { useState, FormEvent } from 'react';
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
  const { user } = useAuthStore();

  // Esta carga no tenía catch. Si fallaba, el formulario se quedaba con los
  // campos en blanco y con aspecto de estar listo; al guardar se enviaba el
  // teléfono, la biografía y la dirección vacíos, y el usuario perdía sus
  // propios datos sin haber tocado nada.
  const { datos, estado, reintentar } = useCarga<Perfil>(
    () => usersApi.getById(user!.id),
    [user?.id],
  );

  if (!user) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-principal mb-6">{t('titulo')}</h1>
      <EstadoCarga estado={estado} onReintentar={reintentar}>
        {datos && <FormularioPerfil perfil={datos} email={user.email} />}
      </EstadoCarga>
    </div>
  );
}

/**
 * El formulario solo existe cuando el perfil ya ha llegado, y parte de él.
 *
 * Antes vivía en la misma pantalla que la carga, empezaba en blanco y un
 * efecto le copiaba los datos al llegar: un render con los campos vacíos y
 * otro con los buenos. Así nace ya relleno.
 */
function FormularioPerfil({
  perfil,
  email,
}: {
  perfil: Perfil;
  email: string;
}) {
  const t = useTranslations('perfilPanel');
  const tAcceso = useTranslations('acceso');
  const tComun = useTranslations('comun');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(() => ({
    firstName: perfil.firstName || '',
    lastName: perfil.lastName || '',
    phone: perfil.phone || '',
    bio: perfil.bio || '',
    address: perfil.address || '',
    city: perfil.city || '',
    postalCode: perfil.postalCode || '',
  }));

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

  return (
    <div className="bg-superficie rounded-lg shadow-card p-6">
      <div className="flex items-center gap-4 mb-6">
        <Avatar name={`${form.firstName} ${form.lastName}`} size="lg" />
        <div>
          <p className="font-semibold text-principal">
            {form.firstName} {form.lastName}
          </p>
          <p className="text-sm text-secundario">{email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={tAcceso('nombre')}
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
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
            onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
          />
        </div>
        <div className="flex justify-end pt-2">
          <Button type="submit" isLoading={isSubmitting}>
            {t('guardar')}
          </Button>
        </div>
      </form>
    </div>
  );
}
