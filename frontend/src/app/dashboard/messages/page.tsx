'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Conversation } from '@/types';
import { messagesApi } from '@/lib/api';
import Avatar from '@/components/atoms/Avatar';
import Badge from '@/components/atoms/Badge';
import Spinner from '@/components/atoms/Spinner';

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    messagesApi
      .getConversations()
      .then((res) => setConversations(res.data || []))
      .catch(() => setConversations([]))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">Mensajes</h1>

      {conversations.length === 0 ? (
        <div className="bg-white rounded-lg shadow-card p-10 text-center text-neutral-600">
          <p>No tienes conversaciones.</p>
          <p className="text-sm text-neutral-500 mt-2">
            Las conversaciones se crean al contactar con un profesional desde
            un servicio o reserva.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          {conversations.map((c) => (
            <Link
              key={c.partnerId}
              href={`/dashboard/messages/${c.partnerId}`}
              className="flex items-center gap-3 p-4 border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
            >
              <Avatar
                name={`${c.partner.firstName} ${c.partner.lastName}`}
                size="md"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-neutral-900 truncate">
                    {c.partner.firstName} {c.partner.lastName}
                  </p>
                  <span className="text-xs text-neutral-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(c.lastMessage.createdAt), {
                      locale: es,
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <p className="text-sm text-neutral-600 truncate mt-1">
                  {c.lastMessage.content}
                </p>
              </div>
              {c.unreadCount > 0 && (
                <Badge variant="info">{c.unreadCount}</Badge>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
