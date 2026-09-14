/**
 * Nivel atómico: Molécula
 * Componente: SelectorTema (alterna entre claro y oscuro)
 *
 * El tema se aplica en <html> mediante una clase. Quien lo pone por primera
 * vez es el script en línea del layout, que corre antes del primer pintado
 * para evitar el destello de tema equivocado; este componente solo lo cambia
 * después y guarda la preferencia.
 */
'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export const CLAVE_TEMA = 'tema';

export default function SelectorTema() {
  // null mientras no se ha montado: el servidor no sabe qué tema tiene el
  // usuario, así que el primer render del cliente debe coincidir con el suyo.
  const [oscuro, setOscuro] = useState<boolean | null>(null);

  useEffect(() => {
    setOscuro(document.documentElement.classList.contains('dark'));
  }, []);

  const alternar = () => {
    const siguiente = !oscuro;
    setOscuro(siguiente);
    document.documentElement.classList.toggle('dark', siguiente);
    try {
      localStorage.setItem(CLAVE_TEMA, siguiente ? 'oscuro' : 'claro');
    } catch {
      // Navegación privada o almacenamiento bloqueado: el tema se aplica
      // igualmente, solo que no se recordará en la próxima visita.
    }
  };

  const etiqueta = oscuro ? 'Activar tema claro' : 'Activar tema oscuro';

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={etiqueta}
      title={etiqueta}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-secundario transition-colors hover:bg-superficie-alt hover:text-principal"
    >
      {oscuro ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
