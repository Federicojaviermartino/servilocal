import type { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, Shield, Star, Search } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Acerca de',
  description:
    'Qué es ServiLocal, cómo conecta a clientes con profesionales de servicios del hogar y qué tecnología hay detrás.',
};

const pasos = [
  {
    icon: Search,
    titulo: 'Busca',
    texto:
      'Indica qué necesitas y dónde. Filtramos por categoría, ciudad, distancia, valoración y precio máximo.',
  },
  {
    icon: MapPin,
    titulo: 'Compara',
    texto:
      'Consulta perfiles, precios y opiniones verificadas, y sitúa a los profesionales sobre el mapa.',
  },
  {
    icon: Shield,
    titulo: 'Reserva y paga',
    texto:
      'La reserva se confirma con el profesional y el pago se procesa de forma segura a través de Stripe.',
  },
  {
    icon: Star,
    titulo: 'Valora',
    texto:
      'Solo quien ha completado un servicio puede valorarlo, así que las opiniones reflejan trabajos reales.',
  },
];

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-principal">
        Acerca de ServiLocal
      </h1>
      <p className="mt-4 text-lg text-secundario">
        ServiLocal conecta a personas que necesitan un servicio en casa con
        profesionales de su zona: fontanería, electricidad, reformas, limpieza o
        clases particulares, entre otras categorías.
      </p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-principal">Cómo funciona</h2>
        <ol className="mt-4 space-y-4">
          {pasos.map((paso, indice) => {
            const Icono = paso.icon;
            return (
              <li key={paso.titulo} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                  <Icono size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-medium text-principal">
                    {indice + 1}. {paso.titulo}
                  </h3>
                  <p className="mt-1 text-sm text-secundario">{paso.texto}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-principal">
          Para profesionales
        </h2>
        <p className="mt-3 text-secundario">
          Publicar un servicio es gratuito. Defines tu descripción, el rango de
          precios, la unidad de cobro y el radio de cobertura desde tu dirección
          de referencia. A partir de ahí recibes solicitudes de reserva que
          puedes aceptar o rechazar, y gestionas la conversación con el cliente
          desde el propio panel.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-principal">Tecnología</h2>
        <p className="mt-3 text-secundario">
          La plataforma está construida con Next.js y React en el cliente, una
          API REST en NestJS y PostgreSQL con la extensión PostGIS para las
          búsquedas por proximidad. Los pagos se procesan con Stripe y la
          documentación de la API se publica con OpenAPI.
        </p>
      </section>

      <section className="mt-10 rounded-lg bg-superficie-alt p-5">
        <h2 className="text-base font-semibold text-principal">
          Proyecto académico
        </h2>
        <p className="mt-2 text-sm text-secundario">
          ServiLocal es el Trabajo de Fin de Máster de Federico Javier Martino
          en la Universitat Oberta de Catalunya. Es una plataforma funcional en
          fase de demostración: los datos que verás son de prueba y los pagos se
          ejecutan en el entorno de pruebas de Stripe, sin cargos reales.
        </p>
      </section>

      <p className="mt-10 text-sm text-secundario">
        ¿Tienes dudas? Consulta los{' '}
        <Link href="/terms" className="text-primary-600 hover:underline">
          términos de uso
        </Link>{' '}
        y la{' '}
        <Link href="/privacy" className="text-primary-600 hover:underline">
          política de privacidad
        </Link>
        .
      </p>
    </article>
  );
}
