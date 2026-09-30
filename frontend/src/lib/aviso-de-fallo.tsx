'use client';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { Link, usePathname } from '@/i18n/navigation';
import {
  CODIGO_DEMOSTRACION,
  CODIGO_SESION_CADUCADA,
  codigoDeError,
  textoDeError,
} from './errores-api';
import { rutaConConsulta } from './ruta-interna';

/**
 * Qué decir cuando falla un envío: una reserva, un perfil, una valoración.
 *
 * Con la sesión caducada, un «no se ha podido guardar» invitaba a reintentar,
 * y reintentar fallaba igual. Aquí se dice qué pasa, se ofrece volver a
 * entrar y, al volver, se regresa a la misma página; quien llama puede
 * guardar antes lo escrito (ver borrador.ts). Cualquier otro fallo se
 * explica con el código de la API, en el idioma de quien mira, o con la
 * frase de la pantalla.
 */
export function useAvisoDeFallo() {
  const tErrores = useTranslations('erroresApi');
  const tComun = useTranslations('comun');
  const tCarga = useTranslations('carga');
  const ruta = usePathname();

  return useCallback(
    (error: unknown, alternativa: string, guardarBorrador?: () => void) => {
      const codigo = codigoDeError(error);
      if (codigo === CODIGO_SESION_CADUCADA) {
        guardarBorrador?.();
        toast.error(
          (aviso) => (
            <span>
              {tErrores(CODIGO_SESION_CADUCADA)}{' '}
              <Link
                href={{
                  pathname: '/auth/login',
                  query: { redirect: rutaConConsulta(ruta) },
                }}
                className="font-medium underline"
                onClick={() => toast.dismiss(aviso.id)}
              >
                {tCarga('entrarDeNuevo')}
              </Link>
            </span>
          ),
          // Uno solo aunque fallen varias cosas a la vez, y con tiempo para
          // leerlo y pulsar el enlace.
          { id: CODIGO_SESION_CADUCADA, duration: 15000 },
        );
        return;
      }
      toast.error(
        codigo === CODIGO_DEMOSTRACION
          ? tComun('demostracionAislada')
          : textoDeError(error, tErrores, alternativa),
      );
    },
    [tErrores, tComun, tCarga, ruta],
  );
}
