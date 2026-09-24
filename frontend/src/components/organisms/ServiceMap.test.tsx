import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import de from '../../../messages/de.json';
import es from '../../../messages/es.json';
import type { Service } from '@/types';
import ServiceMap from './ServiceMap';

/**
 * Leaflet no pinta en jsdom: no hay medidas ni teselas. Se sustituye por
 * piezas que enseñan lo que reciben, porque lo que hay que comprobar es lo
 * que decide este componente —qué se sitúa, dónde y cómo se encuadra—, no
 * que Leaflet sepa dibujar un mapa.
 */
const mapa = { setView: vi.fn(), fitBounds: vi.fn() };

vi.mock('react-leaflet', async () => {
  const React = await import('react');
  return {
    MapContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'mapa' }, children),
    TileLayer: () => null,
    Marker: ({
      position,
      children,
    }: {
      position: [number, number];
      children: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'marcador', 'data-posicion': position.join(',') },
        children,
      ),
    Popup: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    useMap: () => mapa,
  };
});

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
  },
}));

vi.mock('@/i18n/navigation', async () => {
  const React = await import('react');
  return {
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
      React.createElement('a', { href }, children),
  };
});

function servicio(extra: Partial<Service>): Service {
  return {
    id: 's1',
    title: 'Fontanería urgente',
    city: 'Madrid',
    priceMin: 30,
    priceUnit: 'por hora',
    ...extra,
  } as Service;
}

function pintar(services: Service[], idioma: 'es' | 'de' = 'es') {
  return render(
    <NextIntlClientProvider
      locale={idioma}
      messages={(idioma === 'es' ? es : de) as never}
    >
      <ServiceMap services={services} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mapa.setView.mockClear();
  mapa.fitBounds.mockClear();
});

describe('ServiceMap', () => {
  it('sin nada que situar lo dice, en vez de enseñar un mapa en blanco', () => {
    pintar([servicio({ location: undefined })]);

    expect(screen.queryByTestId('mapa')).toBeNull();
    expect(screen.getByText(es.mapa.sinUbicaciones)).toBeInTheDocument();
  });

  it('el GeoJSON viene como [longitud, latitud] y Leaflet lo quiere al revés', () => {
    // Confundirlo manda Madrid al océano Índico.
    pintar([
      servicio({
        location: { type: 'Point', coordinates: [-3.7038, 40.4168] },
      }),
    ]);

    expect(screen.getByTestId('marcador')).toHaveAttribute(
      'data-posicion',
      '40.4168,-3.7038',
    );
  });

  it('acepta también latitud y longitud sueltas, y salta lo que no tiene', () => {
    pintar([
      servicio({ id: 'a', latitude: 41.39, longitude: 2.17 }),
      servicio({ id: 'b' }),
    ]);

    const marcadores = screen.getAllByTestId('marcador');
    expect(marcadores).toHaveLength(1);
    expect(marcadores[0]).toHaveAttribute('data-posicion', '41.39,2.17');
  });

  it('con un solo resultado centra con zoom de barrio, sin encuadrar', () => {
    // Un rectángulo de área cero llevaría a Leaflet al zoom máximo.
    pintar([servicio({ latitude: 41.39, longitude: 2.17 })]);

    expect(mapa.setView).toHaveBeenCalledWith([41.39, 2.17], 14);
    expect(mapa.fitBounds).not.toHaveBeenCalled();
  });

  it('con varios encuadra todos, con margen', () => {
    pintar([
      servicio({ id: 'a', latitude: 41.39, longitude: 2.17 }),
      servicio({ id: 'b', latitude: 39.47, longitude: -0.38 }),
    ]);

    expect(mapa.fitBounds).toHaveBeenCalledWith(
      [
        [41.39, 2.17],
        [39.47, -0.38],
      ],
      { padding: [40, 40] },
    );
  });

  it('volver a pintar con las mismas posiciones no vuelve a encuadrar', () => {
    // Si encuadrara en cada render, el mapa no se dejaría mover.
    const services = [
      servicio({ id: 'a', latitude: 41.39, longitude: 2.17 }),
      servicio({ id: 'b', latitude: 39.47, longitude: -0.38 }),
    ];
    const { rerender } = pintar(services);

    rerender(
      <NextIntlClientProvider locale="es" messages={es as never}>
        <ServiceMap services={services.map((s) => ({ ...s }))} />
      </NextIntlClientProvider>,
    );

    expect(mapa.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('cada marcador lleva a su ficha', () => {
    pintar([servicio({ id: 's9', latitude: 41.39, longitude: 2.17 })]);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/services/s9');
  });

  it('la unidad del precio sale en el idioma de quien mira', () => {
    // Se guarda en castellano. Interpolada tal cual, el mapa en alemán
    // decía «Ab 30 por hora».
    pintar([servicio({ latitude: 52.52, longitude: 13.4 })], 'de');

    const marcador = screen.getByTestId('marcador');
    expect(marcador).not.toHaveTextContent('por hora');
    expect(marcador).toHaveTextContent(
      de.mapa.desde
        .replace('{precio}', '30')
        .replace('{unidad}', de.unidades['por-hora']),
    );
  });
});
