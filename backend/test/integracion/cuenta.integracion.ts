import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  RestablecimientoContrasena,
  SesionRevocada,
  User,
} from '../../src/entities';
import { AuthService } from '../../src/auth/auth.service';
import { SesionesService } from '../../src/auth/sesiones.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { UsersService } from '../../src/users/users.service';
import { crearFuente } from './base';

/**
 * La cuenta de principio a fin, contra la base de verdad.
 *
 * Eliminar una cuenta toca a la vez usuarios, servicios, reservas,
 * valoraciones, avisos y enlaces, con claves ajenas que ya no borran en
 * cascada: con dobles, cada tabla diría lo que se le pidiera. Aquí se ve
 * qué se queda, qué se va y que la base lo permite.
 */
describe('La cuenta', () => {
  let fuente: DataSource;
  let usuarios: UsersService;
  let acceso: AuthService;
  const olvidarCliente = vi.fn(async () => undefined);
  const enviados: Array<{ texto: string }> = [];

  const CLAVE = 'Clave12345!';

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    usuarios = new UsersService(
      fuente.getRepository(User),
      { anotar: vi.fn() } as never,
      fuente,
      { olvidarCliente } as never,
    );
    acceso = new AuthService(
      fuente.getRepository(User),
      new JwtService({ secret: 'secreto-de-integracion' }),
      fuente.getRepository(RestablecimientoContrasena),
      {
        exigirDisponible: () => undefined,
        enviar: async (correo: { texto: string }) => {
          enviados.push(correo);
        },
      } as never,
      fuente,
    );
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  /** Una cuenta real, desechable, con la contraseña conocida. */
  async function cuentaNueva(rol = 'provider'): Promise<{
    id: string;
    email: string;
  }> {
    const email = `cuenta-${Date.now()}-${Math.random().toString(36).slice(2)}@correo.test`;
    const [fila] = await fuente.query(
      `INSERT INTO users
         (email, password, "firstName", "lastName", role, phone, city,
          "stripeCustomerId")
       VALUES ($1, $2, 'Marta', 'Pérez', $3, '600111222', 'Málaga', 'cus_prueba')
       RETURNING id`,
      [email, await bcrypt.hash(CLAVE, 4), rol],
    );
    return { id: fila.id, email };
  }

  describe('eliminarla', () => {
    it('anonimiza la cuenta y conserva el historial de los demás', async () => {
      const cuenta = await cuentaNueva();
      const [{ id: categoria }] = await fuente.query(
        `SELECT id FROM categories LIMIT 1`,
      );
      const [{ id: cliente }] = await fuente.query(
        `SELECT id FROM users WHERE role = 'client' AND "esDemostracion" LIMIT 1`,
      );
      const servicio = async () =>
        (
          await fuente.query(
            `INSERT INTO services
               ("providerId", "categoryId", title, description, "priceMin",
                "priceUnit", address, city, location)
             VALUES ($1, $2, 'Carpintería', 'Llámame al 600111222', 30,
                     'por hora', 'Calle Mía 1', 'Málaga',
                     ST_SetSRID(ST_MakePoint(-4.42, 36.72), 4326))
             RETURNING id`,
            [cuenta.id, categoria],
          )
        )[0].id as string;
      const conHistorial = await servicio();
      const sinHistorial = await servicio();
      const [{ id: reserva }] = await fuente.query(
        `INSERT INTO bookings
           ("clientId", "providerId", "serviceId", "scheduledDate",
            "totalPrice", status)
         VALUES ($1, $2, $3, now() - interval '3 days', 30, 'completed')
         RETURNING id`,
        [cliente, cuenta.id, conHistorial],
      );
      await fuente.query(
        `INSERT INTO reviews ("bookingId", "clientId", "serviceId", rating)
         VALUES ($1, $2, $3, 5)`,
        [reserva, cliente, conHistorial],
      );
      await fuente.query(
        `INSERT INTO notifications ("userId", type, title, content)
         VALUES ($1, 'system', 'aviso', '{}')`,
        [cuenta.id],
      );
      await fuente.query(
        `INSERT INTO restablecimientos_contrasena ("userId", huella, caduca)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [cuenta.id, 'h'.repeat(64)],
      );

      try {
        await usuarios.eliminarCuenta(cuenta.id, CLAVE);

        const [fila] = await fuente.query(
          `SELECT email, "firstName", "lastName", phone, city,
                  "stripeCustomerId", "isActive", "eliminadaEn"
           FROM users WHERE id = $1`,
          [cuenta.id],
        );
        expect(fila).toMatchObject({
          email: `eliminada-${cuenta.id}@servilocal.invalid`,
          firstName: 'Cuenta',
          lastName: 'eliminada',
          phone: null,
          city: null,
          stripeCustomerId: null,
          isActive: false,
        });
        expect(fila.eliminadaEn).toBeTruthy();

        // El servicio con historial se queda, retirado y vacío.
        const [retirado] = await fuente.query(
          `SELECT "isActive", "withdrawnAt", description, address,
                  ST_X(location) AS x, ST_Y(location) AS y
           FROM services WHERE id = $1`,
          [conHistorial],
        );
        expect(retirado).toMatchObject({
          isActive: false,
          description: 'Servicio retirado.',
          address: '—',
          x: 0,
          y: 0,
        });
        expect(retirado.withdrawnAt).toBeTruthy();
        // El que no tenía historial, ya no está.
        expect(
          await fuente.query(`SELECT 1 FROM services WHERE id = $1`, [
            sinHistorial,
          ]),
        ).toEqual([]);

        // La reserva y la valoración de la otra parte siguen.
        expect(
          await fuente.query(`SELECT 1 FROM bookings WHERE id = $1`, [reserva]),
        ).toHaveLength(1);
        expect(
          await fuente.query(`SELECT 1 FROM reviews WHERE "bookingId" = $1`, [
            reserva,
          ]),
        ).toHaveLength(1);

        // Lo que era solo suyo se va.
        expect(
          await fuente.query(
            `SELECT 1 FROM notifications WHERE "userId" = $1`,
            [cuenta.id],
          ),
        ).toEqual([]);
        expect(
          await fuente.query(
            `SELECT 1 FROM restablecimientos_contrasena WHERE "userId" = $1`,
            [cuenta.id],
          ),
        ).toEqual([]);
        expect(olvidarCliente).toHaveBeenCalledWith('cus_prueba');

        // Y el correo queda libre para volver a registrarse.
        expect(
          await fuente.query(`SELECT 1 FROM users WHERE email = $1`, [
            cuenta.email,
          ]),
        ).toEqual([]);
      } finally {
        await fuente.query(`DELETE FROM reviews WHERE "bookingId" = $1`, [
          reserva,
        ]);
        await fuente.query(`DELETE FROM bookings WHERE id = $1`, [reserva]);
        await fuente.query(`DELETE FROM services WHERE "providerId" = $1`, [
          cuenta.id,
        ]);
        await fuente.query(`DELETE FROM users WHERE id = $1`, [cuenta.id]);
      }
    });

    it('su correo sale del historial de moderación, y la decisión se queda', async () => {
      const cuenta = await cuentaNueva('client');
      const entrada = async (sobre: string, correo: string) =>
        (
          await fuente.query(
            `INSERT INTO audit_logs
               ("actorId", "actorEmail", accion, entidad, "entidadId", contexto)
             VALUES (uuid_generate_v4(), 'admin@correo.test',
                     'usuario_desactivado', 'usuario', $1,
                     jsonb_build_object('email', $2::text))
             RETURNING id`,
            [sobre, correo],
          )
        )[0].id as string;
      const suya = await entrada(cuenta.id, cuenta.email);
      // La de otra cuenta no se toca.
      const ajena = await entrada(
        '00000000-0000-4000-8000-000000000001',
        'otra@correo.test',
      );

      try {
        await usuarios.eliminarCuenta(cuenta.id, CLAVE);

        const filas: Array<{
          id: string;
          actorEmail: string;
          accion: string;
          contexto: Record<string, string>;
        }> = await fuente.query(
          `SELECT id, "actorEmail", accion, contexto FROM audit_logs
           WHERE id = ANY($1)`,
          [[suya, ajena]],
        );
        const porId = Object.fromEntries(filas.map((f) => [f.id, f]));
        expect(porId[suya]).toMatchObject({
          actorEmail: 'admin@correo.test',
          accion: 'usuario_desactivado',
          contexto: { email: `eliminada-${cuenta.id}@servilocal.invalid` },
        });
        expect(porId[ajena].contexto).toEqual({ email: 'otra@correo.test' });
      } finally {
        await fuente.query(`DELETE FROM audit_logs WHERE id = ANY($1)`, [
          [suya, ajena],
        ]);
        await fuente.query(`DELETE FROM users WHERE id = $1`, [cuenta.id]);
      }
    });
  });

  describe('recuperar la contraseña', () => {
    it('el enlace pone la contraseña nueva, cierra las sesiones y no vale dos veces', async () => {
      const cuenta = await cuentaNueva('client');
      enviados.length = 0;

      try {
        // En mayúsculas: la cuenta se encuentra igual.
        await acceso.solicitarRecuperacion(cuenta.email.toUpperCase(), 'es');

        expect(enviados).toHaveLength(1);
        const token = /token=(\S+)/.exec(enviados[0].texto)![1];
        const [enlace] = await fuente.query(
          `SELECT huella FROM restablecimientos_contrasena WHERE "userId" = $1`,
          [cuenta.id],
        );
        // Solo la huella: con una copia de la base no se entra en ninguna.
        expect(enlace.huella).not.toBe(token);

        await acceso.restablecer(token, 'Nueva12345!');

        const [fila] = await fuente.query(
          `SELECT password, "sesionesDesde" FROM users WHERE id = $1`,
          [cuenta.id],
        );
        expect(await bcrypt.compare('Nueva12345!', fila.password)).toBe(true);
        expect(fila.sesionesDesde).toBeTruthy();

        const error = await acceso
          .restablecer(token, 'OtraMas12345!')
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BadRequestException);
      } finally {
        await fuente.query(`DELETE FROM users WHERE id = $1`, [cuenta.id]);
      }
    });
  });

  it('se entra con el correo escrito con mayúsculas', async () => {
    const cuenta = await cuentaNueva('client');
    try {
      const sesion = await acceso.login({
        email: cuenta.email.replace('cuenta', 'CUENTA'),
        password: CLAVE,
      });

      expect(sesion.user.id).toBe(cuenta.id);
    } finally {
      await fuente.query(`DELETE FROM users WHERE id = $1`, [cuenta.id]);
    }
  });

  it('los datos de una cuenta se descargan sin la contraseña', async () => {
    const [{ id }] = await fuente.query(
      `SELECT id FROM users WHERE email = 'laura@ejemplo.com'`,
    );

    const datos = (await usuarios.exportarDatos(id)) as {
      cuenta: { email: string };
      reservas: { comoCliente: unknown[] };
    };

    expect(datos.cuenta.email).toBe('laura@ejemplo.com');
    expect(datos.reservas.comoCliente.length).toBeGreaterThan(0);
    const texto = JSON.stringify(datos);
    expect(texto).not.toMatch(/\$2[aby]\$/);
    expect(texto).not.toContain('password');
  });

  /**
   * De la otra parte, solo el nombre de pila. La contraseña no sale nunca
   * —la columna no se lee salvo que se pida—, así que comprobar solo eso
   * dejaba pasar lo que de verdad importa: si la exportación volcara el
   * perfil entero de quien está al otro lado, saldrían su correo, su
   * teléfono y su dirección, y nada fallaría.
   */
  it.each([
    ['la clienta', 'laura@ejemplo.com', 'clientId', 'providerId'],
    ['el profesional', null, 'providerId', 'clientId'],
  ])(
    'descargando %s, de la otra parte solo sale el nombre',
    async (_quien, correo, columnaPropia, columnaAjena) => {
      // El profesional, el que más reservas tiene en la semilla.
      const [{ id }] = await fuente.query(
        correo
          ? `SELECT id FROM users WHERE email = $1`
          : `SELECT "providerId" AS id FROM bookings
             GROUP BY "providerId" ORDER BY count(*) DESC LIMIT 1`,
        correo ? [correo] : [],
      );
      const otras: Array<Record<string, string | null>> = await fuente.query(
        `SELECT DISTINCT u.email, u.phone, u.address, u."lastName"
           FROM bookings b JOIN users u ON u.id = b."${columnaAjena}"
          WHERE b."${columnaPropia}" = $1
         UNION
         SELECT DISTINCT u.email, u.phone, u.address, u."lastName"
           FROM conversations c
           JOIN users u ON u.id IN (c."participantOneId", c."participantTwoId")
          WHERE $1 IN (c."participantOneId", c."participantTwoId")
            AND u.id <> $1`,
        [id],
      );

      const texto = JSON.stringify(await usuarios.exportarDatos(id));

      expect(otras.length).toBeGreaterThan(0);
      for (const otra of otras) {
        for (const dato of Object.values(otra)) {
          if (dato) expect(texto).not.toContain(dato);
        }
      }
    },
  );

  it('el índice sobre lower(email) existe, para que buscar así no recorra la tabla', async () => {
    const indices = await fuente.query(
      `SELECT indexname FROM pg_indexes WHERE indexname = 'IDX_users_email_minusculas'`,
    );

    expect(indices).toHaveLength(1);
  });

  it('una cuenta que la administración desactiva pierde el acceso con el token que ya tenía', async () => {
    // Lo decide una consulta con «isActive: true». Ninguna prueba lo miraba
    // contra la base: con un doble, quitarla no rompía nada.
    const cuenta = await cuentaNueva('client');
    const jwt = new JwtService({ secret: 'secreto-de-integracion' });
    const estrategia = new JwtStrategy(
      {
        getOrThrow: () => 'secreto-de-integracion',
      } as unknown as ConfigService,
      fuente.getRepository(User),
      new SesionesService(fuente.getRepository(SesionRevocada), jwt),
    );
    const [{ id: administrador }] = await fuente.query(
      `SELECT id FROM users WHERE role = 'admin' LIMIT 1`,
    );

    try {
      const sesion = await acceso.login({
        email: cuenta.email,
        password: CLAVE,
      });
      const pase = jwt.decode(sesion.accessToken);
      await expect(estrategia.validate(pase)).resolves.toMatchObject({
        id: cuenta.id,
      });

      await usuarios.toggleActive(cuenta.id, { id: administrador } as never);

      await expect(estrategia.validate(pase)).rejects.toThrow(
        UnauthorizedException,
      );
    } finally {
      await fuente.query(`DELETE FROM users WHERE id = $1`, [cuenta.id]);
    }
  });
});
