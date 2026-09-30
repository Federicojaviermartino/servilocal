/**
 * Nivel atómico: Molécula
 * Componente: SearchBar (campo, botón e icono)
 */
'use client';
import type { FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { getPathname } from '@/i18n/navigation';
import Button from '../atoms/Button';

interface SearchBarProps {
  placeholder?: string;
  initialValue?: string;
  onSearch: (query: string) => void;
}

export default function SearchBar({
  placeholder,
  initialValue = '',
  onSearch,
}: SearchBarProps) {
  const t = useTranslations('buscador');
  const tComun = useTranslations('comun');
  const idioma = useLocale();

  // El texto se lee del formulario al enviarlo, sin estado: con la página
  // pintada desde el servidor, lo que alguien escribía antes de que React
  // tomara el control se borraba al hacerlo, porque el campo controlado
  // volvía a su valor inicial.
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const texto = new FormData(e.currentTarget).get('q');
    onSearch(String(texto ?? '').trim());
  };

  return (
    // Un formulario de verdad: con la página ya pintada desde el servidor,
    // quien pulsaba «Buscar» antes de que cargara el JavaScript no
    // conseguía nada. Así, sin él, va al buscador con lo escrito.
    <form
      action={getPathname({ href: '/services/search', locale: idioma })}
      method="get"
      role="search"
      onSubmit={handleSubmit}
      className="w-full"
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute start-3 top-1/2 -translate-y-1/2 text-tenue"
            size={20}
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            defaultValue={initialValue}
            placeholder={placeholder ?? t('queNecesitas')}
            className="w-full ps-10 pe-3 py-2.5 rounded-md border border-borde bg-superficie text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-acento focus:border-acento"
            aria-label={t('buscarServicios')}
          />
        </div>
        <Button type="submit" variant="primary" size="md">
          {tComun('buscar')}
        </Button>
      </div>
    </form>
  );
}
