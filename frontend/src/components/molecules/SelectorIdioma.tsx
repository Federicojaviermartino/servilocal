/**
 * Nivel atómico: Molécula
 * Componente: SelectorIdioma (cambia de idioma sin perder la página actual)
 *
 * El enlace de next-intl reescribe el prefijo de idioma de la URL, así que
 * basta con enlazar la misma ruta en otra lengua para quedarse donde se
 * estaba.
 */
'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Globe } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { routing, NOMBRES_IDIOMA, type Idioma } from '@/i18n/routing';

/**
 * Era un desplegable que navegaba al cambiar: con el teclado, en Windows,
 * la flecha abajo saltaba al idioma siguiente y cargaba la página, sin
 * dejar pasar de largo (WCAG 3.2.2). Ahora es un botón que abre una lista
 * de enlaces, y solo se navega al elegir uno.
 */
export default function SelectorIdioma() {
  const idiomaActual = useLocale() as Idioma;
  const t = useTranslations('idioma');
  const ruta = usePathname();
  const id = useId();
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) {
        setAbierto(false);
      }
    };
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      setAbierto(false);
      boton.current?.focus();
    };
    document.addEventListener('mousedown', alPulsar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alPulsar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  const alternar = () => {
    // usePathname devuelve la ruta sin prefijo y sin query. La query se lee
    // del navegador para no arrastrar useSearchParams hasta el layout, que
    // obligaría a envolver en Suspense todas las páginas estáticas.
    setConsulta(window.location.search);
    setAbierto((valor) => !valor);
  };

  return (
    <div ref={contenedor} className="relative inline-flex items-center">
      <button
        ref={boton}
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-controls={id}
        className="inline-flex items-center gap-1 rounded-md py-1.5 ps-2 pe-1.5 text-sm text-secundario transition-colors hover:bg-superficie-alt hover:text-principal"
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{t('cambiar')}:</span>{' '}
        <span lang={idiomaActual}>{NOMBRES_IDIOMA[idiomaActual]}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${abierto ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {abierto && (
        <ul
          id={id}
          className="absolute end-0 top-full z-50 mt-1 min-w-40 rounded-md border border-borde bg-superficie py-1 shadow-card"
        >
          {routing.locales.map((idioma) => (
            <li key={idioma}>
              <Link
                href={`${ruta}${consulta}`}
                locale={idioma}
                hrefLang={idioma}
                lang={idioma}
                aria-current={idioma === idiomaActual ? 'true' : undefined}
                onClick={() => setAbierto(false)}
                className={`block px-3 py-1.5 text-sm hover:bg-superficie-alt ${
                  idioma === idiomaActual
                    ? 'font-semibold text-acento'
                    : 'text-principal'
                }`}
              >
                {NOMBRES_IDIOMA[idioma]}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
