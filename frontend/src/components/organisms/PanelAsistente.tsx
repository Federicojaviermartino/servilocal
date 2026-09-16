/**
 * Nivel atómico: Organismo
 * Componente: PanelAsistente (la ventana del asistente de búsqueda)
 *
 * Solo pinta. Recibe la respuesta ya resuelta y no sabe de dónde sale, para
 * que sus estados —cargando, sin resultados, error— se puedan ver y probar
 * sin una llamada de red detrás.
 *
 * Los servicios llegan elegidos por la búsqueda; aquí no se interpreta ni se
 * completa nada, porque cualquier dato que apareciese sin venir de la
 * respuesta sería inventado.
 */
'use client';
import { FormEvent, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Service } from '@/types';
import { Link } from '@/i18n/navigation';
import Button from '../atoms/Button';
import Badge from '../atoms/Badge';
import ServiceCard from '../molecules/ServiceCard';

export interface RespuestaAsistente {
  /** De dónde salió la interpretación: del modelo o del diccionario. */
  modo: 'ia' | 'basico';
  criterios: {
    categoria: string | null;
    ciudad: string | null;
    texto: string | null;
  };
  servicios: Service[];
  total: number;
}

interface PanelAsistenteProps {
  mensaje: string;
  onMensajeChange: (valor: string) => void;
  onEnviar: (evento: FormEvent) => void;
  onCerrar: () => void;
  enviando?: boolean;
  error?: boolean;
  respuesta?: RespuestaAsistente | null;
}

export default function PanelAsistente({
  mensaje,
  onMensajeChange,
  onEnviar,
  onCerrar,
  enviando = false,
  error = false,
  respuesta = null,
}: PanelAsistenteProps) {
  const t = useTranslations('asistente');
  const campo = useRef<HTMLInputElement>(null);

  // Al abrir, el botón flotante que tenía el foco deja de existir: sin esto
  // el foco cae al body y quien navega con teclado pierde el sitio.
  useEffect(() => {
    campo.current?.focus();
  }, []);

  // Escape cierra, como cualquier diálogo. Va en el documento y no en el
  // panel porque el foco puede estar en una tarjeta de resultado.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-label={t('titulo')}
      className="fixed bottom-5 end-5 z-40 flex max-h-[80vh] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-lg border border-borde bg-superficie shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3 border-b border-borde p-4">
        <div>
          <p className="font-semibold text-principal">{t('titulo')}</p>
          <p className="mt-1 text-sm text-secundario">{t('ayuda')}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label={t('cerrar')}
          className="shrink-0 rounded-md p-1 text-tenue transition-colors hover:bg-superficie-alt hover:text-principal"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <form
        onSubmit={onEnviar}
        className="flex gap-2 border-b border-borde p-4"
      >
        <input
          ref={campo}
          type="text"
          value={mensaje}
          onChange={(e) => onMensajeChange(e.target.value)}
          placeholder={t('placeholder')}
          maxLength={500}
          aria-label={t('titulo')}
          className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-sm text-principal placeholder-tenue focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Button
          type="submit"
          size="sm"
          isLoading={enviando}
          disabled={enviando}
        >
          {enviando ? t('buscando') : t('enviar')}
        </Button>
      </form>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-warning-50 p-3 text-sm text-warning-600"
          >
            {t('error')}
          </p>
        )}

        {respuesta && !error && (
          <div className="space-y-3">
            {/* Los criterios llegan tras la respuesta, así que se anuncian:
                quien usa lector de pantalla no ve aparecer la fila. */}
            <div
              role="status"
              className="flex flex-wrap items-center gap-2 text-sm text-secundario"
            >
              <span>{t('criterios')}</span>
              {respuesta.criterios.categoria && (
                <Badge variant="info">{respuesta.criterios.categoria}</Badge>
              )}
              {/* Si el servidor relajó la ciudad, lo dice: afirmar una que no
                  se aplicó sería mentir sobre la búsqueda. */}
              <Badge variant="default">
                {respuesta.criterios.ciudad ?? t('todaEspana')}
              </Badge>
              {respuesta.modo === 'basico' && (
                <Badge variant="warning">{t('modoBasico')}</Badge>
              )}
            </div>

            {respuesta.servicios.length === 0 ? (
              <p className="py-6 text-center text-sm text-tenue">
                {t('sinResultados')}
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  {respuesta.servicios.map((servicio) => (
                    <ServiceCard key={servicio.id} service={servicio} />
                  ))}
                </div>
                <Link
                  href="/services/search"
                  className="block pt-1 text-center text-sm font-medium text-primary-600 hover:underline"
                >
                  {t('verTodos')}
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
