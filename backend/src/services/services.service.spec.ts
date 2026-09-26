import type { Mock } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Service } from '../entities';
import { ServicesService } from './services.service';

/** Lo que nunca puede salir de un proveedor en una respuesta pública. */
const DATOS_PERSONALES = [
  'email',
  'phone',
  'address',
  'postalCode',
  'location',
  'password',
];

function constructorFalso() {
  const qb: Record<string, Mock> = {
    getMany: vi.fn(async () => []),
    // El conteo acotado clona la consulta y le quita el orden y la ventana
    // para envolverla en un COUNT con LIMIT. El clon es el mismo doble: lo
    // que interesa comprobar son las condiciones, y son las mismas.
    clone: vi.fn(() => qb),
    getQuery: vi.fn(() => 'SELECT 1'),
    getParameters: vi.fn(() => ({})),
  };
  for (const metodo of [
    'leftJoin',
    'leftJoinAndSelect',
    'addSelect',
    'select',
    'where',
    'andWhere',
    'orderBy',
    'skip',
    'take',
    'limit',
  ]) {
    qb[metodo] = vi.fn(() => qb);
  }
  return qb;
}

/** El COUNT acotado que se lanza aparte para paginar. */
function constructorConteoFalso(cuantos = 0) {
  const qb: Record<string, Mock> = {
    getRawOne: vi.fn(async () => ({ n: String(cuantos) })),
    setParameters: vi.fn(() => qb),
  };
  for (const metodo of ['select', 'from']) {
    qb[metodo] = vi.fn(() => qb);
  }
  return qb;
}

/**
 * La consulta que resuelve qué categorías casan con lo escrito.
 *
 * Va aparte de la principal a propósito: dentro del OR, esa comparación
 * cruzaba dos tablas y la búsqueda dejaba de poder usar sus índices.
 */
function constructorCategoriasFalso(devuelve: { id: string }[] = []) {
  const qb: Record<string, Mock> = {
    getRawMany: vi.fn(async () => devuelve),
  };
  for (const metodo of ['select', 'from', 'where', 'orWhere']) {
    qb[metodo] = vi.fn(() => qb);
  }
  return qb;
}

async function construir(
  qb: Record<string, Mock>,
  categorias = constructorCategoriasFalso(),
  conteo = constructorConteoFalso(),
) {
  const repo = {
    createQueryBuilder: vi.fn(() => qb),
    // El servicio usa el manager para dos consultas distintas: la de
    // categorías (que hace un FROM de la entidad) y la del conteo acotado
    // (que hace un FROM de una subconsulta). Se reparten por ahí.
    manager: {
      createQueryBuilder: vi.fn(() => {
        const repartidor = {
          select: vi.fn((...args: unknown[]) =>
            String(args[0]).includes('COUNT')
              ? conteo.select(...args)
              : categorias.select(...args),
          ),
        };
        return repartidor as never;
      }),
    },
    findOne: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
    save: vi.fn(async (s: unknown) => s),
    create: vi.fn((s: unknown) => s),
    find: vi.fn(async () => [] as unknown[]),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ServicesService,
      { provide: getRepositoryToken(Service), useValue: repo },
    ],
  }).compile();

  return {
    servicio: module.get(ServicesService),
    repo,
    qb,
    categorias,
    conteo,
  };
}

/** Todas las columnas que la consulta llegó a pedir. */
function columnasPedidas(qb: Record<string, Mock>): string[] {
  const pedidas: string[] = [];
  for (const llamada of [
    ...qb.addSelect.mock.calls,
    ...qb.leftJoinAndSelect.mock.calls,
  ]) {
    for (const argumento of llamada) {
      if (typeof argumento === 'string') pedidas.push(argumento);
      if (Array.isArray(argumento)) pedidas.push(...argumento.map(String));
    }
  }
  return pedidas;
}

describe('ServicesService', () => {
  describe('datos del proveedor en respuestas públicas', () => {
    it('search no pide ninguna columna personal', async () => {
      // Esto existió: la búsqueda devolvía correo, teléfono, dirección y
      // coordenadas de cada profesional a cualquiera que la llamara sin
      // sesión. Se corrigió con una lista blanca, y sin esta comprobación un
      // solo leftJoinAndSelect lo reabre sin que nadie se entere.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ page: 1, limit: 12 } as never);

      const pedidas = columnasPedidas(qb);

      // Primero que la consulta pida algo del proveedor: sin esto, las
      // comprobaciones de abajo pasarían con un simulacro que no registra
      // nada, que es exactamente lo que no queremos de un test de seguridad.
      expect(pedidas).toContain('provider.firstName');

      const texto = pedidas.join(' ');
      for (const campo of DATOS_PERSONALES) {
        expect(texto).not.toContain(`provider.${campo}`);
      }
    });

    it('search trae al proveedor con join explícito, no arrastrando la fila entera', async () => {
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ page: 1, limit: 12 } as never);

      const joins = qb.leftJoinAndSelect.mock.calls.map((c) => String(c[0]));
      expect(joins).not.toContain('service.provider');
      expect(qb.leftJoin).toHaveBeenCalledWith(
        'service.provider',
        expect.any(String),
      );
    });

    it('findById tampoco', async () => {
      // La ficha de un servicio es igual de pública que el listado.
      const qb = constructorFalso();
      qb.getOne = vi.fn(async () => ({ id: 's1' }));
      const { servicio } = await construir(qb);

      await servicio.findById('s1');

      const pedidas = columnasPedidas(qb);
      expect(pedidas).toContain('provider.firstName');

      const texto = pedidas.join(' ');
      for (const campo of DATOS_PERSONALES) {
        expect(texto).not.toContain(`provider.${campo}`);
      }
    });

    it('findById avisa si no existe en vez de devolver vacío', async () => {
      const qb = constructorFalso();
      qb.getOne = vi.fn(async () => null);
      const { servicio } = await construir(qb);

      await expect(servicio.findById('fantasma')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('quién puede tocar un servicio', () => {
    const DUENO = 'due1';
    const OTRO = 'otro1';

    async function conServicio() {
      const qb = constructorFalso();
      qb.getOne = vi.fn(async () => ({
        id: 's1',
        providerId: DUENO,
        title: 'Original',
      }));
      return construir(qb);
    }

    it('deja borrar al dueño', async () => {
      const { servicio, repo } = await conServicio();

      await servicio.remove('s1', DUENO, 'provider');

      expect(repo.remove).toHaveBeenCalled();
    });

    it('no deja borrar a otro profesional', async () => {
      const { servicio, repo } = await conServicio();

      await expect(servicio.remove('s1', OTRO, 'provider')).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('deja borrar a administración', async () => {
      // La moderación tiene que poder retirar un servicio que no es suyo.
      const { servicio, repo } = await conServicio();

      await servicio.remove('s1', OTRO, 'admin');

      expect(repo.remove).toHaveBeenCalled();
    });
  });
  describe('búsqueda por cercanía', () => {
    /** Todo el SQL que la consulta llegó a acumular, en una sola cadena. */
    const sql = (qb: Record<string, Mock>) =>
      [
        ...qb.andWhere.mock.calls,
        ...qb.where.mock.calls,
        ...qb.addSelect.mock.calls,
      ]
        .map((c) => String(c[0]))
        .join(' ');

    it('filtra con ST_DWithin sobre geografía, no con un rectángulo', async () => {
      // Un recuadro de latitud y longitud da distancias falsas: en España un
      // grado de longitud son unos 80 km y uno de latitud 111.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({
        latitude: 40.4,
        longitude: -3.7,
        radiusKm: 5,
      } as never);

      const consulta = sql(qb);
      expect(consulta).toContain('ST_DWithin');
      expect(consulta).toContain('::geography');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ST_DWithin'),
        expect.objectContaining({ radius: 5000, lat: 40.4, lng: -3.7 }),
      );
    });

    it('el radio viaja en metros aunque se pida en kilómetros', async () => {
      // ST_DWithin sobre geography mide en metros: pasarle 10 buscaría en
      // diez metros a la redonda y la búsqueda saldría siempre vacía.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ latitude: 40.4, longitude: -3.7 } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ST_DWithin'),
        expect.objectContaining({ radius: 10000 }),
      );
    });

    it('ordena por la distancia calculada cuando hay coordenadas', async () => {
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({
        latitude: 40.4,
        longitude: -3.7,
        sortBy: 'distance',
      } as never);

      expect(qb.addSelect).toHaveBeenCalledWith(
        expect.stringContaining('ST_Distance'),
        'distance_meters',
      );
      expect(qb.orderBy).toHaveBeenCalledWith('distance_meters', 'ASC');
    });

    it('sin coordenadas, ordenar por distancia cae en lo más reciente', async () => {
      // No hay distancia que calcular, y ordenar por una columna que la
      // consulta no ha añadido rompería la consulta entera.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ sortBy: 'distance' } as never);

      expect(qb.orderBy).toHaveBeenCalledWith('service.createdAt', 'DESC');
      expect(sql(qb)).not.toContain('ST_DWithin');
    });

    it.each([
      ['price', 'service.priceMin', 'ASC'],
      ['rating', 'service.averageRating', 'DESC'],
      ['newest', 'service.createdAt', 'DESC'],
    ])('ordenar por %s usa %s', async (criterio, columna, sentido) => {
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ sortBy: criterio } as never);

      expect(qb.orderBy).toHaveBeenCalledWith(columna, sentido);
    });
  });

  describe('filtros de la búsqueda', () => {
    const sql = (qb: Record<string, Mock>) =>
      qb.andWhere.mock.calls.map((c) => String(c[0])).join(' ');

    it('la ciudad se compara sin acentos y sin mayúsculas, en los dos lados', async () => {
      // Quien teclea «malaga» y quien teclea «Málaga» buscan lo mismo, y
      // normalizar solo un lado de la comparación no casa ninguno de los dos.
      //
      // La columna se normaliza en el SQL, con la misma expresión que tiene
      // indexada; lo tecleado se normaliza antes de salir de aquí. Aplicarlo
      // también al parámetro dentro del SQL dejaba la comparación correcta
      // pero inutilizaba el índice, porque el patrón ya no era constante.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ city: 'MÁLAGA' } as never);

      const llamada = qb.andWhere.mock.calls.find((c) =>
        String(c[0]).includes('service.city'),
      );
      expect(llamada).toBeDefined();
      expect(String(llamada?.[0]).match(/translate\(lower\(/g)?.length).toBe(1);
      expect(llamada?.[1]).toEqual({ city: 'malaga' });
    });

    it('y el texto tecleado llega normalizado, no con su tilde', async () => {
      // Si el patrón llegara sin normalizar, buscar «Fontanería» no casaría
      // con lo que guarda el índice, que está sin tildes.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ query: 'Fontanería' } as never);

      const llamada = qb.andWhere.mock.calls.find((c) =>
        String(c[0]).includes('service.title'),
      );
      expect((llamada?.[1] as Record<string, string>).q0).toBe('%fontaneria%');
    });

    it('el texto busca también por el nombre de la categoría', async () => {
      // La gente busca por oficio, y esa palabra rara vez está en el título
      // del servicio.
      //
      // Se pregunta en una consulta aparte, sobre una tabla de diez filas.
      // Metido en el OR de la principal, ese trozo cruzaba dos tablas y
      // PostgreSQL dejaba de poder combinar los índices de «services»: la
      // búsqueda recorría la tabla entera.
      const qb = constructorFalso();
      const categorias = constructorCategoriasFalso([{ id: 'cat-fontaneria' }]);
      const { servicio } = await construir(qb, categorias);

      await servicio.search({ query: 'fontanero' } as never);

      const preguntado =
        JSON.stringify(categorias.where.mock.calls) +
        JSON.stringify(categorias.orWhere.mock.calls);
      expect(preguntado).toContain('categoria.name');
      expect(preguntado).toContain('%fontanero%');
    });

    it('y lo que casa entra en la búsqueda por su identificador', async () => {
      const qb = constructorFalso();
      const { servicio } = await construir(
        qb,
        constructorCategoriasFalso([{ id: 'cat-fontaneria' }]),
      );

      await servicio.search({ query: 'fontanero' } as never);

      const llamada = qb.andWhere.mock.calls.find((c) =>
        String(c[0]).includes('service.categoryId IN'),
      );
      expect(llamada).toBeDefined();
      expect(
        (llamada?.[1] as { categoriasQueCasan: string[] }).categoriasQueCasan,
      ).toEqual(['cat-fontaneria']);
    });

    it('y si no casa ninguna, esa condición no se añade', async () => {
      // Sin esto, la comprobación de arriba pasaría aunque se metiera
      // siempre una lista vacía, que en SQL no encuentra nada pero obliga
      // al planificador a mirarla.
      const qb = constructorFalso();
      const { servicio } = await construir(qb, constructorCategoriasFalso([]));

      await servicio.search({ query: 'algo-que-no-es-oficio' } as never);

      expect(sql(qb)).not.toContain('service.categoryId IN');
    });

    it('el diccionario añade términos sin quitar el que se escribió', async () => {
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ query: 'fontanero' } as never);

      const llamada = qb.andWhere.mock.calls.find((c) =>
        String(c[0]).includes('service.title'),
      );
      const parametros = llamada?.[1] as Record<string, string>;
      expect(parametros.q0).toBe('%fontanero%');
      // Y hay más de uno: si no, el diccionario no estaría haciendo nada.
      expect(Object.keys(parametros).length).toBeGreaterThan(1);
    });

    it('un precio mínimo de cero sigue siendo un filtro', async () => {
      // Con `if (priceMin)` el cero se cuela como «no filtrar», y quien pide
      // servicios gratuitos recibe la lista entera.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ priceMin: 0 } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'service.priceMin >= :priceMin',
        { priceMin: 0 },
      );
    });

    it('el precio máximo acota por el mínimo del servicio', async () => {
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ priceMax: 50 } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'service.priceMin <= :priceMax',
        {
          priceMax: 50,
        },
      );
    });

    it('solo salen los servicios activos de profesionales activos', async () => {
      // Desactivar una cuenta tiene que retirar su oferta del escaparate; si
      // no, el bloqueo no sirve de nada de cara al público.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({} as never);

      expect(qb.where).toHaveBeenCalledWith('service.isActive = :active', {
        active: true,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'provider.isActive = :providerActive',
        { providerActive: true },
      );
    });

    it('la valoración mínima se aplica cuando se pide', async () => {
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ minRating: 4 } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'service.averageRating >= :minRating',
        { minRating: 4 },
      );
    });
  });

  describe('paginación', () => {
    it('la página tres salta las dos anteriores', async () => {
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ page: 3, limit: 12 } as never);

      expect(qb.skip).toHaveBeenCalledWith(24);
      expect(qb.take).toHaveBeenCalledWith(12);
    });

    it('el total de páginas se redondea hacia arriba', async () => {
      // Con 25 resultados de doce en doce hay tres páginas, no dos: la
      // división entera dejaría un resultado inalcanzable.
      const qb = constructorFalso();
      const { servicio } = await construir(
        qb,
        constructorCategoriasFalso(),
        constructorConteoFalso(25),
      );

      const r = await servicio.search({ page: 1, limit: 12 } as never);

      expect(r.meta).toEqual({
        total: 25,
        totalEsParcial: false,
        page: 1,
        limit: 12,
        totalPages: 3,
      });
    });

    it('el conteo se corta en mil y lo dice', async () => {
      // Contar todas las coincidencias de una palabra común costaba más que
      // traer la página. Nadie navega hasta la página cuatro mil, así que se
      // cuenta hasta el tope y se avisa de que hay más.
      const qb = constructorFalso();
      const { servicio } = await construir(
        qb,
        constructorCategoriasFalso(),
        constructorConteoFalso(1000),
      );

      const r = await servicio.search({ page: 1, limit: 12 } as never);

      expect(r.meta.total).toBe(1000);
      expect(r.meta.totalEsParcial).toBe(true);
    });

    it('y el conteo no arrastra el orden ni la ventana de la página', async () => {
      // Ordenar para contar es trabajo tirado, y dejarle el OFFSET contaría
      // desde la página pedida en vez de desde el principio.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ page: 3, limit: 12 } as never);

      expect(qb.orderBy).toHaveBeenCalledWith();
      expect(qb.skip).toHaveBeenCalledWith(undefined);
      expect(qb.take).toHaveBeenCalledWith(undefined);
      expect(qb.limit).toHaveBeenCalledWith(1000);
    });
  });

  describe('alta y edición', () => {
    it('el punto se construye con la longitud primero', async () => {
      // GeoJSON va en (x, y), es decir (longitud, latitud). Invertirlo
      // compila igual y coloca Madrid en mitad del océano. Que TypeORM lo
      // guarde bien en PostGIS lo comprueba la integración: aquí solo se ve
      // lo que se le pasa.
      const qb = constructorFalso();
      const { servicio, repo } = await construir(qb);

      await servicio.create('p1', {
        title: 'Reparaciones',
        latitude: 40.4,
        longitude: -3.7,
      } as never);

      const creado = repo.create.mock.calls[0][0] as {
        location: unknown;
        providerId: string;
      };
      expect(creado.providerId).toBe('p1');
      expect(creado.location).toEqual({
        type: 'Point',
        coordinates: [-3.7, 40.4],
      });
    });

    it('editar sin coordenadas no mueve el servicio de sitio', async () => {
      // Cambiar el título no debe tocar la ubicación, y una ubicación a
      // medias (solo latitud) sería peor que ninguna.
      const qb = constructorFalso();
      qb.getOne = vi.fn(async () => ({
        id: 's1',
        providerId: 'p1',
        location: 'punto-original',
        title: 'Antes',
      }));
      const { servicio, repo } = await construir(qb);

      await servicio.update('s1', 'p1', { title: 'Después' } as never);

      const guardado = repo.save.mock.calls[0][0] as {
        location: string;
        title: string;
      };
      expect(guardado.location).toBe('punto-original');
      expect(guardado.title).toBe('Después');
    });

    describe('sin coordenadas', () => {
      // El formulario de alta no envía coordenadas y la API las exigía:
      // publicar un servicio desde la aplicación daba siempre un 400.
      const alta = { title: 'Reparaciones', city: 'Málaga' };
      const puntoDe = (repo: { create: Mock }) =>
        (repo.create.mock.calls[0][0] as { location: unknown }).location;

      it('el servicio se sitúa en su ciudad', async () => {
        const { servicio, repo } = await construir(constructorFalso());

        await servicio.create('p1', alta as never);

        expect(puntoDe(repo)).toEqual({
          type: 'Point',
          coordinates: [-4.4214, 36.7213],
        });
      });

      it('la ciudad se reconoce sin acentos ni mayúsculas', async () => {
        // Hay servicios antiguos guardados como «Malaga».
        const { servicio, repo } = await construir(constructorFalso());

        await servicio.create('p1', { ...alta, city: ' MALAGA ' } as never);

        expect(puntoDe(repo)).toEqual({
          type: 'Point',
          coordinates: [-4.4214, 36.7213],
        });
      });

      it('una ciudad que no conocemos pide las coordenadas, con un 400 que lo dice', async () => {
        const { servicio, repo } = await construir(constructorFalso());

        await expect(
          servicio.create('p1', { ...alta, city: 'Ourense' } as never),
        ).rejects.toThrow(/Ourense/);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('una coordenada sola no vale: van juntas', async () => {
        const { servicio } = await construir(constructorFalso());

        await expect(
          servicio.create('p1', { ...alta, latitude: 40.4 } as never),
        ).rejects.toThrow(BadRequestException);
      });

      it('cambiar de ciudad lleva el servicio a la nueva', async () => {
        // Si no, el mapa lo seguiría pintando en la vieja.
        const qb = constructorFalso();
        qb.getOne = vi.fn(async () => ({
          id: 's1',
          providerId: 'p1',
          city: 'Madrid',
          location: 'punto-original',
        }));
        const { servicio, repo } = await construir(qb);

        await servicio.update('s1', 'p1', { city: 'Sevilla' } as never);

        const guardado = repo.save.mock.calls[0][0] as { location: unknown };
        expect(guardado.location).toEqual({
          type: 'Point',
          coordinates: [-5.9845, 37.3891],
        });
      });

      it('la misma ciudad escrita de otra forma no lo mueve', async () => {
        const qb = constructorFalso();
        qb.getOne = vi.fn(async () => ({
          id: 's1',
          providerId: 'p1',
          city: 'Málaga',
          location: 'punto-original',
        }));
        const { servicio, repo } = await construir(qb);

        await servicio.update('s1', 'p1', { city: 'malaga' } as never);

        const guardado = repo.save.mock.calls[0][0] as { location: unknown };
        expect(guardado.location).toBe('punto-original');
      });
    });

    it('no deja editar el servicio de otro', async () => {
      const qb = constructorFalso();
      qb.getOne = vi.fn(async () => ({ id: 's1', providerId: 'p1' }));
      const { servicio, repo } = await construir(qb);

      await expect(
        servicio.update('s1', 'otro', { title: 'Mío ahora' } as never),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('los servicios de un profesional salen con su categoría', async () => {
      const qb = constructorFalso();
      const { servicio, repo } = await construir(qb);

      await servicio.findByProvider('p1');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerId: 'p1' },
          relations: { category: true },
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });
});
