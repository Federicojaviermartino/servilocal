/**
 * Nivel atómico: Organismo
 * Componente: AsistenteBusqueda (búsqueda en lenguaje natural)
 *
 * Guarda el estado y habla con la API; la ventana la pinta PanelAsistente.
 */
'use client';
import { FormEvent, useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { iaApi } from '@/lib/api';
import PanelAsistente, { RespuestaAsistente } from './PanelAsistente';

export default function AsistenteBusqueda() {
  const t = useTranslations('asistente');
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaAsistente | null>(null);

  const cerrar = useCallback(() => setAbierto(false), []);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    const texto = mensaje.trim();
    if (!texto || enviando) return;

    setEnviando(true);
    setError(false);
    try {
      const { data } = await iaApi.asistente(texto);
      setRespuesta(data);
    } catch {
      // Da igual por qué falló: el usuario solo necesita saber que puede
      // reintentar. El detalle vive en el registro del servidor.
      setError(true);
      setRespuesta(null);
    } finally {
      setEnviando(false);
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={t('abrir')}
        className="fixed bottom-5 end-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      >
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </button>
    );
  }

  return (
    <PanelAsistente
      mensaje={mensaje}
      onMensajeChange={setMensaje}
      onEnviar={enviar}
      onCerrar={cerrar}
      enviando={enviando}
      error={error}
      respuesta={respuesta}
    />
  );
}
