import type { Metadata } from 'next';
import { useLocale, useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { alternativas, grafoAbierto } from '@/lib/seo';
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
    title: t('terminosTitulo'),
    description: t('terminosDescripcion'),
    alternates: alternativas(locale, '/terms'),
    openGraph: grafoAbierto(locale, {
      titulo: t('terminosTitulo'),
      descripcion: t('terminosDescripcion'),
      ruta: '/terms',
    }),
  };
}

const secciones = [
  {
    titulo: '1. Objeto',
    parrafos: [
      'Estas condiciones regulan el acceso y el uso de ServiLocal, una plataforma que pone en contacto a personas que buscan un servicio del hogar con profesionales que lo ofrecen. Al registrarte y utilizar la plataforma aceptas estas condiciones.',
    ],
  },
  {
    titulo: '2. Papel de ServiLocal',
    parrafos: [
      'ServiLocal actúa exclusivamente como intermediario tecnológico. No presta los servicios anunciados ni forma parte del contrato que se establece entre el cliente y el profesional. La calidad, la legalidad y la ejecución del trabajo son responsabilidad del profesional que lo realiza.',
      'ServiLocal no verifica de forma exhaustiva la titulación, los seguros ni las licencias de los profesionales registrados. Te recomendamos comprobarlos antes de contratar.',
    ],
  },
  {
    titulo: '3. Cuentas de usuario',
    parrafos: [
      'Debes ser mayor de edad y facilitar información veraz. Eres responsable de la confidencialidad de tus credenciales y de la actividad que se realice desde tu cuenta.',
      'Podemos suspender o desactivar cuentas que incumplan estas condiciones, que publiquen contenido fraudulento o que perjudiquen a otros usuarios.',
      'Puedes eliminar tu cuenta cuando quieras desde tu perfil, siempre que no tengas reservas pendientes o confirmadas: antes hay que cancelarlas o completarlas. Las cuentas de demostración son compartidas: no se pueden eliminar ni se les puede cambiar la contraseña, y lo que se cambie con ellas en servicios, perfiles o valoraciones se deshace al cabo de una hora.',
    ],
  },
  {
    titulo: '4. Publicación de servicios',
    parrafos: [
      'El profesional es el único responsable de la información que publica: descripción, precios, disponibilidad y zona de cobertura. No se permite publicar servicios ilegales, engañosos ni ajenos a la actividad declarada.',
    ],
  },
  {
    titulo: '5. Reservas y pagos',
    parrafos: [
      'Una reserva se considera confirmada cuando el profesional la acepta. El importe se fija al reservar, dentro de la horquilla que publica el servicio, y no puede ser inferior a 0,50 euros. Solo se reserva para una fecha futura, con hasta un año de antelación.',
      'Al pagar, el importe se retiene en tu tarjeta, pero no se cobra: el cobro se hace cuando el profesional da el trabajo por terminado, lo que solo puede ocurrir a partir de la fecha de la reserva. Si la reserva se cancela o se rechaza, la retención se libera y no se cobra nada.',
      'Si el profesional da por terminado un trabajo sin que haya un importe retenido, puede completarlo sin cobro; en ese caso el cliente puede pagarlo después, y el cobro es inmediato.',
      'Los pagos se procesan mediante Stripe. ServiLocal no almacena los datos de tu tarjeta: Stripe la guarda en una ficha de cliente para poder renovar la retención cuando la reserva es para dentro de más de una semana, y se borra si eliminas tu cuenta. Si no se puede renovar, te pediremos que vuelvas a autorizar el pago.',
    ],
  },
  {
    titulo: '6. Valoraciones',
    parrafos: [
      'Solo puede valorar un servicio quien lo ha contratado y completado a través de la plataforma. Las valoraciones deben ser veraces y respetuosas. Se retirará el contenido injurioso, difamatorio o manifiestamente falso.',
    ],
  },
  {
    titulo: '7. Conducta prohibida',
    parrafos: [
      'No está permitido suplantar identidades, extraer datos de forma automatizada, eludir el sistema de pagos de la plataforma para operaciones iniciadas en ella, ni utilizar la mensajería para enviar publicidad no solicitada.',
    ],
  },
  {
    titulo: '8. Limitación de responsabilidad',
    parrafos: [
      'La plataforma se ofrece tal cual, sin garantía de disponibilidad ininterrumpida. ServiLocal no responde de los daños derivados de la relación contractual entre cliente y profesional, sin perjuicio de las responsabilidades que la normativa aplicable imponga con carácter imperativo.',
    ],
  },
  {
    titulo: '9. Modificaciones',
    parrafos: [
      'Podemos actualizar estas condiciones. Si el cambio es sustancial, lo avisaremos con antelación razonable. El uso continuado de la plataforma tras la entrada en vigor implica su aceptación.',
    ],
  },
  {
    titulo: '10. Ley aplicable',
    parrafos: [
      'Estas condiciones se rigen por la legislación española. Para cualquier controversia, las partes se someten a los juzgados y tribunales que correspondan conforme a la normativa de consumo.',
    ],
  },
];

/**
 * Con el idioma fijado aquí, la página se genera al compilar. Sin él,
 * next-intl lo leía de la petición y cada visita la volvía a pintar, sin
 * caché.
 */
export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Terminos />;
}

function Terminos() {
  // El articulado solo existe en español: traducirlo cambiaría su alcance
  // jurídico, así que se avisa en el idioma del visitante.
  const tLegal = useTranslations('legal');
  const idiomaActual = useLocale();

  return (
    // El texto está en español: se declara así para que no herede la
    // dirección del documento cuando el visitante navega en árabe.
    <article className="mx-auto max-w-3xl px-4 py-12" lang="es" dir="ltr">
      <h1 className="text-3xl font-bold text-principal">Términos de uso</h1>
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
        ServiLocal es un proyecto académico en fase de demostración. Los pagos
        se ejecutan en el entorno de pruebas de Stripe y no generan cargos
        reales. Este texto es informativo y no sustituye al asesoramiento
        jurídico de una explotación comercial.
      </div>

      {secciones.map((seccion) => (
        <section key={seccion.titulo} className="mt-8">
          <h2 className="text-lg font-semibold text-principal">
            {seccion.titulo}
          </h2>
          {seccion.parrafos.map((parrafo) => (
            <p key={parrafo} className="mt-3 text-secundario">
              {parrafo}
            </p>
          ))}
        </section>
      ))}

      <p className="mt-10 text-sm text-secundario">
        Consulta también la{' '}
        <Link href="/privacy" className="text-acento hover:underline">
          política de privacidad
        </Link>
        .
      </p>
    </article>
  );
}
