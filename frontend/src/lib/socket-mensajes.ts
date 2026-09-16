'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message } from '@/types';

// La API vive en .../api y el socket cuelga de la raíz del mismo servidor.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

/**
 * Un único socket para toda la pestaña, con recuento de suscriptores.
 *
 * Abrir uno por componente multiplicaría las conexiones al navegar entre la
 * lista y una conversación, y cada una consume una ranura del servidor.
 */
let socket: Socket | null = null;
let suscriptores = 0;

function abrir(token: string): Socket {
  if (!socket) {
    socket = io(`${SOCKET_URL}/mensajes`, {
      // El token va en el apretón de manos y no en la URL: las cadenas de
      // consulta acaban escritas en los registros del servidor.
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
  }
  return socket;
}

function cerrar() {
  if (socket && suscriptores === 0) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Mensajes en vivo.
 *
 * Devuelve si el socket está conectado para que quien lo use pueda seguir
 * refrescando por HTTP mientras no lo esté. Esa red de seguridad importa:
 * en Render el servicio se duerme, y hay redes corporativas que cortan los
 * sockets. Sin ella, quien cae en uno de esos casos deja de recibir mensajes
 * sin enterarse, que es la peor forma de fallar de una mensajería.
 */
export interface AvisoMensaje {
  mensaje: Message;
  /** Con quién es la conversación, visto desde quien recibe el aviso. */
  interlocutorId: string;
}

export function useMensajesEnVivo(alRecibir: (aviso: AvisoMensaje) => void) {
  const [conectado, setConectado] = useState(false);

  // El manejador cambia en cada render; guardarlo en una referencia evita
  // desuscribir y volver a suscribir el socket con cada pulsación de tecla.
  const manejador = useRef(alRecibir);
  manejador.current = alRecibir;

  useEffect(() => {
    const token =
      typeof window === 'undefined'
        ? null
        : localStorage.getItem('accessToken');
    if (!token) return;

    const s = abrir(token);
    suscriptores += 1;

    const alMensaje = (aviso: AvisoMensaje) => manejador.current(aviso);
    const alConectar = () => setConectado(true);
    const alDesconectar = () => setConectado(false);

    s.on('mensaje-nuevo', alMensaje);
    s.on('connect', alConectar);
    s.on('disconnect', alDesconectar);
    // El servidor cierra la conexión cuando el token no vale. Reintentar
    // sería insistir con la misma credencial: se deja de intentar.
    s.on('sesion-invalida', () => s.disconnect());
    setConectado(s.connected);

    return () => {
      s.off('mensaje-nuevo', alMensaje);
      s.off('connect', alConectar);
      s.off('disconnect', alDesconectar);
      suscriptores -= 1;
      cerrar();
    };
  }, []);

  return { conectado };
}
