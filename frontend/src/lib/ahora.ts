'use client';
import { useEffect, useState } from 'react';

/**
 * La hora de ahora, para decidir qué se enseña.
 *
 * Leerla en cada render la haría cambiar entre dos pintadas del mismo
 * estado, y React exige que un componente dé lo mismo con lo mismo. Se lee
 * al montar y se pone al día cada minuto: basta para que el botón de
 * completar aparezca cuando llega la hora de la reserva, sin recargar.
 */
export function useAhora(cadaMs = 60_000): number {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(Date.now()), cadaMs);
    return () => window.clearInterval(reloj);
  }, [cadaMs]);

  return ahora;
}
