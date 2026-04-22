/**
 * Nivel atomico: Molecula
 * Componente: SearchBar (input + boton + icono)
 */
'use client';
import { useState, FormEvent } from 'react';
import { Search } from 'lucide-react';
import Button from '../atoms/Button';

interface SearchBarProps {
  placeholder?: string;
  initialValue?: string;
  onSearch: (query: string) => void;
}

export default function SearchBar({
  placeholder = 'Que servicio necesitas?',
  initialValue = '',
  onSearch,
}: SearchBarProps) {
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
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            size={20}
          />
          <input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-10 pr-3 py-2.5 rounded-md border border-neutral-300 bg-white text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            aria-label="Buscar servicios"
          />
        </div>
        <Button type="submit" variant="primary" size="md">
          Buscar
        </Button>
      </div>
    </form>
  );
}
