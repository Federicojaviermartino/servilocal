'use client';
import { useState, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { formatDistanceToNow } from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';
import { localeDeFecha } from '@/lib/fechas';
import { Conversation } from '@/types';
import { messagesApi } from '@/lib/api';
import Avatar from '@/components/atoms/Avatar';
import Badge from '@/components/atoms/Badge';
import EstadoCarga from '@/components/molecules/EstadoCarga';
import { useCarga } from '@/lib/carga';

export default function MessagesPage() {
  const t = useTranslations('mensajesPanel');
  const idioma = useLocale();
  const { datos, estado, reintentar, referencia } = useCarga<Conversation[]>(
    () => messagesApi.getConversations(),
    [],
  );
  const conversations = datos ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold text-principal mb-6">{t('titulo')}</h1>

      <EstadoCarga
        estado={estado}
        onReintentar={reintentar}
        referencia={referencia}
      >
        {conversations.length === 0 ? (
          <div className="bg-superficie rounded-lg shadow-card p-10 text-center text-secundario">
            <p>{t('sinConversaciones')}</p>
            <p className="text-sm text-tenue mt-2">
              {t('sinConversacionesPista')}
            </p>
          </div>
        ) : (
          <div className="bg-superficie rounded-lg shadow-card overflow-hidden">
            {conversations.map((c) => (
              <Link
                key={c.partnerId}
                href={`/dashboard/messages/${c.partnerId}`}
                className="flex items-center gap-3 p-4 border-b border-borde last:border-0 hover:bg-fondo"
              >
                <Avatar
                  name={`${c.partner.firstName} ${c.partner.lastName}`}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-principal truncate">
                      {c.partner.firstName} {c.partner.lastName}
                    </p>
                    <span className="text-xs text-tenue whitespace-nowrap">
                      {formatDistanceToNow(new Date(c.lastMessage.createdAt), {
                        locale: localeDeFecha(idioma),
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-secundario truncate mt-1">
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
      </EstadoCarga>
    </div>
  );
}
