import { randomUUID } from 'node:crypto';
import type { JwtService } from '@nestjs/jwt';
import type { DataSource } from 'typeorm';
import { AUDIENCIA_API } from '../../src/auth/sesion';
import { arrancarAplicacion } from './aplicacion';

/**
 * De quién es cada cosa, con la aplicación montada y filas de verdad.
 *
 * La matriz de permisos comprueba el rol: llama a cada ruta con un
 * identificador inventado, y le basta con que ninguna guardia la pare. Que
 * una reserva solo la vean sus dos partes lo decide una comparación dentro
 * de cada servicio, probada con dobles: si una consulta dejaba de mirar de
 * quién es la fila, las 336 comprobaciones seguían en verde.
 *
 * Aquí hay una reserva, su pago, una valoración, una conversación, un aviso
 * y un servicio que son de alguien, y se piden como sus dueños, como un
 * tercero con el mismo rol, como la administración y como la de
 * demostración, que para lo real responde 404.
 */

type Quien =
  | 'clienta'
  | 'profesional'
  | 'otroCliente'
  | 'otroProfesional'
  | 'administracion'
  | 'demostracion';

describe('Lo que es de otro, con la aplicación montada', () => {
  let base: string;
  let jwt: JwtService;
  let fuente: DataSource;
  let cerrar: () => Promise<void>;

  const cuentas = {} as Record<
    Quien,
    { id: string; email: string; role: string }
  >;
  const ids = {} as Record<
    | 'servicio'
    | 'reserva'
    | 'completada'
    | 'pago'
    | 'valoracion'
    | 'conversacion'
    | 'aviso',
    string
  >;
  const INTENCION = `pi_propiedad_${randomUUID().slice(0, 8)}`;
  let visitante = 0;

  /** Una sesión nueva en cada llamada, como en la matriz de permisos. */
  async function llamar(
    quien: Quien,
    ruta: string,
    cuerpo?: Record<string, unknown>,
  ): Promise<{ estado: number; cuerpo: unknown }> {
    const [metodo, camino] = ruta.split(' ');
    const cuenta = cuentas[quien];
    const token = jwt.sign(
      { sub: cuenta.id, email: cuenta.email, role: cuenta.role },
      { audience: AUDIENCIA_API, jwtid: randomUUID() },
    );
    visitante += 1;
    const respuesta = await fetch(`${base}${camino}`, {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        // Lo que se prueba son los permisos, no el limitador.
        'cf-connecting-ip': `10.8.${visitante >> 8}.${visitante & 255}`,
        authorization: `Bearer ${token}`,
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const texto = await respuesta.text();
    return {
      estado: respuesta.status,
      cuerpo: texto ? (JSON.parse(texto) as unknown) : null,
    };
  }

  beforeAll(async () => {
    ({ base, jwt, fuente, cerrar } = await arrancarAplicacion());

    const crear = async (
      quien: Quien,
      role: string,
      demostracion = false,
    ): Promise<void> => {
      const email = `propiedad-${quien}-${randomUUID().slice(0, 8)}@correo.test`;
      const [{ id }] = await fuente.query(
        `INSERT INTO users
           (email, password, "firstName", "lastName", role, "soloLectura", "esDemostracion")
         VALUES ($1, 'sin-contrasena', 'Prueba', 'Propiedad', $2, $3, $3)
         RETURNING id`,
        [email, role, demostracion],
      );
      cuentas[quien] = { id, email, role };
    };
    await crear('clienta', 'client');
    await crear('profesional', 'provider');
    await crear('otroCliente', 'client');
    await crear('otroProfesional', 'provider');
    await crear('administracion', 'admin');
    await crear('demostracion', 'admin', true);

    const [{ id: categoria }] = await fuente.query(
      `SELECT id FROM categories ORDER BY id LIMIT 1`,
    );
    [{ id: ids.servicio }] = await fuente.query(
      `INSERT INTO services ("providerId", "categoryId", title, description,
         "priceMin", "priceUnit", address, city, location)
       VALUES ($1, $2, 'Servicio con dueño', 'De una cuenta de la prueba', 50,
               'por servicio', 'Calle Propia 1', 'Madrid',
               ST_SetSRID(ST_MakePoint(-3.7, 40.4), 4326))
       RETURNING id`,
      [cuentas.profesional.id, categoria],
    );
    const reservar = async (estado: string, cuando: string) => {
      const [{ id }] = await fuente.query(
        `INSERT INTO bookings ("clientId", "providerId", "serviceId",
           "scheduledDate", "durationMinutes", "totalPrice", status, description)
         VALUES ($1, $2, $3, now() + $4::interval, 60, 50, $5,
                 'La llave está debajo del felpudo')
         RETURNING id`,
        [
          cuentas.clienta.id,
          cuentas.profesional.id,
          ids.servicio,
          cuando,
          estado,
        ],
      );
      return id as string;
    };
    ids.reserva = await reservar('confirmed', '20 days');
    ids.completada = await reservar('completed', '-20 days');
    [{ id: ids.pago }] = await fuente.query(
      `INSERT INTO payments
         ("bookingId", "clientId", amount, status, "stripePaymentIntentId")
       VALUES ($1, $2, 50, 'pending', $3)
       RETURNING id`,
      [ids.reserva, cuentas.clienta.id, INTENCION],
    );
    [{ id: ids.valoracion }] = await fuente.query(
      `INSERT INTO reviews ("bookingId", "clientId", "serviceId", rating, comment)
       VALUES ($1, $2, $3, 5, 'Puntual y limpio')
       RETURNING id`,
      [ids.completada, cuentas.clienta.id, ids.servicio],
    );
    [{ id: ids.aviso }] = await fuente.query(
      `INSERT INTO notifications ("userId", type, title, content)
       VALUES ($1, 'booking_confirmed', 'Reserva aceptada', 'Tu reserva está aceptada')
       RETURNING id`,
      [cuentas.clienta.id],
    );
    // La conversación, por la API: es quien sabe crearla.
    const primero = await llamar('clienta', 'POST /api/messages', {
      receiverId: cuentas.profesional.id,
      content: 'El portero automático no funciona: llama al móvil.',
    });
    ids.conversacion = (
      primero.cuerpo as { conversationId: string }
    ).conversationId;
  });

  afterAll(async () => {
    if (fuente?.isInitialized) {
      const cuentasCreadas = Object.values(cuentas).map((c) => c.id);
      await fuente.query(`DELETE FROM notifications WHERE "userId" = ANY($1)`, [
        cuentasCreadas,
      ]);
      await fuente.query(
        `DELETE FROM messages WHERE "conversationId" IN
           (SELECT id FROM conversations
            WHERE "participantOneId" = ANY($1) OR "participantTwoId" = ANY($1))`,
        [cuentasCreadas],
      );
      await fuente.query(
        `DELETE FROM conversations
         WHERE "participantOneId" = ANY($1) OR "participantTwoId" = ANY($1)`,
        [cuentasCreadas],
      );
      await fuente.query(`DELETE FROM reviews WHERE "clientId" = ANY($1)`, [
        cuentasCreadas,
      ]);
      await fuente.query(`DELETE FROM payments WHERE "clientId" = ANY($1)`, [
        cuentasCreadas,
      ]);
      await fuente.query(`DELETE FROM bookings WHERE "clientId" = ANY($1)`, [
        cuentasCreadas,
      ]);
      await fuente.query(`DELETE FROM services WHERE "providerId" = ANY($1)`, [
        cuentasCreadas,
      ]);
      await fuente.query(`DELETE FROM users WHERE id = ANY($1)`, [
        cuentasCreadas,
      ]);
    }
    await cerrar?.();
  });

  describe('leer', () => {
    it.each([
      ['clienta', 200],
      ['profesional', 200],
      ['otroCliente', 403],
      ['otroProfesional', 403],
      ['administracion', 200],
      // Para ella, lo que no es de la demostración no existe.
      ['demostracion', 404],
    ] as const)('la reserva, como %s: %i', async (quien, esperado) => {
      const { estado, cuerpo } = await llamar(
        quien,
        `GET /api/bookings/${ids.reserva}`,
      );

      expect(estado).toBe(esperado);
      if (esperado !== 200) {
        // Ni el rechazo deja escapar lo que hay dentro.
        expect(JSON.stringify(cuerpo)).not.toContain('felpudo');
      }
    });

    it.each([
      ['clienta', 200],
      ['profesional', 200],
      ['otroCliente', 403],
      ['otroProfesional', 403],
      ['administracion', 200],
      ['demostracion', 404],
    ] as const)('su pago, como %s: %i', async (quien, esperado) => {
      const { estado } = await llamar(
        quien,
        `GET /api/payments/booking/${ids.reserva}`,
      );

      expect(estado).toBe(esperado);
    });

    it('la conversación de otros dos no se lee pidiéndola con uno de ellos', async () => {
      // La ruta va por interlocutor: lo que devuelve es la conversación de
      // quien pregunta con él, que aquí no existe.
      const { estado, cuerpo } = await llamar(
        'otroCliente',
        `GET /api/messages/conversation/${cuentas.profesional.id}`,
      );

      expect(estado).toBe(200);
      expect(JSON.stringify(cuerpo)).not.toContain('portero');
      // Y sus dos partes sí la leen.
      const suya = await llamar(
        'clienta',
        `GET /api/messages/conversation/${cuentas.profesional.id}`,
      );
      expect(JSON.stringify(suya.cuerpo)).toContain('portero');
    });
  });

  describe('cambiar', () => {
    /** Lo que hay en la base, para comprobar que el rechazo no dejó nada. */
    const leer = async (tabla: string, id: string, columna: string) => {
      const [fila] = await fuente.query(
        `SELECT "${columna}" AS valor FROM ${tabla} WHERE id = $1`,
        [id],
      );
      return (fila as { valor: unknown } | undefined)?.valor;
    };

    it.each(['otroCliente', 'otroProfesional'] as const)(
      'la reserva no la cancela %s',
      async (quien) => {
        const { estado } = await llamar(
          quien,
          `PATCH /api/bookings/${ids.reserva}/status`,
          { status: 'cancelled' },
        );

        expect(estado).toBe(403);
        expect(await leer('bookings', ids.reserva, 'status')).toBe('confirmed');
      },
    );

    it('ni la completa otro profesional', async () => {
      const { estado } = await llamar(
        'otroProfesional',
        `PATCH /api/bookings/${ids.reserva}/status`,
        { status: 'completed' },
      );

      expect(estado).toBe(403);
      expect(await leer('bookings', ids.reserva, 'status')).toBe('confirmed');
    });

    it('el cobro de la reserva de otra no lo abre otro cliente', async () => {
      const { estado } = await llamar(
        'otroCliente',
        'POST /api/payments/create-intent',
        { bookingId: ids.reserva },
      );

      expect(estado).toBe(403);
    });

    it('ni da por retenido el pago de otra', async () => {
      // Se rechaza antes de preguntar a Stripe: bastaba con conocer el
      // identificador de la intención.
      const { estado } = await llamar(
        'otroCliente',
        `POST /api/payments/confirm/${INTENCION}`,
      );

      expect(estado).toBe(403);
      expect(await leer('payments', ids.pago, 'status')).toBe('pending');
    });

    it('la valoración de una reserva ajena no la escribe otro cliente', async () => {
      const [{ id: sinValorar }] = await fuente.query(
        `INSERT INTO bookings ("clientId", "providerId", "serviceId",
           "scheduledDate", "durationMinutes", "totalPrice", status)
         VALUES ($1, $2, $3, now() - interval '5 days', 60, 50, 'completed')
         RETURNING id`,
        [cuentas.clienta.id, cuentas.profesional.id, ids.servicio],
      );

      const { estado } = await llamar('otroCliente', 'POST /api/reviews', {
        bookingId: sinValorar,
        rating: 1,
        comment: 'No estuve allí',
      });

      expect(estado).toBe(403);
      const [{ total }] = await fuente.query(
        `SELECT count(*)::int AS total FROM reviews WHERE "bookingId" = $1`,
        [sinValorar],
      );
      expect(total).toBe(0);
    });

    it('a una valoración solo le contesta el profesional de ese servicio', async () => {
      const { estado } = await llamar(
        'otroProfesional',
        `PATCH /api/reviews/${ids.valoracion}/response`,
        { providerResponse: 'Gracias, aunque no era mi trabajo' },
      );

      expect(estado).toBe(403);
      expect(
        await leer('reviews', ids.valoracion, 'providerResponse'),
      ).toBeNull();
    });

    it('en una conversación solo escriben sus dos partes', async () => {
      const { estado } = await llamar(
        'otroCliente',
        `POST /api/messages/conversation/${ids.conversacion}`,
        { content: 'Me cuelo' },
      );

      expect(estado).toBe(403);
      const [{ total }] = await fuente.query(
        `SELECT count(*)::int AS total FROM messages WHERE "conversationId" = $1`,
        [ids.conversacion],
      );
      expect(total).toBe(1);
    });

    it('un aviso solo lo marca como leído su destinataria', async () => {
      const { estado } = await llamar(
        'otroCliente',
        `PATCH /api/notifications/${ids.aviso}/read`,
      );

      // 404 y no 403: ni siquiera se le dice que existe.
      expect(estado).toBe(404);
      expect(await leer('notifications', ids.aviso, 'isRead')).toBe(false);
    });

    it.each([
      ['otroProfesional', 'PUT', 403],
      ['otroProfesional', 'DELETE', 403],
      // El cliente ni siquiera tiene el rol para editar.
      ['otroCliente', 'PUT', 403],
      ['otroCliente', 'DELETE', 403],
    ] as const)(
      'el servicio no lo toca %s con %s',
      async (quien, metodo, esperado) => {
        const { estado } = await llamar(
          quien,
          `${metodo} /api/services/${ids.servicio}`,
          metodo === 'PUT' ? { title: 'Ya no es tuyo' } : undefined,
        );

        expect(estado).toBe(esperado);
        expect(await leer('services', ids.servicio, 'title')).toBe(
          'Servicio con dueño',
        );
        expect(await leer('services', ids.servicio, 'withdrawnAt')).toBeNull();
      },
    );
  });
});
