import type { Metadata } from 'next';
import { useLocale, useTranslations } from 'next-intl';
import { direccionDe, type Idioma } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Qué datos personales trata ServiLocal, con qué finalidad y cómo puedes ejercer tus derechos.',
};

const datos = [
  {
    categoria: 'Datos de cuenta',
    detalle: 'Nombre, apellidos, correo electrónico y contraseña cifrada.',
    finalidad: 'Crear y mantener tu cuenta, y autenticarte.',
  },
  {
    categoria: 'Datos de perfil',
    detalle:
      'Teléfono, biografía, dirección, ciudad y código postal, si decides facilitarlos.',
    finalidad:
      'Mostrar tu perfil a la otra parte de una reserva y calcular distancias.',
  },
  {
    categoria: 'Datos de uso',
    detalle: 'Reservas, valoraciones y mensajes intercambiados.',
    finalidad: 'Prestar el servicio y resolver incidencias.',
  },
  {
    categoria: 'Datos de pago',
    detalle:
      'Identificadores de la operación. Los datos de la tarjeta los trata Stripe, nunca ServiLocal.',
    finalidad: 'Procesar el cobro de la reserva.',
  },
  {
    categoria: 'Consultas al asistente',
    detalle:
      'El texto que escribes en el asistente de búsqueda, que puede usarse sin cuenta. No conservamos ese texto: de cada consulta guardamos únicamente contadores agregados de uso y coste, sin vincularlos a ninguna persona.',
    finalidad:
      'Interpretar lo que necesitas y traducirlo a filtros de búsqueda sobre nuestro propio catálogo.',
  },
  {
    categoria: 'Datos técnicos de errores',
    detalle:
      'Cuando algo falla, la traza del error y datos técnicos de la petición.',
    finalidad: 'Detectar y corregir fallos de la plataforma.',
  },
];

const derechos = [
  'Acceder a los datos que tratamos sobre ti.',
  'Rectificar los que sean inexactos.',
  'Solicitar su supresión cuando ya no sean necesarios.',
  'Limitar u oponerte a determinados tratamientos.',
  'Solicitar la portabilidad de tus datos en un formato legible.',
  'Presentar una reclamación ante la Agencia Española de Protección de Datos.',
];

export default function PrivacyPage() {
  // El texto solo existe en español: traducirlo cambiaría su alcance
  // jurídico, así que se avisa en el idioma del visitante.
  const tLegal = useTranslations('legal');
  const idiomaActual = useLocale();

  return (
    // El texto está en español: se declara así para que no herede la
    // dirección del documento cuando el visitante navega en árabe.
    <article className="mx-auto max-w-3xl px-4 py-12" lang="es" dir="ltr">
      <h1 className="text-3xl font-bold text-principal">
        Política de privacidad
      </h1>
      <p className="mt-2 text-sm text-tenue">
        Última actualización: septiembre de 2026
      </p>
      {idiomaActual !== 'es' && (
        <p
          className="mt-4 rounded-lg border border-borde bg-superficie-alt p-3 text-sm text-secundario"
          lang={idiomaActual}
          dir={direccionDe(idiomaActual as Idioma)}
        >
          {tLegal('avisoIdioma')}
        </p>
      )}

      <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
        ServiLocal es un proyecto académico en fase de demostración. Te
        recomendamos no introducir datos personales reales que no quieras
        compartir en un entorno de pruebas.
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">
          Quién trata tus datos
        </h2>
        <p className="mt-3 text-secundario">
          El responsable del tratamiento es Federico Javier Martino, autor del
          proyecto. Puedes contactar a través del repositorio público del
          proyecto para cualquier cuestión relativa a esta política.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">
          Qué datos tratamos y para qué
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-borde text-tenue">
                <th className="py-2 pr-4 font-medium">Categoría</th>
                <th className="py-2 pr-4 font-medium">Detalle</th>
                <th className="py-2 font-medium">Finalidad</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((fila) => (
                <tr
                  key={fila.categoria}
                  className="border-b border-borde align-top"
                >
                  <td className="py-3 pr-4 font-medium text-principal">
                    {fila.categoria}
                  </td>
                  <td className="py-3 pr-4 text-secundario">{fila.detalle}</td>
                  <td className="py-3 text-secundario">{fila.finalidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">Base legal</h2>
        <p className="mt-3 text-secundario">
          Tratamos tus datos para ejecutar el contrato que aceptas al usar la
          plataforma, para cumplir obligaciones legales en materia fiscal y de
          consumo, y sobre la base de nuestro interés legítimo en prevenir el
          fraude y el abuso.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">
          Con quién los compartimos
        </h2>
        <p className="mt-3 text-secundario">
          Con la otra parte de una reserva, en la medida necesaria para
          prestarla, y con estos proveedores, que tratan los datos por cuenta
          nuestra y solo para lo que se indica: Stripe para los pagos, Anthropic
          para interpretar las consultas del asistente de búsqueda, y Sentry
          para el registro de errores. No vendemos datos personales ni los
          cedemos con fines publicitarios.
        </p>
        <p className="mt-3 text-secundario">
          Al asistente de búsqueda solo viaja el texto que escribes, junto con
          nuestra lista de categorías y ciudades. No se envía tu nombre, tu
          correo ni ningún identificador de tu cuenta, y el proveedor no decide
          qué profesionales ves: esa consulta la resuelve ServiLocal contra su
          propia base de datos.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">
          Transferencias internacionales
        </h2>
        <p className="mt-3 text-secundario">
          Anthropic y Sentry pueden tratar datos fuera del Espacio Económico
          Europeo. Esas transferencias se amparan en las cláusulas contractuales
          tipo aprobadas por la Comisión Europea. Puedes evitar por completo la
          primera sin perder el servicio: el buscador con filtros no usa el
          asistente.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">
          Cuánto tiempo los conservamos
        </h2>
        <p className="mt-3 text-secundario">
          Mientras tu cuenta esté activa y, después, durante los plazos de
          prescripción legal aplicables a las obligaciones contables y de
          consumo. Transcurridos esos plazos, los suprimimos o anonimizamos.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">
          Almacenamiento en tu navegador
        </h2>
        <p className="mt-3 text-secundario">
          Para mantener tu sesión iniciada guardamos un token de acceso en el
          almacenamiento local de tu navegador. No utilizamos cookies
          publicitarias ni de seguimiento de terceros. Al cerrar sesión, ese
          token se elimina.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">Tus derechos</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-secundario">
          {derechos.map((derecho) => (
            <li key={derecho}>{derecho}</li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-sm text-secundario">
        Consulta también los{' '}
        <Link href="/terms" className="text-primary-600 hover:underline">
          términos de uso
        </Link>
        .
      </p>
    </article>
  );
}
