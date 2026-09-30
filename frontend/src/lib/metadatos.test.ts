import { describe, expect, it, vi } from 'vitest';
import es from '../../messages/es.json';
import de from '../../messages/de.json';
import { paginaPrivada } from './metadatos';

const CATALOGOS = { es, de } as Record<string, Record<string, unknown>>;

vi.mock('next-intl/server', () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: string;
    namespace: string;
  }) => {
    const seccion = CATALOGOS[locale][namespace] as Record<string, string>;
    return (clave: string) => seccion[clave];
  },
}));

describe('paginaPrivada', () => {
  it('da a cada página su título, en su idioma', async () => {
    // Todas heredaban el de la portada: el lector de pantalla no anunciaba
    // nada al pasar de una sección del panel a otra.
    const metadatos = paginaPrivada('navegacion', 'misReservas');

    expect(
      (await metadatos({ params: Promise.resolve({ locale: 'es' }) })).title,
    ).toBe(es.navegacion.misReservas);
    expect(
      (await metadatos({ params: Promise.resolve({ locale: 'de' }) })).title,
    ).toBe(de.navegacion.misReservas);
  });

  it('y le pide al buscador que no la indexe', async () => {
    const metadatos = await paginaPrivada(
      'meta',
      'panelTitulo',
    )({
      params: Promise.resolve({ locale: 'es' }),
    });

    expect(metadatos.robots).toEqual({ index: false, follow: false });
  });

  it('sin la canónica de la portada, que heredaba', async () => {
    const metadatos = await paginaPrivada(
      'meta',
      'panelTitulo',
    )({
      params: Promise.resolve({ locale: 'es' }),
    });

    expect(metadatos.alternates).toBeNull();
  });
});
