import type { Metadata } from 'next';
import Link from 'next/link';

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
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-principal">
        Política de privacidad
      </h1>
      <p className="mt-2 text-sm text-tenue">
        Última actualización: septiembre de 2026
      </p>

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
          prestarla, y con Stripe como proveedor de pagos. No vendemos datos
          personales ni los cedemos con fines publicitarios.
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
