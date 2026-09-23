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
  const tCarga = useTranslations('carga');
  const [abierta, setAbierta] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Aquí no cabe una caja de error con su botón: es un desplegable. Basta
  // con no mentir, que es lo que hacía al decir «no tienes avisos» cuando lo
  // que pasaba era que no había podido preguntarlo.
  const [fallo, setFallo] = useState(false);

  const cargar = useCallback(() => {
    avisosApi
      .listar()
      .then(({ data }) => {
        setAvisos(Array.isArray(data) ? data : []);
        setFallo(false);
      })
      .catch(() => setFallo(true));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Lo que anuncia la región en vivo. Se vacía después para que dos avisos
  // seguidos con el mismo texto se anuncien los dos: un lector de pantalla
  // ignora una región cuyo contenido no ha cambiado.
  const [anuncio, setAnuncio] = useState('');

  const textoDe = (aviso: Aviso): string => {
    // Un tipo que el catálogo no conozca se enseña con un texto genérico en
    // el idioma del visitante, nunca con la clave en crudo.
    const clave = aviso.type as never;
    return t.has(clave) ? t(clave, datosDe(aviso) as never) : t('generico');
  };

  // Los avisos que ya están en pantalla, para saber si uno que llega es
  // nuevo.
  //
  // Antes se decidía poniendo una variable a true dentro de la función que
  // actualiza el estado y leyéndola justo después. Eso solo funciona si React
  // ejecuta esa función en el momento, y no lo promete: cuando no lo hace, la
  // variable se lee sin cambiar y el anuncio no sale. En las pruebas no salía
  // nunca, ni con un solo aviso.
  const conocidos = useRef(new Set<string>());
  useEffect(() => {
    conocidos.current = new Set(avisos.map((a) => a.id));
  }, [avisos]);

  // Llega por el mismo socket que los mensajes: se pone arriba sin recargar.
  useAvisosEnVivo((aviso: Aviso) => {
    if (conocidos.current.has(aviso.id)) return;
    conocidos.current.add(aviso.id);

    setAvisos((previos) =>
      previos.some((a) => a.id === aviso.id)
        ? previos
        : [aviso, ...previos].slice(0, 20),
    );

    // Sin esto, la llegada de un aviso solo se nota en un número rojo de
    // diez píxeles sobre la campana. Quien no lo ve no se entera de que
    // acaban de aceptarle una reserva.
    setAnuncio(textoDe(aviso));
    window.setTimeout(() => setAnuncio(''), 1000);
  });

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

  // Escape cierra, que es lo que espera cualquiera que use el teclado. Sin
  // esto solo se podía cerrar con el ratón, y el panel se anuncia como
  // diálogo: quien navegue escuchando la página se queda dentro de algo de
  // lo que no hay manera de salir.
  useEffect(() => {
    if (!abierta) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierta(false);
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierta]);

  // El foco entra al abrir y vuelve al botón al cerrar. Sin lo primero, el
  // panel se anuncia pero el tabulador sigue detrás de él; sin lo segundo,
  // al cerrarlo el foco se pierde al principio de la página.
  const yaAbierta = useRef(false);
  useEffect(() => {
    if (abierta) {
      panel.current?.focus();
    } else if (yaAbierta.current) {
      boton.current?.focus();
    }
    yaAbierta.current = abierta;
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

  return (
    <div className="relative" ref={contenedor}>
      <span aria-live="polite" className="sr-only">
        {anuncio}
      </span>
      <button
        type="button"
        ref={boton}
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
          aria-modal="false"
          aria-label={t('titulo')}
          ref={panel}
          tabIndex={-1}
          className="absolute end-0 z-50 mt-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-borde bg-superficie shadow-card-hover"
        >
          <div className="flex items-center justify-between border-b border-borde px-4 py-3">
            <p className="text-sm font-semibold text-principal">
              {t('titulo')}
            </p>
            {sinLeer > 0 && (
              <button
                type="button"
                onClick={marcarTodos}
                className="text-xs font-medium text-acento hover:underline"
              >
                {t('marcarTodos')}
              </button>
            )}
          </div>

          <ul className="max-h-80 overflow-y-auto">
            {fallo ? (
              <li className="px-4 py-8 text-center text-sm text-tenue">
                <span className="block">{tCarga('error')}</span>
                <button
                  type="button"
                  onClick={cargar}
                  className="mt-2 text-acento underline"
                >
                  {tCarga('reintentar')}
                </button>
              </li>
            ) : avisos.length === 0 ? (
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
