import type { Mock } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { AccionAuditada, Booking, BookingStatus, Service } from '../entities';
import { ServicesService } from './services.service';
import { servicioPublico } from './servicio-publico';
import { AuditoriaService } from '../auditoria/auditoria.service';

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
    'addOrderBy',
    'offset',
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
      // El correo de quien actúa, para el historial de la administración.
      findOne: vi.fn(async () => ({
        id: 'admin',
        email: 'admin@servilocal.com',
      })),
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

  const auditoria = { anotar: vi.fn(async () => undefined) };

  // Sin reservas, salvo que la prueba diga otra cosa.
  const reservas = {
    count: vi.fn(async () => 0),
    exists: vi.fn(async () => false),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ServicesService,
      { provide: getRepositoryToken(Service), useValue: repo },
      { provide: getRepositoryToken(Booking), useValue: reservas },
      { provide: AuditoriaService, useValue: auditoria },
    ],
  }).compile();

  return {
    servicio: module.get(ServicesService),
    repo,
    reservas,
    auditoria,
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

    it('el de una cuenta de demostración se retira, no se borra: se restaura', async () => {
      // Borrado no habría forma de devolverlo a la hora (DemostracionService).
      const { servicio, repo } = await conServicio();
      (repo as unknown as { update: Mock }).update = vi.fn(async () => ({
        affected: 1,
      }));
      repo.manager.findOne.mockResolvedValueOnce({
        id: DUENO,
        esDemostracion: true,
      } as never);

      await servicio.remove('s1', DUENO, 'provider');

      expect(repo.remove).not.toHaveBeenCalled();
      expect((repo as unknown as { update: Mock }).update).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ isActive: false }),
      );
    });

    it('y lo que retira la administración queda en el historial', async () => {
      const { servicio, auditoria } = await conServicio();

      await servicio.remove('s1', OTRO, 'admin');

      expect(auditoria.anotar).toHaveBeenCalledWith({
        actor: { id: OTRO, email: 'admin@servilocal.com' },
        accion: AccionAuditada.SERVICIO_RETIRADO,
        entidad: 'servicio',
        entidadId: 's1',
        contexto: { nombre: 'Original' },
      });
    });

    it('lo que retira su dueño, no', async () => {
      const { servicio, auditoria } = await conServicio();

      await servicio.remove('s1', DUENO, 'provider');

      expect(auditoria.anotar).not.toHaveBeenCalled();
    });
  });

  describe('la dirección de referencia', () => {
    it('no sale en la búsqueda: solo la ve su dueño, desde su panel', async () => {
      // Es obligatoria al publicar, y quien ponía la de su casa la publicaba
      // a cualquiera sin saberlo.
      const qb = constructorFalso();
      qb.getMany = vi.fn(async () => [
        { id: 's1', title: 'Fontanería', address: 'Calle Mayor 7, 2.º B' },
      ]);
      const { servicio } = await construir(qb);

      const resultado = await servicio.search({} as never);

      expect(resultado.data[0]).toEqual({ id: 's1', title: 'Fontanería' });
    });

    it('servicioPublico la quita sin tocar lo demás', () => {
      expect(
        servicioPublico({
          id: 's1',
          city: 'Málaga',
          address: 'Calle Larios 1',
        } as never),
      ).toEqual({ id: 's1', city: 'Málaga' });
    });
  });

  describe('la ficha pública', () => {
    it('no enseña el servicio de un profesional desactivado', async () => {
      // La búsqueda ya lo ocultaba, pero la ficha se abría por enlace
      // directo y se podía reservar.
      const qb = constructorFalso();
      qb.getOne = vi.fn(async () => ({ id: 's1' }));
      const { servicio } = await construir(qb);

      await servicio.findById('s1', { publica: true });

      expect(qb.andWhere).toHaveBeenCalledWith('provider.isActive = true');
    });

    it('pero su dueño, o la administración, sí lo encuentran para editarlo', async () => {
      const qb = constructorFalso();
      qb.getOne = vi.fn(async () => ({ id: 's1' }));
      const { servicio } = await construir(qb);

      await servicio.findById('s1');

      expect(qb.andWhere).not.toHaveBeenCalledWith('provider.isActive = true');
    });
  });

  describe('eliminar un servicio con historial', () => {
    async function conServicio() {
      const qb = constructorFalso();
      qb.getOne = vi.fn(async () => ({ id: 's1', providerId: 'p1' }));
      const partes = await construir(qb);
      (partes.repo as unknown as { update: Mock }).update = vi.fn(async () => ({
        affected: 1,
      }));
      return { ...partes, qb };
    }

    it('con reservas abiertas no se elimina: se resuelven antes', async () => {
      // Sus clientes se quedarían con una cita para algo que ya no existe,
      // y el dinero retenido sin nadie que lo moviera.
      const { servicio, repo, reservas } = await conServicio();
      reservas.count.mockResolvedValue(2);

      const error = await servicio
        .remove('s1', 'p1', 'provider')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        codigo: 'reservas-abiertas',
      });
      expect(reservas.count).toHaveBeenCalledWith({
        where: {
          serviceId: 's1',
          status: expect.objectContaining({
            value: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
          }),
        },
      });
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('con reservas cerradas se retira, no se borra', async () => {
      // Borrarlo se llevaba en cascada las reservas, y con ellas los pagos
      // y las valoraciones de otras personas.
      const { servicio, repo, reservas } = await conServicio();
      reservas.exists.mockResolvedValue(true);

      await servicio.remove('s1', 'p1', 'provider');

      expect(repo.remove).not.toHaveBeenCalled();
      expect((repo as unknown as { update: Mock }).update).toHaveBeenCalledWith(
        's1',
        {
          isActive: false,
          withdrawnAt: expect.any(Date),
        },
      );
    });

    it('sin reservas se borra de verdad', async () => {
      const { servicio, repo } = await conServicio();

      await servicio.remove('s1', 'p1', 'provider');

      expect(repo.remove).toHaveBeenCalled();
    });

    it('uno retirado ya no se encuentra: ni su ficha, ni para editarlo', async () => {
      const { servicio, qb } = await conServicio();

      await servicio.findById('s1');

      expect(qb.andWhere).toHaveBeenCalledWith('service.withdrawnAt IS NULL');
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

    it('una longitud 0 también filtra: el meridiano pasa por Castellón', async () => {
      // Se miraba si había coordenadas por verdad, y 0 es falso: con
      // longitude=0 el radio dejaba de filtrar y salía el catálogo entero.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({
        latitude: 39.99,
        longitude: 0,
        radiusKm: 5,
      } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ST_DWithin'),
        expect.objectContaining({ lat: 39.99, lng: 0 }),
      );
    });

    it('y no más lejos de lo que el profesional dice que se desplaza', async () => {
      // El radio de cobertura se declaraba al publicar y no filtraba nada.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ latitude: 40.4, longitude: -3.7 } as never);

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining(
          'LEAST(:radius, service.coverageRadiusKm * 1000)',
        ),
      );
    });

    it('y antes, con el radio pedido tal cual, para que sirva el índice', async () => {
      // Con una distancia que cambia fila a fila, el índice espacial no se
      // puede usar: la condición de radio fijo es la que lo aprovecha. Que
      // de verdad lo use lo comprueba la integración, con la consulta real.
      const qb = constructorFalso();
      const { servicio } = await construir(qb);

      await servicio.search({ latitude: 40.4, longitude: -3.7 } as never);

      const condiciones = qb.andWhere.mock.calls.map(([sql]) => String(sql));
      const fija = condiciones.findIndex(
        (sql) => sql.includes('ST_DWithin') && /:radius\s*\)$/.test(sql.trim()),
      );
      const variable = condiciones.findIndex((sql) => sql.includes('LEAST('));
      expect(fija).toBeGreaterThanOrEqual(0);
      expect(fija).toBeLessThan(variable);
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
      expect(qb.addOrderBy).toHaveBeenCalledWith('service.id', 'ASC');
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
      ['price', 'service.priceMin', 'ASC', 'ASC'],
      ['rating', 'service.averageRating', 'DESC', 'ASC'],
      ['newest', 'service.createdAt', 'DESC', 'DESC'],
      [undefined, 'service.createdAt', 'DESC', 'DESC'],
    ])(
      'ordenar por %s usa %s y desempata por el identificador',
      async (criterio, columna, sentido, desempate) => {
        // Sin desempate, los que empatan cambian de sitio entre una página
        // y la siguiente: unos salen dos veces y otros ninguna. En el orden
        // por fecha va en su mismo sentido, para que lo sirva el índice.
        const qb = constructorFalso();
        const { servicio } = await construir(qb);

        await servicio.search({ sortBy: criterio } as never);

        expect(qb.orderBy).toHaveBeenCalledWith(columna, sentido);
        expect(qb.addOrderBy).toHaveBeenCalledWith('service.id', desempate);
      },
    );
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

      // Con offset y limit, no skip y take: ver el servicio.
      expect(qb.offset).toHaveBeenCalledWith(24);
      expect(qb.limit).toHaveBeenCalledWith(12);
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
      expect(qb.offset).toHaveBeenCalledWith(undefined);
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

    describe('la horquilla de la tarifa', () => {
      // Solo la comprobaba el formulario. Por la API se publicaba un máximo
      // por debajo del mínimo, que ningún importe cumple, y la reserva tenía
      // que ignorarlo para que el servicio se pudiera contratar.
      const publicado = (tarifa: Record<string, unknown>) => {
        const qb = constructorFalso();
        qb.getOne = vi.fn(async () => ({
          id: 's1',
          providerId: 'p1',
          location: 'punto-original',
          ...tarifa,
        }));
        return construir(qb);
      };

      it('no se publica con el máximo por debajo del mínimo', async () => {
        const { servicio, repo } = await construir(constructorFalso());

        await expect(
          servicio.create('p1', {
            title: 'Reparaciones',
            city: 'Madrid',
            priceMin: 60,
            priceMax: 40,
          } as never),
        ).rejects.toThrow(/máximo no puede ser menor/);
        expect(repo.save).not.toHaveBeenCalled();
      });

      it('con el máximo igual al mínimo, que es un precio fijo, sí', async () => {
        const { servicio, repo } = await construir(constructorFalso());

        await servicio.create('p1', {
          title: 'Reparaciones',
          city: 'Madrid',
          priceMin: 50,
          priceMax: 50,
        } as never);

        expect(repo.save).toHaveBeenCalled();
      });

      it.each([
        ['bajar el máximo', { priceMax: 30 }],
        ['subir el mínimo', { priceMin: 90 }],
      ])(
        'al editar, %s por debajo o por encima del otro tampoco pasa',
        async (_caso, cambio) => {
          // Se compara con lo que ya tenía el servicio, no solo con lo que
          // llega: basta con mandar uno de los dos para invertirla.
          const { servicio, repo } = await publicado({
            priceMin: '40.00',
            priceMax: '80.00',
          });

          await expect(
            servicio.update('s1', 'p1', cambio as never),
          ).rejects.toThrow(/máximo no puede ser menor/);
          expect(repo.save).not.toHaveBeenCalled();
        },
      );

      it('quitar el máximo deja la tarifa abierta', async () => {
        const { servicio, repo } = await publicado({
          priceMin: '40.00',
          priceMax: '80.00',
        });

        await servicio.update('s1', 'p1', { priceMax: null } as never);

        expect(repo.save).toHaveBeenCalledWith(
          expect.objectContaining({ priceMax: null }),
        );
      });

      it('uno publicado con la horquilla al revés puede cambiar lo demás', async () => {
        // Los hay de antes de esta comprobación: exigirles arreglar la
        // tarifa para corregir una falta en el título sería castigarlos.
        const { servicio, repo } = await publicado({
          priceMin: '60.00',
          priceMax: '40.00',
        });

        await servicio.update('s1', 'p1', { title: 'Después' } as never);

        expect(repo.save).toHaveBeenCalled();
      });
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

      it('la duración que elige el profesional llega al servicio', async () => {
        // Es lo que ocupa cada reserva en su agenda.
        const { servicio, repo } = await construir(constructorFalso());

        await servicio.create('p1', { ...alta, durationMinutes: 90 } as never);

        expect(
          (repo.create.mock.calls[0][0] as { durationMinutes: number })
            .durationMinutes,
        ).toBe(90);
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
          // Sin los retirados: el profesional los eliminó.
          where: { providerId: 'p1', withdrawnAt: IsNull() },
          relations: { category: true },
          order: { createdAt: 'DESC' },
          // Es pública: con tope, como toda lista.
          take: 100,
        }),
      );
    });
  });
});
