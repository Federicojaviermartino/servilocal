import { DataSource } from 'typeorm';
import { Service, User } from '../../src/entities';
import { ServicesService } from '../../src/services/services.service';
import { UsersService } from '../../src/users/users.service';
import { crearFuente } from './base';

/**
 * Las ubicaciones, contra PostGIS y no contra un doble.
 *
 * Las pruebas unitarias daban por bueno que el perfil guardara el texto
 * `SRID=4326;POINT(...)`, y con PostGIS esa consulta fallaba entera: TypeORM
 * convierte lo que recibe una columna geométrica con ST_GeomFromGeoJSON. Un
 * doble no lo sabe. Aquí se guarda de verdad y se lee con las funciones de
 * PostGIS, que son las que usa la búsqueda.
 */
describe('Ubicaciones en PostGIS', () => {
  let fuente: DataSource;
  let servicios: ServicesService;
  let usuarios: UsersService;

  beforeAll(async () => {
    fuente = await crearFuente().initialize();
    servicios = new ServicesService(fuente.getRepository(Service));
    // El perfil no anota nada en el historial: basta con un hueco.
    usuarios = new UsersService(fuente.getRepository(User), {} as never);
  });

  afterAll(async () => {
    if (fuente?.isInitialized) await fuente.destroy();
  });

  /** Longitud, latitud y SRID de lo que hay guardado. */
  async function leerPunto(tabla: 'users' | 'services', id: string) {
    const [punto] = await fuente.query(
      `SELECT ST_X(location) AS longitud, ST_Y(location) AS latitud,
              ST_SRID(location) AS srid
       FROM ${tabla} WHERE id = $1`,
      [id],
    );
    return punto;
  }

  it('el perfil guarda la ubicación, con la longitud delante', async () => {
    const [{ id, location }] = await fuente.query(
      `SELECT id, location FROM users WHERE email = 'laura@ejemplo.com'`,
    );

    try {
      await usuarios.update(id, { latitude: 36.72, longitude: -4.42 });

      expect(await leerPunto('users', id)).toEqual({
        longitud: -4.42,
        latitud: 36.72,
        srid: 4326,
      });
    } finally {
      await fuente.query(`UPDATE users SET location = $2 WHERE id = $1`, [
        id,
        location,
      ]);
    }
  });

  it('un servicio nuevo queda donde se dijo, y la búsqueda por distancia lo encuentra', async () => {
    const [{ providerId, categoryId }] = await fuente.query(
      `SELECT "providerId", "categoryId" FROM services LIMIT 1`,
    );
    // En mitad del Mediterráneo, lejos de todo lo sembrado: si la búsqueda
    // lo encuentra, es por su punto y no por casualidad.
    const creado = await servicios.create(providerId, {
      categoryId,
      title: 'Servicio de prueba de ubicación',
      description: 'Creado por la integración para medir distancias.',
      priceMin: 10,
      priceMax: 20,
      priceUnit: 'por hora',
      address: 'Sin dirección',
      city: 'Mar Mediterráneo',
      latitude: 38.5,
      longitude: 4.5,
    } as never);

    try {
      expect(await leerPunto('services', creado.id)).toEqual({
        longitud: 4.5,
        latitud: 38.5,
        srid: 4326,
      });

      const cerca = await servicios.search({
        latitude: 38.51,
        longitude: 4.51,
        radiusKm: 5,
      });
      expect(cerca.data.map((s: Service) => s.id)).toEqual([creado.id]);

      // Y lo que devuelve la API es GeoJSON, que es lo que lee el mapa.
      expect(cerca.data[0].location).toEqual({
        type: 'Point',
        coordinates: [4.5, 38.5],
      });
    } finally {
      await fuente.query(`DELETE FROM services WHERE id = $1`, [creado.id]);
    }
  });

  it('editar las coordenadas mueve el servicio, y editar otra cosa no', async () => {
    const [{ providerId, categoryId }] = await fuente.query(
      `SELECT "providerId", "categoryId" FROM services LIMIT 1`,
    );
    const creado = await servicios.create(providerId, {
      categoryId,
      title: 'Servicio que se mueve',
      description: 'Creado por la integración para moverlo.',
      priceMin: 10,
      priceMax: 20,
      priceUnit: 'por hora',
      address: 'Sin dirección',
      city: 'Mar Mediterráneo',
      latitude: 38.5,
      longitude: 4.5,
    } as never);

    try {
      await servicios.update(creado.id, providerId, {
        title: 'Otro título',
      } as never);
      expect(await leerPunto('services', creado.id)).toMatchObject({
        longitud: 4.5,
        latitud: 38.5,
      });

      // Longitud 0: el meridiano de Greenwich, que se perdía porque se
      // comparaba por verdad.
      await servicios.update(creado.id, providerId, {
        latitude: 39.99,
        longitude: 0,
      } as never);
      expect(await leerPunto('services', creado.id)).toEqual({
        longitud: 0,
        latitud: 39.99,
        srid: 4326,
      });
    } finally {
      await fuente.query(`DELETE FROM services WHERE id = $1`, [creado.id]);
    }
  });
});
