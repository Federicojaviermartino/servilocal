import { describe, expect, it } from 'vitest';
import {
  filtrosDeUrl,
  leerBusqueda,
  paginaDeUrl,
  parametrosDeApi,
  peticionDeBusqueda,
  urlDeBusqueda,
  vistaDeUrl,
} from './busqueda';
import type { Service } from '@/types';

const url = (texto: string) => new URLSearchParams(texto);

describe('La búsqueda en la dirección', () => {
  it('lee los filtros, la vista y la página', () => {
    const parametros = url(
      'q=grifo&category=c1&city=Sevilla&rating=4&maxPrice=60&view=map&page=3',
    );

    expect(filtrosDeUrl(parametros)).toEqual({
      query: 'grifo',
      categoryId: 'c1',
      city: 'Sevilla',
      latitude: undefined,
      longitude: undefined,
      radiusKm: undefined,
      minRating: 4,
      maxPrice: 60,
    });
    expect(vistaDeUrl(parametros)).toBe('map');
    expect(paginaDeUrl(parametros)).toBe(3);
  });

  it('el radio solo cuenta con un punto', () => {
    // Sin coordenadas la API lo ignoraba, y el filtro no filtraba nada.
    expect(filtrosDeUrl(url('radius=5')).radiusKm).toBeUndefined();
    expect(filtrosDeUrl(url('lat=39.47&radius=5')).radiusKm).toBeUndefined();
    expect(filtrosDeUrl(url('lat=39.47&lng=-0.38&radius=5'))).toMatchObject({
      latitude: 39.47,
      longitude: -0.38,
      radiusKm: 5,
    });
  });

  it('un punto se lee redondeado, y uno imposible no se lee', () => {
    expect(filtrosDeUrl(url('lat=39.46975&lng=-0.37739'))).toMatchObject({
      latitude: 39.47,
      longitude: -0.38,
    });
    expect(filtrosDeUrl(url('lat=120&lng=3')).latitude).toBeUndefined();
    expect(filtrosDeUrl(url('lat=abc&lng=3')).latitude).toBeUndefined();
    // 0 es una coordenada válida: el meridiano de Greenwich pasa por España.
    expect(filtrosDeUrl(url('lat=40.4&lng=0')).longitude).toBe(0);
  });

  it.each(['0', '-2', '1.5', 'dos', ''])(
    'una página «%s» es la primera',
    (pagina) => {
      expect(paginaDeUrl(url(`page=${pagina}`))).toBe(1);
    },
  );

  it('se escribe siempre en el mismo orden, y las mismas búsquedas coinciden', () => {
    const una = urlDeBusqueda(
      filtrosDeUrl(url('radius=10&city=Sevilla&q=grifo&lng=-5.98&lat=37.39')),
      'list',
    );
    const otra = urlDeBusqueda(
      filtrosDeUrl(url('q=grifo&lat=37.39&lng=-5.98&city=Sevilla&radius=10')),
      'list',
    );

    expect(una).toBe('q=grifo&city=Sevilla&lat=37.39&lng=-5.98&radius=10');
    expect(otra).toBe(una);
  });

  it('la página va solo si no es la primera, y el mapa no lleva', () => {
    expect(urlDeBusqueda({ query: 'grifo' }, 'list', 1)).toBe('q=grifo');
    expect(urlDeBusqueda({ query: 'grifo' }, 'list', 2)).toBe('q=grifo&page=2');
    expect(urlDeBusqueda({ query: 'grifo' }, 'map', 2)).toBe(
      'q=grifo&view=map',
    );
  });

  it('las coordenadas se escriben redondeadas', () => {
    // Ni la dirección ni el historial guardan dónde está la casa de quien
    // busca.
    expect(
      urlDeBusqueda({ latitude: 39.46975, longitude: -0.37739 }, 'list'),
    ).toBe('lat=39.47&lng=-0.38');
  });
});

describe('La búsqueda que se pide a la API', () => {
  it('el mapa pide todo lo que admite, desde la primera página', () => {
    expect(peticionDeBusqueda({ city: 'Sevilla' }, 'map', 3)).toEqual({
      city: 'Sevilla',
      page: 1,
      limit: 50,
    });
    expect(peticionDeBusqueda({ city: 'Sevilla' }, 'list', 3)).toEqual({
      city: 'Sevilla',
      page: 3,
    });
  });

  it('el precio máximo va con el nombre de la API', () => {
    // Con maxPrice la API respondía 400 y el buscador se quedaba en error.
    expect(parametrosDeApi({ maxPrice: 50, city: 'Sevilla' })).toEqual({
      priceMax: 50,
      city: 'Sevilla',
    });
  });

  it('lo vacío no viaja', () => {
    expect(
      parametrosDeApi({ query: '', city: undefined, page: 1, maxPrice: 0 }),
    ).toEqual({ page: 1 });
  });
});

describe('La respuesta de la API', () => {
  const servicios = [{ id: 's1' }, { id: 's2' }] as unknown as Service[];

  it('paginada', () => {
    expect(
      leerBusqueda({
        data: servicios,
        meta: { total: 25, totalPages: 3, totalEsParcial: true },
      }),
    ).toEqual({
      services: servicios,
      total: 25,
      totalEsParcial: true,
      totalPages: 3,
    });
  });

  it('como lista suelta', () => {
    expect(leerBusqueda(servicios)).toEqual({
      services: servicios,
      total: 2,
      totalEsParcial: false,
      totalPages: 1,
    });
  });

  it('con el total fuera de meta, o sin total', () => {
    expect(leerBusqueda({ data: servicios, total: 7 }).total).toBe(7);
    expect(leerBusqueda({ data: servicios }).total).toBe(2);
    expect(leerBusqueda({}).services).toEqual([]);
  });
});
