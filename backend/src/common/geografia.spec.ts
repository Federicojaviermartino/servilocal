import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateServiceDto,
  SearchServicesDto,
  UpdateServiceDto,
} from '../services/dto/service.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { puntoGeografico } from './geografia';

/** Las propiedades de un DTO que la validación rechaza. */
async function rechazadas(
  clase: new () => object,
  datos: Record<string, unknown>,
): Promise<string[]> {
  const errores = await validate(plainToInstance(clase, datos));
  return errores.map((error) => error.property);
}

describe('puntoGeografico', () => {
  it('va en el orden de GeoJSON: longitud y después latitud', () => {
    // Invertirlo compila igual y lleva Madrid a mitad del océano Índico.
    expect(puntoGeografico(40.4168, -3.7038)).toEqual({
      type: 'Point',
      coordinates: [-3.7038, 40.4168],
    });
  });
});

describe('coordenadas en lo que llega a la API', () => {
  // Antes solo se exigía que fueran números, y una latitud de 1000 se
  // guardaba: un punto que no existe, que PostGIS acepta y el mapa no sabe
  // dónde pintar.
  const DTOS: [string, new () => object][] = [
    ['el alta de un servicio', CreateServiceDto],
    ['la edición de un servicio', UpdateServiceDto],
    ['la búsqueda', SearchServicesDto],
    ['el perfil', UpdateUserDto],
  ];

  describe.each(DTOS)('en %s', (_nombre, clase) => {
    it.each([
      [{ latitude: 90.5 }, 'latitude'],
      [{ latitude: -91 }, 'latitude'],
      [{ longitude: 180.1 }, 'longitude'],
      [{ longitude: -181 }, 'longitude'],
    ])('rechaza %j', async (datos, campo) => {
      expect(await rechazadas(clase, datos)).toContain(campo);
    });

    it.each([
      { latitude: 90, longitude: 180 },
      { latitude: -90, longitude: -180 },
      { latitude: 0, longitude: 0 },
    ])('acepta los extremos y el cero: %j', async (datos) => {
      const errores = await rechazadas(clase, datos);
      expect(errores).not.toContain('latitude');
      expect(errores).not.toContain('longitude');
    });
  });

  it('en la búsqueda, las que llegan como texto de la URL también', async () => {
    // La consulta llega con todo como texto; @Type las convierte antes de
    // comprobar el rango.
    expect(
      await rechazadas(SearchServicesDto, { latitude: '95', longitude: '10' }),
    ).toEqual(['latitude']);
  });
});
