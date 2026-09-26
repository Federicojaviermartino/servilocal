import { Booking, BookingStatus, User } from '../entities';
import { parteVisible, reservaVisible } from './partes-visibles';

const persona = (id: string) =>
  ({
    id,
    firstName: 'Carlos',
    lastName: 'Ruiz',
    avatarUrl: 'https://example.test/a.png',
    city: 'Madrid',
    email: `${id}@ejemplo.com`,
    phone: '600 111 222',
    address: 'Calle Mayor 1',
    postalCode: '28013',
    location: { type: 'Point', coordinates: [-3.7, 40.4] },
    bio: 'Fontanero',
    soloLectura: false,
    esDemostracion: false,
  }) as unknown as User;

const reserva = (status: BookingStatus) =>
  ({
    id: 'b1',
    status,
    client: persona('cliente'),
    provider: persona('profesional'),
  }) as unknown as Booking;

describe('lo que ve cada parte de una reserva', () => {
  it.each([
    BookingStatus.PENDING,
    BookingStatus.CANCELLED,
    BookingStatus.REJECTED,
  ])('sin aceptar (%s), solo el nombre, el avatar y la ciudad', (estado) => {
    // Con crear una reserva pendiente, sin pagar, y cancelarla, cualquier
    // cliente se llevaba el teléfono y el domicilio del profesional.
    const vista = reservaVisible(reserva(estado));

    for (const parte of [vista.client, vista.provider]) {
      expect(parte).toEqual({
        id: expect.any(String),
        firstName: 'Carlos',
        lastName: 'Ruiz',
        avatarUrl: 'https://example.test/a.png',
        city: 'Madrid',
      });
    }
  });

  it.each([BookingStatus.CONFIRMED, BookingStatus.COMPLETED])(
    'aceptada (%s), también el contacto, que hace falta para ir a trabajar',
    (estado) => {
      const vista = reservaVisible(reserva(estado));

      expect(vista.client).toMatchObject({
        email: 'cliente@ejemplo.com',
        phone: '600 111 222',
        address: 'Calle Mayor 1',
        postalCode: '28013',
      });
    },
  );

  it('las coordenadas de casa y los datos internos, nunca', () => {
    const vista = reservaVisible(reserva(BookingStatus.CONFIRMED));

    for (const parte of [vista.client, vista.provider]) {
      expect(parte).not.toHaveProperty('location');
      expect(parte).not.toHaveProperty('soloLectura');
      expect(parte).not.toHaveProperty('esDemostracion');
    }
  });

  it('no toca la reserva original', () => {
    const original = reserva(BookingStatus.PENDING);

    reservaVisible(original);

    expect(original.client.phone).toBe('600 111 222');
  });

  it('una parte que no se cargó sigue sin estar', () => {
    expect(parteVisible(undefined, true)).toBeUndefined();
  });
});
