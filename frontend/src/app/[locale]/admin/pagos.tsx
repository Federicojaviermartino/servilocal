'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Banknote } from 'lucide-react';
import { adminApi, bookingsApi, paymentsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useAvisoDeFallo } from '@/lib/aviso-de-fallo';
import { useCarga } from '@/lib/carga';
import { useImporte } from '@/lib/importes';
import { useIdiomaDelCatalogo } from '@/lib/idioma-catalogo';
import { BookingStatus } from '@/types';
import Badge from '@/components/atoms/Badge';
import Button from '@/components/atoms/Button';
import EstadoCarga from '@/components/molecules/EstadoCarga';

/** Los motivos de GET /api/admin/pagos, del más urgente al menos. */
const MOTIVOS = {
  'retenido-con-reserva-cerrada': {
    titulo: 'motivoRetenidoCerrada',
    texto: 'motivoRetenidoCerradaTexto',
    variante: 'warning',
  },
  'retenido-sin-completar': {
    titulo: 'motivoRetenidoSinCompletar',
    texto: 'motivoRetenidoSinCompletarTexto',
    variante: 'warning',
  },
  'completada-sin-cobrar': {
    titulo: 'motivoCompletadaSinCobrar',
    texto: 'motivoCompletadaSinCobrarTexto',
    variante: 'info',
  },
} as const;

type Motivo = keyof typeof MOTIVOS;

interface PagoPorRevisar {
  motivo: Motivo;
  reservaId: string;
  estadoReserva: BookingStatus;
  fecha: string;
  estadoPago: string | null;
  importe: number;
  servicio: string;
  cliente: string;
  profesional: string;
}

interface PagosPorRevisar {
  pagos: PagoPorRevisar[];
  totales: Record<Motivo, number>;
}

/** Lo que se puede hacer con un pago, y con qué palabras. */
const ACCIONES = {
  cobrar: {
    boton: 'cobrar',
    confirmar: 'confirmarCobrar',
    hecho: 'pagoCobrado',
    hacer: (reservaId: string) => paymentsApi.capture(reservaId),
  },
  soltar: {
    boton: 'soltarRetencion',
    confirmar: 'confirmarSoltar',
    hecho: 'retencionSoltada',
    hacer: (reservaId: string) => paymentsApi.refund(reservaId),
  },
  completar: {
    boton: 'completarYCobrar',
    confirmar: 'confirmarCompletar',
    hecho: 'reservaCompletadaAdmin',
    hacer: (reservaId: string) =>
      bookingsApi.updateStatus(reservaId, BookingStatus.COMPLETED),
  },
  cancelar: {
    boton: 'cancelarYSoltar',
    confirmar: 'confirmarCancelarReserva',
    hecho: 'reservaCanceladaAdmin',
    hacer: (reservaId: string) =>
      bookingsApi.updateStatus(reservaId, BookingStatus.CANCELLED),
  },
} as const;

type Accion = keyof typeof ACCIONES;

/**
 * Qué se le ofrece a la administración con cada pago.
 *
 * Retenido con la reserva completada, cobrarlo; con la reserva cancelada o
 * rechazada, soltarlo. Con la reserva aún confirmada, cerrarla en un sentido
 * o en el otro, que es lo que mueve el dinero. Y con una completada sin
 * cobrar no hay nada que hacer desde aquí: paga el cliente.
 */
function accionesDe(pago: PagoPorRevisar): Accion[] {
  if (pago.motivo === 'retenido-sin-completar') {
    return ['completar', 'cancelar'];
  }
  if (pago.motivo === 'retenido-con-reserva-cerrada') {
    return [
      pago.estadoReserva === BookingStatus.COMPLETED ? 'cobrar' : 'soltar',
    ];
  }
  return [];
}

const ESTADO_DE_RESERVA: Record<BookingStatus, string> = {
  [BookingStatus.PENDING]: 'pendiente',
  [BookingStatus.CONFIRMED]: 'confirmada',
  [BookingStatus.COMPLETED]: 'completada',
  [BookingStatus.CANCELLED]: 'cancelada',
  [BookingStatus.REJECTED]: 'rechazada',
};

/**
 * Los pagos que alguien tiene que mirar.
 *
 * La administración podía cobrar y reembolsar por la API, pero el panel no
 * enseñaba qué: una retención que Stripe no dejaba soltar, o una reserva
 * confirmada que nadie cerraba, solo se veían en el registro del servidor.
 * Las acciones son las que la API ya tenía, y quedan en el historial.
 */
export default function PagosSection() {
  const t = useTranslations('administracion');
  const tEstados = useTranslations('estados');
  const idioma = useLocale();
  const idiomaDelCatalogo = useIdiomaDelCatalogo();
  const importe = useImporte();
  const avisarDeFallo = useAvisoDeFallo();
  const soloLectura = useAuthStore((estado) => estado.user?.soloLectura);
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const { datos, estado, reintentar, refrescar, referencia } =
    useCarga<PagosPorRevisar>(() => adminApi.pagos(), []);

  const actuar = async (pago: PagoPorRevisar, accion: Accion) => {
    const { confirmar, hecho, hacer } = ACCIONES[accion];
    if (
      !window.confirm(t(confirmar, { importe: importe(pago.importe, true) }))
    ) {
      return;
    }
    setEnCurso(pago.reservaId);
    try {
      await hacer(pago.reservaId);
      toast.success(t(hecho));
      // Sin pasar por «cargando»: la lista no se va de la pantalla, y con
      // ella el foco.
      refrescar();
    } catch (error) {
      avisarDeFallo(error, t('errorPago'));
    } finally {
      setEnCurso(null);
    }
  };

  if (estado !== 'listo' || !datos) {
    return (
      <EstadoCarga
        estado={estado}
        onReintentar={reintentar}
        referencia={referencia}
      />
    );
  }

  const { pagos, totales } = datos;
  const total = Object.values(totales).reduce((suma, n) => suma + n, 0);

  if (total === 0) {
    return (
      <div className="py-10 text-center text-tenue">
        <Banknote size={32} className="mx-auto mb-2" aria-hidden="true" />
        <p>{t('sinPagos')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-secundario">{t('pagosAyuda')}</p>

      <ul className="flex flex-wrap gap-2" aria-label={t('pagosResumen')}>
        {(Object.keys(MOTIVOS) as Motivo[]).map((motivo) => (
          <li key={motivo}>
            <Badge
              variant={
                totales[motivo] > 0 ? MOTIVOS[motivo].variante : 'default'
              }
            >
              {t(MOTIVOS[motivo].titulo)}: {totales[motivo]}
            </Badge>
          </li>
        ))}
      </ul>

      <ul className="space-y-3" aria-label={t('listaPagos')}>
        {pagos.map((pago) => {
          const motivo = MOTIVOS[pago.motivo];
          return (
            <li
              key={pago.reservaId}
              className="rounded-md border border-borde bg-superficie p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={motivo.variante}>{t(motivo.titulo)}</Badge>
                    <span className="font-semibold text-principal">
                      {importe(pago.importe, true)}
                    </span>
                  </div>
                  <p
                    dir="auto"
                    lang={idiomaDelCatalogo}
                    className="break-words text-principal"
                  >
                    {pago.servicio}
                  </p>
                  <p className="text-sm text-secundario">
                    {t('cliente')}: {pago.cliente} · {t('proveedor')}:{' '}
                    {pago.profesional}
                  </p>
                  <p className="text-xs text-tenue">
                    {t('reserva', { id: pago.reservaId.slice(0, 8) })} ·{' '}
                    {tEstados(ESTADO_DE_RESERVA[pago.estadoReserva])} ·{' '}
                    {new Date(pago.fecha).toLocaleDateString(idioma)}
                  </p>
                  <p className="text-sm text-secundario">{t(motivo.texto)}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                  {accionesDe(pago).map((accion) => (
                    <Button
                      key={accion}
                      variant={accion === 'cancelar' ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={() => actuar(pago, accion)}
                      disabled={soloLectura || enCurso === pago.reservaId}
                      title={soloLectura ? t('soloLecturaTexto') : undefined}
                    >
                      {t(ACCIONES[accion].boton)}
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pagos.length < total && (
        <p className="text-sm text-tenue">
          {t('pagosMostrados', { mostrados: pagos.length, total })}
        </p>
      )}
    </div>
  );
}
