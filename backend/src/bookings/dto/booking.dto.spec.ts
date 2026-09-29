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
