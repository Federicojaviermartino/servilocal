'use client';
import { useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { authApi, usersApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { textoDeError } from '@/lib/errores-api';
import { useAvisoDeFallo } from '@/lib/aviso-de-fallo';
import { useBorrador } from '@/lib/borrador';
import { useRouter } from '@/i18n/navigation';
import Input from '@/components/atoms/Input';
import Button from '@/components/atoms/Button';
import Avatar from '@/components/atoms/Avatar';
import EstadoCarga from '@/components/molecules/EstadoCarga';
import { useCarga } from '@/lib/carga';

interface DatosPerfil {
  firstName: string;
  lastName: string;
  phone: string | null;
  bio: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
}

interface Perfil extends DatosPerfil {
  esDemostracion?: boolean;
  soloLectura?: boolean;
}

export default function ProfilePage() {
  const t = useTranslations('perfilPanel');
  const { user } = useAuthStore();

  // Esta carga no tenía catch. Si fallaba, el formulario se quedaba con los
  // campos en blanco y con aspecto de estar listo; al guardar se enviaba el
  // teléfono, la biografía y la dirección vacíos, y el usuario perdía sus
  // propios datos sin haber tocado nada.
  //
  // Y pedía /users/:id, que es de administración: a clientes y
  // profesionales les respondía 403 y el perfil no llegaba a cargar.
  const { datos, estado, reintentar, referencia } = useCarga<Perfil>(
    () => usersApi.getMe(),
    [user?.id],
  );

  if (!user) return null;

  // Compartidas por todos los visitantes: ni se cambia su contraseña ni se
  // eliminan, y la API lo rechazaría igual.
  const compartida = !!(datos?.esDemostracion || datos?.soloLectura);

  return (
    <div>
      <h1 className="text-2xl font-bold text-principal mb-6">{t('titulo')}</h1>
      <EstadoCarga
        estado={estado}
        onReintentar={reintentar}
        referencia={referencia}
      >
        {datos && (
          <div className="space-y-6">
            <FormularioPerfil perfil={datos} email={user.email} />
            {compartida ? (
              <p className="rounded-lg border border-borde bg-superficie p-4 text-sm text-secundario">
                {t('demostracionSinGestion')}
              </p>
            ) : (
              <CambiarContrasena />
            )}
            <DescargarDatos />
            {!compartida && <EliminarCuenta />}
          </div>
        )}
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
  const avisarFallo = useAvisoDeFallo();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Si la sesión caducó al guardar, vuelve lo que se había escrito.
  const borrador = useBorrador<Record<keyof DatosPerfil, string>>('perfil');
  const [form, setForm] = useState(
    () =>
      borrador.recuperado ?? {
        firstName: perfil.firstName || '',
        lastName: perfil.lastName || '',
        phone: perfil.phone || '',
        bio: perfil.bio || '',
        address: perfil.address || '',
        city: perfil.city || '',
        postalCode: perfil.postalCode || '',
      },
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await usersApi.updateProfile(form);
      toast.success(t('actualizado'));
    } catch (error) {
      avisarFallo(error, t('errorActualizar'), () => borrador.guardar(form));
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

      {borrador.recuperado && (
        <p role="status" className="mb-4 text-sm text-secundario">
          {tComun('borradorRecuperado')}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={tAcceso('nombre')}
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            maxLength={100}
            required
          />
          <Input
            label={tAcceso('apellidos')}
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            maxLength={100}
            required
          />
        </div>
        <Input
          label={t('telefono')}
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          maxLength={20}
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
            maxLength={2000}
            className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder={t('biografiaPlaceholder')}
          />
        </div>
        <Input
          label={t('direccion')}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          maxLength={255}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={tComun('ciudad')}
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            maxLength={100}
          />
          <Input
            label={t('codigoPostal')}
            value={form.postalCode}
            onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
            maxLength={10}
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

/**
 * Cambiar la contraseña con la sesión abierta.
 *
 * Pide la actual, y la API cierra las demás sesiones: la de este navegador
 * sigue, porque la respuesta trae una cookie nueva.
 */
function CambiarContrasena() {
  const t = useTranslations('perfilPanel');
  const tValidacion = useTranslations('validacion');
  const tErrores = useTranslations('erroresApi');
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cambiar = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (nueva !== repetida) {
      setError(tValidacion('passwordsNoCoinciden'));
      return;
    }
    setGuardando(true);
    try {
      await authApi.cambiarContrasena(actual, nueva);
      toast.success(t('contrasenaCambiada'));
      setActual('');
      setNueva('');
      setRepetida('');
    } catch (err) {
      setError(textoDeError(err, tErrores, t('errorCambiarContrasena')));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section
      aria-labelledby="perfil-contrasena"
      className="bg-superficie rounded-lg shadow-card p-6"
    >
      <h2
        id="perfil-contrasena"
        className="text-lg font-semibold text-principal mb-4"
      >
        {t('seguridadTitulo')}
      </h2>
      <form onSubmit={cambiar} className="space-y-4">
        {error && (
          <p
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}
        <Input
          label={t('contrasenaActual')}
          type="password"
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          required
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={t('contrasenaNueva')}
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            required
          />
          <Input
            label={t('contrasenaRepetir')}
            type="password"
            autoComplete="new-password"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" isLoading={guardando}>
            {t('cambiarContrasena')}
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Todo lo suyo en un fichero: el derecho de acceso y el de portabilidad. */
function DescargarDatos() {
  const t = useTranslations('perfilPanel');
  const avisarFallo = useAvisoDeFallo();
  const [descargando, setDescargando] = useState(false);

  const descargar = async () => {
    setDescargando(true);
    try {
      const { data } = await usersApi.exportarDatos();
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(data);
      enlace.download = `servilocal-mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
    } catch (error) {
      avisarFallo(error, t('errorDescargar'));
    } finally {
      setDescargando(false);
    }
  };

  return (
    <section
      aria-labelledby="perfil-datos"
      className="bg-superficie rounded-lg shadow-card p-6"
    >
      <h2
        id="perfil-datos"
        className="text-lg font-semibold text-principal mb-2"
      >
        {t('datosTitulo')}
      </h2>
      <p className="text-sm text-secundario mb-4">{t('datosTexto')}</p>
      <Button variant="secondary" onClick={descargar} isLoading={descargando}>
        {t('descargarDatos')}
      </Button>
    </section>
  );
}

/**
 * Eliminar la cuenta, con la contraseña.
 *
 * La API anonimiza lo que tiene que quedarse —las reservas, los pagos y las
 * valoraciones de otras personas— y borra el resto, la tarjeta de Stripe
 * incluida. Con reservas abiertas no deja, y la pantalla dice por qué.
 */
function EliminarCuenta() {
  const t = useTranslations('perfilPanel');
  const tErrores = useTranslations('erroresApi');
  const { logout } = useAuthStore();
  const router = useRouter();
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [eliminando, setEliminando] = useState(false);

  const eliminar = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm(t('eliminarPregunta'))) return;
    setError('');
    setEliminando(true);
    try {
      await usersApi.eliminarCuenta(contrasena);
      toast.success(t('cuentaEliminada'));
      await logout();
      router.push('/');
    } catch (err) {
      setError(textoDeError(err, tErrores, t('errorEliminar')));
      setEliminando(false);
    }
  };

  return (
    <section
      aria-labelledby="perfil-eliminar"
      className="rounded-lg border border-red-200 bg-superficie p-6 dark:border-red-900"
    >
      <h2
        id="perfil-eliminar"
        className="text-lg font-semibold text-principal mb-2"
      >
        {t('eliminarTitulo')}
      </h2>
      <p className="text-sm text-secundario mb-4">{t('eliminarTexto')}</p>
      <form onSubmit={eliminar} className="space-y-4">
        {error && (
          <p
            className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}
        <Input
          label={t('eliminarContrasena')}
          type="password"
          autoComplete="current-password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          required
        />
        <div className="flex justify-end">
          <Button type="submit" variant="danger" isLoading={eliminando}>
            {t('eliminarBoton')}
          </Button>
        </div>
      </form>
    </section>
  );
}
