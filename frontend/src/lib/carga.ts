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
  /**
   * El identificador de la petición que falló, si fue un error del servidor.
   * Es lo que aparece en su registro: la pantalla lo enseña como código de
   * referencia, para que quien lo vea pueda darlo y se encuentre el fallo.
   */
  referencia?: string;
}

/** Cómo terminó una petición, y cuál era: la función y el intento. */
interface Respuesta<T> {
  ejecutar: () => Promise<{ data: T }>;
  intento: number;
  estado: Exclude<EstadoCarga, 'cargando'>;
  referencia?: string;
}

/** El identificador que pone la API en cada respuesta, si es de un 5xx. */
export function referenciaDe(
  error: AxiosError | undefined,
): string | undefined {
  const respuesta = error?.response;
  if (!respuesta || respuesta.status < 500) return undefined;
  const id = respuesta.headers?.['x-request-id'];
  return typeof id === 'string' ? id : undefined;
}

export function useCarga<T>(
  pedir: () => Promise<{ data: T }>,
  dependencias: unknown[] = [],
): Resultado<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [respuesta, setRespuesta] = useState<Respuesta<T> | null>(null);
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

    ejecutar()
      .then(({ data }) => {
        if (!vigente) return;
        setDatos(data);
        setRespuesta({ ejecutar, intento, estado: 'listo' });
      })
      .catch((error: AxiosError) => {
        if (!vigente) return;
        setRespuesta({
          ejecutar,
          intento,
          estado: error?.response?.status === 401 ? 'sesion' : 'error',
          referencia: referenciaDe(error),
        });
      });

    return () => {
      vigente = false;
    };
  }, [ejecutar, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  // «Cargando» no se guarda: es que la última respuesta no corresponde a lo
  // último que se ha pedido. Antes se ponía a mano al empezar cada petición,
  // dentro del efecto, y eso obligaba a React a pintar dos veces seguidas.
  // Así cambia en el mismo render en que cambian las dependencias o se
  // reintenta, sin ningún paso intermedio.
  const alDia =
    respuesta !== null &&
    respuesta.ejecutar === ejecutar &&
    respuesta.intento === intento;

  return {
    datos,
    estado: alDia ? respuesta.estado : 'cargando',
    reintentar,
    referencia: alDia ? respuesta.referencia : undefined,
  };
}
