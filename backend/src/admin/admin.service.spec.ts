import type { Mock } from 'vitest';
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
  const qb: Record<string, Mock> = {};
  for (const metodo of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'orderBy',
    'leftJoin',
    'innerJoin',
  ]) {
    qb[metodo] = vi.fn(() => qb);
  }
  qb.getRawMany = vi.fn(async () => resultado.raws ?? []);
  qb.getRawOne = vi.fn(async () => resultado.raw ?? {});
  qb.getCount = vi.fn(async () => resultado.count ?? 0);
  return qb;
}

/** Repositorio falso que devuelve una consulta distinta en cada llamada. */
function repositorioFalso(consultas: ReturnType<typeof consultaFalsa>[]) {
  let i = 0;
  return {
    count: vi.fn(async () => 0),
    createQueryBuilder: vi.fn(() => consultas[i++] ?? consultaFalsa({})),
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
    /** Repos mínimos; solo interesa la serie de reservas. */
    function conSerie(raws: unknown[]) {
      return {
        usuarios: repositorioFalso([]),
        servicios: repositorioFalso([]),
        reservas: repositorioFalso([
          consultaFalsa({ raws: [] }),
          consultaFalsa({ raw: { suma: '0' } }),
          consultaFalsa({ raws }),
        ]),
        valoraciones: repositorioFalso([]),
        categorias: repositorioFalso([]),
      };
    }

    describe('serie semanal', () => {
      it('devuelve doce lunes consecutivos, también los vacíos', async () => {
        // Un GROUP BY solo trae las semanas con filas. Pintar solo esas uniría
        // dos fechas lejanas como si fueran contiguas y la línea mentiría
        // sobre la tendencia.
        const servicio = await construir(conSerie([]));

        const { porSemana } = (await servicio.metricas()).reservas;

        expect(porSemana).toHaveLength(12);
        for (const punto of porSemana) {
          // 1 es lunes, que es donde corta date_trunc('week') en PostgreSQL.
          expect(new Date(`${punto.semana}T00:00:00Z`).getUTCDay()).toBe(1);
          expect(punto.reservas).toBe(0);
          expect(punto.facturado).toBe(0);
        }

        const dias = porSemana.map((p) => Date.parse(`${p.semana}T00:00:00Z`));
        for (let i = 1; i < dias.length; i++) {
          expect(dias[i] - dias[i - 1]).toBe(7 * 24 * 60 * 60 * 1000);
        }
      });

      it('conserva los números de las semanas que sí tienen datos', async () => {
        // Se pregunta primero qué semanas espera el servicio y luego se le
        // devuelve una de ellas: así el test no recalcula el lunes por su
        // cuenta, que sería copiar la implementación y no comprobarla.
        const vacio = await construir(conSerie([]));
        const esperadas = (await vacio.metricas()).reservas.porSemana;
        const objetivo = esperadas[esperadas.length - 2].semana;

        const servicio = await construir(
          conSerie([{ semana: objetivo, reservas: '7', facturado: '250.5' }]),
        );

        const { porSemana } = (await servicio.metricas()).reservas;
        const punto = porSemana.find((p) => p.semana === objetivo);

        expect(punto).toEqual({
          semana: objetivo,
          reservas: 7,
          facturado: 250.5,
        });
        expect(porSemana).toHaveLength(12);
      });
    });

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

  describe('las métricas de la administración de demostración', () => {
    // Su contraseña está en la pantalla de acceso. Veía los agregados de
    // toda la plataforma: lo cobrado de verdad y cuántas cuentas reales hay.
    const consultas = (cuantas: number) =>
      Array.from({ length: cuantas }, () => consultaFalsa({}));

    async function medir(soloDemostracion?: boolean) {
      const repos = {
        usuarios: repositorioFalso(consultas(1)),
        servicios: repositorioFalso(consultas(3)),
        reservas: repositorioFalso(consultas(3)),
        valoraciones: repositorioFalso(consultas(3)),
        categorias: repositorioFalso(consultas(1)),
      };
      const servicio = await construir(repos);
      await servicio.metricas(
        soloDemostracion === undefined ? undefined : { soloDemostracion },
      );
      return repos;
    }

    /** Las consultas a mano que un repositorio llegó a construir. */
    const construidas = (repo: ReturnType<typeof repositorioFalso>) =>
      repo.createQueryBuilder.mock.results.map(
        (r) => r.value as ReturnType<typeof consultaFalsa>,
      );

    it('cuenta solo las cuentas, los servicios, las reservas y las valoraciones de su mundo', async () => {
      const repos = await medir(true);
      const suyo = { esDemostracion: true };

      expect(repos.usuarios.count.mock.calls).toEqual([
        [{ where: suyo }],
        [{ where: { isActive: false, ...suyo } }],
      ]);
      expect(repos.servicios.count.mock.calls).toEqual([
        [{ where: { provider: suyo } }],
        [{ where: { isActive: true, provider: suyo } }],
      ]);
      expect(repos.reservas.count.mock.calls).toEqual([
        [{ where: { client: suyo } }],
      ]);
      expect(repos.valoraciones.count.mock.calls).toEqual([
        [{ where: { client: suyo } }],
        [{ where: { isReported: true, client: suyo } }],
      ]);

      // Y las que se construyen a mano, unidas a quien es de cada cosa.
      for (const [repo, relacion] of [
        [repos.servicios, 's.provider'],
        [repos.reservas, 'b.client'],
        [repos.valoraciones, 'r.client'],
      ] as const) {
        const hechas = construidas(repo);
        expect(hechas).toHaveLength(3);
        for (const consulta of hechas) {
          expect(consulta.innerJoin).toHaveBeenCalledWith(
            relacion,
            'mundo',
            'mundo.esDemostracion = true',
          );
        }
      }
      expect(construidas(repos.usuarios)[0].where).toHaveBeenCalledWith(
        'u.esDemostracion = true',
      );
    });

    it('las categorías son las de todos', async () => {
      const repos = await medir(true);

      expect(repos.categorias.count).toHaveBeenCalledWith();
      expect(construidas(repos.categorias)[0].innerJoin).not.toHaveBeenCalled();
    });

    it.each([[false], [undefined]])(
      'la administración de verdad (%s) lo cuenta todo',
      async (soloDemostracion) => {
        const repos = await medir(soloDemostracion);

        expect(repos.usuarios.count.mock.calls).toEqual([
          [{ where: {} }],
          [{ where: { isActive: false } }],
        ]);
        expect(repos.reservas.count.mock.calls).toEqual([[{ where: {} }]]);
        for (const repo of [
          repos.servicios,
          repos.reservas,
          repos.valoraciones,
        ]) {
          for (const consulta of construidas(repo)) {
            expect(consulta.innerJoin).not.toHaveBeenCalled();
          }
        }
        expect(construidas(repos.usuarios)[0].where).toHaveBeenCalledWith(
          '1 = 1',
        );
      },
    );
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

    it('la administración de verdad ve a todos, con el nombre completo', async () => {
      const consulta = consultaFalsa({
        raws: [fila({ nombre: 'Carlos', apellidos: 'Ruiz Pérez' })],
      });
      const servicio = await construir({
        usuarios: repositorioFalso([consulta]),
      });

      const [p] = await servicio.reputacion();

      expect(p.nombre).toBe('Carlos Ruiz Pérez');
      expect(consulta.andWhere).not.toHaveBeenCalled();
    });

    it('la de demostración, solo a los suyos y con el apellido acortado', async () => {
      // Su contraseña es pública, y la máscara no reconocía un nombre que
      // llegaba ya unido: salían los apellidos de cuentas reales.
      const consulta = consultaFalsa({
        raws: [fila({ nombre: 'Carlos', apellidos: 'Ruiz Pérez' })],
      });
      const servicio = await construir({
        usuarios: repositorioFalso([consulta]),
      });

      const [p] = await servicio.reputacion({ soloDemostracion: true });

      expect(consulta.andWhere).toHaveBeenCalledWith('u.esDemostracion = true');
      expect(p.nombre).toBe('Carlos R.');
    });
  });
});
