import type { Metadata } from 'next';
import { useLocale, useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { alternativas } from '@/lib/seo';
import { direccionDe, type Idioma } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';

// Heredaba la canónica de la portada, así que un buscador la tomaba por
// un duplicado de ella y no la indexaba, aunque el sitemap la publicara.
// El texto legal está en castellano, pero el título y la descripción van
// en el idioma de la página.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: t('privacidadTitulo'),
    description: t('privacidadDescripcion'),
    alternates: alternativas(locale, '/privacy'),
  };
}

// El mismo que SECURITY.md. Ejercer un derecho no puede obligar a hacerlo
// en público, que es lo que pasaba cuando el único canal era el repositorio.
const CONTACTO = 'federicojaviermartino@gmail.com';

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
      'Mostrar tu perfil a la otra parte de una reserva y calcular distancias. Si ofreces servicios, una parte es pública: lo explica el apartado «Qué ve cualquier visitante».',
  },
  {
    categoria: 'Datos de uso',
    detalle: 'Reservas, valoraciones y mensajes intercambiados.',
    finalidad: 'Prestar el servicio y resolver incidencias.',
  },
  {
    categoria: 'Datos de pago',
    detalle:
      'Identificadores de la operación. Los datos de la tarjeta los trata Stripe, nunca ServiLocal: Stripe guarda tu tarjeta en una ficha de cliente para poder renovar la retención cuando la reserva es para dentro de más de una semana.',
    finalidad:
      'Procesar el cobro de la reserva y mantener la retención hasta que el trabajo se completa.',
  },
  {
    categoria: 'Constancia de aceptación',
    detalle:
      'La fecha en que aceptaste los términos y esta política al registrarte, y la versión que aceptaste.',
    finalidad: 'Poder acreditar que diste tu conformidad, y a qué texto.',
  },
  {
    categoria: 'Recuperación de la contraseña',
    detalle:
      'Tu correo, cuando pides un enlace para elegir contraseña nueva. Del enlace guardamos solo una huella, y caduca en una hora.',
    finalidad: 'Enviarte ese enlace.',
  },
  {
    categoria: 'Consultas al asistente',
    detalle:
      'El texto que escribes en el asistente de búsqueda, que puede usarse sin cuenta. No conservamos ese texto: de cada consulta guardamos únicamente contadores agregados de uso y coste, sin vincularlos a ninguna persona.',
    finalidad:
      'Interpretar lo que necesitas y traducirlo a filtros de búsqueda sobre nuestro propio catálogo.',
  },
  {
    categoria: 'Historial de moderación',
    detalle:
      'Cuando la administración desactiva o reactiva una cuenta, retira una valoración o un servicio, descarta una denuncia o actúa sobre una reserva o un pago ajenos, anotamos quién lo hizo, cuándo y sobre qué. De una cuenta se anota su correo; de una valoración retirada, la nota y el comienzo del texto.',
    finalidad:
      'Poder explicar cada decisión de moderación y responder de ella.',
  },
  {
    categoria: 'Datos técnicos de errores',
    detalle:
      'Cuando algo falla, la traza del error y datos técnicos de la petición.',
    finalidad: 'Detectar y corregir fallos de la plataforma.',
  },
];

const derechos = [
  'Acceder a los datos que tratamos sobre ti, y llevártelos en un formato legible: desde tu perfil puedes descargarlos todos en un fichero.',
  'Rectificar los que sean inexactos, también desde tu perfil.',
  'Suprimirlos: desde tu perfil puedes eliminar tu cuenta.',
  'Limitar u oponerte a determinados tratamientos.',
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
        Última actualización: 29 de septiembre de 2026
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
          proyecto. Para cualquier cuestión sobre esta política o sobre tus
          datos, escribe a{' '}
          <a href={`mailto:${CONTACTO}`} className="text-acento underline">
            {CONTACTO}
          </a>
          .
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
        <h2 className="text-lg font-semibold text-principal">
          Qué ve cualquier visitante
        </h2>
        <p className="mt-3 text-secundario">
          Una parte de lo que publicas la puede ver cualquiera, tenga cuenta o
          no. Si ofreces servicios, tu nombre y apellidos, tu ciudad, tu
          biografía y tu foto, y de cada servicio su título, su descripción, sus
          precios, sus fotos, su ciudad y un punto en el mapa, que se calcula a
          partir de la ciudad y no de tu dirección. Si valoras un servicio, tu
          nombre con la inicial del apellido, tu foto, la nota y el comentario,
          junto con la respuesta del profesional.
        </p>
        <p className="mt-3 text-secundario">
          La dirección de referencia de un servicio solo la ve quien lo publica.
          Tu correo, tu teléfono y tu dirección no se publican nunca.
        </p>
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
          nuestra y solo para lo que se indica: Render, que aloja la aplicación
          en Fráncfort (Alemania); Neon, que aloja la base de datos; Stripe para
          los pagos; Brevo para enviar los correos de recuperación de la
          contraseña; Anthropic para interpretar las consultas del asistente de
          búsqueda, y Sentry para el registro de errores. No vendemos datos
          personales ni los cedemos con fines publicitarios.
        </p>
        <p className="mt-3 text-secundario">
          Además, las visitas a la aplicación pasan por Cloudflare, que Render
          usa para entregarlas y protegerlas, y al abrir el mapa del buscador tu
          navegador descarga las imágenes del mapa directamente de
          OpenStreetMap. Los dos reciben tu dirección IP, como cualquier sitio
          del que tu navegador descarga algo.
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
          Stripe, Anthropic, Sentry y Cloudflare pueden tratar datos fuera del
          Espacio Económico Europeo, y Neon también, según la región en que se
          aloje la base de datos. OpenStreetMap está en el Reino Unido, que la
          Comisión Europea reconoce con un nivel de protección adecuado. Esas
          transferencias se amparan en las cláusulas contractuales tipo
          aprobadas por la Comisión Europea. Puedes evitar por completo la de
          Anthropic sin perder el servicio: el buscador con filtros no usa el
          asistente.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">
          Cuánto tiempo los conservamos
        </h2>
        <p className="mt-3 text-secundario">
          Mientras tu cuenta esté activa. Si la eliminas, borramos tus datos
          personales y la tarjeta que Stripe tenga guardada. Tus reservas, pagos
          y valoraciones se conservan sin tu nombre, porque forman parte del
          historial de otras personas y los pagos deben conservarse durante los
          plazos que fija la normativa fiscal y de consumo; tus mensajes siguen
          en las conversaciones de la otra parte, también sin tu nombre. El
          historial de moderación también se conserva, porque explica decisiones
          que tomó la administración, pero tu correo desaparece de él.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">
          Almacenamiento en tu navegador
        </h2>
        <p className="mt-3 text-secundario">
          Tu sesión va en una cookie propia que solo lee el servidor: el código
          de la página no puede acceder a ella, y se borra al cerrar sesión.
          Otra cookie recuerda el idioma que elegiste. En el almacenamiento
          local del navegador guardamos tu preferencia de tema y tu nombre y tu
          papel en la plataforma, para mostrarlos, pero no el acceso a tu
          cuenta. Si la sesión caduca mientras escribes una reserva, un mensaje,
          una valoración, un servicio o tu perfil, lo escrito se guarda en el
          almacenamiento de esa pestaña para recuperarlo cuando vuelvas a
          entrar: no sale de tu navegador, y se borra al recuperarlo o al cerrar
          la pestaña. Todo ello es necesario para el funcionamiento que pides;
          no utilizamos cookies publicitarias ni de seguimiento, y por eso no te
          pedimos consentimiento para ninguna.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-principal">Tus derechos</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-secundario">
          {derechos.map((derecho) => (
            <li key={derecho}>{derecho}</li>
          ))}
        </ul>
        <p className="mt-3 text-secundario">
          Para lo que no puedas hacer desde tu perfil, escribe a{' '}
          <a href={`mailto:${CONTACTO}`} className="text-acento underline">
            {CONTACTO}
          </a>
          .
        </p>
      </section>

      <p className="mt-10 text-sm text-secundario">
        Consulta también los{' '}
        <Link href="/terms" className="text-acento underline">
          términos de uso
        </Link>
        .
      </p>
    </article>
  );
}
