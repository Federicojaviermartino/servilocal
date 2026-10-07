import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookingStatus } from '../../entities';
import { CreateBookingDto, UpdateBookingStatusDto } from './booking.dto';

async function rechazadas(datos: Record<string, unknown>): Promise<string[]> {
  const errores = await validate(
    plainToInstance(UpdateBookingStatusDto, datos),
  );
  return errores.map((error) => error.property);
}

describe('El motivo de una cancelación', () => {
  it('es opcional', async () => {
    expect(await rechazadas({ status: BookingStatus.CANCELLED })).toEqual([]);
  });

  it('se admite hasta 500 caracteres', async () => {
    expect(
      await rechazadas({
        status: BookingStatus.CANCELLED,
        cancellationReason: 'a'.repeat(500),
      }),
    ).toEqual([]);
  });

  it('más no: la interfaz ya lo pide, y ahora lo ve la otra parte', async () => {
    expect(
      await rechazadas({
        status: BookingStatus.REJECTED,
        cancellationReason: 'a'.repeat(501),
      }),
    ).toEqual(['cancellationReason']);
  });
});

describe('El importe de una reserva', () => {
  const conImporte = (totalPrice: unknown) =>
    validate(
      plainToInstance(CreateBookingDto, {
        serviceId: '8f14e45f-ceea-467a-9575-6d2c1b1f0a11',
        scheduledDate: '2027-03-10T09:30:00Z',
        totalPrice,
      }),
    ).then((errores) => errores.map((error) => error.property));

  it.each([
    // Se guardaba 45,56 y la respuesta decía 45,555.
    ['con milésimas', 45.555],
    // La columna lo admite y Stripe no: se creaba y no se podía pagar.
    ['por encima de lo que Stripe puede cobrar', 1_000_000],
    ['como texto', '45'],
  ])('%s se rechaza', async (_caso, importe) => {
    expect(await conImporte(importe)).toEqual(['totalPrice']);
  });

  it('con céntimos y hasta el tope, pasa', async () => {
    expect(await conImporte(45.5)).toEqual([]);
    expect(await conImporte(999_999.99)).toEqual([]);
  });
});

describe('La descripción de una reserva', () => {
  const reserva = (description: string) =>
    validate(
      plainToInstance(CreateBookingDto, {
        serviceId: '8f14e45f-ceea-467a-9575-6d2c1b1f0a11',
        scheduledDate: '2027-03-10T09:30:00Z',
        totalPrice: 45,
        description,
      }),
    ).then((errores) => errores.map((error) => error.property));

  it('admite hasta 2000 caracteres, como un mensaje', async () => {
    expect(await reserva('a'.repeat(2000))).toEqual([]);
  });

  it('más no: no tenía límite y llegaba entera a la base y al aviso', async () => {
    expect(await reserva('a'.repeat(2001))).toEqual(['description']);
  });
});
