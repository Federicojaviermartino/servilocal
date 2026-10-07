/**
 * Nivel atómico: Molécula
 * Componente: FiltroEstados (qué reservas se ven, según su estado)
 */
'use client';
import { useTranslations } from 'next-intl';
import { BookingStatus } from '@/types';

export type FiltroDeEstado = 'all' | BookingStatus;

interface FiltroEstadosProps {
  valor: FiltroDeEstado;
  onCambiar: (valor: FiltroDeEstado) => void;
  /** Las reservas de la lista, para decir cuántas hay en cada estado. */
  reservas: { status: BookingStatus }[];
}

/** En el orden en que le pasan las cosas a una reserva. */
const OPCIONES = [
  ['all', 'todas'],
  [BookingStatus.PENDING, 'pendientes'],
  [BookingStatus.CONFIRMED, 'confirmadas'],
  [BookingStatus.COMPLETED, 'completadas'],
  [BookingStatus.CANCELLED, 'canceladas'],
  [BookingStatus.REJECTED, 'rechazadas'],
] as const;

/**
 * Los filtros de una lista de reservas.
 *
 * Estaban copiados en las dos listas, la del cliente y la del profesional, y
 * el que estaba puesto solo se distinguía por el color: ni un lector de
 * pantalla ni quien no distingue ese azul sabían qué estaban viendo (WCAG
 * 1.4.1 y 4.1.2, y axe no lo detecta). Cada uno es un botón de dos estados
 * que dice si está pulsado, y lleva cuántas reservas tiene.
 *
 * Con canceladas y rechazadas, que faltaban: solo se llegaba a ellas
 * buscándolas en «Todas».
 */
export default function FiltroEstados({
  valor,
  onCambiar,
  reservas,
}: FiltroEstadosProps) {
  const t = useTranslations('estados');

  const cuantas = (estado: FiltroDeEstado) =>
    estado === 'all'
      ? reservas.length
      : reservas.filter((reserva) => reserva.status === estado).length;

  return (
    <div
      role="group"
      aria-label={t('filtrar')}
      className="bg-superficie rounded-lg shadow-card p-1 mb-4 inline-flex max-w-full flex-wrap gap-1"
    >
      {OPCIONES.map(([estado, clave]) => {
        const puesto = valor === estado;
        return (
          <button
            key={estado}
            type="button"
            aria-pressed={puesto}
            onClick={() => onCambiar(estado)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              puesto
                ? 'bg-primary-600 text-white font-semibold'
                : 'text-secundario hover:bg-fondo'
            }`}
          >
            {t(clave)}{' '}
            <span className={puesto ? 'text-primary-100' : 'text-tenue'}>
              {cuantas(estado)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
