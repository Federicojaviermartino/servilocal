'use client';
import { useState, useEffect, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { usersApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Input from '@/components/atoms/Input';
import Button from '@/components/atoms/Button';
import Avatar from '@/components/atoms/Avatar';
import Spinner from '@/components/atoms/Spinner';

export default function ProfilePage() {
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
      toast.success('Perfil actualizado');
    } catch {
      toast.error('No se ha podido actualizar el perfil');
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
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Mi perfil</h1>
      <div className="bg-white rounded-lg shadow-card p-6">
        <div className="flex items-center gap-4 mb-6">
          <Avatar name={`${form.firstName} ${form.lastName}`} size="lg" />
          <div>
            <p className="font-semibold text-neutral-900">
              {form.firstName} {form.lastName}
            </p>
            <p className="text-sm text-neutral-600">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nombre"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
            />
            <Input
              label="Apellidos"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
            />
          </div>
          <Input
            label="Telefono"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Biografia
            </label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Cuentanos sobre ti..."
            />
          </div>
          <Input
            label="Direccion"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Ciudad"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <Input
              label="Codigo postal"
              value={form.postalCode}
              onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" isLoading={isSubmitting}>
              Guardar cambios
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
