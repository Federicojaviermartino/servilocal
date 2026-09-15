import type { Metadata } from 'next';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export const metadata: Metadata = {
  title: 'Términos de uso',
  description:
    'Condiciones que regulan el uso de ServiLocal por parte de clientes y profesionales.',
};

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
      'Una reserva se considera confirmada cuando el profesional la acepta. El importe acordado puede ajustarse tras hablar con el profesional, antes de que se confirme.',
      'Los pagos se procesan mediante Stripe. ServiLocal no almacena los datos de tu tarjeta en ningún momento. Las cancelaciones y devoluciones se gestionan entre las partes conforme a lo pactado.',
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

export default function TermsPage() {
  // El articulado solo existe en español: traducirlo cambiaría su alcance
  // jurídico, así que se avisa en el idioma del visitante.
  const tLegal = useTranslations('legal');
  const idiomaActual = useLocale();

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-principal">Términos de uso</h1>
      <p className="mt-2 text-sm text-tenue">
        Última actualización: septiembre de 2026
      </p>
      {idiomaActual !== 'es' && (
        <p
          className="mt-4 rounded-lg border border-borde bg-superficie-alt p-3 text-sm text-secundario"
          lang={idiomaActual}
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
        <Link href="/privacy" className="text-primary-600 hover:underline">
          política de privacidad
        </Link>
        .
      </p>
    </article>
  );
}
