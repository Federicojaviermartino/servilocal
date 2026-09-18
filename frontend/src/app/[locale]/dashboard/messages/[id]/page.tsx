'use client';
import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Send } from 'lucide-react';
import { Conversation, Message } from '@/types';
import { messagesApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useMensajesEnVivo, type AvisoMensaje } from '@/lib/socket-mensajes';
import Avatar from '@/components/atoms/Avatar';
import Button from '@/components/atoms/Button';
import Spinner from '@/components/atoms/Spinner';

export default function ConversationPage() {
  const t = useTranslations('mensajesPanel');
  const idioma = useLocale();
  const params = useParams();
  const partnerId = params.id as string;
  const { user } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [interlocutor, setInterlocutor] = useState<Conversation['partner']>();
  const [isLoading, setIsLoading] = useState(true);
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await messagesApi.getConversation(partnerId);
      setMessages(data || []);
    } catch {
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [partnerId]);

  // Llega por socket: se añade en el sitio en lugar de recargar la
  // conversación entera. El servidor manda el mensaje a los dos, así que
  // también se recibe el propio y no hace falta pintarlo por adelantado.
  const { conectado } = useMensajesEnVivo(
    useCallback(
      ({ mensaje, interlocutorId }: AvisoMensaje) => {
        // El servidor dice con quién es cada conversación. Mirar el remitente
        // no bastaría: en los mensajes propios el remitente soy yo, así que
        // no se distinguiría de lo que escribo en otra conversación.
        if (interlocutorId !== partnerId) return;

        setMessages((previos) =>
          // Con dos pestañas abiertas el mismo mensaje puede llegar dos
          // veces; sin esta comprobación React avisaría de claves repetidas
          // y la conversación mostraría el texto duplicado.
          previos.some((m) => m.id === mensaje.id)
            ? previos
            : [...previos, mensaje],
        );
      },
      [partnerId],
    ),
  );

  useEffect(() => {
    if (partnerId) load();
  }, [partnerId, load]);

  // Quién es el interlocutor no se puede deducir de los mensajes: si aún no
  // ha escrito, ninguno lleva su nombre. Viene de la lista de conversaciones,
  // que sí lo trae.
  useEffect(() => {
    messagesApi
      .getConversations()
      .then(({ data }) => {
        const hilo = (data as Conversation[] | undefined)?.find(
          (c) => c.partnerId === partnerId,
        );
        setInterlocutor(hilo?.partner);
      })
      .catch(() => setInterlocutor(undefined));
  }, [partnerId]);

  // Red de seguridad mientras el socket no esté conectado: en Render el
  // servicio se duerme y hay redes que cortan los sockets. Dejar de recibir
  // mensajes sin enterarse es la peor forma de fallar de una mensajería.
  useEffect(() => {
    if (conectado) return;
    const intervalo = setInterval(load, 10000);
    return () => clearInterval(intervalo);
  }, [conectado, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setIsSending(true);
    try {
      await messagesApi.send({
        receiverId: partnerId,
        content: content.trim(),
      });
      setContent('');
      // Con socket, el propio mensaje vuelve por él. Sin socket hay que
      // pedirlo, o quien escribe no vería lo que acaba de enviar.
      if (!conectado) load();
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  const partner = interlocutor;

  return (
    <div className="bg-superficie rounded-lg shadow-card flex flex-col h-[70vh]">
      {partner && (
        <div className="p-4 border-b border-borde flex items-center gap-3">
          <Avatar name={`${partner.firstName} ${partner.lastName}`} size="md" />
          <div>
            <p className="font-semibold text-principal">
              {partner.firstName} {partner.lastName}
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-tenue py-10">{t('sinMensajes')}</p>
        ) : (
          messages.map((m) => {
            const isOwn = m.senderId === user?.id;
            return (
              <div
                key={m.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    isOwn
                      ? 'bg-primary-600 text-white'
                      : 'bg-superficie-alt text-principal'
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">{m.content}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isOwn ? 'text-primary-100' : 'text-tenue'
                    }`}
                  >
                    {new Date(m.createdAt).toLocaleTimeString(idioma, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="p-3 border-t border-borde flex gap-2"
      >
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('escribePlaceholder')}
          className="flex-1 rounded-md border border-borde bg-superficie px-3 py-2 text-principal placeholder-tenue focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Button
          type="submit"
          isLoading={isSending}
          disabled={!content.trim() || isSending}
          aria-label={t('enviar')}
        >
          <Send size={18} aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
