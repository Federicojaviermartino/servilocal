'use client';
import { useState, useEffect, useRef, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Send } from 'lucide-react';
import { Message } from '@/types';
import { messagesApi } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import Avatar from '@/components/atoms/Avatar';
import Button from '@/components/atoms/Button';
import Spinner from '@/components/atoms/Spinner';

export default function ConversationPage() {
  const params = useParams();
  const partnerId = params.id as string;
  const { user } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const { data } = await messagesApi.getConversation(partnerId);
      setMessages(data || []);
    } catch {
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (partnerId) load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [partnerId]);

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
      load();
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

  const partner =
    messages.find((m) => m.senderId === partnerId)?.sender ||
    messages.find((m) => m.receiverId === partnerId)?.receiver;

  return (
    <div className="bg-white rounded-lg shadow-card flex flex-col h-[70vh]">
      {partner && (
        <div className="p-4 border-b border-neutral-200 flex items-center gap-3">
          <Avatar name={`${partner.firstName} ${partner.lastName}`} size="md" />
          <div>
            <p className="font-semibold text-neutral-900">
              {partner.firstName} {partner.lastName}
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-center text-neutral-500 py-10">
            Aun no hay mensajes en esta conversacion.
          </p>
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
                      : 'bg-neutral-100 text-neutral-900'
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">{m.content}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isOwn ? 'text-primary-100' : 'text-neutral-500'
                    }`}
                  >
                    {new Date(m.createdAt).toLocaleTimeString('es-ES', {
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
        className="p-3 border-t border-neutral-200 flex gap-2"
      >
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Button
          type="submit"
          isLoading={isSending}
          disabled={!content.trim() || isSending}
        >
          <Send size={18} />
        </Button>
      </form>
    </div>
  );
}
