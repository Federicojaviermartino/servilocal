import { DataSource } from 'typeorm';
import { Booking, Service } from '../../src/entities';
import { ServicesService } from '../../src/services/services.service';
import { crearFuente } from './base';

/**
 * La búsqueda, página a página, contra PostgreSQL.
 *
 * Que una consulta ordene bien no dice nada de lo que pasa entre dos: cada
 * página es una consulta distinta, y lo que no se le manda a PostgreSQL lo
 * decide él en cada una. Un doble devuelve lo que se le pide, así que esto
 * solo se ve con la base delante.
 */
describe('Paginación de la búsqueda', () => {
  let fuente: DataSource;
  let servicios: ServicesService;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    servicios = new ServicesService(
      fuente.getRepository(Service),
      fuente.getRepository(Booking),
      { anotar: async () => undefined } as never,
    );
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  /**
   * Deja todos los servicios empatados en lo que se puede ordenar, y al
   * acabar los devuelve como estaban. La fecha se guarda como texto: leída
   * como Date perdería los microsegundos al restaurarla.
   */
  async function conTodosEmpatados(tarea: () => Promise<void>) {
    const antes: Array<{
      id: string;
      nota: string;
      precio: string;
      creado: string;
    }> = await fuente.query(
      `SELECT id, "averageRating"::text AS nota, "priceMin"::text AS precio,
              "createdAt"::text AS creado
       FROM services`,
    );
    await fuente.query(
      `UPDATE services
       SET "averageRating" = 4.5, "priceMin" = 0.5,
           "createdAt" = '2026-01-01 00:00:00'`,
    );
    try {
      await tarea();
    } finally {
      for (const servicio of antes) {
        await fuente.query(
          `UPDATE services
           SET "averageRating" = $2::numeric, "priceMin" = $3::numeric,
               "createdAt" = $4::timestamp
           WHERE id = $1`,
          [servicio.id, servicio.nota, servicio.precio, servicio.creado],
        );
      }
    }
  }

  it.each(['rating', 'price', 'newest', undefined])(
    'ordenando por %s, cada servicio sale una vez y solo una',
    async (sortBy) => {
      // En producción, ordenando por valoración, las tres páginas de diez
      // traían 25 filas y solo 23 servicios: dos repetidos y dos que no
      // aparecían nunca. Empataban en la nota, y entre empatados el orden
      // cambiaba de una consulta a otra.
      await conTodosEmpatados(async () => {
        const vistos: string[] = [];
        let total = 0;
        for (let page = 1; page <= 10; page++) {
          const { data, meta } = await servicios.search({
            sortBy,
            page,
            limit: 6,
          } as never);
          total = meta.total;
          if (data.length === 0) break;
          vistos.push(...data.map((servicio) => servicio.id));
        }

        expect(total).toBeGreaterThan(12);
        expect(vistos).toHaveLength(total);
        expect(new Set(vistos).size).toBe(total);
      });
    },
  );
});
