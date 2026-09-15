'use client';
import { useState, useEffect, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { usersApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Input from '@/components/atoms/Input';
import Button from '@/components/atoms/Button';
import Avatar from '@/components/atoms/Avatar';
import Spinner from '@/components/atoms/Spinner';

export default function ProfilePage() {
  const t = useTranslations('perfilPanel');
  const tAcceso = useTranslations('acceso');
  const tComun = useTranslations('comun');
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
    if (!user) return;
    usersApi
      .getById(user.id)
      .then((res) => {
        const d = res.data;
        setForm({
          firstName: d.firstName || '',
          lastName: d.lastName || '',
          phone: d.phone || '',
          bio: d.bio || '',
          address: d.address || '',
          city: d.city || '',
          postalCode: d.postalCode || '',
        });
      })
      .finally(() => setIsLoading(false));
  }, [user]);

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

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-principal mb-6">{t('titulo')}</h1>
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
    </div>
  );
}
