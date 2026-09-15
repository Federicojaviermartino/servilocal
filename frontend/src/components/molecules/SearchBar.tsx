/**
 * Nivel atomico: Molecula
 * Componente: SearchBar (input + boton + icono)
 */
'use client';
import { useState, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
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
  const [value, setValue] = useState(initialValue);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(value.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-tenue"
            size={20}
          />
          <input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder ?? t('queNecesitas')}
            className="w-full pl-10 pr-3 py-2.5 rounded-md border border-borde bg-superficie text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
