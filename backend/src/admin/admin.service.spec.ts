import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { Booking, Category, Review, Service, User } from '../entities';

/**
 * Constructor de consultas falso.
 *
 * Todos los métodos de encadenado devuelven el propio objeto; solo los
 * terminadores devuelven datos. Así el test se fija en lo que importa —qué hace
 * el servicio con las filas— y no en el orden exacto de las llamadas, que es
 * detalle de implementación.
 */
function consultaFalsa(resultado: {
  raws?: unknown[];
  raw?: unknown;
  count?: number;
}) {
  const qb: Record<string, jest.Mock> = {};
  for (const metodo of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'orderBy',
    'leftJoin',
  ]) {
    qb[metodo] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn(async () => resultado.raws ?? []);
  qb.getRawOne = jest.fn(async () => resultado.raw ?? {});
  qb.getCount = jest.fn(async () => resultado.count ?? 0);
  return qb;
}

/** Repositorio falso que devuelve una consulta distinta en cada llamada. */
function repositorioFalso(consultas: ReturnType<typeof consultaFalsa>[]) {
  let i = 0;
  return {
    count: jest.fn(async () => 0),
    createQueryBuilder: jest.fn(() => consultas[i++] ?? consultaFalsa({})),
  };
}

describe('AdminService', () => {
  async function construir(repos: Record<string, unknown>) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: repos.usuarios },
        { provide: getRepositoryToken(Service), useValue: repos.servicios },
        { provide: getRepositoryToken(Booking), useValue: repos.reservas },
        { provide: getRepositoryToken(Review), useValue: repos.valoraciones },
        { provide: getRepositoryToken(Category), useValue: repos.categorias },
      ],
    }).compile();
    return module.get<AdminService>(AdminService);
  }

  describe('metricas', () => {
    it('convierte los agregados en recuentos con números, no cadenas', async () => {
      // Postgres devuelve los COUNT como cadena; si no se convierten, el panel
      // ordena "10" antes que "9" y suma concatenando.
      const servicio = await construir({
        usuarios: repositorioFalso([
          consultaFalsa({ raws: [{ clave: 'provider', total: '12' }] }),
        ]),
        servicios: repositorioFalso([
          consultaFalsa({ count: 3 }),
          consultaFalsa({ raws: [{ clave: 'Fontanería', total: '4' }] }),
          consultaFalsa({ raws: [{ clave: 'Madrid', total: '5' }] }),
        ]),
        reservas: repositorioFalso([
          consultaFalsa({ raws: [{ clave: 'completed', total: '79' }] }),
          consultaFalsa({ raw: { suma: '80686.00' } }),
        ]),
        valoraciones: repositorioFalso([
          consultaFalsa({ raw: { media: '4.6329113924050633' } }),
          consultaFalsa({ raws: [{ clave: 5, total: '50' }] }),
          consultaFalsa({ count: 7 }),
        ]),
        categorias: repositorioFalso([consultaFalsa({ count: 2 })]),
      });

      const m = await servicio.metricas();

      expect(m.usuarios.porRol).toEqual([{ clave: 'provider', total: 12 }]);
      expect(m.servicios.porCategoria).toEqual([
        { clave: 'Fontanería', total: 4 },
      ]);
      expect(m.reservas.facturado).toBe(80686);
      expect(m.valoraciones.porNota).toEqual([{ clave: '5', total: 50 }]);
      expect(m.categorias.sinServicios).toBe(2);
    });

    it('redondea la media a dos decimales', async () => {
      const servicio = await construir({
        usuarios: repositorioFalso([consultaFalsa({})]),
        servicios: repositorioFalso([
          consultaFalsa({}),
          consultaFalsa({}),
          consultaFalsa({}),
        ]),
        reservas: repositorioFalso([consultaFalsa({}), consultaFalsa({})]),
        valoraciones: repositorioFalso([
          consultaFalsa({ raw: { media: '4.6329113924050633' } }),
          consultaFalsa({}),
          consultaFalsa({}),
        ]),
        categorias: repositorioFalso([consultaFalsa({})]),
      });

      const m = await servicio.metricas();

      expect(m.valoraciones.media).toBe(4.63);
    });

    it('deja la media en nulo cuando todavía no hay valoraciones', async () => {
      const servicio = await construir({
        usuarios: repositorioFalso([consultaFalsa({})]),
        servicios: repositorioFalso([
          consultaFalsa({}),
          consultaFalsa({}),
          consultaFalsa({}),
        ]),
        reservas: repositorioFalso([consultaFalsa({}), consultaFalsa({})]),
        valoraciones: repositorioFalso([
          consultaFalsa({ raw: { media: null } }),
          consultaFalsa({}),
          consultaFalsa({}),
        ]),
        categorias: repositorioFalso([consultaFalsa({})]),
      });

      const m = await servicio.metricas();

      // Nulo, no cero: cero es una nota pésima y aquí significa «sin datos».
      expect(m.valoraciones.media).toBeNull();
    });

    it('descarta las filas cuya clave es nula', async () => {
      // Un servicio sin ciudad produce una fila con clave nula en el GROUP BY;
      // pintarla como columna sin nombre confunde más que omitirla.
      const servicio = await construir({
        usuarios: repositorioFalso([consultaFalsa({})]),
        servicios: repositorioFalso([
          consultaFalsa({}),
          consultaFalsa({}),
          consultaFalsa({
            raws: [
              { clave: 'Madrid', total: '5' },
              { clave: null, total: '2' },
            ],
          }),
        ]),
        reservas: repositorioFalso([consultaFalsa({}), consultaFalsa({})]),
        valoraciones: repositorioFalso([
          consultaFalsa({ raw: {} }),
          consultaFalsa({}),
          consultaFalsa({}),
        ]),
        categorias: repositorioFalso([consultaFalsa({})]),
      });

      const m = await servicio.metricas();

      expect(m.servicios.porCiudad).toEqual([{ clave: 'Madrid', total: 5 }]);
    });
  });

  describe('reputacion', () => {
    function conFilas(filas: unknown[]) {
      return construir({
        usuarios: repositorioFalso([consultaFalsa({ raws: filas })]),
        servicios: repositorioFalso([]),
        reservas: repositorioFalso([]),
        valoraciones: repositorioFalso([]),
        categorias: repositorioFalso([]),
      });
    }

    const fila = (extra: Record<string, unknown>) => ({
      proveedorId: 'id',
      nombre: 'Nombre Apellido',
      ciudad: 'Madrid',
      activo: true,
      servicios: '2',
      serviciosActivos: '2',
      valoraciones: '0',
      media: null,
      reservasCompletadas: '0',
      respondidas: '0',
      ...extra,
    });

    it('calcula la tasa de respuesta como porcentaje entero', async () => {
      const servicio = await conFilas([
        fila({ valoraciones: '8', media: '4.75', respondidas: '3' }),
      ]);

      const [p] = await servicio.reputacion();

      expect(p.tasaRespuesta).toBe(38);
      expect(p.media).toBe(4.75);
      expect(p.valoraciones).toBe(8);
    });

    it('no divide entre cero cuando el profesional no tiene valoraciones', async () => {
      const servicio = await conFilas([fila({})]);

      const [p] = await servicio.reputacion();

      expect(p.tasaRespuesta).toBeNull();
      expect(p.media).toBeNull();
    });

    it('ordena por media y deja al final a quien no tiene valoraciones', async () => {
      const servicio = await conFilas([
        fila({ proveedorId: 'sin-datos' }),
        fila({ proveedorId: 'flojo', valoraciones: '4', media: '3.20' }),
        fila({ proveedorId: 'bueno', valoraciones: '4', media: '4.90' }),
      ]);

      const orden = (await servicio.reputacion()).map((p) => p.proveedorId);

      expect(orden).toEqual(['bueno', 'flojo', 'sin-datos']);
    });

    it('desempata por número de valoraciones cuando la media coincide', async () => {
      // Con la misma nota, pesa más quien la ha sostenido sobre más trabajos.
      const servicio = await conFilas([
        fila({ proveedorId: 'pocas', valoraciones: '2', media: '4.50' }),
        fila({ proveedorId: 'muchas', valoraciones: '20', media: '4.50' }),
      ]);

      const orden = (await servicio.reputacion()).map((p) => p.proveedorId);

      expect(orden).toEqual(['muchas', 'pocas']);
    });
  });
});
