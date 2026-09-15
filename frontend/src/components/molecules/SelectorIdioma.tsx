/**
 * Nivel atómico: Molécula
 * Componente: SelectorIdioma (cambia de idioma sin perder la página actual)
 *
 * El router de next-intl reescribe el prefijo de idioma de la URL, así que
 * basta con pedir la misma ruta en otra lengua para quedarse donde se estaba.
 */
'use client';
import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, NOMBRES_IDIOMA, type Idioma } from '@/i18n/routing';

export default function SelectorIdioma() {
  const idiomaActual = useLocale() as Idioma;
  const t = useTranslations('idioma');
  const router = useRouter();
  const ruta = usePathname();
  const [pendiente, iniciarTransicion] = useTransition();

  const cambiar = (idioma: Idioma) => {
    // usePathname devuelve la ruta sin prefijo y sin query. La query se lee
    // del navegador para no arrastrar useSearchParams hasta el layout, que
    // obligaría a envolver en Suspense todas las páginas estáticas.
    const consulta =
      typeof window === 'undefined' ? '' : window.location.search;
    iniciarTransicion(() => {
      router.replace(`${ruta}${consulta}`, { locale: idioma });
    });
  };

  return (
    <div className="relative inline-flex items-center">
      <Globe
        className="pointer-events-none absolute start-2 h-4 w-4 text-secundario"
        aria-hidden="true"
      />
      <select
        value={idiomaActual}
        onChange={(evento) => cambiar(evento.target.value as Idioma)}
        disabled={pendiente}
        aria-label={t('cambiar')}
        title={t('cambiar')}
        className="cursor-pointer appearance-none rounded-md border border-transparent bg-superficie py-1.5 ps-7 pe-2 text-sm text-secundario transition-colors hover:bg-superficie-alt hover:text-principal focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
      >
        {routing.locales.map((idioma) => (
          <option
            key={idioma}
            value={idioma}
            className="bg-superficie text-principal"
          >
            {NOMBRES_IDIOMA[idioma]}
          </option>
        ))}
      </select>
    </div>
  );
}
