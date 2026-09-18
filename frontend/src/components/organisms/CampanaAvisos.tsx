/**
 * Nivel atómico: Organismo
 * Componente: CampanaAvisos
 *
 * Los avisos llegan del servidor con su tipo y sus datos, nunca con la frase
 * escrita. La frase se compone aquí con el catálogo del visitante: guardarla
 * traducida dejaría un aviso en castellano para siempre, aunque quien lo lea
 * se pase al alemán mañana.
 */
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { avisosApi } from '@/lib/api';
import { useAvisosEnVivo, type Aviso } from '@/lib/socket-mensajes';
import { Link } from '@/i18n/navigation';

/** Lee los datos que el servidor guardó como texto, sin reventar si no valen. */
function datosDe(aviso: Aviso): Record<string, string> {
  try {
    const leido = JSON.parse(aviso.content ?? '{}');
    return typeof leido === 'object' && leido !== null ? leido : {};
  } catch {
    return {};
  }
}

export default function CampanaAvisos() {
  const t = useTranslations('avisos');
  const [abierta, setAbierta] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const contenedor = useRef<HTMLDivElement>(null);

  const cargar = useCallback(() => {
    avisosApi
      .listar()
      .then(({ data }) => setAvisos(Array.isArray(data) ? data : []))
      .catch(() => setAvisos([]));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Llega por el mismo socket que los mensajes: se pone arriba sin recargar.
  useAvisosEnVivo(
    useCallback((aviso: Aviso) => {
      setAvisos((previos) =>
        previos.some((a) => a.id === aviso.id)
          ? previos
          : [aviso, ...previos].slice(0, 20),
      );
    }, []),
  );

  // Pulsar fuera cierra el panel, como cualquier desplegable.
  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) {
        setAbierta(false);
      }
    };
    document.addEventListener('mousedown', alPulsar);
    return () => document.removeEventListener('mousedown', alPulsar);
  }, [abierta]);

  const sinLeer = avisos.filter((a) => !a.isRead).length;

  const marcarTodos = async () => {
    // Se pinta antes de que responda el servidor: el contador es un adorno,
    // y esperar a la red para tacharlo se nota y molesta.
    setAvisos((previos) => previos.map((a) => ({ ...a, isRead: true })));
    await avisosApi.marcarTodos().catch(() => cargar());
  };

  const abrirAviso = async (aviso: Aviso) => {
    setAbierta(false);
    if (aviso.isRead) return;
    setAvisos((previos) =>
      previos.map((a) => (a.id === aviso.id ? { ...a, isRead: true } : a)),
    );
    await avisosApi.marcarLeido(aviso.id).catch(() => cargar());
  };

  const textoDe = (aviso: Aviso): string => {
    // Un tipo que el catálogo no conozca se enseña con un texto genérico en
    // el idioma del visitante, nunca con la clave en crudo.
    const clave = aviso.type as never;
    return t.has(clave) ? t(clave, datosDe(aviso) as never) : t('generico');
  };

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-label={
          sinLeer > 0 ? t('abrirConPendientes', { total: sinLeer }) : t('abrir')
        }
        aria-expanded={abierta}
        className="relative rounded-md p-2 text-secundario transition-colors hover:bg-superficie-alt hover:text-principal"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {sinLeer > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[0.625rem] font-bold text-white">
            {sinLeer > 9 ? '9+' : sinLeer}
          </span>
        )}
      </button>

      {abierta && (
        <div
          role="dialog"
          aria-label={t('titulo')}
          className="absolute end-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-borde bg-superficie shadow-card-hover"
        >
          <div className="flex items-center justify-between border-b border-borde px-4 py-3">
            <p className="text-sm font-semibold text-principal">
              {t('titulo')}
            </p>
            {sinLeer > 0 && (
              <button
                type="button"
                onClick={marcarTodos}
                className="text-xs font-medium text-primary-600 hover:underline"
              >
                {t('marcarTodos')}
              </button>
            )}
          </div>

          <ul className="max-h-80 overflow-y-auto">
            {avisos.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-tenue">
                {t('sinAvisos')}
              </li>
            ) : (
              avisos.map((aviso) => (
                <li
                  key={aviso.id}
                  className="border-b border-borde last:border-0"
                >
                  <Link
                    href={aviso.actionUrl || '/dashboard'}
                    onClick={() => abrirAviso(aviso)}
                    className="flex gap-3 px-4 py-3 transition-colors hover:bg-superficie-alt"
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        aviso.isRead ? 'bg-transparent' : 'bg-primary-600'
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-principal">
                        {textoDe(aviso)}
                      </span>
                      {!aviso.isRead && (
                        <span className="sr-only">{t('sinLeer')}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
