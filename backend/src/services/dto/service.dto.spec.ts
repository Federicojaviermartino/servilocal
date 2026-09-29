import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchServicesDto, UpdateServiceDto } from './service.dto';

async function rechazadas(
  clase: new () => object,
  datos: Record<string, unknown>,
): Promise<string[]> {
  const errores = await validate(
    plainToInstance(clase, datos, { enableImplicitConversion: true }),
  );
  return errores.map((error) => error.property).sort();
}

describe('Editar un servicio', () => {
  it.each([
    'title',
    'description',
    'categoryId',
    'priceMin',
    'city',
    'address',
  ])('%s como null se rechaza: su columna no lo admite', async (campo) => {
    // @IsOptional lo dejaba pasar: llegaba a la base, que respondía con
    // un 500, o a un trim que no lo esperaba.
    expect(await rechazadas(UpdateServiceDto, { [campo]: null })).toEqual([
      campo,
    ]);
  });

  it('lo que no viene no se valida', async () => {
    expect(await rechazadas(UpdateServiceDto, {})).toEqual([]);
  });

  it('el precio máximo sí puede quitarse: su columna admite null', async () => {
    expect(
      await rechazadas(UpdateServiceDto, { priceMax: null, images: null }),
    ).toEqual([]);
  });
});

describe('Las imágenes de un servicio', () => {
  it.each([
    ['un data: con lo que sea', ['data:text/html,<script>alert(1)</script>']],
    ['una dirección sin cifrar', ['http://imagenes.example/grifo.jpg']],
    ['texto que no es una dirección', ['grifo']],
    [
      'más de diez',
      Array.from({ length: 11 }, (_, i) => `https://imagenes.example/${i}.jpg`),
    ],
  ])('no admiten %s', async (_que, images) => {
    // Valía cualquier texto: también un data: con lo que se quisiera, en
    // un catálogo que las cuentas de demostración pueden editar.
    expect(await rechazadas(UpdateServiceDto, { images })).toEqual(['images']);
  });

  it('las https, sí', async () => {
    expect(
      await rechazadas(UpdateServiceDto, {
        images: ['https://images.pexels.com/photos/1/grifo.jpeg'],
      }),
    ).toEqual([]);
  });
});

describe('La paginación de la búsqueda', () => {
  it('una página enorme se rechaza en vez de llegar a la consulta', async () => {
    // page=1e308 acababa en OFFSET Infinity y en un 500 de la búsqueda
    // pública, al alcance de cualquiera.
    expect(await rechazadas(SearchServicesDto, { page: '1e308' })).toEqual([
      'page',
    ]);
  });

  it('y media página, también', async () => {
    expect(
      await rechazadas(SearchServicesDto, { page: '1.5', limit: '1.5' }),
    ).toEqual(['limit', 'page']);
  });

  it('las de siempre pasan', async () => {
    expect(
      await rechazadas(SearchServicesDto, { page: '3', limit: '12' }),
    ).toEqual([]);
  });
});
