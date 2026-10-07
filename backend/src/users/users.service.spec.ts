import type { Mock } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  Booking,
  BookingStatus,
  Conversation,
  Message,
  Notification,
  Payment,
  RestablecimientoContrasena,
  Review,
  Service,
  User,
  UserRole,
} from '../entities';
import { UsersService } from './users.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PaymentsService } from '../payments/payments.service';
import { TiempoRealGateway } from '../common/tiempo-real/tiempo-real.gateway';

/** La transacción de la eliminación, y las consultas de la exportación. */
const gestor = {
  query: vi.fn(async () => []),
  delete: vi.fn(async () => ({ affected: 1 })),
  update: vi.fn(async () => ({ affected: 1 })),
};
const manager = {
  count: vi.fn(async () => 0),
  find: vi.fn(
    async (_entidad: unknown, _opciones?: unknown) => [] as unknown[],
  ),
};
const dataSource = {
  manager,
  transaction: vi.fn(async (ejecutar: (g: typeof gestor) => Promise<unknown>) =>
    ejecutar(gestor),
  ),
};
const pagos = { olvidarCliente: vi.fn(async () => undefined) };
const tiempoReal = { desconectar: vi.fn() };

describe('UsersService', () => {
  let servicio: UsersService;
  let repo: { findOne: Mock; save: Mock; find: Mock };
  const auditoria = { anotar: vi.fn(async () => undefined) };

  const OTRO = 'b2c3d4e5-0000-4000-8000-000000000002';
  const YO = 'a1b2c3d4-0000-4000-8000-000000000001';
  const ACTOR = { id: YO, email: 'admin@servilocal.com' };

  beforeEach(async () => {
    repo = {
      findOne: vi.fn(async () => ({ id: OTRO, isActive: true }) as User),
      save: vi.fn(async (u: User) => u),
      find: vi.fn(async (_o?: unknown) => [] as User[]),
    };
    auditoria.anotar.mockClear();
    vi.clearAllMocks();
    manager.count.mockResolvedValue(0);
    manager.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: AuditoriaService, useValue: auditoria },
        { provide: DataSource, useValue: dataSource },
        { provide: PaymentsService, useValue: pagos },
        { provide: TiempoRealGateway, useValue: tiempoReal },
      ],
    }).compile();

    servicio = module.get(UsersService);
  });

  describe('toggleActive', () => {
    it('cambia el estado de otra cuenta', async () => {
      const resultado = await servicio.toggleActive(OTRO, ACTOR);

      expect(resultado.isActive).toBe(false);
      expect(repo.save).toHaveBeenCalled();
    });

    it('al desactivarla se cierran sus sockets; al reactivarla, no', async () => {
      // Una cuenta desactivada ya no entra en la API, pero el socket que
      // tuviera abierto seguía recibiendo mensajes y avisos.
      await servicio.toggleActive(OTRO, ACTOR);
      expect(tiempoReal.desconectar).toHaveBeenCalledWith(OTRO);

      tiempoReal.desconectar.mockClear();
      repo.findOne.mockResolvedValueOnce({ id: OTRO, isActive: false } as User);
      await servicio.toggleActive(OTRO, ACTOR);
      expect(tiempoReal.desconectar).not.toHaveBeenCalled();
    });

    it('no deja que un administrador se desactive a sí mismo', async () => {
      // Sería irreversible: la estrategia JWT rechaza a los inactivos y la
      // ruta exige un administrador activo, así que con un solo administrador
      // no queda nadie que pueda deshacerlo desde la aplicación.
      await expect(servicio.toggleActive(YO, ACTOR)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('una cuenta que eliminó su titular no se reactiva', async () => {
      // Sería una cáscara vacía, con una contraseña que no conoce nadie.
      repo.findOne.mockResolvedValueOnce({
        id: OTRO,
        isActive: false,
        eliminadaEn: new Date(),
      } as User);

      await expect(servicio.toggleActive(OTRO, ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
      expect(auditoria.anotar).not.toHaveBeenCalled();
    });

    it('sigue avisando si la cuenta no existe', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(servicio.toggleActive(OTRO, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
  describe('lo que sale de un listado de usuarios', () => {
    it('no se pide la contraseña ni la ubicación', async () => {
      // El listado lo ve administración, pero la columna de contraseña no
      // tiene por qué salir de la base de datos ni para eso.
      await servicio.findAll();

      const opciones = repo.find.mock.calls[0][0] as {
        select: Record<string, boolean>;
      };
      expect(opciones.select.email).toBe(true);
      expect(opciones.select).not.toHaveProperty('password');
      expect(opciones.select).not.toHaveProperty('location');
    });

    it('a la administración de demostración, solo las cuentas de su mundo', async () => {
      // Con el registro abierto, las cuentas reales quedaban a la vista de
      // cualquier visitante, aunque con los datos tapados.
      await servicio.findAll({ soloDemostracion: true });

      const opciones = repo.find.mock.calls[0][0] as { where: unknown };
      expect(opciones.where).toEqual({ esDemostracion: true });
    });

    it('a la de verdad, todas', async () => {
      await servicio.findAll();

      const opciones = repo.find.mock.calls[0][0] as { where: unknown };
      expect(opciones.where).toBeUndefined();
    });
  });

  describe('editar el perfil', () => {
    beforeEach(() => {
      repo.findOne.mockResolvedValue({
        id: OTRO,
        isActive: true,
        city: 'Málaga',
        location: 'punto-original',
      } as unknown as User);
    });

    it('el punto lleva la longitud delante de la latitud', async () => {
      // GeoJSON va en (x, y), o sea (longitud, latitud). Invertirlo compila
      // igual y coloca a la persona en el hemisferio equivocado.
      //
      // Antes esta prueba daba por bueno `SRID=4326;POINT(-4.42 36.72)`, y
      // con PostGIS ese texto hacía fallar la consulta: un doble no sabe que
      // TypeORM espera GeoJSON. Lo que llega a la base de verdad lo mira la
      // integración.
      const r = await servicio.update(OTRO, {
        latitude: 36.72,
        longitude: -4.42,
      } as never);

      expect(r.location).toEqual({
        type: 'Point',
        coordinates: [-4.42, 36.72],
      });
    });

    it('una coordenada 0 también cuenta', async () => {
      // Se comparaba por verdad, y 0 es falso: el meridiano de Greenwich,
      // que pasa por Castellón, no se podía guardar.
      const r = await servicio.update(OTRO, {
        latitude: 39.99,
        longitude: 0,
      } as never);

      expect(r.location).toEqual({ type: 'Point', coordinates: [0, 39.99] });
    });

    it('sin las dos coordenadas no se toca la ubicación', async () => {
      // Una posición a medias es peor que ninguna: dejaría a la persona en
      // el meridiano cero.
      const r = await servicio.update(OTRO, { latitude: 36.72 } as never);

      expect(r.location).toBe('punto-original');
    });

    it('la latitud y la longitud no se copian como campos sueltos', async () => {
      // No son columnas de la entidad: asignarlas ensuciaría la fila con dos
      // campos que TypeORM no sabe guardar.
      const r = (await servicio.update(OTRO, {
        city: 'Sevilla',
        latitude: 36.72,
        longitude: -4.42,
      } as never)) as unknown as Record<string, unknown>;

      expect(r.city).toBe('Sevilla');
      expect(r.latitude).toBeUndefined();
      expect(r.longitude).toBeUndefined();
    });

    it('avisa si la cuenta no existe', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await expect(
        servicio.update(OTRO, { city: 'Sevilla' } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('lo que queda anotado al cambiar el estado de una cuenta', () => {
    it('desactivar y activar se distinguen en el historial', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: OTRO,
        isActive: true,
        email: 'laura@ejemplo.com',
      } as User);

      await servicio.toggleActive(OTRO, ACTOR);

      expect(auditoria.anotar).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: 'usuario_desactivado',
          entidadId: OTRO,
          contexto: { email: 'laura@ejemplo.com' },
        }),
      );
    });

    it('reactivar queda con su propia acción', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: OTRO,
        isActive: false,
        email: 'laura@ejemplo.com',
      } as User);

      await servicio.toggleActive(OTRO, ACTOR);

      expect(auditoria.anotar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'usuario_activado' }),
      );
    });

    it('el intento bloqueado no deja anotación', async () => {
      // Solo se anota lo que llegó a ocurrir; si no, el historial se llena
      // de acciones que nadie hizo.
      await expect(servicio.toggleActive(YO, ACTOR)).rejects.toThrow(
        BadRequestException,
      );

      expect(auditoria.anotar).not.toHaveBeenCalled();
    });
  });

  describe('eliminar la cuenta', () => {
    const CLAVE = 'Clave12345!';
    const cuenta = async (extra: Partial<User> = {}) =>
      ({
        id: YO,
        password: await bcrypt.hash(CLAVE, 4),
        role: UserRole.CLIENT,
        esDemostracion: false,
        soloLectura: false,
        stripeCustomerId: 'cus_1',
        eliminadaEn: null,
        ...extra,
      }) as unknown as User;

    const rechazo = async (promesa: Promise<unknown>) =>
      promesa.catch((e: unknown) => e) as Promise<{
        getResponse: () => unknown;
      }>;

    it('y cierra los sockets que tuviera abiertos', async () => {
      repo.findOne.mockResolvedValueOnce(await cuenta());

      await servicio.eliminarCuenta(YO, CLAVE);

      expect(tiempoReal.desconectar).toHaveBeenCalledWith(YO);
    });

    it('borra sus datos personales y deja la fila, anonimizada', async () => {
      // La necesitan las reservas, los pagos y las valoraciones de otros.
      repo.findOne.mockResolvedValueOnce(await cuenta());

      await servicio.eliminarCuenta(YO, CLAVE);

      const [entidad, id, cambios] = gestor.update.mock.calls[0] as unknown as [
        unknown,
        string,
        Record<string, unknown>,
      ];
      expect(entidad).toBe(User);
      expect(id).toBe(YO);
      expect(cambios).toMatchObject({
        firstName: 'Cuenta',
        lastName: 'eliminada',
        email: `eliminada-${YO}@servilocal.invalid`,
        phone: null,
        bio: null,
        avatarUrl: null,
        address: null,
        city: null,
        postalCode: null,
        location: null,
        isActive: false,
        stripeCustomerId: null,
        eliminadaEn: expect.any(Date),
        sesionesDesde: expect.any(Date),
      });
      // Y su contraseña deja de valer.
      expect(await bcrypt.compare(CLAVE, cambios.password as string)).toBe(
        false,
      );
    });

    it('retira sus servicios con historial y borra los que no lo tienen', async () => {
      repo.findOne.mockResolvedValueOnce(await cuenta());

      await servicio.eliminarCuenta(YO, CLAVE);

      const sentencias = gestor.query.mock.calls.map((c) =>
        String((c as unknown[])[0]),
      );
      expect(sentencias.some((s) => s.includes('UPDATE "services"'))).toBe(
        true,
      );
      expect(sentencias.some((s) => s.includes('DELETE FROM "services"'))).toBe(
        true,
      );
      for (const [sql, parametros] of gestor.query.mock.calls as unknown[][]) {
        if (String(sql).includes('"services"')) {
          expect(parametros).toEqual([YO]);
        }
      }
    });

    it('cambia su correo por el anonimizado en el historial de moderación', async () => {
      repo.findOne.mockResolvedValueOnce(await cuenta());

      await servicio.eliminarCuenta(YO, CLAVE);

      const historial = (gestor.query.mock.calls as unknown[][]).find(([sql]) =>
        String(sql).includes('UPDATE "audit_logs"'),
      );
      expect(historial?.[1]).toEqual([
        YO,
        `eliminada-${YO}@servilocal.invalid`,
      ]);
    });

    it('borra sus avisos y sus enlaces de recuperación', async () => {
      repo.findOne.mockResolvedValueOnce(await cuenta());

      await servicio.eliminarCuenta(YO, CLAVE);

      expect(gestor.delete).toHaveBeenCalledWith(Notification, { userId: YO });
      expect(gestor.delete).toHaveBeenCalledWith(RestablecimientoContrasena, {
        userId: YO,
      });
    });

    it('y la tarjeta que guardó en Stripe', async () => {
      repo.findOne.mockResolvedValueOnce(await cuenta());

      await servicio.eliminarCuenta(YO, CLAVE);

      expect(pagos.olvidarCliente).toHaveBeenCalledWith('cus_1');
    });

    it('sin ficha en Stripe, no hay nada que borrar allí', async () => {
      repo.findOne.mockResolvedValueOnce(
        await cuenta({ stripeCustomerId: null }),
      );

      await servicio.eliminarCuenta(YO, CLAVE);

      expect(pagos.olvidarCliente).not.toHaveBeenCalled();
    });

    it('con reservas abiertas, como cliente o como profesional, no se deja', async () => {
      // Primero se cancelan o se completan: es lo que lleva el dinero
      // adonde tiene que ir.
      repo.findOne.mockResolvedValueOnce(await cuenta());
      manager.count.mockResolvedValueOnce(2);

      const error = await rechazo(servicio.eliminarCuenta(YO, CLAVE));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        codigo: 'cuenta-con-reservas-abiertas',
      });
      const [entidad, { where }] = manager.count.mock.calls[0] as unknown as [
        unknown,
        { where: Array<Record<string, unknown>> },
      ];
      expect(entidad).toBe(Booking);
      expect(where).toEqual([
        {
          clientId: YO,
          status: expect.objectContaining({
            value: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
          }),
        },
        {
          providerId: YO,
          status: expect.objectContaining({
            value: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
          }),
        },
      ]);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('sin la contraseña correcta, 400 con su código y nada cambia', async () => {
      // Una sesión abierta en un ordenador ajeno no basta.
      repo.findOne.mockResolvedValueOnce(await cuenta());

      const error = await rechazo(servicio.eliminarCuenta(YO, 'NoEsEsta1!'));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toMatchObject({
        codigo: 'contrasena-incorrecta',
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('una cuenta de demostración no se elimina: la comparten todos', async () => {
      repo.findOne.mockResolvedValueOnce(
        await cuenta({ esDemostracion: true }),
      );

      const error = await rechazo(servicio.eliminarCuenta(YO, CLAVE));

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toMatchObject({
        codigo: 'cuenta-de-demostracion',
      });
    });

    it('ni una de administración: la plataforma se quedaría sin nadie', async () => {
      repo.findOne.mockResolvedValueOnce(
        await cuenta({ role: UserRole.ADMIN }),
      );

      await expect(servicio.eliminarCuenta(YO, CLAVE)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('una ya eliminada no existe', async () => {
      repo.findOne.mockResolvedValueOnce(
        await cuenta({ eliminadaEn: new Date() }),
      );

      await expect(servicio.eliminarCuenta(YO, CLAVE)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('descargar los datos', () => {
    const CONVERSACION = {
      id: 'c1',
      participantOneId: YO,
      participantTwoId: OTRO,
      participantTwo: {
        firstName: 'Luis',
        lastName: 'Gómez',
        email: 'luis@correo.test',
      },
    };

    beforeEach(() => {
      repo.findOne.mockResolvedValue({
        id: YO,
        email: 'ana@ejemplo.org',
        firstName: 'Ana',
        lastName: 'Ruiz',
        role: UserRole.CLIENT,
        stripeCustomerId: 'cus_1',
      } as unknown as User);
      manager.find.mockImplementation(async (entidad: unknown) => {
        if (entidad === Conversation) return [CONVERSACION];
        if (entidad === Message)
          return [
            { conversationId: 'c1', senderId: YO, content: 'Hola' },
            { conversationId: 'c1', senderId: OTRO, content: 'Buenas' },
          ];
        if (entidad === Booking)
          return [
            {
              id: 'b1',
              status: BookingStatus.COMPLETED,
              service: { title: 'Fontanería' },
              provider: {
                firstName: 'Luis',
                lastName: 'Gómez',
                email: 'luis@correo.test',
                phone: '600000000',
              },
            },
          ];
        if (entidad === Payment) return [{ id: 'p1', amount: 45 }];
        if (
          entidad === Review ||
          entidad === Service ||
          entidad === Notification
        )
          return [];
        return [];
      });
    });

    it('reúne lo suyo: cuenta, reservas, pagos y conversaciones', async () => {
      const datos = (await servicio.exportarDatos(YO)) as Record<
        string,
        Record<string, unknown>
      >;

      expect(datos.cuenta.email).toBe('ana@ejemplo.org');
      expect(
        (datos.reservas.comoCliente as Array<{ servicio: string }>)[0].servicio,
      ).toBe('Fontanería');
      expect(datos.pagos).toEqual([expect.objectContaining({ importe: 45 })]);
      expect(datos.conversaciones).toEqual([
        {
          conQuien: 'Luis',
          mensajes: [
            expect.objectContaining({ deQuien: 'yo', texto: 'Hola' }),
            expect.objectContaining({
              deQuien: 'la otra parte',
              texto: 'Buenas',
            }),
          ],
        },
      ]);
    });

    it('de la otra parte, solo el nombre de pila: sus datos son suyos', async () => {
      const texto = JSON.stringify(await servicio.exportarDatos(YO));

      expect(texto).toContain('Luis');
      expect(texto).not.toContain('Gómez');
      expect(texto).not.toContain('luis@correo.test');
      expect(texto).not.toContain('600000000');
    });

    it('ni la ficha de Stripe ni nada de la contraseña', async () => {
      const texto = JSON.stringify(await servicio.exportarDatos(YO));

      expect(texto).not.toContain('cus_1');
      expect(texto).not.toMatch(/password|contrasena/i);
    });

    it('como profesional: sus servicios, lo recibido y sus avisos, y de los clientes solo el nombre', async () => {
      const CLIENTE = {
        firstName: 'Marta',
        lastName: 'Soler',
        email: 'marta@correo.test',
        phone: '611111111',
        address: 'Calle del Cliente 7',
      };
      manager.find.mockImplementation(
        async (entidad: unknown, opciones?: unknown) => {
          const donde = (opciones as { where?: Record<string, unknown> })
            ?.where;
          if (entidad === Service)
            return [{ id: 's1', title: 'Fontanería', address: 'Mi taller' }];
          if (entidad === Booking)
            return donde && 'providerId' in donde
              ? [
                  {
                    id: 'b2',
                    status: BookingStatus.CONFIRMED,
                    service: { title: 'Fontanería' },
                    client: CLIENTE,
                  },
                ]
              : [];
          if (entidad === Review)
            return donde && 'serviceId' in donde
              ? [
                  {
                    rating: 5,
                    comment: 'Muy bien',
                    providerResponse: 'Gracias',
                    service: { title: 'Fontanería' },
                    client: CLIENTE,
                  },
                ]
              : [
                  {
                    rating: 4,
                    comment: 'Correcto',
                    service: { title: 'Pintura' },
                  },
                ];
          if (entidad === Notification)
            return [{ type: 'booking_created', content: {}, isRead: false }];
          return [];
        },
      );

      const datos = (await servicio.exportarDatos(YO)) as Record<
        string,
        Record<string, unknown>
      >;
      const texto = JSON.stringify(datos);

      expect(datos.servicios).toEqual([
        expect.objectContaining({
          titulo: 'Fontanería',
          direccion: 'Mi taller',
        }),
      ]);
      expect(datos.reservas.comoProfesional).toEqual([
        expect.objectContaining({ otraParte: 'Marta' }),
      ]);
      expect(datos.valoraciones.recibidas).toEqual([
        expect.objectContaining({ autor: 'Marta', tuRespuesta: 'Gracias' }),
      ]);
      expect(datos.valoraciones.escritas).toEqual([
        expect.objectContaining({ servicio: 'Pintura', nota: 4 }),
      ]);
      expect(datos.avisos).toEqual([
        expect.objectContaining({ tipo: 'booking_created', leido: false }),
      ]);
      for (const dato of [
        CLIENTE.lastName,
        CLIENTE.email,
        CLIENTE.phone,
        CLIENTE.address,
      ]) {
        expect(texto).not.toContain(dato);
      }
    });
  });
});
