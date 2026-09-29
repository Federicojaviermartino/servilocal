import { DataSource } from 'typeorm';
import { Conversation, Message, User } from '../../src/entities';
import { MessagesService } from '../../src/messages/messages.service';
import { crearFuente } from './base';

/**
 * Dos mensajes a la vez entre las mismas personas.
 *
 * Cada envío miraba si ya había conversación antes de que el otro la
 * guardara, y se creaban dos: cada mensaje acababa en un hilo distinto. El
 * cerrojo por pareja solo se ve contra PostgreSQL, con dos transacciones de
 * verdad compitiendo.
 */
describe('Conversaciones', () => {
  let fuente: DataSource;
  let mensajes: MessagesService;
  let pareja: { a: string; b: string };

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    mensajes = new MessagesService(
      fuente.getRepository(Conversation),
      fuente.getRepository(Message),
      fuente.getRepository(User),
      { notificarMensaje: () => undefined } as never,
    );
    // Dos cuentas activas del mismo mundo que no hayan hablado nunca.
    const [fila] = await fuente.query(
      `SELECT a.id AS a, b.id AS b FROM users a
       JOIN users b ON b.id > a.id AND b."esDemostracion" = a."esDemostracion"
       WHERE a."isActive" AND b."isActive"
         AND a."eliminadaEn" IS NULL AND b."eliminadaEn" IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM conversations c
           WHERE (c."participantOneId" = a.id AND c."participantTwoId" = b.id)
              OR (c."participantOneId" = b.id AND c."participantTwoId" = a.id))
       LIMIT 1`,
    );
    pareja = fila;
    // Las conexiones del pool se abren cuando hacen falta: en frío, el
    // primer envío terminaba mientras los demás aún conectaban, y la
    // carrera no llegaba a darse. En producción el pool está caliente.
    await Promise.all(
      Array.from({ length: 10 }, () => fuente.query('SELECT pg_sleep(0.1)')),
    );
  });

  afterAll(async () => {
    if (!fuente?.isInitialized) return;
    await fuente.query(
      `DELETE FROM messages WHERE "conversationId" IN (
         SELECT id FROM conversations
         WHERE "participantOneId" IN ($1, $2) AND "participantTwoId" IN ($1, $2))`,
      [pareja.a, pareja.b],
    );
    await fuente.query(
      `DELETE FROM conversations
       WHERE "participantOneId" IN ($1, $2) AND "participantTwoId" IN ($1, $2)`,
      [pareja.a, pareja.b],
    );
    await fuente.destroy();
  });

  it('varios mensajes a la vez entre la misma pareja acaban en un solo hilo', async () => {
    // Diez a la vez, en los dos sentidos: con dos, a veces el segundo ya
    // encontraba el hilo del primero y la carrera no llegaba a verse.
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        i % 2 === 0
          ? mensajes.sendMessage(pareja.a, {
              receiverId: pareja.b,
              content: `Hola, ¿tienes hueco el jueves? (${i})`,
            })
          : mensajes.sendMessage(pareja.b, {
              receiverId: pareja.a,
              content: `Hola, justo te iba a escribir. (${i})`,
            }),
      ),
    );

    const [{ n }] = await fuente.query(
      `SELECT count(*)::int AS n FROM conversations
       WHERE "participantOneId" IN ($1, $2) AND "participantTwoId" IN ($1, $2)`,
      [pareja.a, pareja.b],
    );
    expect(n).toBe(1);
  });
});
