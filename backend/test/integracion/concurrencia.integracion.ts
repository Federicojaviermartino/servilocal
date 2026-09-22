import { DataSource } from 'typeorm';
import { Booking, BookingStatus } from '../../src/entities';
import { crearFuente } from './base';

/**
 * Lo que dos peticiones simultáneas se hacen entre sí.
 *
 * Esto no se puede probar con dobles: la serialización la hace PostgreSQL, no
 * el código. Abrir el cobro dejaba dos retenciones sobre la misma tarjeta
 * cuando había dos pestañas abiertas, y el arreglo —leer la fila de la
 * reserva bloqueada dentro de una transacción— se verificó a mano con psql.
 * A mano no sirve: eso no caza una regresión.
 */
describe('Bloqueo de fila', () => {
  let fuente: DataSource;
  let reservaId: string;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();

    const [reserva] = await fuente.query(`SELECT id FROM bookings LIMIT 1`);
    expect(reserva).toBeTruthy();
    reservaId = reserva.id;
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  it('la segunda transacción espera a que la primera suelte la fila', async () => {
    // Es el mecanismo entero. La primera retiene la fila y tarda; la segunda
    // pide la misma con bloqueo y no puede continuar hasta que la primera
    // confirme. Sin el bloqueo, las dos leerían a la vez y las dos crearían
    // su propia intención de pago.
    const ESPERA_MS = 1500;
    let segundaEmpezo = 0;

    const primera = fuente.transaction(async (gestor) => {
      await gestor.findOne(Booking, {
        where: { id: reservaId },
        lock: { mode: 'pessimistic_write' },
      });
      await new Promise((r) => setTimeout(r, ESPERA_MS));
    });

    // Un respiro para que la primera tenga la fila antes de pedirla.
    await new Promise((r) => setTimeout(r, 200));

    const segunda = fuente.transaction(async (gestor) => {
      segundaEmpezo = Date.now();
      await gestor.findOne(Booking, {
        where: { id: reservaId },
        lock: { mode: 'pessimistic_write' },
      });
      return Date.now() - segundaEmpezo;
    });

    const [, esperadoMs] = await Promise.all([primera, segunda]);

    // Si no esperase, esto sería del orden de milisegundos.
    expect(esperadoMs).toBeGreaterThan(ESPERA_MS * 0.5);
  });

  it('una lectura sin bloqueo no espera, que es la contraparte', async () => {
    // Sin esto, la comprobación anterior podría pasar porque la base entera
    // vaya lenta y no porque el bloqueo haga su trabajo.
    const primera = fuente.transaction(async (gestor) => {
      await gestor.findOne(Booking, {
        where: { id: reservaId },
        lock: { mode: 'pessimistic_write' },
      });
      await new Promise((r) => setTimeout(r, 1500));
    });

    await new Promise((r) => setTimeout(r, 200));

    const inicio = Date.now();
    await fuente.query(`SELECT id FROM bookings WHERE id = $1`, [reservaId]);
    const tardo = Date.now() - inicio;

    await primera;

    expect(tardo).toBeLessThan(500);
  });

  it('una transacción que lanza no deja nada escrito', async () => {
    // Si abrir el cobro falla a mitad, no puede quedar una fila de pago
    // apuntando a una intención de Stripe que no llegó a crearse.
    const antes = await fuente.query(`SELECT count(*)::int FROM bookings`);

    await expect(
      fuente.transaction(async (gestor) => {
        await gestor.save(Booking, {
          clientId: (
            await fuente.query(`SELECT "clientId" FROM bookings LIMIT 1`)
          )[0].clientId,
          providerId: (
            await fuente.query(`SELECT "providerId" FROM bookings LIMIT 1`)
          )[0].providerId,
          serviceId: (
            await fuente.query(`SELECT "serviceId" FROM bookings LIMIT 1`)
          )[0].serviceId,
          scheduledDate: new Date('2027-06-01T10:00:00Z'),
          totalPrice: 10,
          status: BookingStatus.PENDING,
        });
        throw new Error('algo falló después de escribir');
      }),
    ).rejects.toThrow('algo falló después de escribir');

    const despues = await fuente.query(`SELECT count(*)::int FROM bookings`);
    expect(despues[0].count).toBe(antes[0].count);
  });
});
