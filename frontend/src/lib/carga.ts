'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AxiosError } from 'axios';

/**
 * Cargar datos sin confundir «no hay nada» con «no he podido preguntar».
 *
 * Diez pantallas hacían `.catch(() => setDatos([]))`. Una red caída, una API
 * dormida o una sesión caducada se veían exactamente igual que una cuenta
 * recién creada: «No tienes reservas». El cliente que reservó ayer entra hoy
 * y la aplicación le dice que no tiene nada, en lugar de decirle que no ha
 * podido enterarse.
 *
 * La sesión caducada se distingue del resto a propósito. El token dura
 * veinticuatro horas, así que es el fallo más frecuente de todos, y el
 * remedio no es reintentar sino volver a entrar.
 *
 * No se redirige a la pantalla de acceso desde aquí: el cliente HTTP ya
 * documenta por qué no lo hace —una petición de fondo no puede interrumpir
 * lo que alguien esté haciendo con una navegación dura— y esto es la otra
 * mitad de esa decisión, la que faltaba: quien llama se entera y lo cuenta.
 */
export type EstadoCarga = 'cargando' | 'listo' | 'error' | 'sesion';

interface Resultado<T> {
  datos: T | null;
  estado: EstadoCarga;
  /** Vuelve a pedirlo. Lo usa el botón de reintentar. */
  reintentar: () => void;
}

export function useCarga<T>(
  pedir: () => Promise<{ data: T }>,
  dependencias: unknown[] = [],
): Resultado<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const [intento, setIntento] = useState(0);

  // La función llega nueva en cada render; guardarla como dependencia
  // dispararía una petición por render. Las dependencias las da quien llama,
  // igual que en useEffect, y por eso no son una lista escrita aquí que el
  // compilador de React pueda analizar: lo que avisa es de que no puede
  // optimizar esto, no de un fallo.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const ejecutar = useCallback(pedir, dependencias);

  useEffect(() => {
    let vigente = true;
    setEstado('cargando');

    ejecutar()
      .then(({ data }) => {
        if (!vigente) return;
        setDatos(data);
        setEstado('listo');
      })
      .catch((error: AxiosError) => {
        if (!vigente) return;
        setEstado(error?.response?.status === 401 ? 'sesion' : 'error');
      });

    return () => {
      vigente = false;
    };
  }, [ejecutar, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return { datos, estado, reintentar };
}
