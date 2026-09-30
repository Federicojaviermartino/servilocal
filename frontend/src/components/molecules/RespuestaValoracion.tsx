/**
 * Nivel atómico: Molécula
 * Componente: RespuestaValoracion (el profesional responde a una valoración)
 */
'use client';
import { FormEvent, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import toast from 'react-hot-toast';
import { reviewsApi } from '@/lib/api';
import { useAvisoDeFallo } from '@/lib/aviso-de-fallo';
import Button from '../atoms/Button';

/** El tope de la API para una respuesta. */
const MAXIMO = 1000;

/**
 * La API dejaba responder a una valoración, pero ninguna pantalla lo
 * ofrecía: el profesional no tenía forma de contestar a una reseña, ni
 * siquiera a una injusta. Sale bajo cada valoración sin respuesta, en la
 * ficha de su propio servicio.
 */
export default function RespuestaValoracion({
  reviewId,
  onRespondida,
}: {
  reviewId: string;
  onRespondida: (respuesta: string) => void;
}) {
  const t = useTranslations('detalle');
  const tComun = useTranslations('comun');
  const avisarFallo = useAvisoDeFallo();
  const id = useId();
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!abierta) {
    return (
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="mt-2 text-sm text-acento underline hover:no-underline"
      >
        {t('responder')}
      </button>
    );
  }

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    const respuesta = texto.trim();
    if (!respuesta || enviando) return;
    setEnviando(true);
    try {
      await reviewsApi.respond(reviewId, respuesta);
      toast.success(t('respuestaPublicada'));
      onRespondida(respuesta);
    } catch (error) {
      avisarFallo(error, t('errorResponder'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mt-3 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-secundario">
        {t('tuRespuesta')}
      </label>
      <textarea
        id={id}
        dir="auto"
        rows={3}
        maxLength={MAXIMO}
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        className="w-full rounded-md border border-borde bg-superficie px-3 py-2 text-sm text-principal focus:outline-none focus:ring-2 focus:ring-acento"
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAbierta(false)}
        >
          {tComun('cancelar')}
        </Button>
        <Button
          type="submit"
          size="sm"
          isLoading={enviando}
          disabled={!texto.trim() || enviando}
        >
          {t('publicarRespuesta')}
        </Button>
      </div>
    </form>
  );
}
