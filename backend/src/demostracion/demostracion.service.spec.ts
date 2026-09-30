import type { DataSource } from 'typeorm';
import { DemostracionService } from './demostracion.service';

/**
 * La restauración con dobles: lo que no depende de la base.
 *
 * Que el SQL haga lo que debe lo comprueba restauracion.integracion.ts
 * contra PostgreSQL. Aquí, lo que la rodea: que todo vaya en una
 * transacción, que solo toque lo que lleva una hora quieto y cómo cuenta.
 * Los dobles responden como TypeORM a un UPDATE o un DELETE, con
 * [filas, recuento], que es lo que hizo que cada recuento saliera 2.
 */

/** Qué devuelve cada consulta, por un trozo de su texto. */
type Respuestas = Array<[RegExp, unknown]>;

function construir(respuestas: Respuestas = []) {
  const gestor = {
    // Con los parámetros en la firma, para poder leerlos de mock.calls.
    query: vi.fn(async (sql: string, _parametros?: unknown[]) => {
      const encontrada = respuestas.find(([patron]) => patron.test(sql));
      return encontrada ? encontrada[1] : [[], 0];
    }),
  };
  const fuente = {
    transaction: vi.fn(async (trabajo: (g: typeof gestor) => unknown) =>
      trabajo(gestor),
    ),
  };
  const servicio = new DemostracionService(fuente as unknown as DataSource);
  return { servicio, gestor, fuente };
}

const SERVICIOS = /UPDATE services s SET\s+title/;
const RETIRAR = /UPDATE services s SET "isActive" = false/;
const BORRAR_SERVICIOS = /DELETE FROM services/;
const PERFILES = /UPDATE users u SET/;
const BORRAR_VALORACIONES = /DELETE FROM reviews/;
const VALORACIONES = /UPDATE reviews r SET/;
const MEDIAS = /"averageRating" = COALESCE/;

const sentencias = (gestor: ReturnType<typeof construir>['gestor']) =>
  gestor.query.mock.calls.map(([sql]) => String(sql));

describe('DemostracionService', () => {
  it('lo hace todo en una sola transacción', async () => {
    const { servicio, gestor, fuente } = construir();

    await servicio.restaurar();

    expect(fuente.transaction).toHaveBeenCalledTimes(1);
    expect(gestor.query).toHaveBeenCalled();
  });

  it('solo toca lo que lleva más de una hora sin cambiar', async () => {
    // Quien está probando la demostración sigue viendo lo que acaba de
    // cambiar. El límite se calcula en la base, con su reloj.
    const { servicio, gestor } = construir();

    await servicio.restaurar();

    const escrituras = sentencias(gestor).filter((sql) =>
      /^\s*(UPDATE|DELETE)/.test(sql),
    );
    expect(escrituras).toHaveLength(6);
    for (const sql of escrituras) {
      expect(sql).toContain(`now() - interval '1 hour'`);
    }
  });

  it('cuenta las filas, no el par [filas, recuento] de TypeORM', async () => {
    const { servicio } = construir([
      [SERVICIOS, [[{ id: 's1' }], 1]],
      [RETIRAR, [[{ id: 's2' }], 1]],
      [BORRAR_SERVICIOS, [[{ id: 's3' }, { id: 's4' }], 2]],
      [PERFILES, [[{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }], 3]],
      [VALORACIONES, [[{ id: 'r1' }], 1]],
    ]);

    const resumen = await servicio.restaurar();

    expect(resumen).toEqual({
      servicios: 1,
      perfiles: 3,
      valoraciones: 1,
      // Los retirados y los borrados, juntos.
      retirados: 3,
    });
  });

  it('también entiende las filas sueltas, sin recuento', async () => {
    const { servicio } = construir([[SERVICIOS, [{ id: 's1' }, { id: 's2' }]]]);

    const { servicios } = await servicio.restaurar();

    expect(servicios).toBe(2);
  });

  it('recalcula la media de cada servicio con valoraciones borradas, una vez', async () => {
    const { servicio, gestor } = construir([
      [
        BORRAR_VALORACIONES,
        [[{ serviceId: 's1' }, { serviceId: 's1' }, { serviceId: 's2' }], 3],
      ],
    ]);

    const { valoraciones } = await servicio.restaurar();

    expect(valoraciones).toBe(3);
    const recalculo = gestor.query.mock.calls.find(([sql]) =>
      MEDIAS.test(String(sql)),
    );
    expect(recalculo?.[1]).toEqual([['s1', 's2']]);
  });

  it('sin valoraciones borradas no recalcula nada', async () => {
    const { servicio, gestor } = construir();

    await servicio.restaurar();

    expect(sentencias(gestor).some((sql) => MEDIAS.test(sql))).toBe(false);
  });

  it('si algo falla, la transacción no oculta el error', async () => {
    // Lo recoge el programador, que lo anota y sigue: ver
    // ProgramadorDemostracion.
    const { servicio, gestor } = construir();
    gestor.query.mockRejectedValueOnce(new Error('la base no responde'));

    await expect(servicio.restaurar()).rejects.toThrow('la base no responde');
  });
});
