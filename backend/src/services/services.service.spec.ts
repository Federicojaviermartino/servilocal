import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
  const qb: Record<string, jest.Mock> = {
    getManyAndCount: jest.fn(async () => [[], 0]),
  };
  for (const metodo of [
    'leftJoin',
    'leftJoinAndSelect',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'skip',
    'take',
  ]) {
    qb[metodo] = jest.fn(() => qb);
  }
  return qb;
}

async function construir(qb: Record<string, jest.Mock>) {
  const repo = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn(async () => null),
    remove: jest.fn(async () => undefined),
    save: jest.fn(async (s: unknown) => s),
    create: jest.fn((s: unknown) => s),
    find: jest.fn(async () => [] as unknown[]),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ServicesService,
      { provide: getRepositoryToken(Service), useValue: repo },
    ],
  }).compile();

  return { servicio: module.get(ServicesService), repo, qb };
}

/** Todas las columnas que la consulta llegó a pedir. */
function columnasPedidas(qb: Record<string, jest.Mock>): string[] {
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
      qb.getOne = jest.fn(async () => ({ id: 's1' }));
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
      qb.getOne = jest.fn(async () => null);
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
      qb.getOne = jest.fn(async () => ({
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
    const sql = (qb: Record<string, jest.Mock>) =>
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
    const sql = (qb: Record<string, jest.Mock>) =>
      qb.andWhere.mock.calls.map((c) => String(c[0])).join(' ');

    it('la ciudad se compara sin acentos y sin mayúsculas, en los dos lados', async () => {
      // Quien teclea «malaga» y quien teclea «Málaga» buscan lo mismo, y
      // normalizar solo un lado de la comparación no casa ninguno de los dos.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ city: 'malaga' } as never);

      const llamada = qb.andWhere.mock.calls.find((c) =>
        String(c[0]).includes('service.city'),
      );
      expect(llamada).toBeDefined();
      const condicion = String(llamada?.[0]);
      expect(condicion.match(/translate\(lower\(/g)?.length).toBe(2);
      expect(llamada?.[1]).toEqual({ city: 'malaga' });
    });

    it('el texto busca también por el nombre de la categoría', async () => {
      // La gente busca por oficio, y esa palabra rara vez está en el título
      // del servicio.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ query: 'fontanero' } as never);

      const consulta = sql(qb);
      expect(consulta).toContain('category.name');
      expect(consulta).toContain('service.title');
      expect(consulta).toContain('service.description');
    });

    it('el diccionario añade términos sin quitar el que se escribió', async () => {
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ query: 'fontanero' } as never);

      const llamada = qb.andWhere.mock.calls.find((c) =>
        String(c[0]).includes('category.name'),
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
      qb.getManyAndCount = jest.fn(async () => [[], 25]);
      const { servicio } = await construir(qb);

      const r = await servicio.search({ page: 1, limit: 12 } as never);

      expect(r.meta).toEqual({
        total: 25,
        page: 1,
        limit: 12,
        totalPages: 3,
      });
    });
  });

  describe('alta y edición', () => {
    it('el punto se construye con la longitud primero', async () => {
      // ST_MakePoint toma (x, y), es decir (longitud, latitud). Invertirlo
      // compila igual y coloca Madrid en mitad del océano.
      const qb = constructorFalso();
      const { servicio, repo } = await construir(qb);

      await servicio.create('p1', {
        title: 'Reparaciones',
        latitude: 40.4,
        longitude: -3.7,
      } as never);

      const creado = repo.create.mock.calls[0][0] as {
        location: () => string;
        providerId: string;
      };
      expect(creado.providerId).toBe('p1');
      expect(creado.location()).toContain('ST_MakePoint(-3.7, 40.4)');
    });

    it('editar sin coordenadas no mueve el servicio de sitio', async () => {
      // Cambiar el título no debe tocar la ubicación, y una ubicación a
      // medias (solo latitud) sería peor que ninguna.
      const qb = constructorFalso();
      qb.getOne = jest.fn(async () => ({
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

    it('no deja editar el servicio de otro', async () => {
      const qb = constructorFalso();
      qb.getOne = jest.fn(async () => ({ id: 's1', providerId: 'p1' }));
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
          relations: ['category'],
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });
});
