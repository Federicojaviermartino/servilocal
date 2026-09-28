import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookingStatus } from '../../entities';
import { UpdateBookingStatusDto } from './booking.dto';

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
