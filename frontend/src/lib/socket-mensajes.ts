'use client';
import { useEffect, useEffectEvent, useState } from 'react';
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

/**
 * Suscripción genérica a un evento del socket.
 *
 * Los mensajes y los avisos viajan por la misma conexión: abrir una segunda
 * gastaría el doble de ranuras del servidor para nada.
 */
function useEvento<T>(evento: string, alRecibir: (dato: T) => void) {
  const [conectado, setConectado] = useState(false);

  // El manejador cambia en cada render, y no conviene desuscribir y volver a
  // suscribir con cada pulsación de tecla. Antes se guardaba en una
  // referencia que se reescribía durante el render, algo que React
  // desaconseja: con el renderizado concurrente, un render que se descarta
  // podía dejar puesta la función de un estado que nunca llegó a pantalla.
  // useEffectEvent es la pieza que trae React 19.2 para esto: se llama desde
  // el efecto y siempre ve el último render que sí se confirmó.
  const recibirUltimo = useEffectEvent((dato: T) => alRecibir(dato));

  useEffect(() => {
    const token =
      typeof window === 'undefined'
        ? null
        : localStorage.getItem('accessToken');
    if (!token) return;

    const s = abrir(token);
    suscriptores += 1;

    const alDato = (dato: T) => recibirUltimo(dato);
    const alConectar = () => setConectado(true);
    const alDesconectar = () => setConectado(false);
    // El servidor cierra la conexión cuando el token no vale. Reintentar
    // sería insistir con la misma credencial: se deja de intentar.
    const alSesionInvalida = () => s.disconnect();

    s.on(evento, alDato);
    s.on('connect', alConectar);
    s.on('disconnect', alDesconectar);
    s.on('sesion-invalida', alSesionInvalida);
    setConectado(s.connected);

    return () => {
      s.off(evento, alDato);
      s.off('connect', alConectar);
      s.off('disconnect', alDesconectar);
      // Antes no se quitaba: con el socket compartido, cada suscripción
      // dejaba uno más colgado.
      s.off('sesion-invalida', alSesionInvalida);
      suscriptores -= 1;
      cerrar();
    };
  }, [evento]);

  return { conectado };
}

/** Un aviso de la plataforma, tal como lo guarda el servidor. */
export interface Aviso {
  id: string;
  type: string;
  content: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export function useAvisosEnVivo(alRecibir: (aviso: Aviso) => void) {
  return useEvento<Aviso>('aviso-nuevo', alRecibir);
}

export function useMensajesEnVivo(alRecibir: (aviso: AvisoMensaje) => void) {
  return useEvento<AvisoMensaje>('mensaje-nuevo', alRecibir);
}
