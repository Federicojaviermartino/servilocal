import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './update-user.dto';

async function rechazadas(datos: Record<string, unknown>): Promise<string[]> {
  const errores = await validate(plainToInstance(UpdateUserDto, datos));
  return errores.map((error) => error.property).sort();
}

describe('Editar el perfil', () => {
  it('nombre y apellidos como null se rechazan: la base los exige', async () => {
    // Llegaban a un UPDATE a NULL, que la base rechazaba con un 500.
    expect(await rechazadas({ firstName: null, lastName: null })).toEqual([
      'firstName',
      'lastName',
    ]);
  });

  it('el teléfono, la biografía o la dirección sí se pueden vaciar', async () => {
    expect(
      await rechazadas({ phone: null, bio: null, address: null, city: null }),
    ).toEqual([]);
  });
});
