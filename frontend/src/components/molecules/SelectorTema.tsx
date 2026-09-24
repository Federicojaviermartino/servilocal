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
import { useTranslations } from 'next-intl';
import { Moon, Sun } from 'lucide-react';
import { useTemaOscuro } from '@/lib/tema';

export const CLAVE_TEMA = 'tema';

export default function SelectorTema() {
  const t = useTranslations('tema');
  // null en el servidor y en el primer render del cliente, que no saben qué
  // tema tiene el usuario. Ver lib/tema.ts.
  const oscuro = useTemaOscuro();

  const alternar = () => {
    const siguiente = !oscuro;
    // Basta con cambiar la clase: useTemaOscuro se entera y vuelve a pintar
    // este selector y cualquier otro que haya en la página.
    document.documentElement.classList.toggle('dark', siguiente);
    try {
      localStorage.setItem(CLAVE_TEMA, siguiente ? 'oscuro' : 'claro');
    } catch {
      // Navegación privada o almacenamiento bloqueado: el tema se aplica
      // igualmente, solo que no se recordará en la próxima visita.
    }
  };

  const etiqueta = oscuro ? t('activarClaro') : t('activarOscuro');

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
