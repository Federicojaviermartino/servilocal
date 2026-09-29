import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCategoryDto } from './category.dto';

async function rechazadas(datos: Record<string, unknown>): Promise<string[]> {
  const errores = await validate(plainToInstance(UpdateCategoryDto, datos));
  return errores.map((error) => error.property).sort();
}

describe('Editar una categoría', () => {
  it('nombre, estado y orden como null se rechazan: la base los exige', async () => {
    expect(
      await rechazadas({ name: null, isActive: null, sortOrder: null }),
    ).toEqual(['isActive', 'name', 'sortOrder']);
  });

  it('la descripción y el icono sí se pueden vaciar', async () => {
    expect(await rechazadas({ description: null, icon: null })).toEqual([]);
  });
});
